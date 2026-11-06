// DOM cache + tiny UI helpers. Imported only by browser-facing modules.
const $ = id => document.getElementById(id);

export const el = {
  video: $('video'),
  overlay: $('overlay-canvas'),
  proc: $('proc-canvas'),
  flash: $('flash'),
  banner: $('alert-banner'),
  alertIcon: $('alert-icon'),
  alertMsg: $('alert-msg'),
  alertSub: $('alert-sub'),
  time: $('time-display'),
  statusDot: $('status-dot'),
  emergencyChip: $('emergency-chip'),
  startBtn: $('start-btn'),
  permissions: $('permissions-screen'),
  permError: $('perm-error'),
  grantBtn: $('grant-btn'),
  gpsOpt: $('gps-opt'),
  valTraffic: $('val-traffic'),
  valSignal: $('val-signal'),
  valCollision: $('val-collision'),
  valLane: $('val-lane'),
  valSpeed: $('val-speed'),
  cardTraffic: $('card-traffic'),
  cardSignal: $('card-signal'),
  cardCollision: $('card-collision'),
  cardLane: $('card-lane'),
  cardSpeed: $('card-speed'),
  unitCollision: $('unit-collision'),
  unitSpeed: $('unit-speed'),
  unitLane: $('unit-lane'),
};

export const overlayCtx = el.overlay.getContext('2d');
export const procCtx = el.proc.getContext('2d', { willReadFrequently: true });

export function setMetric(valueEl, text, cardEl, cls = '') {
  if (!valueEl) return;
  valueEl.textContent = text;
  valueEl.className = 'metric-value' + (cls ? ' ' + cls : '');
  if (cardEl) cardEl.classList.toggle('active', !!cls);
}

export function setButtonState(feature, on) {
  const btn = document.getElementById('btn-' + feature);
  if (!btn) return;
  btn.classList.toggle('on', !!on);
  btn.classList.toggle('warn-on', feature === 'emergency' && !!on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

export function setStatus(color) {
  if (!el.statusDot) return;
  el.statusDot.style.background = color;
}
