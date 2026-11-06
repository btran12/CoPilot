import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { rgbToHsl } from '../utils.js';
import { showAlert } from '../core/alerts.js';
import { playSequence, vibrate } from '../core/audio.js';

// ─────────────────────────────────────────────────────────────
//  TRAFFIC LIGHT — colour detection with spatial clustering.
//
//  A red tail-light or shop sign is a small scattered blob. Real
//  signal heads produce a compact cluster of bright saturated
//  pixels, so we require the winning colour to be concentrated.
// ─────────────────────────────────────────────────────────────

function newStats() {
  return {
    score: 0,
    pixels: 0,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
}

function addSample(stats, x, y, weight) {
  stats.score += weight;
  stats.pixels++;
  if (x < stats.minX) stats.minX = x;
  if (x > stats.maxX) stats.maxX = x;
  if (y < stats.minY) stats.minY = y;
  if (y > stats.maxY) stats.maxY = y;
}

function finishStats(stats, W, H) {
  const spreadX = stats.pixels ? (stats.maxX - stats.minX) / W : 1;
  const spreadY = stats.pixels ? (stats.maxY - stats.minY) / H : 1;
  return { ...stats, spreadX, spreadY };
}

function valid(stats) {
  return (
    stats.score >= CONFIG.light.minScore &&
    stats.pixels >= CONFIG.light.minPixels &&
    stats.spreadX <= CONFIG.light.maxClusterW &&
    stats.spreadY <= CONFIG.light.maxClusterH
  );
}

export function resetTrafficLight() {
  state.light.color = 'none';
  state.light.prevColor = 'none';
  state.light.since = 0;
  state.light.history = [];
  state.light.scores = { r: 0, g: 0, y: 0 };
  state.light.lastSeen = 0;
}

export function updateTrafficLight(pixels, now) {
  const W = CONFIG.proc.width;
  const H = CONFIG.proc.height;
  const roi = CONFIG.light.roi;
  const x1 = Math.floor(W * roi.x0);
  const x2 = Math.floor(W * roi.x1);
  const y1 = Math.floor(H * roi.y0);
  const y2 = Math.floor(H * roi.y1);

  const red = newStats();
  const green = newStats();
  const yellow = newStats();
  const STEP = 2;

  for (let y = y1; y < y2; y += STEP) {
    const row = y * W;
    for (let x = x1; x < x2; x += STEP) {
      const i = (row + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness < CONFIG.light.minBrightness) continue;

      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < CONFIG.light.minSaturation) continue;

      const weight = brightness / 255;

      if ((h >= 340 || h <= 15) && s > 50 && l > 25) {
        addSample(red, x, y, weight);
      } else if (h >= 95 && h <= 165 && s > 45 && l > 20) {
        addSample(green, x, y, weight);
      } else if (h >= 28 && h <= 62 && s > 55 && l > 30) {
        addSample(yellow, x, y, weight);
      }
    }
  }

  const rStats = finishStats(red, W, H);
  const gStats = finishStats(green, W, H);
  const yStats = finishStats(yellow, W, H);

  state.light.scores = { r: rStats.score, g: gStats.score, y: yStats.score };

  const max = Math.max(rStats.score, gStats.score, yStats.score);
  let candidate = 'none';
  if (max >= CONFIG.light.minScore) {
    if (rStats.score === max && valid(rStats) && rStats.score > gStats.score * 1.35 && rStats.score > yStats.score * 1.35) {
      candidate = 'red';
    } else if (gStats.score === max && valid(gStats) && gStats.score > rStats.score * 1.35) {
      candidate = 'green';
    } else if (yStats.score === max && valid(yStats) && yStats.score > rStats.score * 1.2 && yStats.score > gStats.score * 1.2) {
      candidate = 'yellow';
    }
  }

  state.light.history.push(candidate);
  if (state.light.history.length > CONFIG.light.history) state.light.history.shift();

  const counts = { red: 0, green: 0, yellow: 0, none: 0 };
  for (const c of state.light.history) counts[c]++;

  let confirmed = 'none';
  if (counts.red >= CONFIG.light.confirm) confirmed = 'red';
  else if (counts.green >= CONFIG.light.confirm) confirmed = 'green';
  else if (counts.yellow >= CONFIG.light.confirm) confirmed = 'yellow';

  if (confirmed !== 'none') state.light.lastSeen = now;

  if (confirmed !== state.light.color) {
    const prev = state.light.color;
    state.light.prevColor = prev;
    state.light.color = confirmed;
    state.light.since = now;

    if (confirmed === 'red') {
      showAlert({
        level: 'high',
        type: 'red',
        icon: '🚦',
        msg: 'RED LIGHT',
        sub: 'Prepare to stop',
        key: 'light-red',
        speakText: 'Red light.',
        cooldownMs: 4500,
        vibratePattern: [150, 70, 150],
      });
      playSequence([[330, 0, 0.25, 'triangle']]);
    } else if (confirmed === 'yellow') {
      showAlert({
        level: 'normal',
        type: 'yellow',
        icon: '⚠️',
        msg: 'YELLOW LIGHT',
        sub: 'Prepare to stop',
        key: 'light-yellow',
        speakText: 'Yellow light.',
        cooldownMs: 5000,
        vibratePattern: [100],
      });
      playSequence([[440, 0, 0.2, 'triangle']]);
    } else if (confirmed === 'green') {
      // The useful green alert is red -> green transition. A green light
      // that is merely being confirmed continuously should stay quiet.
      if (prev === 'red') {
        showAlert({
          level: 'normal',
          type: 'green',
          icon: '🟢',
          msg: 'GREEN LIGHT',
          sub: 'Proceed when clear',
          key: 'light-green',
          speakText: 'Green light.',
          cooldownMs: 6000,
        });
        playSequence([[523, 0, 0.14], [659, 150, 0.18]]);
      }
    }
  }
}
