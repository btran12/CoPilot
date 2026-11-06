import { el, setMetric } from './dom.js';
import { state } from '../state.js';
import { metersPerSecondToMph } from '../utils.js';

// ─────────────────────────────────────────────────────────────
//  HUD — turns state into glanceable metric cards.
// ─────────────────────────────────────────────────────────────

function setUnit(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

export function updateHud(now) {
  // Traffic
  const traffic = state.motion.state;
  if (traffic === 'stopped') {
    setMetric(el.valTraffic, 'STOP', el.cardTraffic, 'danger');
  } else if (traffic === 'moving') {
    setMetric(el.valTraffic, 'MOVE', el.cardTraffic, 'ok');
  } else if (traffic === 'slow') {
    setMetric(el.valTraffic, 'SLOW', el.cardTraffic, 'warn');
  } else if (traffic === 'driving') {
    setMetric(el.valTraffic, 'DRIVE', el.cardTraffic, 'ok');
  } else {
    setMetric(el.valTraffic, '—', el.cardTraffic, '');
  }

  // Signal
  const light = state.light.color;
  if (light === 'red') setMetric(el.valSignal, 'RED', el.cardSignal, 'danger');
  else if (light === 'yellow') setMetric(el.valSignal, 'YLW', el.cardSignal, 'warn');
  else if (light === 'green') setMetric(el.valSignal, 'GRN', el.cardSignal, 'ok');
  else setMetric(el.valSignal, '—', el.cardSignal, '');

  // Collision
  const c = state.collision;
  if (c.level === 'critical' && Number.isFinite(c.ttc)) {
    setMetric(el.valCollision, c.ttc.toFixed(1), el.cardCollision, 'danger');
    setUnit(el.unitCollision, 'SEC TTC');
  } else if (c.level === 'warn' && Number.isFinite(c.ttc)) {
    setMetric(el.valCollision, c.ttc.toFixed(1), el.cardCollision, 'warn');
    setUnit(el.unitCollision, 'SEC TTC');
  } else if (c.distance != null) {
    setMetric(el.valCollision, Math.round(c.distance).toString(), el.cardCollision, c.level === 'near' ? 'warn' : 'ok');
    setUnit(el.unitCollision, 'METERS');
  } else {
    setMetric(el.valCollision, '—', el.cardCollision, '');
    setUnit(el.unitCollision, 'TTC');
  }

  // Lane
  if (state.lane.level === 'left') {
    setMetric(el.valLane, 'LEFT', el.cardLane, 'danger');
    setUnit(el.unitLane, 'DRIFT');
  } else if (state.lane.level === 'right') {
    setMetric(el.valLane, 'RIGHT', el.cardLane, 'danger');
    setUnit(el.unitLane, 'DRIFT');
  } else if (state.lane.level === 'ok') {
    setMetric(el.valLane, 'OK', el.cardLane, 'ok');
    setUnit(el.unitLane, 'LANE');
  } else {
    setMetric(el.valLane, '—', el.cardLane, '');
    setUnit(el.unitLane, 'LANE');
  }

  // Speed
  if (state.ego.speed != null) {
    const mph = metersPerSecondToMph(state.ego.speed);
    setMetric(el.valSpeed, Math.round(mph).toString(), el.cardSpeed, 'ok');
    setUnit(el.unitSpeed, 'MPH');
  } else {
    setMetric(el.valSpeed, '—', el.cardSpeed, '');
    setUnit(el.unitSpeed, state.ego.gpsEnabled ? 'NO FIX' : 'NO GPS');
  }

  // Emergency chip
  if (el.emergencyChip) {
    el.emergencyChip.classList.toggle('show', state.emergency.activeUntil > now);
  }
}

export function clearHud() {
  setMetric(el.valTraffic, '—', el.cardTraffic, '');
  setMetric(el.valSignal, '—', el.cardSignal, '');
  setMetric(el.valCollision, '—', el.cardCollision, '');
  setMetric(el.valLane, '—', el.cardLane, '');
  setMetric(el.valSpeed, '—', el.cardSpeed, '');
  setUnit(el.unitCollision, 'TTC');
  setUnit(el.unitSpeed, state.ego.gpsEnabled ? 'NO FIX' : 'NO GPS');
  setUnit(el.unitLane, 'LANE');
  if (el.emergencyChip) el.emergencyChip.classList.remove('show');
}
