# CoPilot — Camera-Based Driving Companion

A phone-first, install-free driving aid. Mount the phone facing the road and
CoPilot watches the scene with the rear camera, raising **eyes-free spoken and
audible alerts** for the situations that matter most:

- **Forward collision warning** — time-to-collision to the vehicle ahead
- **Lane departure warning** — drift left / right out of your lane
- **Green-light nudge** — reminds you to go if you are still stopped at a green light
- **Traffic light colour** and **stop / go** traffic awareness
- **Pedestrian, cyclist and stop-sign alerts**
- **Experimental** emergency-vehicle (red/blue light bar) detection

Everything runs on-device in the browser. There is no backend, no account, and
no camera, GPS or sensor data ever leaves the phone.

> **This is a driver aid, not an ADAS.** It uses a single phone camera and
> heuristics. It can miss things, and it must never replace your eyes, your
> attention, or the rules of the road. Do not interact with the phone while
> driving.

---

## Quick start

The app uses native ES modules, so it **must be served over HTTP(S)** —
opening `index.html` from the filesystem (`file://`) will not work.

```bash
# from the project directory
python -m http.server 8080
# then open http://localhost:8080 on your phone (same Wi-Fi) or desktop
```

On a phone:

1. Open the URL over **HTTPS** (camera access requires a secure context on
   mobile; `localhost` is exempt). A tunnel such as `ngrok` or `cloudflared`
   works well for testing.
2. Tap **Enable camera** and allow camera access. Optionally allow location for
   GPS-based speed and stop detection.
3. Mount the phone so the rear camera sees the road ahead, then tap
   **Start monitoring**.

Camera, GPS and motion sensors require a user gesture, so nothing starts until
you tap the button.

### Requirements

- A modern browser with `getUserMedia` (Chrome, Edge, Safari, Firefox).
- Camera access. WebGL is used when available; TensorFlow.js automatically
  falls back to CPU.
- TensorFlow.js and COCO-SSD are loaded from a CDN, so the first run needs
  network access. After that the browser cache usually covers them.

---

## Features

| Feature | What it does | Default |
| --- | --- | --- |
| **Collision** | Tracks vehicles in your lane, estimates distance from bounding-box height, and computes time-to-collision (TTC). | On |
| **Lane** | Finds lane paint with a Hough transform and warns when your offset exceeds ~⅓ of a lane width for several frames. | On |
| **Signals** | Detects red / yellow / green signal heads by colour clustering and temporal confirmation. | On |
| **Traffic** | Frame-difference stop / go awareness, gated to low ego speed so it does not fire while driving. | On |
| **Objects** | COCO-SSD detection of pedestrians, cyclists and stop signs, with stable track IDs. | On |
| **Emergency** | Looks for alternating red/blue light bars on tracked vehicles. Prototype only. | Off |
| **Voice** | Spoken alerts through the Web Speech API. | On |
| **Tone** | Short WebAudio alert tones. | On |

Alert types are prioritised: a critical collision warning interrupts speech and
fires immediately, while routine alerts are debounced both per key and globally
so the cabin does not fill with noise.

## Voice quality

CoPilot uses the browser's built-in speech synthesis, so alerts stay on-device
and work offline. Voice quality varies a lot between systems, and the default
is often a small legacy voice. CoPilot therefore ranks the installed English
voices and automatically picks the most natural one:

- Enhanced / Premium / Natural / Neural voices rank first
- Google and well-known Apple/Microsoft voices rank above generic ones
- legacy desktop and novelty voices rank last
- the current selection is shown on the start screen (`Auto — <voice>`)

You can override the choice in the **Alert voice** menu. Changing it speaks a
short sample, and the selection is remembered on the device.

For the most realistic result, install a high-quality voice pack:

- **iOS / iPadOS** — Settings → Accessibility → Spoken Content → Voices →
  English, then download an Enhanced or Premium voice.
- **Android** — Settings → Accessibility → Text-to-speech output → Google
  speech services, then choose or install a higher-quality voice.
- **macOS** — System Settings → Accessibility → Spoken Content → System Voice →
  Manage Voices, then download a Premium or Enhanced voice.
- **Windows** — Microsoft Edge exposes the online "Natural" voices
  automatically. Chrome usually exposes only the older local SAPI voices.

If you need studio-quality speech, the next step is a neural TTS engine:
cloud services (ElevenLabs, Azure, OpenAI, Google Cloud) sound excellent but
add network latency, cost, and send alert text off-device; on-device engines
(Kokoro, Piper) stay private but require a large model download. The current
design deliberately keeps speech local and dependency-free.

---

## Architecture

```
index.html            app shell: permissions screen, HUD, controls
css/styles.css        HUD and permission-screen styling
favicon.svg
js/
  main.js             bootstrap, feature toggles, debug handle
  config.js           every tunable threshold in one place
  state.js            shared runtime state + reset helpers
  utils.js            geometry, stats, colour and format helpers
  core/
    camera.js         getUserMedia, frame capture into a 320×180 canvas
    loop.js           frame loop: one capture shared by all detectors
    egomotion.js      GPS speed, accelerometer fallback, stopped/moving state
    audio.js          WebAudio tones, vibration, speech synthesis
    voice.js          voice discovery, ranking and persistence
    alerts.js         single-banner alert manager with cooldowns
  perception/
    motion.js         stop / go frame differencing
    trafficLight.js   traffic-light colour clustering + confirmation
    laneDetect.js     pure lane detection (grayscale → Sobel → Hough)
    lane.js           lane-departure gating and one-warning-per-drift state
    tracker.js        greedy IoU multi-object tracker
    objects.js        COCO-SSD inference + object alerts
    collisionMath.js  monocular distance and TTC math (pure)
    collision.js      forward-collision target selection and alerts
    greenLight.js     green-light nudge logic
    emergency.js      experimental red/blue light-bar detector
  ui/
    dom.js            cached DOM nodes + small UI helpers
    hud.js            metric cards and speed readout
    overlay.js        canvas overlay: zones, lane lines, boxes, strobes
tests/
  smoke.mjs           Node tests for the pure modules
  browser-check.mjs   headless-Chrome load/run smoke test over CDP
  inject-collision.mjs synthetic approaching-car test
  inject-safety.mjs   lane-departure + green-nudge tests
```

### Design notes

- **One frame, many detectors.** Each loop iteration captures a single 320×180
  frame; motion, light, lane and emergency detectors all reuse those pixels.
  COCO-SSD runs asynchronously on a slower cadence.
- **Pure modules are testable.** `laneDetect.js`, `collisionMath.js`,
  `tracker.js` and `utils.js` have no DOM access, so they run under Node.
- **TTC is scale-tolerant.** Distance comes from bounding-box height and an
  assumed real-world vehicle height. Because TTC divides distance by the rate of
  change of that same estimate, the height assumption largely cancels.
- **One warning per event.** Lane departure re-arms only after returning toward
  the lane centre; the green-light nudge fires once per light cycle; object
  alerts fire per new track, not per frame.

---

## Tuning

All thresholds live in [`js/config.js`](js/config.js). The most useful knobs:

| Setting | Meaning |
| --- | --- |
| `loopIntervalMs` | Analysis cadence (default 120 ms ≈ 8 fps). Lower = more responsive, hotter phone. |
| `proc.width/height` | Detector resolution. Higher finds smaller objects but costs CPU. |
| `camera.horizontalFovDeg` | Rear-camera field of view; affects monocular distance. |
| `collision.ttcCritical` / `ttcWarn` | Brake / warn thresholds in seconds. |
| `collision.lateralTolerance` | How far off-centre a target can be and still count as "in your lane". |
| `lane.warnOffset` / `releaseOffset` | Drift threshold and re-arm threshold, in lane widths. |
| `lane.minSpeedMps` | Speed above which lane warnings are allowed. |
| `greenLight.minStoppedMs` | How long you must be stopped before the nudge. |
| `light.confirm` | Consecutive frames needed to confirm a light colour. |

Tune conservatively: a false alert is annoying, but a missed one is dangerous.
If you change detection behaviour, run `node tests/smoke.mjs` to make sure the
lane and collision math still hold.

---

## Testing

```bash
node tests/smoke.mjs          # pure-module unit tests
```

The browser tests drive a real page over the Chrome DevTools Protocol. Start a
static server and a headless Chrome with a fake camera, then run them:

```bash
python -m http.server 8080

chrome --headless=new --disable-gpu \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  --remote-debugging-port=9333 \
  --user-data-dir="$(mktemp -d)" \
  http://localhost:8080/

node tests/browser-check.mjs   # app loads, camera runs, no JS errors
node tests/inject-collision.mjs
node tests/inject-safety.mjs
```

Set `CDP_PORT` to point the tests at a different debugging port.

Notes:

- `WebGL is not supported` and blocked `navigator.vibrate` warnings are expected
  in headless Chrome; TensorFlow.js falls back to CPU and vibration needs a user
  gesture.
- Model download can take longer than 20 s on a cold cache.

---

## Privacy

- Camera frames are processed in memory and discarded. Nothing is recorded.
- GPS is optional and used only to derive speed and stopped state.
- Sensor data, detections and alerts never leave the device.
- The only network requests are the TensorFlow.js / COCO-SSD CDN scripts.

---

## Limitations

- **Single camera, no depth sensor.** Distances are rough monocular estimates
  and depend on the assumed vehicle height and camera field of view.
- **Not a substitute for ADAS.** No radar, no LiDAR, no vehicle integration.
- **Lane detection** needs visible paint and reasonable lighting. It struggles
  with worn markings, heavy rain, night, and sharp curves.
- **Traffic-light detection** is colour- and geometry-based; it can be fooled by
  bright signs or tail lights, and it cannot read arrow signals.
- **Frame differencing** cannot separate ego-motion from traffic motion, which
  is why stop / go alerts are gated to low ego speed.
- **Emergency-vehicle detection is experimental.** It only catches marked
  vehicles whose red/blue light bars are visible to a forward-facing camera. It
  will not detect unmarked vehicles, vehicles approaching from behind, or most
  motorcycles. Never rely on it when you hear a siren — look and yield.
- Phone thermals and battery life limit continuous operation on long drives.

---

## Legal

CoPilot is provided as-is for educational and experimental use. It is not a
certified safety device and is not a substitute for attentive driving. You are
responsible for observing all traffic laws and for maintaining control of your
vehicle at all times. Do not operate the phone while driving; mount it and set
it up before you start moving.
