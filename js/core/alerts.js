import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { el } from '../ui/dom.js';
import { speak, vibrate } from './audio.js';

// ─────────────────────────────────────────────────────────────
//  ALERT MANAGER
//  One banner. Priority alerts bypass the global cooldown; routine
//  alerts are debounced per key and globally so the screen stays calm.
// ─────────────────────────────────────────────────────────────

export const LEVEL = { info: 0, normal: 1, high: 2, critical: 3 };

const cooldowns = new Map();
let hideTimer = null;

export function resetAlerts() {
  cooldowns.clear();
  hideTimer = null;
  state.lastAlertTime = 0;
  hideAlert();
}

export function showAlert({
  level = 'normal',
  type = 'cyan',
  icon = '⚠️',
  msg = 'ALERT',
  sub = '',
  key = msg,
  speakText = '',
  cooldownMs = 3000,
  vibratePattern = null,
  interruptSpeech = false,
}) {
  const now = Date.now();
  const priority = LEVEL[level] ?? LEVEL.normal;
  const isPriority = priority >= LEVEL.high;

  const last = cooldowns.get(key) || 0;
  if (now - last < cooldownMs) return false;

  // Routine alerts must yield to any recent alert.
  if (!isPriority && now - state.lastAlertTime < CONFIG.alerts.globalCooldownMs) {
    return false;
  }

  cooldowns.set(key, now);
  state.lastAlertTime = now;

  if (el.banner) {
    el.banner.className = `alert-${type} show`;
    if (el.alertIcon) el.alertIcon.textContent = icon;
    if (el.alertMsg) el.alertMsg.textContent = msg;
    if (el.alertSub) el.alertSub.textContent = sub || '';
  }

  if (el.flash) {
    el.flash.className = `flash-${type}`;
    el.flash.style.opacity = '1';
    setTimeout(() => { el.flash.style.opacity = '0'; }, 180);
  }

  if (speakText) speak(speakText, { interrupt: interruptSpeech });
  if (vibratePattern) vibrate(vibratePattern);

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hideAlert(), CONFIG.alerts.bannerMs);
  return true;
}

export function hideAlert() {
  if (el.banner) el.banner.classList.remove('show');
}
