import { CONFIG } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  LANE MARKING DETECTION (pure, DOM-free)
//
//  1. Grayscale the lower half of the frame.
//  2. Keep bright pixels with a strong horizontal gradient
//     (lane paint produces a near-vertical edge).
//  3. Accumulate a Hough transform and pick the strongest
//     left and right near-vertical lines.
//  4. Return lane centre / width and the ego offset in lane widths.
//
//  No DOM access here, which makes it unit-testable in Node.
// ─────────────────────────────────────────────────────────────

let accBuffer = null;

export function detectLane(pixels, W, H) {
  const empty = {
    left: null, right: null, center: null, width: null,
    offset: null, hasPair: false, edgeCount: 0,
  };
  if (!pixels || W < 40 || H < 40) return empty;

  const roi = CONFIG.lane.roi;
  const y0 = Math.floor(H * roi.y0);
  const y1 = Math.floor(H * roi.y1);
  const yRef = Math.round(y0 + (y1 - y0) * 0.78);

  // Grayscale (whole frame is cheap at 320x180 and keeps Sobel simple).
  const gray = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
  }

  // Edge extraction.
  const edges = [];
  const threshold = CONFIG.lane.edgeThreshold;
  const minPaint = CONFIG.lane.paintBrightness;
  for (let y = y0 + 1; y < y1 - 1; y++) {
    const row = y * W;
    for (let x = 1; x < W - 1; x++) {
      const p = row + x;
      if (gray[p] < minPaint) continue;

      const gx =
        (gray[p - W + 1] - gray[p - W - 1]) +
        2 * (gray[p + 1] - gray[p - 1]) +
        (gray[p + W + 1] - gray[p + W - 1]);
      if (Math.abs(gx) < threshold) continue;

      const gy =
        (gray[p + W - 1] - gray[p - W - 1]) +
        2 * (gray[p + W] - gray[p - W]) +
        (gray[p + W + 1] - gray[p - W + 1]);
      // Lane paint is a near-vertical edge, not a horizontal seam.
      if (Math.abs(gx) < Math.abs(gy) * 1.1) continue;

      edges.push(x, y);
      if (edges.length / 2 >= CONFIG.lane.maxEdgePixels) break;
    }
    if (edges.length / 2 >= CONFIG.lane.maxEdgePixels) break;
  }

  const edgeCount = edges.length / 2;
  if (edgeCount < 20) return { ...empty, edgeCount };
  const roiPixels = W * Math.max(1, y1 - y0);
  if (edgeCount > roiPixels * CONFIG.lane.maxEdgeRatio) {
    return { ...empty, edgeCount };
  }

  // Hough transform over near-vertical angles.
  const thetaStep = CONFIG.lane.thetaStepDeg * Math.PI / 180;
  const thetaMin = CONFIG.lane.thetaMinDeg * Math.PI / 180;
  const thetaMax = CONFIG.lane.thetaMaxDeg * Math.PI / 180;
  const thetaCount = Math.floor((thetaMax - thetaMin) / thetaStep) + 1;
  const cos = new Float32Array(thetaCount);
  const sin = new Float32Array(thetaCount);
  for (let t = 0; t < thetaCount; t++) {
    const a = thetaMin + t * thetaStep;
    cos[t] = Math.cos(a);
    sin[t] = Math.sin(a);
  }

  const diag = Math.ceil(Math.hypot(W, H));
  const rhoBins = diag * 2 + 1;
  const accSize = thetaCount * rhoBins;
  // Reuse the accumulator between frames to avoid ~240 KB of garbage
  // per frame on a phone running at 8 fps.
  if (!accBuffer || accBuffer.length !== accSize) {
    accBuffer = new Int32Array(accSize);
  } else {
    accBuffer.fill(0);
  }
  const acc = accBuffer;

  for (let e = 0; e < edges.length; e += 2) {
    const x = edges[e];
    const y = edges[e + 1];
    for (let t = 0; t < thetaCount; t++) {
      const rho = x * cos[t] + y * sin[t];
      const bin = Math.round(rho) + diag;
      if (bin >= 0 && bin < rhoBins) acc[t * rhoBins + bin]++;
    }
  }

  const yTop = y0;
  const yBottom = y1 - 1;
  const span = Math.max(1, yBottom - yTop);

  // Verify that the line actually sits on bright paint. This is what
  // makes a low Hough threshold safe: random edges fail here.
  function supportFor(xTop, xBottom) {
    const SAMPLES = 40;
    let hits = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const y = Math.round(yTop + (yBottom - yTop) * (i / (SAMPLES - 1)));
      const x = Math.round(xTop + (xBottom - xTop) * (i / (SAMPLES - 1)));
      let best = 0;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const v = gray[y * W + xx];
        if (v > best) best = v;
      }
      if (best >= minPaint * 0.9) hits++;
    }
    return hits / SAMPLES;
  }

  let bestLeft = null;
  let bestRight = null;

  for (let t = 0; t < thetaCount; t++) {
    const c = cos[t];
    const s = sin[t];
    if (Math.abs(c) < 0.15) continue; // discard horizontal-ish lines
    const base = t * rhoBins;
    for (let b = 0; b < rhoBins; b++) {
      const score = acc[base + b];
      if (score < CONFIG.lane.minScore) continue;

      const rho = b - diag;
      const xBottom = (rho - yBottom * s) / c;
      const xTop = (rho - yTop * s) / c;
      if (xBottom < -0.25 * W || xBottom > 1.25 * W) continue;
      if (xTop < -0.25 * W || xTop > 1.25 * W) continue;

      const slope = (xBottom - xTop) / span;
      if (Math.abs(slope) < CONFIG.lane.minSlope || Math.abs(slope) > CONFIG.lane.maxSlope) continue;

      const support = supportFor(xTop, xBottom);
      if (support < CONFIG.lane.minSupport) continue;

      const line = {
        xBottom, xTop, slope, score, support,
        quality: score * support,
        theta: t, rho,
      };

      if (slope < 0 && xBottom < W * 0.72) {
        if (!bestLeft || line.quality > bestLeft.quality) bestLeft = line;
      } else if (slope > 0 && xBottom > W * 0.28) {
        if (!bestRight || line.quality > bestRight.quality) bestRight = line;
      }
    }
  }

  let center = null;
  let width = null;
  let offset = null;
  let hasPair = false;

  if (bestLeft && bestRight && bestLeft.xBottom < bestRight.xBottom) {
    const w = bestRight.xBottom - bestLeft.xBottom;
    if (w > W * CONFIG.lane.minWidthRatio && w < W * CONFIG.lane.maxWidthRatio) {
      const topWidth = bestRight.xTop - bestLeft.xTop;
      const topCenter = (bestLeft.xTop + bestRight.xTop) / 2;
      const bottomCenter = (bestLeft.xBottom + bestRight.xBottom) / 2;
      const converges = topWidth > W * 0.02 &&
        topWidth < w * CONFIG.lane.maxTopWidthRatio;
      const centred = Math.abs(topCenter - bottomCenter) < W * CONFIG.lane.maxCenterShiftRatio;

      if (converges && centred) {
        center = bottomCenter;
        width = w;
        // Positive = ego is right of lane centre; negative = drifting left.
        offset = (W / 2 - center) / w;
        hasPair = true;
        bestLeft.xAtRef = bestLeft.xBottom;
        bestRight.xAtRef = bestRight.xBottom;
      }
    }
  }

  return {
    left: bestLeft,
    right: bestRight,
    center,
    width,
    offset,
    hasPair,
    edgeCount,
    yRef,
    yTop,
    yBottom,
  };
}
