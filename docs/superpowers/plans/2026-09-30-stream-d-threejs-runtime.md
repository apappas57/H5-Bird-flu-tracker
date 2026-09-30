# Stream D: three.js Birds Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two quiet bird moments (one flight across the map on first load, a slow turntable in the record drawer) as a lazily loaded, CSP-safe three.js module with image fallbacks for every device that should not run WebGL.

**Architecture:** Source lives in `birds-src/` (plain ES modules, unit-tested in Node), bundled by esbuild into one committed ES module `site/assets/three/birds.js` (three + GLTFLoader tree-shaken in, no import map, so the CSP `script-src 'self'` needs no change). `site/birds.js` re-exports it so `app.js` imports `./birds.js`. Gates decide `live`, `apng` or `still` before any WebGL work; the flight and the figure each own one renderer and dispose it. Models come from `site/assets/birds/manifest.json` (stream C).

**Tech Stack:** three `0.186.1`, esbuild `0.28.2` (dev dependencies), `node:test`, GLB assets from Blender.

**Spec:** `docs/superpowers/specs/2026-09-30-map-first-rebuild-design.md`, sections 6.1, 6.4 and 6.5 subgoal 5; the D row of section 8.

## Global Constraints

- No runtime build step for the site: the bundle is committed; `npm run bundle` regenerates it and CI fails when the committed bundle differs from the source (spec 6.4, stream E's CI guard on `site/assets/three/birds.js`).
- CSP stays `script-src 'self'; connect-src 'self'`: no inline scripts, no import map, no CDN. GLB and manifest fetches are same-origin (spec 6.4).
- Gates, all required for live rendering: WebGL 2 available; `prefers-reduced-motion` not set; `navigator.connection.saveData` not set; `navigator.deviceMemory` absent or at least 4. Reduced motion shows the PNG still and no flight; no WebGL or a low-end device shows the APNG loop and no flight. The page never waits on the birds (spec 6.4).
- The flight runs once per session, never on About or History; the flight canvas has `pointer-events: none`, is removed and its renderer disposed when the flight ends (spec 6.4).
- Ink look: flat white fill, ink `#101010` outline by inverted hull, no lighting, no colour, carmine never (spec 6.3, 6.4).
- Bundle budget: at most 600 KB raw and 150 KB gzip, loaded after the map's first render inside `requestIdleCallback` (spec 5.5, 6.4).
- No em dashes in any file this plan creates.
- Interface consumed from stream C: `site/assets/birds/manifest.json` with `{"version":1,"generic":"<slug>","species":{"<slug>":{"glb","still","apng","webm","tris","animations":["flap"],"pose":"glide","generic":bool,"bytes":{...}}}}`; GLB rest pose is the glide; the `flap` animation is a 24-frame loop driven by an armature (three bones per wing); every GLB material is named `bird_white` or `bird_ink`, and the runtime keeps `bird_ink` fills as ink so the live model matches the rendered fallbacks.
- Interface produced for stream B: `site/birds.js` exporting `flight(hostElement): Promise<void>`, `figure(canvasElement, speciesSlug): { dispose(): void }`, `speciesSlug(commonName): string`. `app.js` calls `flight` after the first map render inside `requestIdleCallback` guarded by `sessionStorage.getItem('birds-flight')`, and `figure` on drawer open, `dispose` on drawer close; every call is inside a `try`/`catch` and the import failure is swallowed.

---

## File structure

| File | Responsibility |
| --- | --- |
| `package.json` | dev dependencies `three`, `esbuild`; `npm run bundle`; `npm test` also runs `birds-src/test/`. |
| `birds-src/entry.mjs` | Public exports: `flight`, `figure`, `speciesSlug`. |
| `birds-src/gates.mjs` | Pure `decide(env)` and the browser `detect()` that feeds it. |
| `birds-src/manifest.mjs` | Fetch and cache the manifest; `slugFor(commonName, manifest)`; asset URL helpers. |
| `birds-src/ink.mjs` | `inkPair(mesh)`: white fill plus inverted-hull ink outline; `loadModel(url)` with a promise cache. |
| `birds-src/flight.mjs` | Pure `flightPoint(t, w, h)` and `easeInOutSine(t)`; the flight runtime. |
| `birds-src/figure.mjs` | The drawer turntable and its image fallbacks. |
| `birds-src/test/*.test.mjs` | Unit tests for the pure parts, the ink pair, and the bundle budget. |
| `site/assets/three/birds.js` | Committed bundle. |
| `site/birds.js` | `export * from './assets/three/birds.js';` |

---

### Task 1: Dependencies, bundle script, entry skeleton, budget test

**Files:**
- Modify: `package.json`
- Create: `birds-src/entry.mjs`, `site/birds.js`, `birds-src/test/bundle.test.mjs`
- Create (generated): `site/assets/three/birds.js`

**Interfaces:**
- Produces: `npm run bundle`; the shim path `site/birds.js`; the export names `flight`, `figure`, `speciesSlug` (stubs now, real in Tasks 4 to 6).

- [ ] **Step 1: Install and script**

Run: `cd ~/dev/h5-bird-flu-tracker && npm install --save-dev --save-exact three@0.186.1 esbuild@0.28.2 --no-audit --no-fund`

Edit `package.json` `scripts` (keep the other scripts stream A added; do not touch `test`, whose
`node --test` default discovery already finds `birds-src/test/`):

```json
    "bundle": "esbuild birds-src/entry.mjs --bundle --format=esm --minify --target=es2020 --legal-comments=none --outfile=site/assets/three/birds.js"
```

- [ ] **Step 2: Write the failing budget test**

```js
// birds-src/test/bundle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

const BUNDLE = new URL('../../site/assets/three/birds.js', import.meta.url);
const SHIM = new URL('../../site/birds.js', import.meta.url);

test('the committed bundle exists and is within budget', () => {
  const raw = fs.readFileSync(BUNDLE);
  assert.ok(raw.length <= 600 * 1024, `bundle is ${raw.length} bytes, budget 600 KB`);
  const gz = zlib.gzipSync(raw, { level: 9 }).length;
  assert.ok(gz <= 150 * 1024, `bundle gzips to ${gz} bytes, budget 150 KB`);
  const text = raw.toString('utf8');
  assert.ok(/export\s*\{/.test(text), 'bundle is an ES module with exports');
  assert.ok(!/from\s*["']three["']/.test(text), 'three is bundled, not imported');
});

test('the shim re-exports the bundle', () => {
  assert.equal(fs.readFileSync(SHIM, 'utf8').trim(), "export * from './assets/three/birds.js';");
});
```

- [ ] **Step 3: Run to see it fail**

Run: `node --test birds-src/test/bundle.test.mjs`
Expected: fails with `ENOENT` on the bundle.

- [ ] **Step 4: Write the entry stub and the shim**

```js
// birds-src/entry.mjs
// Public surface of the birds runtime. Stream B's app.js imports './birds.js'
// (a shim onto the committed bundle of this file) after the map's first render.
export async function flight() {}
export function figure() { return { dispose() {} }; }
export function speciesSlug(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
```

`site/birds.js`:

```js
export * from './assets/three/birds.js';
```

- [ ] **Step 5: Bundle and test**

Run: `npm run bundle && node --test birds-src/test/bundle.test.mjs`
Expected: a tiny bundle for now, both tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json birds-src/entry.mjs birds-src/test/bundle.test.mjs site/birds.js site/assets/three/birds.js
git commit -m "feat(birds): esbuild bundle pipeline, entry stub, budget test"
```

---

### Task 2: Gates and manifest

**Files:**
- Create: `birds-src/gates.mjs`, `birds-src/manifest.mjs`
- Test: `birds-src/test/gates.test.mjs`, `birds-src/test/manifest.test.mjs`

**Interfaces:**
- Produces: `decide({ reducedMotion, webgl2, saveData, deviceMemory }) -> 'live' | 'apng' | 'still'`; `detect(win) -> that env object`; `loadManifest(fetchFn, base) -> Promise<manifest>` (cached); `slugFor(commonName, manifest) -> slug`; `assetUrl(base, relativePath) -> string`.

- [ ] **Step 1: Write the failing tests**

```js
// birds-src/test/gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../gates.mjs';

const ok = { reducedMotion: false, webgl2: true, saveData: false, deviceMemory: undefined };

test('all gates open means live', () => {
  assert.equal(decide(ok), 'live');
  assert.equal(decide({ ...ok, deviceMemory: 8 }), 'live');
});

test('reduced motion means still, whatever else is true', () => {
  assert.equal(decide({ ...ok, reducedMotion: true }), 'still');
  assert.equal(decide({ ...ok, reducedMotion: true, webgl2: false }), 'still');
});

test('no WebGL 2, save-data or a low-memory device means apng', () => {
  assert.equal(decide({ ...ok, webgl2: false }), 'apng');
  assert.equal(decide({ ...ok, saveData: true }), 'apng');
  assert.equal(decide({ ...ok, deviceMemory: 2 }), 'apng');
  assert.equal(decide({ ...ok, deviceMemory: 4 }), 'live');
});
```

```js
// birds-src/test/manifest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugFor, assetUrl, loadManifest, _resetManifestCache } from '../manifest.mjs';

const manifest = { version: 1, generic: 'greater-crested-tern', species: {
  'greater-crested-tern': { glb: 'assets/birds/greater-crested-tern.glb', still: 'assets/birds/greater-crested-tern.png', apng: 'assets/birds/greater-crested-tern-loop.png', generic: false },
  'brown-skua': { glb: 'assets/birds/brown-skua.glb', still: 'assets/birds/brown-skua.png', apng: 'assets/birds/brown-skua-loop.png', generic: false },
} };

test('slugFor maps common names and falls back to the generic', () => {
  assert.equal(slugFor('Greater Crested Tern', manifest), 'greater-crested-tern');
  assert.equal(slugFor('brown skua', manifest), 'brown-skua');
  assert.equal(slugFor('Southern Giant Petrel', manifest), 'greater-crested-tern');
  assert.equal(slugFor('', manifest), 'greater-crested-tern');
});

test('assetUrl resolves against the site base', () => {
  assert.equal(assetUrl('https://www.birdflutracker.org/', 'assets/birds/x.glb'), 'https://www.birdflutracker.org/assets/birds/x.glb');
  assert.equal(assetUrl('https://www.birdflutracker.org/about', 'assets/birds/x.glb'), 'https://www.birdflutracker.org/assets/birds/x.glb');
});

test('loadManifest fetches once and caches', async () => {
  _resetManifestCache();
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: true, json: async () => manifest }; };
  const a = await loadManifest(fetchFn, 'https://www.birdflutracker.org/');
  const b = await loadManifest(fetchFn, 'https://www.birdflutracker.org/');
  assert.equal(a, b);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test birds-src/test/gates.test.mjs birds-src/test/manifest.test.mjs`
Expected: both fail on missing modules.

- [ ] **Step 3: Write the modules**

```js
// birds-src/gates.mjs
// Which rendering mode a device gets. Pure decide() so it is testable; detect()
// reads the browser. Reduced motion wins over everything: a still image.
export function decide({ reducedMotion, webgl2, saveData, deviceMemory }) {
  if (reducedMotion) return 'still';
  if (!webgl2 || saveData || (deviceMemory !== undefined && deviceMemory < 4)) return 'apng';
  return 'live';
}

export function detect(win = globalThis) {
  let webgl2 = false;
  try {
    const c = win.document.createElement('canvas');
    webgl2 = Boolean(c.getContext('webgl2'));
  } catch { webgl2 = false; }
  const nav = win.navigator || {};
  return {
    reducedMotion: Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches),
    webgl2,
    saveData: Boolean(nav.connection && nav.connection.saveData),
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
  };
}
```

```js
// birds-src/manifest.mjs
let cached = null;

export function _resetManifestCache() { cached = null; }

export function assetUrl(base, rel) {
  return new URL(rel, new URL('./', base)).toString();
}

export function loadManifest(fetchFn, base) {
  if (!cached) {
    cached = fetchFn(assetUrl(base, 'assets/birds/manifest.json')).then(async (res) => {
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      return res.json();
    }).catch((err) => { cached = null; throw err; });
  }
  return cached;
}

export function slugFor(commonName, manifest) {
  const slug = String(commonName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return manifest?.species?.[slug] ? slug : manifest?.generic || slug;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test birds-src/test/gates.test.mjs birds-src/test/manifest.test.mjs`
Expected: `# pass 6`.

- [ ] **Step 5: Commit**

```bash
git add birds-src/gates.mjs birds-src/manifest.mjs birds-src/test/gates.test.mjs birds-src/test/manifest.test.mjs
git commit -m "feat(birds): device gates and manifest loader"
```

---

### Task 3: Ink material and model loading

**Files:**
- Create: `birds-src/ink.mjs`
- Test: `birds-src/test/ink.test.mjs`

**Interfaces:**
- Produces: `inkPair(sourceMesh, { outline = 1.03 } = {}) -> Group` containing the white fill mesh and the ink back-face hull; `loadModel(url, loaderFactory) -> Promise<{ scene, animations }>` cached per URL; `fitScale(object, targetSize) -> number`.

- [ ] **Step 1: Write the failing test**

```js
// birds-src/test/ink.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, BackSide, FrontSide, Group } from 'three';
import { inkPair, fitScale, loadModel, _resetModelCache } from '../ink.mjs';

test('inkPair returns a white fill and an ink back-face hull, no lighting', () => {
  const src = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xff0000 }));
  const g = inkPair(src);
  assert.ok(g instanceof Group);
  assert.equal(g.children.length, 2);
  const [fill, hull] = g.children;
  assert.equal(fill.material.type, 'MeshBasicMaterial');
  assert.equal(fill.material.color.getHexString(), 'ffffff');
  assert.equal(fill.material.side, FrontSide);
  assert.equal(hull.material.type, 'MeshBasicMaterial');
  assert.equal(hull.material.color.getHexString(), '101010');
  assert.equal(hull.material.side, BackSide);
  assert.ok(Math.abs(hull.scale.x - 1.03) < 1e-9);
  assert.equal(hull.geometry, fill.geometry, 'the hull shares the geometry');
});

test('inkPair keeps the GLB fills named bird_ink (cap, wing band) as ink, per material slot', () => {
  const inkSrc = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name: 'bird_ink', color: 0xff0000 }));
  assert.equal(inkPair(inkSrc).children[0].material.color.getHexString(), '101010');
  const multi = new Mesh(new BoxGeometry(1, 1, 1), [new MeshStandardMaterial({ name: 'bird_white' }), new MeshStandardMaterial({ name: 'bird_ink' })]);
  const fills = inkPair(multi).children[0].material;
  assert.equal(fills.length, 2);
  assert.equal(fills[0].color.getHexString(), 'ffffff');
  assert.equal(fills[1].color.getHexString(), '101010');
  assert.equal(inkPair(multi).children[1].material.color.getHexString(), '101010', 'the hull is always ink');
});

test('fitScale scales the largest dimension to the target', () => {
  const src = new Mesh(new BoxGeometry(2, 1, 4));
  assert.ok(Math.abs(fitScale(src, 8) - 2) < 1e-9);
});

test('loadModel caches per url', async () => {
  _resetModelCache();
  let calls = 0;
  const loaderFactory = () => ({ loadAsync: async (url) => { calls++; return { scene: new Group(), animations: [], url }; } });
  const a = await loadModel('x.glb', loaderFactory);
  const b = await loadModel('x.glb', loaderFactory);
  assert.equal(a, b);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test birds-src/test/ink.test.mjs`
Expected: fails on the missing module (three itself imports fine in Node).

- [ ] **Step 3: Write the module**

```js
// birds-src/ink.mjs
// The ink look, in the material rather than in lighting: a flat white fill and
// an inverted hull (the same mesh, back faces only, ink colour, slightly
// scaled) which reads as a line around the silhouette. Matches the Freestyle
// renders stream C produces, so the still, the loop and the live model agree.
import { Group, Mesh, SkinnedMesh, MeshBasicMaterial, BackSide, FrontSide, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const INK = 0x101010;
export const PAPER = 0xffffff;

function cloneMesh(src) {
  // SkinnedMesh.clone keeps the skeleton reference, so an animated hull follows the fill.
  return src instanceof SkinnedMesh ? src.clone() : new Mesh(src.geometry, src.material);
}

// Stream C names every GLB material either `bird_white` (the body) or `bird_ink`
// (the tern's cap, the skua's wing band). The fill keeps that distinction so the
// live model matches the still and the loop; everything else is paper white.
function fillMaterialFor(srcMaterial) {
  const name = String(srcMaterial?.name || '').toLowerCase();
  return new MeshBasicMaterial({ color: name === 'bird_ink' ? INK : PAPER, side: FrontSide });
}

export function inkPair(src, { outline = 1.03 } = {}) {
  const fill = cloneMesh(src);
  fill.material = Array.isArray(src.material) ? src.material.map(fillMaterialFor) : fillMaterialFor(src.material);
  const hull = cloneMesh(src);
  hull.material = new MeshBasicMaterial({ color: INK, side: BackSide });
  hull.scale.multiplyScalar(outline);
  hull.renderOrder = -1;
  const g = new Group();
  g.add(fill, hull);
  return g;
}

export function inkScene(gltfScene) {
  // Replace every mesh in a loaded scene with its ink pair, keeping the hierarchy.
  const out = gltfScene.clone(true);
  const meshes = [];
  out.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const pair = inkPair(m);
    pair.position.copy(m.position); pair.rotation.copy(m.rotation); pair.scale.copy(m.scale);
    m.parent.add(pair);
    m.parent.remove(m);
  }
  return out;
}

export function fitScale(object, target) {
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  return target / largest;
}

let cache = new Map();
export function _resetModelCache() { cache = new Map(); }

export function loadModel(url, loaderFactory = () => new GLTFLoader()) {
  if (!cache.has(url)) {
    cache.set(url, loaderFactory().loadAsync(url).catch((err) => { cache.delete(url); throw err; }));
  }
  return cache.get(url);
}
```

- [ ] **Step 4: Run the test**

Run: `node --test birds-src/test/ink.test.mjs`
Expected: `# pass 3`. If importing `three/addons/loaders/GLTFLoader.js` fails in Node (it references browser globals lazily, so it should not), move that import into `loadModel`'s default `loaderFactory` via a dynamic `import()`.

- [ ] **Step 5: Commit**

```bash
git add birds-src/ink.mjs birds-src/test/ink.test.mjs
git commit -m "feat(birds): ink material pair, model cache, fit helper"
```

---

### Task 4: The flight

**Files:**
- Create: `birds-src/flight.mjs`
- Modify: `birds-src/entry.mjs`
- Test: `birds-src/test/flight.test.mjs`

**Interfaces:**
- Produces: `easeInOutSine(t)`, `flightPoint(t, w, h) -> { x, y, angle }` (pure), `runFlight(host, deps) -> Promise<void>`; `entry.flight(host)` wires gates and the manifest.

- [ ] **Step 1: Write the failing test**

```js
// birds-src/test/flight.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeInOutSine, flightPoint, DURATION_MS } from '../flight.mjs';

test('easing is monotonic and pinned at the ends', () => {
  assert.equal(easeInOutSine(0), 0);
  assert.ok(Math.abs(easeInOutSine(1) - 1) < 1e-12);
  let prev = -1;
  for (let i = 0; i <= 100; i++) { const v = easeInOutSine(i / 100); assert.ok(v >= prev); prev = v; }
});

test('the path starts off the left edge low, ends off the right edge high, and climbs', () => {
  const w = 1000, h = 600;
  const start = flightPoint(0, w, h);
  const end = flightPoint(1, w, h);
  assert.ok(start.x < 0 && start.y > 0.8 * h);
  assert.ok(end.x > w && end.y < 0.2 * h);
  let prevX = -Infinity;
  for (let i = 0; i <= 50; i++) { const p = flightPoint(i / 50, w, h); assert.ok(p.x > prevX, 'x increases'); prevX = p.x; }
  assert.ok(flightPoint(0.5, w, h).angle < 0, 'nose points up while climbing (screen y is down)');
  assert.equal(DURATION_MS, 4000);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test birds-src/test/flight.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the flight**

```js
// birds-src/flight.mjs
// One tern crosses the map, lower left to upper right, about four seconds, then
// the canvas and the renderer are gone. Screen-space only: the bird is never
// anchored to coordinates and never implies a location.
import { Scene, OrthographicCamera, WebGLRenderer, AnimationMixer, AnimationClip, Clock } from 'three';
import { inkScene, fitScale } from './ink.mjs';

export const DURATION_MS = 4000;

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Quadratic Bezier in screen pixels (y down). Off-screen at both ends.
export function flightPoint(t, w, h) {
  const p0 = { x: -0.15 * w, y: 0.85 * h };
  const p1 = { x: 0.5 * w, y: 0.3 * h };
  const p2 = { x: 1.15 * w, y: 0.12 * h };
  const u = 1 - t;
  const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
  const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return { x, y, angle: Math.atan2(dy, dx) };
}

export async function runFlight(host, { gltf, win = globalThis, duration = DURATION_MS } = {}) {
  const doc = win.document;
  if (doc.visibilityState === 'hidden') return;
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));

  const canvas = doc.createElement('canvas');
  canvas.className = 'birds-flight';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1100' });
  canvas.setAttribute('aria-hidden', 'true');
  if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, w, 0, -h, -1000, 1000);
  const bird = inkScene(gltf.scene);
  bird.scale.setScalar(fitScale(bird, Math.max(90, 0.12 * w)));
  bird.rotation.y = -0.6;
  scene.add(bird);

  const mixer = new AnimationMixer(bird);
  const clip = AnimationClip.findByName(gltf.animations || [], 'flap') || (gltf.animations || [])[0];
  if (clip) mixer.clipAction(clip).play();

  const clock = new Clock();
  const started = win.performance.now();
  await new Promise((resolve) => {
    let raf = 0;
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const p = flightPoint(easeInOutSine(t), w, h);
      bird.position.set(p.x, -p.y, 0);
      bird.rotation.z = -p.angle;
      mixer.update(clock.getDelta());
      renderer.render(scene, camera);
      if (t < 1 && doc.visibilityState !== 'hidden') raf = win.requestAnimationFrame(frame);
      else resolve();
    };
    raf = win.requestAnimationFrame(frame);
    void raf;
  });

  mixer.stopAllAction();
  scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
  renderer.dispose();
  canvas.remove();
}
```

- [ ] **Step 4: Wire the public `flight` in `entry.mjs`**

Replace the `flight` stub with:

```js
import { detect, decide } from './gates.mjs';
import { loadManifest, assetUrl } from './manifest.mjs';
import { loadModel } from './ink.mjs';
import { runFlight } from './flight.mjs';

const BASE = () => globalThis.location?.href || 'https://www.birdflutracker.org/';
const FLAG = 'birds-flight';

export async function flight(host) {
  if (!host || decide(detect()) !== 'live') return;
  try { if (globalThis.sessionStorage?.getItem(FLAG)) return; } catch { /* private mode */ }
  const manifest = await loadManifest((u) => fetch(u), BASE());
  const species = manifest.species[manifest.generic] || Object.values(manifest.species)[0];
  const gltf = await loadModel(assetUrl(BASE(), species.glb));
  try { globalThis.sessionStorage?.setItem(FLAG, '1'); } catch { /* private mode */ }
  await runFlight(host, { gltf });
}
```

- [ ] **Step 5: Test, bundle, budget**

Run: `node --test birds-src/test/flight.test.mjs && npm run bundle && node --test birds-src/test/bundle.test.mjs`
Expected: `# pass 2`, then the budget test passes with the real three.js inside (expect roughly 450 KB raw, under 120 KB gzip; if over budget, confirm `--minify` and `--target=es2020` are in the script and that no three addon beyond GLTFLoader is imported).

- [ ] **Step 6: Commit**

```bash
git add birds-src/flight.mjs birds-src/entry.mjs birds-src/test/flight.test.mjs site/assets/three/birds.js
git commit -m "feat(birds): the one-time flight across the map"
```

---

### Task 5: The drawer figure and its fallbacks

**Files:**
- Create: `birds-src/figure.mjs`
- Modify: `birds-src/entry.mjs`
- Test: `birds-src/test/figure.test.mjs`

**Interfaces:**
- Produces: `figureFallback(canvas, species, mode, doc) -> { dispose }` (pure DOM: hides the canvas, inserts an `<img>`), `runFigure(canvas, gltf, deps) -> { dispose }`; `entry.figure(canvas, slug)` chooses by gate and never throws.

- [ ] **Step 1: Write the failing test (DOM-free parts)**

```js
// birds-src/test/figure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figureFallback, TURN_RATE } from '../figure.mjs';

function fakeDoc() {
  const made = [];
  return {
    made,
    createElement(tag) {
      const el = { tag, attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; } };
      made.push(el);
      return el;
    },
  };
}

test('figureFallback shows the still for reduced motion and the loop otherwise, and dispose restores', () => {
  const doc = fakeDoc();
  const inserted = [];
  const canvas = { hidden: false, insertAdjacentElement(_, el) { inserted.push(el); } };
  const species = { still: 'assets/birds/t.png', apng: 'assets/birds/t-loop.png' };
  const h = figureFallback(canvas, species, 'still', doc, 'https://www.birdflutracker.org/');
  assert.equal(canvas.hidden, true);
  assert.equal(inserted[0].attrs.src, 'https://www.birdflutracker.org/assets/birds/t.png');
  assert.equal(inserted[0].attrs.alt, '');
  h.dispose();
  assert.equal(canvas.hidden, false);
  assert.equal(inserted[0].removed, true);
  const h2 = figureFallback(canvas, species, 'apng', doc, 'https://www.birdflutracker.org/');
  assert.match(inserted[1].attrs.src, /t-loop\.png$/);
  h2.dispose();
});

test('the turntable is slow', () => {
  assert.ok(TURN_RATE > 0.2 && TURN_RATE < 0.5, 'radians per second, a few rpm');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test birds-src/test/figure.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the figure**

```js
// birds-src/figure.mjs
// The species figure in the record drawer: a slow turntable, draggable, one
// renderer per open drawer, disposed on close. Fallbacks swap the canvas for an
// image so the drawer looks the same on every device.
import { Scene, PerspectiveCamera, WebGLRenderer, Box3, Vector3, Clock } from 'three';
import { inkScene, fitScale } from './ink.mjs';
import { assetUrl } from './manifest.mjs';

export const TURN_RATE = 0.35;   // radians per second

export function figureFallback(canvas, species, mode, doc = globalThis.document, base = globalThis.location?.href) {
  const img = doc.createElement('img');
  img.setAttribute('src', assetUrl(base, mode === 'still' ? species.still : species.apng));
  img.setAttribute('alt', '');
  img.setAttribute('aria-hidden', 'true');
  img.className = 'birds-figure-img';
  canvas.hidden = true;
  canvas.insertAdjacentElement('afterend', img);
  return { dispose() { img.remove(); canvas.hidden = false; } };
}

export function runFigure(canvas, gltf, { win = globalThis } = {}) {
  const size = Math.max(1, canvas.clientWidth || 160);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const bird = inkScene(gltf.scene);
  bird.scale.setScalar(fitScale(bird, 1));
  const box = new Box3().setFromObject(bird);
  const centre = box.getCenter(new Vector3());
  bird.position.sub(centre);
  scene.add(bird);
  camera.position.set(0, 0.15, 2.6);
  camera.lookAt(0, 0, 0);

  let dragging = false; let lastX = 0; let velocity = 0;
  const onDown = (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; velocity = dx * 0.01; bird.rotation.y += velocity; };
  const onUp = () => { dragging = false; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'pan-y';

  const clock = new Clock();
  let raf = 0; let alive = true;
  const frame = () => {
    if (!alive) return;
    const dt = clock.getDelta();
    if (!dragging) bird.rotation.y += TURN_RATE * dt;
    renderer.render(scene, camera);
    raf = win.requestAnimationFrame(frame);
  };
  raf = win.requestAnimationFrame(frame);

  return {
    dispose() {
      alive = false;
      win.cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 4: Wire the public `figure` and `speciesSlug` in `entry.mjs`**

Replace the two stubs with:

```js
import { slugFor } from './manifest.mjs';
import { figureFallback, runFigure } from './figure.mjs';

let manifestSync = null;   // resolved manifest, for the synchronous speciesSlug

export function speciesSlug(commonName) {
  return slugFor(commonName, manifestSync);
}

export function figure(canvas, slug) {
  let handle = { dispose() {} };
  let cancelled = false;
  (async () => {
    try {
      const manifest = await loadManifest((u) => fetch(u), BASE());
      manifestSync = manifest;
      const species = manifest.species[slug] || manifest.species[manifest.generic];
      if (!species || cancelled) return;
      const mode = decide(detect());
      if (mode !== 'live') { handle = figureFallback(canvas, species, mode); return; }
      const gltf = await loadModel(assetUrl(BASE(), species.glb));
      if (cancelled) return;
      handle = runFigure(canvas, gltf);
    } catch (err) {
      console.warn('[birds] figure unavailable:', err?.message || err);
    }
  })();
  return { dispose() { cancelled = true; handle.dispose(); } };
}
```

Also, at the end of `flight()`, after loading the manifest, set `manifestSync = manifest` so `speciesSlug` is exact once either path has run; before that it returns the normalised slug, which `figure` resolves through the manifest anyway.

- [ ] **Step 5: Test, bundle, commit**

Run: `node --test birds-src/test/ && npm run bundle && npm test`
Expected: all birds tests pass, bundle within budget, pipeline tests unaffected.

```bash
git add birds-src/figure.mjs birds-src/entry.mjs birds-src/test/figure.test.mjs site/assets/three/birds.js
git commit -m "feat(birds): drawer turntable with still and loop fallbacks"
```

---

### Task 6: Integration and cross-browser verification

**Files:**
- Read: `site/app.js` (stream B's two integration points), `site/assets/birds/manifest.json` (stream C)
- Modify: `site/styles.css` only if the `.birds-flight` or `.birds-figure-img` rules are missing (add these two rules; nothing else)

**Interfaces:**
- Consumes: stream B's `app.js` calling `import('./birds.js')` after first render inside `requestIdleCallback`, guarded by `sessionStorage.getItem('birds-flight')`, and `figure(canvas, speciesSlug(record.species))` on drawer open with `handle.dispose()` on close; stream C's accepted GLBs, stills and loops in `site/assets/birds/`.

- [ ] **Step 1: Blockers check**

Run: `ls site/assets/birds/ && grep -n "birds.js\|birds-flight\|figure(" site/app.js | head`
Expected: the manifest, at least the generic GLB, still and loop; the two integration points in `app.js`. If either is missing, stop and report which stream is not yet merged.

- [ ] **Step 2: Styles the runtime relies on**

Ensure `site/styles.css` contains (add to the map block if absent):

```css
.birds-flight { display: block; }
.birds-figure-img { display: block; width: 160px; height: 160px; object-fit: contain; }
```

- [ ] **Step 3: Local run, then the checklist in four browsers**

Run: `npm run serve` and open `http://localhost:8080/` in Chrome and Safari on this Mac, then the Vercel preview URL on an iPhone (Safari) and an Android phone (Chrome). For each, check and record:

1. The map renders and is interactive before any bird appears (Network panel: `birds.js` starts after the map's first paint; Performance panel: no long task over 50 ms attributable to `birds.js`).
2. One tern crosses lower left to upper right in about four seconds, in ink line, then the canvas is gone from the DOM (`document.querySelector('.birds-flight') === null`).
3. Reload: no second flight in the same session; `sessionStorage['birds-flight'] === '1'`. New tab: flight again.
4. `/about` and `/history`: no flight, no request for `birds.js`.
5. Open a record: the species figure turns slowly; drag rotates it; close the drawer; `performance.memory` (Chrome) and the console show no `WebGL: CONTEXT_LOST` or "Too many active WebGL contexts" after opening and closing 20 records.
6. Reduced motion (macOS: System Settings, Accessibility, Display, Reduce motion; Chrome DevTools: Rendering, Emulate CSS prefers-reduced-motion): no flight; the drawer shows the PNG still.
7. WebGL off (Chrome: `--disable-gpu --disable-software-rasterizer`, or DevTools Rendering "Emulate WebGL unsupported" where available): no flight; the drawer shows the APNG loop.
8. Console clean of errors on all four browsers; the CSP report shows no violation (DevTools console would show a CSP error if the module or a fetch were blocked).

- [ ] **Step 4: Screenshot evidence by subagent, not in the main thread**

Dispatch a browser subagent (`/browser-task`) to capture, at 390 px and 1280 px: mid-flight frame, drawer with figure, drawer under reduced motion. Review against spec 6.3 (ink only, no colour, no carmine on birds).

- [ ] **Step 5: Commit any style additions**

```bash
git add site/styles.css
git commit -m "feat(birds): runtime styles"
```

Report to the parent: the eight checklist results per browser, the bundle's raw and gzip size, and the frame time of the flight on the slowest device tested.

---

## Self-review

- Spec 6.1 (two appearances, screen-space, never anchored): Tasks 4, 5. Spec 6.4 (bundle, no import map, CSP untouched, ink in the material, gates and fallbacks, one renderer each, disposed, once per session, not on other pages): Tasks 1 to 5, checklist items 2 to 7. Spec 6.5 subgoal 5 (runs on the four browsers, every gate's fallback exercised): Task 6.
- Names consistent: `flight`, `figure`, `speciesSlug` (entry); `decide`, `detect` (gates); `loadManifest`, `slugFor`, `assetUrl` (manifest); `inkPair`, `inkScene`, `fitScale`, `loadModel` (ink); `flightPoint`, `easeInOutSine`, `runFlight`, `DURATION_MS` (flight); `figureFallback`, `runFigure`, `TURN_RATE` (figure). The manifest keys used (`species`, `generic`, `glb`, `still`, `apng`) match stream C's contract.
- Dependencies stated as blockers (Task 6 Step 1) rather than assumed.
