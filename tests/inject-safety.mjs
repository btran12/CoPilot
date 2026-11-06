// Dev-only: verifies lane-departure and green-light nudge paths in a
// running page by feeding deterministic frames and state.
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.CDP_PORT || 9333;
const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
const page = targets.find(t => t.type === 'page');
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
await sleep(8000);

const lane = await evaluate(`(() => {
  COPILOT.debug.stopLoop();
  const W = 320, H = 180;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 40; px[i + 1] = 42; px[i + 2] = 46; px[i + 3] = 255;
  }
  const line = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const x = x0 + (x1 - x0) * t;
      for (let dx = -3; dx <= 3; dx++) {
        const xx = Math.round(x + dx);
        const i = (y * W + xx) * 4;
        px[i] = 235; px[i + 1] = 235; px[i + 2] = 225; px[i + 3] = 255;
      }
    }
  };
  line(140 + 70, 90, 70 + 70, 170);
  line(180 + 70, 90, 250 + 70, 170);

  const s = COPILOT.state;
  s.proc.width = W; s.proc.height = H; s.proc.pixels = px;
  s.ego.speed = 10;
  s.startedAt = performance.now() - 10000;
  s.lane.offset = null;
  s.lane.hasPair = false;
  s.lane.level = 'unknown';
  s.lane.badFrames = 0;
  s.lane.armed = true;
  s.lane.lastSeen = 0;

  const now = performance.now();
  for (let i = 0; i < 8; i++) COPILOT.debug.updateLane(now + i * 130);
  COPILOT.debug.updateHud(now + 1000);

  return {
    level: s.lane.level,
    offset: Math.round(s.lane.offset * 100) / 100,
    hud: document.getElementById('val-lane').textContent,
    banner: document.getElementById('alert-msg').textContent,
    shown: document.getElementById('alert-banner').classList.contains('show')
  };
})()`);
console.log('lane:', lane);
assert.equal(lane.level, 'left');
assert.equal(lane.banner, 'DRIFTING LEFT');
assert.equal(lane.hud, 'LEFT');

const green = await evaluate(`(() => {
  const s = COPILOT.state;
  const now = performance.now();
  s.startedAt = now - 10000;
  Object.assign(s.ego, { stopped: true, stoppedSince: now - 5000, speed: 0 });
  Object.assign(s.light, { color: 'green', since: now - 5000, lastSeen: now });
  Object.assign(s.motion, { state: 'stopped', since: now - 10000, smooth: 2 });
  s.collision.nearest = null;
  Object.assign(s.greenLight, { stoppedSince: now - 5000, nudged: false, lastNudgeTs: 0 });

  COPILOT.debug.updateGreenLight(now);
  return {
    nudged: s.greenLight.nudged,
    banner: document.getElementById('alert-msg').textContent,
    shown: document.getElementById('alert-banner').classList.contains('show')
  };
})()`);
console.log('green:', green);
assert.equal(green.nudged, true);
assert.equal(green.banner, 'GREEN LIGHT');

const blocked = await evaluate(`(() => {
  const s = COPILOT.state;
  const now = performance.now();
  Object.assign(s.greenLight, { nudged: false, lastNudgeTs: 0 });
  s.collision.nearest = { distance: 4, closing: 0 };
  COPILOT.debug.updateGreenLight(now + 10000);
  return { nudged: s.greenLight.nudged };
})()`);
console.log('green blocked by car:', blocked);
assert.equal(blocked.nudged, false, 'must not nudge while a stopped car is directly ahead');

await evaluate(`(() => {
  COPILOT.state.ego.speed = null;
  COPILOT.state.collision.nearest = null;
  COPILOT.debug.startLoop();
  return true;
})()`);

ws.close();
console.log('\nsafety injection tests passed.');
