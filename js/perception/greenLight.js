import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { cooledDown } from '../utils.js';
import { showAlert } from '../core/alerts.js';
import { playSequence, vibrate } from '../core/audio.js';

// ─────────────────────────────────────────────────────────────
//  GREEN-LIGHT NUDGE
//
//  Fires only when all of these are true:
//    • the light has been confirmed green for a moment
//    • the car has been stationary for a couple of seconds
//    • there is no stopped vehicle blocking the lane
//    • the car has not already been nudged for this light cycle
// ─────────────────────────────────────────────────────────────

export function resetGreenLight() {
  state.greenLight.stoppedSince = 0;
  state.greenLight.nudged = false;
}

export function updateGreenLight(now) {
  const gl = state.greenLight;

  const stopped =
    state.ego.stopped === true ||
    (state.ego.stopped === null &&
      state.motion.state === 'stopped' &&
      state.motion.smooth < 5);

  if (!stopped) {
    gl.stoppedSince = 0;
    gl.nudged = false;
    return;
  }

  if (!gl.stoppedSince) gl.stoppedSince = now;

  const light = state.light;
  if (light.color !== 'green') {
    gl.nudged = false;
    return;
  }

  if (now - light.since < CONFIG.greenLight.minGreenMs) return;
  if (now - light.lastSeen > 1600) return; // no longer visible
  if (now - gl.stoppedSince < CONFIG.greenLight.minStoppedMs) return;
  if (now - state.startedAt < CONFIG.alerts.startupGraceMs) return;
  if (gl.nudged) return;
  if (!cooledDown(gl.lastNudgeTs, now, CONFIG.greenLight.cooldownMs)) return;

  // The traffic-motion alert already says "go" when the queue moves.
  // Avoid a duplicate nudge right on top of it.
  if (state.motion.state === 'moving' && now - state.motion.since < 5000) return;

  // If a vehicle is still sitting directly ahead, a nudge is pointless.
  const target = state.collision.nearest;
  if (
    target &&
    target.distance != null &&
    target.distance < CONFIG.greenLight.clearGapM &&
    target.closing < 0.5
  ) {
    return;
  }

  gl.nudged = true;
  gl.lastNudgeTs = now;

  showAlert({
    level: 'high',
    type: 'green',
    icon: '🟢',
    msg: 'GREEN LIGHT',
    sub: 'Still stopped — go when safe',
    key: 'green-nudge',
    speakText: 'Green light. Go when safe.',
    cooldownMs: CONFIG.greenLight.cooldownMs,
    vibratePattern: [120, 60, 120, 60, 180],
  });
  playSequence([[523, 0, 0.14], [659, 160, 0.14], [784, 320, 0.22]]);
}
