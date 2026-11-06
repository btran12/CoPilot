import { state, resetRuntime } from './state.js';
import { CONFIG } from './config.js';
import { el, setButtonState, setStatus } from './ui/dom.js';
import { clearHud, updateHud } from './ui/hud.js';
import { requestCamera, resizeCanvases } from './core/camera.js';
import { initEgoMotion, enableGps } from './core/egomotion.js';
import { unlockAudio, speak } from './core/audio.js';
import { initVoice, getVoiceChoices, getSelectedVoiceURI, setSelectedVoiceURI } from './core/voice.js';
import { resetAlerts } from './core/alerts.js';
import { startLoop, stopLoop, resetAllDetectors } from './core/loop.js';
import { initObjectDetection, resetObjects } from './perception/objects.js';
import { resetMotion } from './perception/motion.js';
import { resetTrafficLight, updateTrafficLight } from './perception/trafficLight.js';
import { resetLane, updateLane } from './perception/lane.js';
import { resetCollision, updateCollision } from './perception/collision.js';
import { resetGreenLight, updateGreenLight } from './perception/greenLight.js';
import { resetEmergency } from './perception/emergency.js';

// ─────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────────────────────

function startClock() {
  const tick = () => {
    const n = new Date();
    const h = String(n.getHours()).padStart(2, '0');
    const m = String(n.getMinutes()).padStart(2, '0');
    if (el.time) el.time.textContent = `${h}:${m}`;
  };
  tick();
  setInterval(tick, 1000);
}

function startMonitoring() {
  if (state.running) return;

  resetRuntime();
  resetAllDetectors();
  resetAlerts();
  clearHud();

  setStatus('var(--cyan)');
  if (el.startBtn) {
    el.startBtn.textContent = 'Stop monitoring';
    el.startBtn.classList.add('active');
  }
  startLoop();
}

function stopMonitoring() {
  stopLoop();
  resetMotion();
  resetTrafficLight();
  resetLane();
  resetCollision();
  resetGreenLight();
  resetEmergency();
  state.emergency.activeUntil = 0;
  clearHud();
  setStatus('var(--green)');
  if (el.startBtn) {
    el.startBtn.textContent = 'Start monitoring';
    el.startBtn.classList.remove('active');
  }
}

// Feature toggles
for (const feature of Object.keys(state.features)) {
  const btn = document.getElementById('btn-' + feature);
  if (!btn) continue;
  setButtonState(feature, state.features[feature]);
  btn.addEventListener('click', () => {
    state.features[feature] = !state.features[feature];
    setButtonState(feature, state.features[feature]);

    if (feature === 'voice' || feature === 'sound') unlockAudio();

    if (!state.features[feature]) {
      if (feature === 'motion') resetMotion();
      if (feature === 'light') resetTrafficLight();
      if (feature === 'lane') resetLane();
      if (feature === 'collision') resetCollision();
      if (feature === 'detection') resetObjects();
      if (feature === 'emergency') resetEmergency();
    }
  });
}

// Voice picker. Voices load asynchronously, so this repopulates as the
// browser discovers them. The choice is remembered on this device.
const voiceSelect = document.getElementById('voice-select');

function renderVoiceOptions() {
  if (!voiceSelect) return;
  const current = getSelectedVoiceURI();
  const choices = getVoiceChoices();
  voiceSelect.innerHTML = '';

  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = choices.length
    ? `Auto — ${choices[0].name}`
    : 'Auto — best available';
  auto.title = 'Use the most natural voice available on this device';
  voiceSelect.appendChild(auto);

  for (const voice of choices) {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = voice.name;
    option.title = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  }

  voiceSelect.value = current;
}

initVoice(renderVoiceOptions);

if (voiceSelect) {
  voiceSelect.addEventListener('change', () => {
    setSelectedVoiceURI(voiceSelect.value);
    unlockAudio();
    speak(
      voiceSelect.value ? 'This is your alert voice.' : 'Using the best available voice.',
      { interrupt: true },
    );
  });
}

// Camera / permission screen
if (el.grantBtn) {
  el.grantBtn.addEventListener('click', async () => {
    el.grantBtn.disabled = true;
    el.grantBtn.textContent = 'Starting…';
    if (el.permError) el.permError.textContent = '';

    // Must run inside the user gesture (iOS sensor permission).
    unlockAudio();
    initEgoMotion();

    const ok = await requestCamera();
    if (!ok) {
      el.grantBtn.disabled = false;
      el.grantBtn.textContent = 'Try again';
      return;
    }

    // Start GPS only after camera consent, so denying the camera does
    // not leave a location watch running.
    if (el.gpsOpt?.checked) enableGps();

    startClock();
    initObjectDetection();
    el.grantBtn.textContent = 'Camera ready';
    startMonitoring();
  });
}

// Start / stop
if (el.startBtn) {
  el.startBtn.addEventListener('click', () => {
    if (state.running) stopMonitoring();
    else startMonitoring();
  });
}

// Layout
window.addEventListener('resize', resizeCanvases);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvases, 250));

// Debug handle. The perception functions are exposed for console tuning
// and for the headless safety tests in tests/.
window.COPILOT = {
  state,
  CONFIG,
  debug: {
    startLoop,
    stopLoop,
    updateLane,
    updateCollision,
    updateTrafficLight,
    updateGreenLight,
    updateHud,
  },
};
