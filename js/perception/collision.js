import { state } from '../state.js';
import { CONFIG, VEHICLE_CLASSES } from '../config.js';
import { ema, cooledDown } from '../utils.js';
import { showAlert } from '../core/alerts.js';
import { playSequence, playTone, vibrate } from '../core/audio.js';
import { estimateDistanceMeters, ttcFromHistory } from './collisionMath.js';

// ─────────────────────────────────────────────────────────────
//  FORWARD COLLISION WARNING
//
//  Picks the nearest tracked vehicle in the ego lane, estimates its
//  distance from bounding-box height, and computes time-to-collision
//  from the rate of change of that distance. TTC is fairly robust to
//  the monocular scale assumption because it cancels out.
// ─────────────────────────────────────────────────────────────

export function resetCollision() {
  state.collision.nearest = null;
  state.collision.ttc = Infinity;
  state.collision.distance = null;
  state.collision.closing = 0;
  state.collision.level = 'safe';
  state.collision.targetId = null;
}

function pickTarget(now) {
  const vw = state.video.width;
  const vh = state.video.height;
  if (!vw || !vh) return null;

  const laneFresh =
    state.lane.hasPair &&
    state.lane.centerNorm != null &&
    now - state.lane.lastSeen < 600;
  const egoX = laneFresh ? state.lane.centerNorm : 0.5;

  let best = null;

  for (const track of state.tracks) {
    if (!VEHICLE_CLASSES.has(track.cls)) continue;
    if (track.score < CONFIG.collision.minScore) continue;
    if (now - track.lastSeen > CONFIG.collision.maxAgeMs) continue;

    const [x, y, w, h] = track.bbox;
    if (!(h > 4)) continue;
    if ((y + h) / vh < CONFIG.collision.minBottom) continue;

    const cx = (x + w / 2) / vw;
    const lateral = Math.abs(cx - egoX);
    if (lateral > CONFIG.collision.lateralTolerance) continue;

    const realHeight = CONFIG.vehicles[track.cls]?.heightM || 1.5;
    const distance = estimateDistanceMeters(
      h, realHeight, vw, CONFIG.camera.horizontalFovDeg,
    );
    if (distance == null || distance > CONFIG.collision.maxDistanceM) continue;

    // Prefer close and centred vehicles.
    const rank = distance + lateral * 40;
    if (!best || rank < best.rank) {
      best = { track, distance, lateral, cx, rank };
    }
  }

  return best;
}

export function updateCollision(now) {
  const target = pickTarget(now);

  if (!target) {
    resetCollision();
    return;
  }

  const track = target.track;

  // Only append a sample when the tracker actually has a new bbox.
  // Sampling a stale bbox every frame would flatten the approach rate.
  if (track.lastSeen > (track.lastDistSampleTs || 0)) {
    track.lastDistSampleTs = track.lastSeen;
    track.distEMA = ema(track.distEMA, target.distance, 0.35);
    track.distHistory.push({ t: track.lastSeen, y: track.distEMA });
    while (track.distHistory.length && now - track.distHistory[0].t > CONFIG.collision.historyMs) {
      track.distHistory.shift();
    }
  }

  const { ttc, closing } = ttcFromHistory(
    track.distHistory,
    CONFIG.collision.minClosingMps,
  );

  const distance = track.distEMA ?? target.distance;
  const prevLevel = state.collision.level;

  let level = 'safe';
  if (ttc <= CONFIG.collision.ttcCritical) {
    level = 'critical';
  } else if (ttc <= CONFIG.collision.ttcWarn) {
    level = 'warn';
  } else if (
    prevLevel === 'critical' && ttc <= CONFIG.collision.ttcRelease
  ) {
    level = 'warn';
  } else if (distance <= CONFIG.collision.closeDistanceM) {
    // Warn about tailgating only when the car is actually moving;
    // otherwise every red light behind a stopped car would trigger.
    const egoMoving = state.ego.speed != null
      ? state.ego.speed > 2
      : ['moving', 'driving'].includes(state.motion.state);
    if (closing > 0.2 || egoMoving) level = 'near';
  }

  state.collision.nearest = {
    id: track.id,
    cls: track.cls,
    distance,
    ttc,
    closing,
    bbox: track.bbox,
    level,
  };
  state.collision.ttc = ttc;
  state.collision.distance = distance;
  state.collision.closing = closing;
  state.collision.level = level;
  state.collision.targetId = track.id;

  if (level === 'critical' && cooledDown(state.collision.lastCriticalTs, now, CONFIG.collision.criticalCooldownMs)) {
    state.collision.lastCriticalTs = now;
    showAlert({
      level: 'critical',
      type: 'red',
      icon: '🛑',
      msg: 'BRAKE — COLLISION RISK',
      sub: `Vehicle closing in ${ttc.toFixed(1)}s`,
      key: 'fcw-critical',
      speakText: 'Brake. Collision risk.',
      cooldownMs: CONFIG.collision.criticalCooldownMs,
      vibratePattern: [300, 100, 300, 100, 300],
      interruptSpeech: true,
    });
    playSequence([[880, 0, 0.12, 'square'], [660, 140, 0.12, 'square'], [880, 280, 0.18, 'square']]);
  } else if (level === 'warn' && prevLevel !== 'critical' && cooledDown(state.collision.lastWarnTs, now, CONFIG.collision.warnCooldownMs)) {
    state.collision.lastWarnTs = now;
    showAlert({
      level: 'high',
      type: 'orange',
      icon: '⚠️',
      msg: 'VEHICLE CLOSING',
      sub: ttc < 10 ? `Collision risk in ${ttc.toFixed(1)}s` : 'Reduce speed',
      key: 'fcw-warn',
      speakText: `Vehicle closing in ${Math.max(1, Math.round(ttc))} seconds.`,
      cooldownMs: CONFIG.collision.warnCooldownMs,
      vibratePattern: [180, 80, 180],
    });
    playTone(660, 0.2, 'triangle');
  } else if (level === 'near' && cooledDown(state.collision.lastNearTs, now, CONFIG.collision.nearCooldownMs)) {
    state.collision.lastNearTs = now;
    showAlert({
      level: 'normal',
      type: 'yellow',
      icon: '📏',
      msg: 'CLOSE FOLLOWING',
      sub: 'Increase your following distance',
      key: 'fcw-near',
      speakText: 'Following too closely.',
      cooldownMs: CONFIG.collision.nearCooldownMs,
      vibratePattern: [120, 60, 120],
    });
    playTone(440, 0.18, 'sine');
  }
}
