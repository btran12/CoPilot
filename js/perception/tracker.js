import { iou } from '../utils.js';

// ─────────────────────────────────────────────────────────────
//  MULTI-OBJECT TRACKER (DOM-free)
//  Greedy IoU matching gives each vehicle a stable id so distance
//  and time-to-collision can be measured across frames.
// ─────────────────────────────────────────────────────────────

export function createTracker() {
  return { nextId: 1, tracks: [] };
}

export function updateTracks(tracker, detections, now) {
  const active = tracker.tracks.filter(t => now - t.lastSeen < 900);
  const usedDet = new Set();
  const usedTrack = new Set();

  // Score every compatible detection/track pair.
  const pairs = [];
  for (let ti = 0; ti < active.length; ti++) {
    const track = active[ti];
    for (let di = 0; di < detections.length; di++) {
      const det = detections[di];
      if (det.cls !== track.cls) continue;
      const score = iou(track.bbox, det.bbox);
      if (score >= 0.08) pairs.push({ ti, di, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  for (const pair of pairs) {
    if (usedTrack.has(pair.ti) || usedDet.has(pair.di)) continue;
    const track = active[pair.ti];
    const det = detections[pair.di];
    usedTrack.add(pair.ti);
    usedDet.add(pair.di);

    track.bbox = det.bbox;
    track.score = det.score;
    track.lastSeen = now;
    track.age++;
    track.misses = 0;
    track.history.push({ t: now, bbox: det.bbox });
    if (track.history.length > 40) track.history.shift();
  }

  // Missed tracks linger briefly so a dropped detection does not
  // destroy the id (and the distance history).
  for (let ti = 0; ti < active.length; ti++) {
    if (usedTrack.has(ti)) continue;
    const track = active[ti];
    track.misses++;
    if (now - track.lastSeen > 1200 || track.misses > 8) track.dead = true;
  }

  // New detections become new tracks.
  for (let di = 0; di < detections.length; di++) {
    if (usedDet.has(di)) continue;
    const det = detections[di];
    tracker.tracks.push({
      id: tracker.nextId++,
      cls: det.cls,
      score: det.score,
      bbox: det.bbox,
      firstSeen: now,
      lastSeen: now,
      age: 0,
      misses: 0,
      history: [{ t: now, bbox: det.bbox }],
      distEMA: null,
      distHistory: [],
      emgHistory: [],
    });
  }

  tracker.tracks = tracker.tracks.filter(t => !t.dead);
  return tracker.tracks;
}

export function resetTracker(tracker) {
  tracker.tracks = [];
  tracker.nextId = 1;
}
