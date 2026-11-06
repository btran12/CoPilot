import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { el, procCtx } from '../ui/dom.js';

// ─────────────────────────────────────────────────────────────
//  CAMERA + FRAME CAPTURE
// ─────────────────────────────────────────────────────────────

export async function requestCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API is not available in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });

    el.video.srcObject = stream;
    await el.video.play();

    el.permissions.style.display = 'none';
    resizeCanvases();
    return true;
  } catch (e) {
    if (el.permError) {
      el.permError.textContent = e && e.message
        ? e.message
        : 'Camera access denied. Allow camera access and try again.';
    }
    return false;
  }
}

export function resizeCanvases() {
  const rect = el.overlay.getBoundingClientRect();
  const w = Math.round(rect.width || window.innerWidth);
  const h = Math.round(rect.height || window.innerHeight);
  if (w > 0 && h > 0) {
    el.overlay.width = w;
    el.overlay.height = h;
  }

  el.proc.width = CONFIG.proc.width;
  el.proc.height = CONFIG.proc.height;
  state.proc.width = CONFIG.proc.width;
  state.proc.height = CONFIG.proc.height;
}

// Draw the current video frame into the small analysis canvas and read
// the pixels once. Every pixel-based detector shares this frame.
export function captureFrame() {
  const v = el.video;
  if (!v || !v.videoWidth || !v.videoHeight) return false;

  state.video.width = v.videoWidth;
  state.video.height = v.videoHeight;

  procCtx.drawImage(v, 0, 0, CONFIG.proc.width, CONFIG.proc.height);
  const data = procCtx.getImageData(0, 0, CONFIG.proc.width, CONFIG.proc.height);
  state.proc.pixels = data.data;
  return true;
}
