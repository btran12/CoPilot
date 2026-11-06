import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { showAlert } from '../core/alerts.js';
import { playSequence, vibrate } from '../core/audio.js';

// ─────────────────────────────────────────────────────────────
//  TRAFFIC MOTION — stop / go awareness using frame differencing.
//
//  Frame differencing cannot tell ego-motion from traffic motion, so
//  this module is deliberately gated: it only raises stop/go alerts
//  when the car itself is slow. At speed, forward-collision warning
//  is the relevant safety signal instead.
// ─────────────────────────────────────────────────────────────

export function resetMotion() {
  state.motion.history = [];
  state.motion.smooth = 0;
  state.motion.state = 'unknown';
  state.motion.stoppedFrames = 0;
  state.motion.movingFrames = 0;
  state.motion.since = 0;
}

export function updateMotion(pixels, prev, now) {
  if (!prev) return;

  const W = CONFIG.proc.width;
  const H = CONFIG.proc.height;
  const z = CONFIG.motion.zone;
  const x1 = Math.floor(W * z.x0);
  const x2 = Math.floor(W * z.x1);
  const y1 = Math.floor(H * z.y0);
  const y2 = Math.floor(H * z.y1);

  let diffSum = 0;
  let count = 0;
  for (let y = y1; y < y2; y++) {
    const row = y * W;
    for (let x = x1; x < x2; x++) {
      const i = (row + x) * 4;
      const dr = Math.abs(pixels[i] - prev[i]);
      const dg = Math.abs(pixels[i + 1] - prev[i + 1]);
      const db = Math.abs(pixels[i + 2] - prev[i + 2]);
      diffSum += (dr + dg + db) / 3;
      count++;
    }
  }

  const avgDiff = count > 0 ? diffSum / count : 0;
  const motionPct = Math.min(100, (avgDiff / 25) * 100);

  state.motion.history.push(motionPct);
  if (state.motion.history.length > 10) state.motion.history.shift();
  const smooth = state.motion.history.reduce((a, b) => a + b, 0) / state.motion.history.length;
  state.motion.smooth = smooth;

  // If GPS says we are driving, stop/go awareness is not applicable.
  const egoFast = state.ego.speed != null && state.ego.speed > CONFIG.motion.fastEgoMps;
  if (egoFast) {
    state.motion.stoppedFrames = 0;
    state.motion.movingFrames = 0;
    state.motion.state = 'driving';
    return;
  }

  const { stopThreshold, moveThreshold, stopFrames, moveFrames } = CONFIG.motion;

  if (smooth < stopThreshold) {
    state.motion.movingFrames = 0;
    state.motion.stoppedFrames++;
    if (state.motion.stoppedFrames === stopFrames) {
      const wasMoving = ['moving', 'slow', 'driving'].includes(state.motion.state);
      state.motion.state = 'stopped';
      state.motion.since = now;
      if (wasMoving) {
        showAlert({
          level: 'high',
          type: 'red',
          icon: '🛑',
          msg: 'TRAFFIC STOPPED',
          sub: 'Vehicle ahead has stopped',
          key: 'traffic-stop',
          speakText: 'Traffic stopped ahead.',
          cooldownMs: 5000,
          vibratePattern: [220, 90, 220],
        });
        playSequence([[220, 0, 0.35, 'sawtooth']]);
      }
    }
  } else if (smooth > moveThreshold) {
    state.motion.stoppedFrames = 0;
    state.motion.movingFrames++;
    if (state.motion.movingFrames === moveFrames) {
      const wasStopped = state.motion.state === 'stopped';
      state.motion.state = 'moving';
      state.motion.since = now;
      if (wasStopped) {
        showAlert({
          level: 'high',
          type: 'green',
          icon: '🟢',
          msg: 'TRAFFIC MOVING',
          sub: 'Vehicle ahead is moving — go when safe',
          key: 'traffic-go',
          speakText: 'Traffic is moving.',
          cooldownMs: 4000,
          vibratePattern: [80, 40, 80, 40, 180],
        });
        playSequence([[523, 0, 0.15], [659, 150, 0.15], [784, 300, 0.22]]);
      }
    }
  } else if (state.motion.state !== 'stopped') {
    state.motion.state = 'slow';
  }
}
