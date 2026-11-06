import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { ema } from '../utils.js';
import { showAlert } from '../core/alerts.js';
import { playTone, vibrate } from '../core/audio.js';
import { detectLane } from './laneDetect.js';

// ─────────────────────────────────────────────────────────────
//  LANE DEPARTURE WARNING
//
//  Runs only when the car is actually moving. A departure must be
//  sustained for several frames, and re-arms only after the car
//  returns towards the lane centre — one warning per drift event.
// ─────────────────────────────────────────────────────────────

export function resetLane() {
  state.lane.left = null;
  state.lane.right = null;
  state.lane.center = null;
  state.lane.width = null;
  state.lane.centerNorm = null;
  state.lane.offset = null;
  state.lane.hasPair = false;
  state.lane.level = 'unknown';
  state.lane.badFrames = 0;
  state.lane.goodFrames = 0;
  state.lane.armed = true;
  state.lane.lastWarnTs = 0;
  state.lane.lastSeen = 0;
}

export function updateLane(now) {
  if (!state.proc.pixels) return;

  const W = CONFIG.proc.width;
  const H = CONFIG.proc.height;
  const result = detectLane(state.proc.pixels, W, H);

  state.lane.left = result.left;
  state.lane.right = result.right;

  if (result.hasPair) {
    state.lane.center = result.center;
    state.lane.width = result.width;
    state.lane.centerNorm = result.center / W;
    state.lane.offset = ema(state.lane.offset, result.offset, 0.45);
    state.lane.hasPair = true;
    state.lane.lastSeen = now;
  } else if (now - state.lane.lastSeen > 700) {
    state.lane.hasPair = false;
    state.lane.offset = null;
    state.lane.centerNorm = null;
    state.lane.level = 'unknown';
    state.lane.badFrames = 0;
  }

  const speed = state.ego.speed;
  const moving = speed != null
    ? speed >= CONFIG.lane.minSpeedMps
    : state.motion.smooth >= CONFIG.lane.minSceneMotion;

  if (!moving) {
    state.lane.level = state.lane.hasPair ? 'ok' : 'unknown';
    state.lane.badFrames = 0;
    state.lane.armed = true;
    return;
  }

  if (!state.lane.hasPair || state.lane.offset == null) return;
  if (now - state.lane.lastSeen > 400) return;

  const absOffset = Math.abs(state.lane.offset);

  if (absOffset < CONFIG.lane.releaseOffset) {
    state.lane.armed = true;
    state.lane.badFrames = 0;
    state.lane.level = 'ok';
    return;
  }

  if (absOffset > CONFIG.lane.warnOffset) {
    state.lane.badFrames++;
    state.lane.level = state.lane.offset < 0 ? 'left' : 'right';
  } else {
    state.lane.badFrames = Math.max(0, state.lane.badFrames - 1);
    state.lane.level = 'ok';
  }

  if (
    state.lane.armed &&
    state.lane.badFrames >= CONFIG.lane.confirmFrames &&
    now - state.startedAt > CONFIG.alerts.startupGraceMs
  ) {
    const left = state.lane.offset < 0;
    state.lane.armed = false;
    state.lane.badFrames = 0;
    state.lane.lastWarnTs = now;

    showAlert({
      level: 'high',
      type: 'orange',
      icon: '↔️',
      msg: left ? 'DRIFTING LEFT' : 'DRIFTING RIGHT',
      sub: 'Lane departure — correct your path',
      key: left ? 'lane-left' : 'lane-right',
      speakText: left ? 'Drifting left.' : 'Drifting right.',
      cooldownMs: 3000,
      vibratePattern: [140, 70, 140],
    });
    playTone(300, 0.3, 'triangle');
  }
}
