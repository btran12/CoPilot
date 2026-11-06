// ─────────────────────────────────────────────────────────────
//  CONFIG — all tunable values live here.
//  Units: distances in metres, times in milliseconds unless noted.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Main analysis cadence. 8 fps keeps the CPU cool and is enough for alerts.
  loopIntervalMs: 120,

  // Low-resolution frame used by the pixel-based detectors.
  proc: { width: 320, height: 180 },

  // Phone rear cameras are roughly 65-70° horizontal FOV. Used only for
  // monocular distance estimation, so an approximate value is fine.
  camera: { horizontalFovDeg: 66 },

  motion: {
    zone: { x0: 0.20, x1: 0.80, y0: 0.20, y1: 0.78 },
    stopThreshold: 4,
    moveThreshold: 8,
    stopFrames: 6,
    moveFrames: 5,
    // Stop/go alerts are meaningless while you are already driving fast.
    fastEgoMps: 3.0,
  },

  light: {
    roi: { x0: 0.15, x1: 0.85, y0: 0.02, y1: 0.55 },
    minBrightness: 100,
    minSaturation: 35,
    minScore: 2.6,
    minPixels: 18,
    maxClusterW: 0.42,
    maxClusterH: 0.55,
    history: 12,
    confirm: 6,
  },

  lane: {
    roi: { y0: 0.50, y1: 0.99 },
    edgeThreshold: 60,
    paintBrightness: 105,
    maxEdgePixels: 5000,
    thetaStepDeg: 2,
    thetaMinDeg: 10,
    thetaMaxDeg: 170,
    // The Hough peak is only a seed; a support check along the line
    // rejects random edges, so the accumulator threshold can be low.
    minScore: 5,
    minSupport: 0.40,
    minSlope: 0.16,
    maxSlope: 2.2,
    minWidthRatio: 0.16,
    maxWidthRatio: 0.95,
    // A real lane converges toward the horizon; parallel texture edges do not.
    maxTopWidthRatio: 0.90,
    maxCenterShiftRatio: 0.28,
    // If the ROI is mostly edges, lane detection is unreliable.
    maxEdgeRatio: 0.08,
    confirmFrames: 4,
    releaseFrames: 3,
    warnOffset: 0.33,
    releaseOffset: 0.22,
    cooldownMs: 6000,
    minSpeedMps: 4.5,
    minSceneMotion: 10,
  },

  collision: {
    minScore: 0.42,
    maxAgeMs: 900,
    lateralTolerance: 0.17,
    minBottom: 0.38,
    maxDistanceM: 55,
    ttcCritical: 1.2,
    ttcWarn: 2.6,
    ttcRelease: 3.4,
    minClosingMps: 0.7,
    historyMs: 1600,
    criticalCooldownMs: 3500,
    warnCooldownMs: 7000,
    nearCooldownMs: 12000,
    closeDistanceM: 7,
  },

  greenLight: {
    minStoppedMs: 2500,
    minGreenMs: 1200,
    cooldownMs: 12000,
    clearGapM: 7,
  },

  emergency: {
    // Fraction of a vehicle's roof area that must be saturated red/blue.
    minScore: 0.018,
    alternations: 2,
    windowMs: 1800,
    cooldownMs: 15000,
    activeMs: 3000,
  },

  // Approximate real-world heights, used for monocular distance estimation.
  vehicles: {
    car: { heightM: 1.5 },
    truck: { heightM: 3.0 },
    bus: { heightM: 3.1 },
    motorcycle: { heightM: 1.4 },
    bicycle: { heightM: 1.2 },
    person: { heightM: 1.7 },
  },

  alerts: {
    globalCooldownMs: 1800,
    bannerMs: 4200,
    // Silence lane / info alerts for a moment after monitoring starts.
    startupGraceMs: 2500,
  },
};

export const VEHICLE_CLASSES = new Set(['car', 'truck', 'bus', 'motorcycle']);
export const TRACKED_CLASSES = new Set([
  'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person', 'stop sign',
]);
