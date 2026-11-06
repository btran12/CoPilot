// ─────────────────────────────────────────────────────────────
//  VOICE SELECTION
//
//  Browsers expose a mix of tiny legacy voices and modern neural
//  ones. The default is often the worst-sounding option, so this
//  module scores the installed voices and prefers:
//    • Enhanced / Premium / Natural / Neural voices
//    • well-known good voices (Siri, Google, Samantha, Aria, …)
//    • voices for the user's own English region
//
//  The selection is only a preference; everything still runs
//  through the browser's built-in speech synthesis, on-device.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'copilot.voice-uri';
const ENGLISH = /^en([-_]|$)/i;

const NATURAL = /\b(natural|neural|premium|enhanced)\b/i;
const GOOGLE = /\bgoogle\b/i;
const APPLE_NICE = /\b(siri|samantha|ava|allison|susan|zoe|serena|daniel|karen|moira|tessa|aria|jenny|guy|libby|sonia|ryan|michelle|ana|clara|emma|brian|christopher|eric|roger|steffan|nicky|aaron)\b/i;
const LEGACY_DESKTOP = /\b(david|mark|zira|hazel|george)\b/i;
const LEGACY_OR_NOVELTY = /compact|espeak|festival|pico|robot|novelty|whisper|bells|boing|bubbles|cellos|trinoids|zarvox|albert|jester|organ|superstar|wobble|bad news|good news/i;

let allVoices = [];
let selectedURI = readStored();
let lastKey = '';
const listeners = new Set();

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function writeStored(uri) {
  try {
    if (uri) localStorage.setItem(STORAGE_KEY, uri);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* private mode */ }
}

function navigatorLang() {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

function score(voice) {
  let s = 0;
  const lang = (voice.lang || '').replace('_', '-');

  if (/^en-US$/i.test(lang)) s += 12;
  else if (/^en-GB$/i.test(lang)) s += 8;
  else if (/^en/i.test(lang)) s += 6;

  // Prefer the user's own locale when several English voices exist.
  const nav = navigatorLang().replace('_', '-');
  if (nav.toLowerCase() === lang.toLowerCase()) s += 8;
  else if (nav.split('-')[0].toLowerCase() === lang.split('-')[0].toLowerCase()) s += 3;

  if (NATURAL.test(voice.name)) s += 50;
  if (GOOGLE.test(voice.name)) s += 25;
  if (APPLE_NICE.test(voice.name)) s += 20;
  if (LEGACY_DESKTOP.test(voice.name)) s += 4;
  if (voice.localService) s += 3;
  if (voice.default) s += 2;
  if (LEGACY_OR_NOVELTY.test(voice.name)) s -= 80;

  return s;
}

// English voices, best first, with duplicate names removed.
function rankedVoices() {
  const seen = new Set();
  return allVoices
    .filter(v => ENGLISH.test(v.lang || ''))
    .sort((a, b) => score(b) - score(a))
    .filter(v => {
      const key = `${v.name}|${v.lang}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (_) { /* listener is best-effort */ }
  }
}

function refresh() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;

  const list = window.speechSynthesis.getVoices();
  if (!list || !list.length) return false;

  const key = list.map(v => v.voiceURI).join('|');
  if (key === lastKey) return true;

  allVoices = list;
  lastKey = key;

  // A saved voice can disappear when the OS voice pack is removed.
  if (selectedURI && !list.some(v => v.voiceURI === selectedURI)) {
    selectedURI = '';
    writeStored('');
  }

  notify();
  return true;
}

export function initVoice(onChange) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  if (onChange) listeners.add(onChange);

  if (refresh()) {
    return;
  }

  // Voices load asynchronously, especially in Chrome and Safari.
  const onVoicesChanged = () => refresh();
  if (window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  } else {
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (refresh() || ++tries > 24) clearInterval(timer);
  }, 250);
}

export function getVoiceChoices() {
  return rankedVoices();
}

export function getSelectedVoiceURI() {
  return selectedURI;
}

export function setSelectedVoiceURI(uri) {
  selectedURI = uri && allVoices.some(v => v.voiceURI === uri) ? uri : '';
  writeStored(selectedURI);
  notify();
}

// The voice actually used for an utterance.
export function pickVoice() {
  if (selectedURI) {
    const chosen = allVoices.find(v => v.voiceURI === selectedURI);
    if (chosen) return chosen;
  }
  return rankedVoices()[0] || allVoices[0] || null;
}
