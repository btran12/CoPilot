import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { ema, nowMs } from '../utils.js';
import { captureFrame } from './camera.js';
import { updateEgo } from './egomotion.js';
import { updateMotion, resetMotion } from '../perception/motion.js';
import { updateTrafficLight, resetTrafficLight } from '../perception/trafficLight.js';
import { updateLane, resetLane } from '../perception/lane.js';
import { updateObjects, resetObjects } from '../perception/objects.js';
import { updateCollision, resetCollision } from '../perception/collision.js';
import { updateGreenLight } from '../perception/greenLight.js';
import { updateEmergency, resetEmergency } from '../perception/emergency.js';
import { updateHud } from '../ui/hud.js';
import { drawOverlay } from '../ui/overlay.js';

// ─────────────────────────────────────────────────────────────
//  MAIN LOOP
//  One captured frame is shared by every pixel-based detector.
//  COCO-SSD runs asynchronously on a slower cadence.
// ─────────────────────────────────────────────────────────────

let timer = null;

export function startLoop() {
  if (state.running) return;
  state.running = true;
  state.startedAt = nowMs();
  state.lastFrameTs = 0;
  tick();
}

export function stopLoop() {
  state.running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(ms) {
  timer = setTimeout(tick, ms);
}

function tick() {
  if (!state.running) return;

  if (typeof document !== 'undefined' && document.hidden) {
    schedule(500);
    return;
  }

  const now = nowMs();
  try {
    processFrame(now);
  } catch (e) {
    console.error('COPILOT frame error:', e);
  }
  schedule(CONFIG.loopIntervalMs);
}

function processFrame(now) {
  if (!captureFrame()) return;

  state.frameCount++;
  if (state.lastFrameTs) {
    const inst = 1000 / Math.max(1, now - state.lastFrameTs);
    state.fps = ema(state.fps, inst, 0.2);
  }
  state.lastFrameTs = now;

  updateEgo(now);

  if (state.features.motion) {
    updateMotion(state.proc.pixels, state.proc.prevPixels, now);
  } else if (state.motion.state !== 'unknown') {
    resetMotion();
  }

  if (state.features.light) {
    updateTrafficLight(state.proc.pixels, now);
  } else if (state.light.color !== 'none') {
    resetTrafficLight();
  }

  if (state.features.lane) {
    updateLane(now);
  } else if (state.lane.hasPair || state.lane.level !== 'unknown') {
    resetLane();
  }

  if (state.features.detection) {
    updateObjects();
  } else if (state.tracks.length) {
    state.tracks = [];
    state.detection.counts = { vehicle: 0, pedestrian: 0, bicycle: 0 };
  }

  if (state.features.collision) {
    updateCollision(now);
  } else if (state.collision.level !== 'safe') {
    resetCollision();
  }

  updateGreenLight(now);

  if (state.features.emergency) {
    updateEmergency(now);
  } else {
    state.emergency.activeUntil = 0;
  }

  updateHud(now);
  drawOverlay(now);

  // Reuse the previous-frame buffer instead of allocating ~230 KB per
  // frame at 8 fps. getImageData already gives us a fresh array.
  if (state.proc.prevPixels?.length === state.proc.pixels.length) {
    state.proc.prevPixels.set(state.proc.pixels);
  } else {
    state.proc.prevPixels = new Uint8ClampedArray(state.proc.pixels);
  }
}

// Exposed for the debug panel / console.
export function resetAllDetectors() {
  resetMotion();
  resetTrafficLight();
  resetLane();
  resetCollision();
  resetObjects();
  resetEmergency();
}
