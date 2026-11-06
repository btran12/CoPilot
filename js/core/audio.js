import { state } from '../state.js';
import { pickVoice } from './voice.js';

// ─────────────────────────────────────────────────────────────
//  AUDIO — WebAudio tones, vibration, and speech synthesis.
//  All output is local to the phone; nothing leaves the device.
// ─────────────────────────────────────────────────────────────

export function ensureAudio() {
  if (!state.audioCtx && typeof window !== 'undefined') {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) state.audioCtx = new Ctx();
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume().catch(() => {});
  }
}

// Must be called from a user gesture (the "Enable camera" tap) so that
// both WebAudio and speech synthesis are allowed to start on mobile.
export function unlockAudio() {
  ensureAudio();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    // Some browsers only populate voices after the first call.
    window.speechSynthesis.getVoices();
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch (_) { /* ignore */ }
  }
}

export function playTone(freq, duration, type = 'sine', gainValue = 0.28) {
  if (!state.features.sound) return;
  try {
    ensureAudio();
    if (!state.audioCtx) return;
    const now = state.audioCtx.currentTime;
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  } catch (_) { /* audio unavailable */ }
}

export function playSequence(notes) {
  notes.forEach(([freq, when, dur, type]) => {
    setTimeout(() => playTone(freq, dur, type || 'sine'), when);
  });
}

export function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
  }
}

export function speak(text, { interrupt = false } = {}) {
  if (!state.features.voice || !text || typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  try {
    if (interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch (_) { /* ignore */ }
}
