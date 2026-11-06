import assert from 'node:assert/strict';

import { detectLane } from '../js/perception/laneDetect.js';
import { createTracker, updateTracks } from '../js/perception/tracker.js';
import { estimateDistanceMeters, ttcFromHistory } from '../js/perception/collisionMath.js';
import { iou, linearSlope, cooledDown } from '../js/utils.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// ── utils ────────────────────────────────────────────────────
test('IoU of identical boxes is 1', () => {
  assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1);
});

test('linear slope of a descending distance is negative', () => {
  const slope = linearSlope([
    { t: 0, y: 30 },
    { t: 500, y: 29 },
    { t: 1000, y: 28 },
  ]);
  assert.ok(Math.abs(slope + 2) < 1e-6, `expected -2, got ${slope}`);
});

test('a zero timestamp counts as never alerted, even early after load', () => {
  assert.equal(cooledDown(0, 250, 3000), true);
  assert.equal(cooledDown(100, 250, 3000), false);
});

// ── lane detection ───────────────────────────────────────────
const W = 320;
const H = 180;

function drawLine(px, x0, y0, x1, y1, halfWidth = 3) {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / (y1 - y0);
    const x = x0 + (x1 - x0) * t;
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      const xx = Math.round(x + dx);
      const i = (y * W + xx) * 4;
      px[i] = 235;
      px[i + 1] = 235;
      px[i + 2] = 225;
      px[i + 3] = 255;
    }
  }
}

function laneFrame(shift = 0, dashed = false) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 40; px[i + 1] = 42; px[i + 2] = 46; px[i + 3] = 255;
  }
  // Left line converges from centre-top to left-bottom.
  drawLine(px, 140 + shift, 90, 70 + shift, 170);
  // Right line converges from centre-top to right-bottom.
  drawLine(px, 180 + shift, 90, 250 + shift, 170);

  if (dashed) {
    for (let y = 90; y < 170; y++) {
      if (((y >> 2) & 1) === 0) continue;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        px[i] = 40 + ((x * 7 + y * 3) % 25);
        px[i + 1] = 42 + ((x * 5 + y * 7) % 25);
        px[i + 2] = 46 + ((x * 3 + y * 5) % 25);
      }
    }
  }
  return px;
}

test('detects a centred lane pair', () => {
  const result = detectLane(laneFrame(0), W, H);
  assert.ok(result.hasPair, 'expected a lane pair');
  assert.ok(Math.abs(result.offset) < 0.05, `expected centred, got ${result.offset}`);
});

test('reports drifting left when the lane shifts right', () => {
  const result = detectLane(laneFrame(40), W, H);
  assert.ok(result.hasPair, 'expected a lane pair');
  assert.ok(result.offset < -0.12, `expected negative offset, got ${result.offset}`);
});

test('survives dashed lines and asphalt noise', () => {
  const result = detectLane(laneFrame(0, true), W, H);
  assert.ok(result.hasPair, 'expected a lane pair through dashes');
});

// ── tracker ──────────────────────────────────────────────────
test('keeps a stable id across frames', () => {
  const tracker = createTracker();
  let tracks = updateTracks(tracker, [
    { cls: 'car', score: 0.9, bbox: [100, 100, 50, 40] },
  ], 1000);
  assert.equal(tracks.length, 1);
  const id = tracks[0].id;

  tracks = updateTracks(tracker, [
    { cls: 'car', score: 0.88, bbox: [104, 102, 50, 40] },
  ], 1100);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, id);

  tracks = updateTracks(tracker, [
    { cls: 'car', score: 0.88, bbox: [104, 102, 50, 40] },
    { cls: 'car', score: 0.80, bbox: [500, 100, 45, 35] },
  ], 1200);
  assert.equal(tracks.length, 2, 'a distant car should become a second track');
  assert.equal(tracks.find(t => t.id === id).id, id);
});

// ── collision math ───────────────────────────────────────────
test('estimates monocular distance from bbox height', () => {
  const d = estimateDistanceMeters(150, 1.5, 1280, 66);
  assert.ok(Math.abs(d - 9.86) < 0.1, `expected ~9.86m, got ${d}`);
});

test('computes time-to-collision from closing distance', () => {
  const result = ttcFromHistory([
    { t: 0, y: 30 },
    { t: 500, y: 29 },
    { t: 1000, y: 28 },
    { t: 1500, y: 27 },
  ], 0.7);
  assert.ok(Math.abs(result.closing - 2) < 1e-6, `expected 2 m/s, got ${result.closing}`);
  assert.ok(Math.abs(result.ttc - 13.5) < 1e-6, `expected 13.5s, got ${result.ttc}`);
});

test('ignores a stationary target', () => {
  const result = ttcFromHistory([
    { t: 0, y: 20 },
    { t: 500, y: 20 },
    { t: 1000, y: 20 },
  ], 0.7);
  assert.equal(result.ttc, Infinity);
});

console.log(`\n${passed} tests passed.`);
