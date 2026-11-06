import { state } from '../state.js';
import { CONFIG, TRACKED_CLASSES } from '../config.js';
import { el } from '../ui/dom.js';
import { createTracker, updateTracks, resetTracker } from './tracker.js';
import { showAlert } from '../core/alerts.js';
import { playTone, vibrate } from '../core/audio.js';
import { nowMs, cooledDown } from '../utils.js';

// ─────────────────────────────────────────────────────────────
//  OBJECT DETECTION — COCO-SSD + tracking
//  Alerts are raised once per new pedestrian / cyclist / stop sign
//  track, never per frame.
// ─────────────────────────────────────────────────────────────

const tracker = createTracker();

export async function initObjectDetection() {
  if (state.detection.loaded || state.detection.loading) return;
  state.detection.loading = true;
  try {
    if (typeof window === 'undefined' || !window.cocoSsd) {
      throw new Error('COCO-SSD library not loaded');
    }
    state.detection.model = await window.cocoSsd.load();
    state.detection.loaded = true;
  } catch (e) {
    console.warn('Object detection unavailable:', e);
  } finally {
    state.detection.loading = false;
  }
}

export function resetObjects() {
  resetTracker(tracker);
  state.tracks = [];
  state.detection.lastPredictions = [];
  state.detection.inProgress = false;
  state.detection.cooldown = 0;
  state.detection.counts = { vehicle: 0, pedestrian: 0, bicycle: 0 };
}

export function updateObjects() {
  if (!state.detection.loaded || state.detection.inProgress) return;

  state.detection.cooldown++;
  if (state.detection.cooldown < 4) return;
  state.detection.cooldown = 0;

  if (!el.video || !el.video.videoWidth) return;

  state.detection.inProgress = true;
  const started = nowMs();

  state.detection.model.detect(el.video, 24, 0.35)
    .then(predictions => {
      if (!state.running) return;
      processPredictions(predictions, nowMs(), started);
    })
    .catch(() => { /* detection is best-effort */ })
    .finally(() => {
      state.detection.inProgress = false;
    });
}

function processPredictions(predictions, now) {
  const detections = predictions
    .filter(p => p.score >= CONFIG.collision.minScore)
    .map(p => ({
      cls: p.class.toLowerCase(),
      score: p.score,
      bbox: p.bbox,
    }))
    .filter(p => TRACKED_CLASSES.has(p.cls));

  const tracks = updateTracks(tracker, detections, now);
  state.tracks = tracks;
  state.detection.lastPredictions = predictions;
  state.detection.lastRunTs = now;

  const counts = { vehicle: 0, pedestrian: 0, bicycle: 0 };
  for (const t of tracks) {
    if (now - t.lastSeen > 600) continue;
    if (['car', 'truck', 'bus', 'motorcycle'].includes(t.cls)) counts.vehicle++;
    else if (t.cls === 'person') counts.pedestrian++;
    else if (t.cls === 'bicycle') counts.bicycle++;
  }
  state.detection.counts = counts;

  // Only fire for tracks created in this detection pass.
  const fresh = tracks.filter(t => now - t.firstSeen < 80);

  const pedestrian = fresh.find(t => t.cls === 'person');
  if (pedestrian && cooledDown(state.detection.lastPedestrianAlertTs, now, 5000)) {
    state.detection.lastPedestrianAlertTs = now;
    showAlert({
      level: 'high',
      type: 'orange',
      icon: '🚶',
      msg: 'PEDESTRIAN AHEAD',
      sub: 'Person detected near the road',
      key: 'obj-person',
      speakText: 'Pedestrian ahead.',
      cooldownMs: 5000,
      vibratePattern: [120, 60, 120],
    });
    playTone(330, 0.22, 'sine');
  }

  const bicycle = fresh.find(t => t.cls === 'bicycle');
  if (bicycle && cooledDown(state.detection.lastBicycleAlertTs, now, 7000)) {
    state.detection.lastBicycleAlertTs = now;
    showAlert({
      level: 'normal',
      type: 'yellow',
      icon: '🚴',
      msg: 'CYCLIST AHEAD',
      sub: 'Give cyclists room',
      key: 'obj-bicycle',
      speakText: 'Cyclist ahead.',
      cooldownMs: 7000,
    });
    playTone(523, 0.16, 'sine');
  }

  const stopSign = fresh.find(t => t.cls === 'stop sign');
  if (stopSign && cooledDown(state.detection.lastSignAlertTs, now, 8000)) {
    state.detection.lastSignAlertTs = now;
    showAlert({
      level: 'normal',
      type: 'red',
      icon: '🛑',
      msg: 'STOP SIGN',
      sub: 'Stop sign detected ahead',
      key: 'obj-stop-sign',
      speakText: 'Stop sign ahead.',
      cooldownMs: 8000,
      vibratePattern: [160, 80, 160],
    });
    playTone(220, 0.32, 'sine');
  }
}
