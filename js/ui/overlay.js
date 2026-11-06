import { el, overlayCtx } from './dom.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  OVERLAY — a quiet layer over the camera feed.
//
//  Only useful things are drawn: the lane the car is in, tracked
//  objects, and an emergency-vehicle border. Debug zones and the
//  animated scan line were removed to keep the view clean.
//
//  Video is displayed with object-fit: cover, so boxes are mapped
//  through the same crop/scale.
// ─────────────────────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const COLOR = {
  vehicle: 'rgba(190, 200, 214, 0.85)',
  person: 'rgba(255, 176, 102, 0.95)',
  bicycle: 'rgba(245, 196, 81, 0.95)',
  sign: 'rgba(255, 107, 107, 0.95)',
  lane: 'rgba(61, 220, 151, 0.9)',
  laneFill: 'rgba(61, 220, 151, 0.06)',
  safe: 'rgba(100, 168, 255, 0.95)',
  near: 'rgba(245, 196, 81, 0.95)',
  warn: 'rgba(255, 159, 90, 1)',
  critical: 'rgba(255, 107, 107, 1)',
};

function makeMapper(W, H) {
  const vw = state.video.width || 1;
  const vh = state.video.height || 1;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  return {
    rect(bbox) {
      const [x, y, w, h] = bbox;
      return {
        x: dx + x * scale,
        y: dy + y * scale,
        w: w * scale,
        h: h * scale,
      };
    },
    procPoint(px, py) {
      const vx = (px / CONFIG.proc.width) * vw;
      const vy = (py / CONFIG.proc.height) * vh;
      return { x: dx + vx * scale, y: dy + vy * scale };
    },
  };
}

function classColor(cls) {
  if (cls === 'person') return COLOR.person;
  if (cls === 'bicycle') return COLOR.bicycle;
  if (cls === 'stop sign') return COLOR.sign;
  return COLOR.vehicle;
}

function targetColor(level) {
  if (level === 'critical') return COLOR.critical;
  if (level === 'warn') return COLOR.warn;
  if (level === 'near') return COLOR.near;
  return COLOR.safe;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawLabel(ctx, r, color, text) {
  ctx.font = `600 11px ${FONT}`;
  const tw = ctx.measureText(text).width + 10;
  const th = 18;
  const x = r.x;
  const y = r.y > th + 4 ? r.y - th - 3 : r.y + 3;

  ctx.fillStyle = 'rgba(8, 9, 11, 0.72)';
  ctx.fillRect(x, y, tw, th);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 5, y + th / 2 + 0.5);
}

export function drawOverlay(now) {
  const W = el.overlay.width;
  const H = el.overlay.height;
  if (!W || !H) return;

  overlayCtx.clearRect(0, 0, W, H);
  if (!state.running) return;

  const map = makeMapper(W, H);
  const procH = CONFIG.proc.height;

  // Lane lines + a very light fill between them.
  if (state.features.lane && state.lane.hasPair) {
    const yTop = procH * CONFIG.lane.roi.y0;
    const yBottom = procH * CONFIG.lane.roi.y1 - 1;
    const left = state.lane.left;
    const right = state.lane.right;

    if (left && right) {
      const lt = map.procPoint(left.xTop, yTop);
      const lb = map.procPoint(left.xBottom, yBottom);
      const rt = map.procPoint(right.xTop, yTop);
      const rb = map.procPoint(right.xBottom, yBottom);

      overlayCtx.save();
      overlayCtx.beginPath();
      overlayCtx.moveTo(lt.x, lt.y);
      overlayCtx.lineTo(rt.x, rt.y);
      overlayCtx.lineTo(rb.x, rb.y);
      overlayCtx.lineTo(lb.x, lb.y);
      overlayCtx.closePath();
      overlayCtx.fillStyle = COLOR.laneFill;
      overlayCtx.fill();

      overlayCtx.strokeStyle = COLOR.lane;
      overlayCtx.lineWidth = 2;
      overlayCtx.lineCap = 'round';
      overlayCtx.beginPath();
      overlayCtx.moveTo(lt.x, lt.y);
      overlayCtx.lineTo(lb.x, lb.y);
      overlayCtx.moveTo(rt.x, rt.y);
      overlayCtx.lineTo(rb.x, rb.y);
      overlayCtx.stroke();
      overlayCtx.restore();
    }
  }

  // Tracked objects: thin boxes, one short label each.
  if (state.features.detection) {
    for (const track of state.tracks) {
      if (now - track.lastSeen > 700) continue;

      const r = map.rect(track.bbox);
      const isTarget = track.id === state.collision.targetId;
      const color = isTarget ? targetColor(state.collision.level) : classColor(track.cls);

      overlayCtx.save();
      overlayCtx.strokeStyle = color;
      overlayCtx.lineWidth = isTarget ? 2.5 : 1.5;
      overlayCtx.strokeRect(r.x, r.y, r.w, r.h);

      let label = capitalize(track.cls);
      if (isTarget && state.collision.distance != null) {
        label += `  ${state.collision.distance.toFixed(0)} m`;
        if (Number.isFinite(state.collision.ttc) && state.collision.ttc < 10) {
          label += ` · ${state.collision.ttc.toFixed(1)} s`;
        }
      }

      drawLabel(overlayCtx, r, color, label);
      overlayCtx.restore();
    }
  }

  // Emergency-vehicle border: red / blue alternation.
  if (state.emergency.activeUntil > now) {
    const blue = Math.floor(now / 160) % 2 === 0;
    overlayCtx.save();
    overlayCtx.strokeStyle = blue
      ? 'rgba(107, 147, 255, 0.9)'
      : 'rgba(255, 107, 107, 0.9)';
    overlayCtx.lineWidth = 4;
    overlayCtx.strokeRect(5, 5, W - 10, H - 10);
    overlayCtx.restore();
  }
}
