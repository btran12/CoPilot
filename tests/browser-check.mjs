// Dev-only smoke check: drives the app in headless Chrome over CDP.
// Start Chrome with:
//   chrome --headless=new --remote-debugging-port=9222 \
//     --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
//     --autoplay-policy=no-user-gesture-required http://localhost:8080/
// Then: node tests/browser-check.mjs
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
const page = targets.find(t => t.type === 'page');
if (!page) {
  console.error('No page target found.');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const events = [];

ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id) {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  } else {
    events.push(msg);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async expression => {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  }
  return r.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:8080/' });
await sleep(5000);

console.log('initial:', await evaluate(`({
  ready: document.readyState,
  copilot: typeof window.COPILOT,
  perms: getComputedStyle(document.getElementById('permissions-screen')).display,
  error: document.getElementById('perm-error').textContent
})`));

await evaluate(`document.getElementById('grant-btn').click(); true`);
await sleep(20000);

const state = await evaluate(`({
  running: COPILOT.state.running,
  globals: { tf: typeof window.tf, cocoSsd: typeof window.cocoSsd },
  modelLoaded: COPILOT.state.detection.loaded,
  modelLoading: COPILOT.state.detection.loading,
  video: [video.videoWidth, video.videoHeight],
  proc: [COPILOT.state.proc.width, COPILOT.state.proc.height],
  fps: Math.round(COPILOT.state.fps * 10) / 10,
  frames: COPILOT.state.frameCount,
  tracks: COPILOT.state.tracks.length,
  collisions: COPILOT.state.collision.level,
  motion: COPILOT.state.motion.state,
  light: COPILOT.state.light.color,
  lane: COPILOT.state.lane.level,
  ego: { speed: COPILOT.state.ego.speed, source: COPILOT.state.ego.speedSource, stopped: COPILOT.state.ego.stopped },
  perms: getComputedStyle(document.getElementById('permissions-screen')).display,
  error: document.getElementById('perm-error').textContent,
  hud: {
    traffic: document.getElementById('val-traffic').textContent,
    signal: document.getElementById('val-signal').textContent,
    collision: document.getElementById('val-collision').textContent,
    lane: document.getElementById('val-lane').textContent,
    speed: document.getElementById('val-speed').textContent
  }
})`);
console.log('running:', state);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('tests/screenshot.png', Buffer.from(shot.data, 'base64'));

const problems = [];
for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') {
    problems.push('EXCEPTION: ' + e.params.exceptionDetails.text + ' ' +
      (e.params.exceptionDetails.exception?.description || ''));
  }
  if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
    problems.push('LOG ERROR: ' + e.params.entry.text);
  }
  if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
    const text = e.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    problems.push('CONSOLE ' + e.params.type.toUpperCase() + ': ' + text);
  }
}

console.log('\nproblems:', problems.length ? problems : 'none');
ws.close();
