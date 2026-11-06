// Small, dependency-free helpers shared by every module.

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function ema(prev, next, alpha) {
  if (prev == null || !Number.isFinite(prev)) return next;
  return prev + (next - prev) * alpha;
}

export function avg(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function variance(values) {
  if (values.length < 2) return 0;
  const mean = avg(values);
  let sum = 0;
  for (const v of values) sum += (v - mean) * (v - mean);
  return sum / values.length;
}

// Linear regression slope of y over time. points: [{ t, y }] with t in ms.
export function linearSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    const x = p.t / 1000;
    sx += x;
    sy += p.y;
    sxx += x * x;
    sxy += x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return [h * 360, s * 100, l * 100];
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function metersPerSecondToMph(v) {
  return v == null ? null : v * 2.2369362920544;
}

export function fmt(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function nowMs() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
}

// Timestamps come from nowMs(), which starts near zero when the page
// loads. A zero timestamp means "never", not "a very long time ago".
export function cooledDown(lastTs, now, cooldownMs) {
  return !lastTs || now - lastTs >= cooldownMs;
}
