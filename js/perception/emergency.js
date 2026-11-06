import { state } from '../state.js';
import { CONFIG, VEHICLE_CLASSES } from '../config.js';
import { cooledDown } from '../utils.js';
import { showAlert } from '../core/alerts.js';
import { playTone, vibrate } from '../core/audio.js';

// ─────────────────────────────────────────────────────────────
//  EMERGENCY VEHICLE — EXPERIMENTAL
//
//  Looks at the roof area of each tracked vehicle for saturated
//  red/blue light-bar flashes and requires the dominant colour to
//  alternate. This catches marked police / fire / ambulance units
//  with their lights on. It does NOT detect unmarked cars, and a
//  forward camera cannot see an emergency vehicle approaching from
//  behind. Treat this as a prototype, not a guarantee.
// ─────────────────────────────────────────────────────────────

export function resetEmergency() {
  state.emergency.activeUntil = 0;
}

function analyseTrackRoof(track) {
  const pixels = state.proc.pixels;
  const W = CONFIG.proc.width;
  const H = CONFIG.proc.height;
  const vw = state.video.width;
  const vh = state.video.height;
  if (!pixels || !vw || !vh) return null;

  const [x, y, w, h] = track.bbox;
  // Roof / light-bar area: top 45% of the vehicle box.
  const px0 = Math.max(0, Math.floor((x / vw) * W));
  const px1 = Math.min(W, Math.ceil(((x + w) / vw) * W));
  const py0 = Math.max(0, Math.floor((y / vh) * H));
  const py1 = Math.min(H, Math.ceil(((y + h * 0.45) / vh) * H));
  if (px1 - px0 < 4 || py1 - py0 < 3) return null;

  let red = 0;
  let blue = 0;
  let total = 0;

  for (let yy = py0; yy < py1; yy++) {
    const row = yy * W;
    for (let xx = px0; xx < px1; xx++) {
      const i = (row + xx) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness < 70) continue;
      if (r > 110 && r > g * 1.5 && r > b * 1.35) red++;
      else if (b > 110 && b > r * 1.35 && b > g * 1.15) blue++;
      total++;
    }
  }

  if (total < 60) return null;
  return { red: red / total, blue: blue / total };
}

function hasAlternation(history, now) {
  const recent = history.filter(h => now - h.t <= CONFIG.emergency.windowMs);
  if (recent.length < 3) return false;

  let maxRed = 0;
  let maxBlue = 0;
  for (const h of recent) {
    if (h.red > maxRed) maxRed = h.red;
    if (h.blue > maxBlue) maxBlue = h.blue;
  }
  if (maxRed < CONFIG.emergency.minScore || maxBlue < CONFIG.emergency.minScore) {
    return false;
  }

  let alternations = 0;
  let last = 0;
  for (const h of recent) {
    const sign = h.red > h.blue * 1.05 ? 1 : h.blue > h.red * 1.05 ? -1 : 0;
    if (sign !== 0) {
      if (last !== 0 && sign !== last) alternations++;
      last = sign;
    }
  }
  return alternations >= CONFIG.emergency.alternations;
}

export function updateEmergency(now) {
  if (!state.proc.pixels) return;

  let found = false;

  for (const track of state.tracks) {
    if (!VEHICLE_CLASSES.has(track.cls)) continue;
    if (now - track.lastSeen > 700) continue;

    const sample = analyseTrackRoof(track);
    if (!sample) continue;

    track.emgHistory.push({ t: now, red: sample.red, blue: sample.blue });
    while (track.emgHistory.length && now - track.emgHistory[0].t > CONFIG.emergency.windowMs) {
      track.emgHistory.shift();
    }

    if (hasAlternation(track.emgHistory, now)) {
      found = true;
      break;
    }
  }

  if (!found) return;
  if (!cooledDown(state.emergency.lastWarnTs, now, CONFIG.emergency.cooldownMs)) {
    state.emergency.activeUntil = Math.max(state.emergency.activeUntil, now + CONFIG.emergency.activeMs);
    return;
  }

  state.emergency.lastWarnTs = now;
  state.emergency.activeUntil = now + CONFIG.emergency.activeMs;

  showAlert({
    level: 'critical',
    type: 'red',
    icon: '🚨',
    msg: 'EMERGENCY VEHICLE',
    sub: 'Flashing red/blue lights — yield when safe',
    key: 'emergency-vehicle',
    speakText: 'Emergency vehicle nearby. Yield when safe.',
    cooldownMs: CONFIG.emergency.cooldownMs,
    vibratePattern: [250, 100, 250, 100, 250],
    interruptSpeech: true,
  });
  playTone(700, 0.35, 'sawtooth');
}
