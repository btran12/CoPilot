import { state } from '../state.js';
import { haversineMeters, nowMs, variance } from '../utils.js';

// ─────────────────────────────────────────────────────────────
//  EGO MOTION — how fast am I going, and am I stopped?
//
//  GPS speed is the primary source. If GPS is unavailable, a small
//  accelerometer-energy heuristic provides a rough fallback. Both
//  are used only for gating and the green-light nudge; nothing is
//  transmitted anywhere.
// ─────────────────────────────────────────────────────────────

let watchId = null;
let motionAttached = false;
let motionSamples = [];

export function initEgoMotion() {
  startDeviceMotion();
}

export function enableGps() {
  state.ego.gpsEnabled = true;
  startGps();
}

function startGps() {
  if (watchId != null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000,
    });
  } catch (_) { /* ignore */ }
}

function onGpsError() {
  // Permission denied or no fix: silently fall back to IMU / scene motion.
}

function onPosition(position) {
  const { coords } = position;
  if (coords.accuracy != null && coords.accuracy > 100) return;

  const t = nowMs();
  let speed = null;
  if (Number.isFinite(coords.speed) && coords.speed >= 0) {
    speed = coords.speed;
  } else if (state.ego.lastCoord) {
    const prev = state.ego.lastCoord;
    const dt = (t - prev.t) / 1000;
    if (dt > 0.4) {
      speed = haversineMeters(prev.lat, prev.lon, coords.latitude, coords.longitude) / dt;
    }
  }

  state.ego.lastCoord = { lat: coords.latitude, lon: coords.longitude, t };
  state.ego.speed = speed != null && speed >= 0 && speed < 90 ? speed : null;
  state.ego.speedSource = state.ego.speed != null ? 'gps' : 'none';
  state.ego.lastFixTs = t;
}

function startDeviceMotion() {
  if (motionAttached || typeof window === 'undefined') return;

  const attach = () => {
    if (motionAttached) return;
    window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
    motionAttached = true;
  };

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS: must be requested from a user gesture.
    DeviceMotionEvent.requestPermission()
      .then(result => { if (result === 'granted') attach(); })
      .catch(() => {});
  } else {
    attach();
  }
}

function onDeviceMotion(event) {
  let magnitude = null;

  if (event.acceleration &&
      event.acceleration.x != null &&
      event.acceleration.y != null &&
      event.acceleration.z != null) {
    magnitude = Math.hypot(
      event.acceleration.x,
      event.acceleration.y,
      event.acceleration.z,
    );
  } else if (event.accelerationIncludingGravity &&
             event.accelerationIncludingGravity.x != null) {
    const g = event.accelerationIncludingGravity;
    magnitude = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  }

  if (magnitude == null) return;

  motionSamples.push(magnitude);
  if (motionSamples.length > 24) motionSamples.shift();
  state.ego.accelVar = variance(motionSamples);
  if (motionSamples.length >= 12) state.ego.imuReady = true;
}

export function updateEgo(now) {
  const ego = state.ego;
  const gpsFresh =
    ego.speedSource === 'gps' &&
    ego.speed != null &&
    now - ego.lastFixTs < 6000;

  if (!gpsFresh && ego.speedSource === 'gps') {
    ego.speed = null;
    ego.speedSource = 'none';
  }

  let candidateStopped = null;
  let candidateMoving = null;

  if (gpsFresh) {
    candidateStopped = ego.speed < 0.6;
    candidateMoving = ego.speed > 1.2;
  } else if (ego.imuReady) {
    if (ego.accelVar < 0.15) candidateStopped = true;
    else if (ego.accelVar > 0.55) candidateMoving = true;
  }

  // Debounce so a single sensor sample cannot flip the state.
  if (candidateStopped === true) {
    if (!ego.stoppedSince) ego.stoppedSince = now;
    ego.stopped = now - ego.stoppedSince >= 700;
    if (ego.stopped) ego.movingSince = 0;
  } else if (candidateStopped === false) {
    ego.stoppedSince = 0;
    ego.stopped = false;
  } else {
    ego.stoppedSince = 0;
    ego.stopped = null;
  }

  if (candidateMoving === true) {
    if (!ego.movingSince) ego.movingSince = now;
    ego.moving = now - ego.movingSince >= 400;
  } else if (candidateMoving === false) {
    ego.movingSince = 0;
    ego.moving = false;
  } else {
    ego.movingSince = 0;
    ego.moving = null;
  }
}
