import { linearSlope } from '../utils.js';

// ─────────────────────────────────────────────────────────────
//  COLLISION MATH (DOM-free, unit-testable)
// ─────────────────────────────────────────────────────────────

export function estimateDistanceMeters(bboxHeightPx, realHeightM, videoWidthPx, hfovDeg) {
  if (!(bboxHeightPx > 0) || !(realHeightM > 0) || !(videoWidthPx > 0)) return null;
  const focalPx = (videoWidthPx / 2) / Math.tan((hfovDeg * Math.PI / 180) / 2);
  return (realHeightM * focalPx) / bboxHeightPx;
}

// Time-to-collision from a distance history. Because both distance and
// its derivative are derived from the same assumed object height, the
// result is largely independent of that assumption.
export function ttcFromHistory(points, minClosingMps = 0.7) {
  if (!points || points.length < 2) return { ttc: Infinity, closing: 0 };
  const span = points[points.length - 1].t - points[0].t;
  if (span < 300) return { ttc: Infinity, closing: 0 };

  const slope = linearSlope(points); // metres per second (negative = closing)
  const closing = -slope;
  // Two-point estimates are jitter-prone; demand a clearer approach.
  const threshold = points.length === 2
    ? Math.max(minClosingMps, 1.0)
    : minClosingMps;
  if (closing < threshold) return { ttc: Infinity, closing: Math.max(0, closing) };

  const distance = points[points.length - 1].y;
  if (!(distance > 0)) return { ttc: Infinity, closing };
  return { ttc: distance / closing, closing };
}
