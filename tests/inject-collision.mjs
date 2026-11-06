// Dev-only: injects a synthetic approaching car to verify the
// forward-collision path end-to-end in a running page.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.CDP_PORT || 9333;
const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
if (!page) throw new Error('No page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (!msg.id) return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:8080/' });
await sleep(5000);
await evaluate(`document.getElementById('grant-btn').click(); true`);
await sleep(7000);

await evaluate(`(() => {
  const now = performance.now();
  const track = {
    id: 999, cls: 'car', score: 0.9,
    bbox: [540, 600, 200, 100],
    firstSeen: now, lastSeen: now, age: 10, misses: 0,
    history: [], distEMA: null, distHistory: [], emgHistory: []
  };
  window.__testTrack = track;
  window.__testStart = now;
  clearInterval(window.__testInt);
  window.__testInt = setInterval(() => {
    const t = performance.now();
    const elapsed = (t - window.__testStart) / 1000;
    const h = 100 + Math.min(400, elapsed * 110);
    const w = h * 2;
    track.bbox = [640 - w / 2, 700 - h, w, h];
    track.lastSeen = t;
    COPILOT.state.tracks = [track];
  }, 100);
  return true;
})()`);

await sleep(6000);

const state = await evaluate(`({
  collision: {
    level: COPILOT.state.collision.level,
    distance: Math.round(COPILOT.state.collision.distance * 10) / 10,
    ttc: Math.round(COPILOT.state.collision.ttc * 10) / 10,
    closing: Math.round(COPILOT.state.collision.closing * 10) / 10
  },
  hud: {
    collision: document.getElementById('val-collision').textContent,
    unit: document.getElementById('unit-collision').textContent,
    cardClass: document.getElementById('card-collision').className
  },
  banner: {
    text: document.getElementById('alert-msg').textContent,
    sub: document.getElementById('alert-sub').textContent,
    shown: document.getElementById('alert-banner').classList.contains('show')
  }
})`);

console.log(state);
assert.ok(['warn', 'critical'].includes(state.collision.level), 'expected a collision warning level');
assert.ok(Number.isFinite(state.collision.ttc), 'expected a finite TTC');
assert.ok(state.hud.collision !== '—', 'expected the HUD to show a collision value');

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('tests/screenshot-collision.png', Buffer.from(shot.data, 'base64'));

await evaluate(`clearInterval(window.__testInt); window.__testInt = null; window.__testTrack = null; COPILOT.state.tracks = []; true`);
ws.close();
console.log('\ncollision injection test passed.');
