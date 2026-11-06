// Shared mutable application state. Perception modules write here; the HUD
// and overlay read from here. Keeping it in one object makes teardown easy.
export const state = {
  running: false,
  startedAt: 0,

  features: {
    motion: true,      // stop / go traffic awareness
    light: true,       // traffic light colour
    detection: true,   // COCO-SSD objects + tracker
    collision: true,   // forward collision warning
    lane: true,        // lane departure warning
    emergency: false,  // experimental emergency-light detector
    voice: true,       // spoken alerts
    sound: true,       // alert tones
  },

  proc: { width: 0, height: 0, pixels: null, prevPixels: null },
  video: { width: 0, height: 0 },

  frameCount: 0,
  fps: 0,
  lastFrameTs: 0,
  lastAlertTime: 0,

  motion: {
    history: [],
    smooth: 0,
    state: 'unknown', // unknown | stopped | moving | slow | driving
    stoppedFrames: 0,
    movingFrames: 0,
    since: 0,
  },

  light: {
    color: 'none',      // none | red | yellow | green
    prevColor: 'none',
    since: 0,
    history: [],
    scores: { r: 0, g: 0, y: 0 },
    lastSeen: 0,
  },

  lane: {
    left: null,
    right: null,
    center: null,
    width: null,
    centerNorm: null,
    offset: null,
    hasPair: false,
    level: 'unknown', // unknown | ok | left | right
    badFrames: 0,
    goodFrames: 0,
    armed: true,
    lastWarnTs: 0,
    lastSeen: 0,
  },

  tracks: [],

  detection: {
    model: null,
    loaded: false,
    loading: false,
    inProgress: false,
    cooldown: 0,
    lastPredictions: [],
    lastRunTs: 0,
    lastPedestrianAlertTs: 0,
    lastBicycleAlertTs: 0,
    lastSignAlertTs: 0,
    counts: { vehicle: 0, pedestrian: 0, bicycle: 0 },
  },

  collision: {
    nearest: null,
    ttc: Infinity,
    distance: null,
    closing: 0,
    level: 'safe', // safe | near | warn | critical
    targetId: null,
    lastCriticalTs: 0,
    lastWarnTs: 0,
    lastNearTs: 0,
  },

  greenLight: {
    stoppedSince: 0,
    nudged: false,
    lastNudgeTs: 0,
  },

  emergency: {
    activeUntil: 0,
    lastWarnTs: 0,
  },

  ego: {
    speed: null,          // m/s, from GPS or null
    speedSource: 'none',  // none | gps
    moving: null,
    stopped: null,
    stoppedSince: 0,
    movingSince: 0,
    lastFixTs: 0,
    gpsEnabled: false,
    lastCoord: null,
    imuReady: false,
    accelVar: 0,
    imuEnergy: 0,
  },

  audioCtx: null,
};

export function resetRuntime() {
  state.proc.pixels = null;
  state.proc.prevPixels = null;
  state.frameCount = 0;
  state.fps = 0;
  state.lastFrameTs = 0;

  state.motion.history = [];
  state.motion.smooth = 0;
  state.motion.state = 'unknown';
  state.motion.stoppedFrames = 0;
  state.motion.movingFrames = 0;
  state.motion.since = 0;

  state.light.color = 'none';
  state.light.prevColor = 'none';
  state.light.since = 0;
  state.light.history = [];
  state.light.scores = { r: 0, g: 0, y: 0 };
  state.light.lastSeen = 0;

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

  state.tracks = [];

  state.detection.pending = false;
  state.detection.inProgress = false;
  state.detection.cooldown = 0;
  state.detection.lastPredictions = [];
  state.detection.lastPedestrianAlertTs = 0;
  state.detection.lastBicycleAlertTs = 0;
  state.detection.lastSignAlertTs = 0;
  state.detection.counts = { vehicle: 0, pedestrian: 0, bicycle: 0 };

  state.collision.nearest = null;
  state.collision.ttc = Infinity;
  state.collision.distance = null;
  state.collision.closing = 0;
  state.collision.level = 'safe';
  state.collision.targetId = null;
  state.collision.lastCriticalTs = 0;
  state.collision.lastWarnTs = 0;
  state.collision.lastNearTs = 0;

  state.greenLight.stoppedSince = 0;
  state.greenLight.nudged = false;
  state.greenLight.lastNudgeTs = 0;

  state.emergency.activeUntil = 0;
  state.emergency.lastWarnTs = 0;

  state.ego.stoppedSince = 0;
  state.ego.movingSince = 0;
}
