// Shells from three numbers: the coiling model of Raup in three.js, the
// spiral seen from above against the Fibonacci spiral, and the plane (D, W)
// of Raup's shell space. The mesh is rebuilt only when a number changes.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { presets, shell, fibonacci, logSpiral, PHI } from './shells-model.js';
import { t, onLang, onTheme } from './i18n.js';
import { printPanel } from './print/index.js';
import { fileName } from './shells-print.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const still = matchMedia('(prefers-reduced-motion: reduce)');
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

// the state: the three numbers, the aperture and the number of whorls
const state = { ...presets.nautilus, preset: 'nautilus', ap: 'ellipse' };
const apOf = p => (p.drop ? 'drop' : p.S === 1 ? 'circle' : 'ellipse');
const fmtW = W => (W >= 100 ? W.toFixed(0) : W >= 10 ? W.toFixed(1) : W.toFixed(3));

/* ---------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, group, outer, inner, dirty = true;
const matOut = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0, vertexColors: true, side: THREE.FrontSide });
const matIn = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.05, side: THREE.BackSide });

// growth lines across the whorl (u, in revolutions) and two soft spiral bands
// along it (v), as a grey texture that the colour of the material tints
function growthTexture() {
  const w = 512, h = 128, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const line = new Float32Array(w);
  for (let x = 0; x < w; x += 6 + Math.floor(rnd() * 10)) {
    const strong = rnd() < 0.18, depth = strong ? 0.42 : 0.12 + 0.12 * rnd();
    for (let d = -2; d <= 2; d++) line[(x + d + w) % w] = Math.max(line[(x + d + w) % w], depth * Math.exp(-d * d / (strong ? 1.6 : 0.8)));
  }
  for (let y = 0; y < h; y++) {
    const v = y / h, band = 0.16 * Math.exp(-((v - 0.2) ** 2) / 0.004) + 0.12 * Math.exp(-((v - 0.32) ** 2) / 0.002);
    for (let x = 0; x < w; x++) {
      const k = 4 * (y * w + x), s = 255 * (1 - line[x]) * (1 - band);
      img.data[k] = img.data[k + 1] = img.data[k + 2] = s; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function colours() {
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  const shellC = new THREE.Color(dark ? css('--accent') : css('--lilac'));
  matOut.color.copy(shellC);
  matIn.color.copy(shellC.clone().lerp(new THREE.Color('#ffffff'), 0.55));
  matIn.emissive.copy(new THREE.Color(css('--gold'))).multiplyScalar(dark ? 0.06 : 0.03);
  dirty = true;
}

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(-2.2, -1.85, 1.45);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 1.2;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(3, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 3, -1); scene.add(rim);
  group = new THREE.Group(); scene.add(group);
  matOut.map = growthTexture();
  colours();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.82, 620));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  controls.addEventListener('change', () => { dirty = true; });
  $('spin').checked = !still.matches;
  const loop = () => {
    controls.autoRotate = $('spin').checked;
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  loop();
}

// the mesh of the current numbers, scaled into the unit sphere about the origin
function build() {
  const n = state.n, nTheta = Math.min(1600, Math.max(220, Math.round(n * 150))), nPhi = 56;
  const S = state.ap === 'circle' ? 1 : state.S;
  const { pos, uv, gr, idx } = shell({ W: state.W, D: state.D, T: state.T, S, n, drop: state.ap === 'drop' }, nTheta, nPhi);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // growth lines in revolutions: the same number per turn whatever W
  const uv2 = new Float32Array(uv.length);
  for (let k = 0; k < uv.length; k += 2) { uv2[k] = uv[k] * 3; uv2[k + 1] = uv[k + 1]; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv2, 2));
  // darker near the apex, as an old shell is worn there
  const col = new Float32Array(gr.length * 3);
  for (let k = 0; k < gr.length; k++) { const c = 0.72 + 0.28 * Math.pow(gr[k], 0.25); col[3 * k] = col[3 * k + 1] = col[3 * k + 2] = c; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const bs = geo.boundingSphere;
  if (outer) { outer.geometry.dispose(); group.remove(outer, inner); }
  outer = new THREE.Mesh(geo, matOut); inner = new THREE.Mesh(geo, matIn);
  group.add(outer, inner);
  group.scale.setScalar(1 / bs.radius);
  group.position.copy(bs.center).multiplyScalar(-1 / bs.radius);
  dirty = true;
}

/* ----------------------------------------------------- the two insets ---- */

// the spiral of the coiling seen from above against the Fibonacci spiral
const FIB = fibonacci(9);
function drawFib() {
  const svg = $('fib'); svg.replaceChildren();
  const xs = FIB.squares.flat().map(p => p[0]), ys = FIB.squares.flat().map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 2, sc = 300 / (x1 - x0 + 2 * pad);
  const X = p => (p[0] - x0 + pad) * sc, Y = p => (y1 - p[1] + pad) * sc;
  svg.setAttribute('viewBox', `0 0 300 ${Math.round((y1 - y0 + 2 * pad) * sc)}`);
  for (const q of FIB.squares) el('polygon', { class: 'fsq', points: q.map(p => `${X(p)},${Y(p)}`).join(' ') }, svg);
  FIB.squares.forEach((q, i) => {
    if (FIB.F[i] < 3) return;
    const c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
    el('text', { class: 'fnum', x: X(c), y: Y(c) + 4 }, svg).textContent = FIB.F[i];
  });
  let d = '';
  for (const a of FIB.arcs) {
    const r = a.r * sc;
    d += `${d ? '' : `M${X(a.from)},${Y(a.from)}`} A${r},${r} 0 0 0 ${X(a.to)},${Y(a.to)}`;
  }
  el('path', { class: 'fibsp', d }, svg);
  // the shell: a logarithmic spiral about the same eye through the outer end
  const end = FIB.joins.at(-1), pts = logSpiral(FIB.eye, end, state.W, 6);
  const inside = pts.filter(p => Math.hypot(p[0] - FIB.eye[0], p[1] - FIB.eye[1]) > 0.05);
  el('path', { class: 'shellsp', d: 'M' + inside.map(p => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join('L') }, svg);
  // a dot every quarter turn on the shell spiral, back from the outer end
  const v = [end[0] - FIB.eye[0], end[1] - FIB.eye[1]], q = Math.pow(state.W, 0.25);
  for (let k = 0; k < 16; k++) {
    const g = Math.pow(q, -k), a = -k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const p = [FIB.eye[0] + g * (c * v[0] - s * v[1]), FIB.eye[1] + g * (s * v[0] + c * v[1])];
    if (g * Math.hypot(...v) < 0.4) break;
    el('circle', { class: 'shelldot', cx: X(p), cy: Y(p), r: 3 }, svg);
  }
  el('circle', { class: 'eye', cx: X(FIB.eye), cy: Y(FIB.eye), r: 2.5 }, svg);
  const qW = Math.pow(state.W, 0.25);
  $('quarter').textContent = qW.toFixed(3);
  $('turn').textContent = fmtW(state.W);
  $('ratio').textContent = t(
    qW > PHI * 1.01 ? 'wider than golden' : qW < PHI / 1.01 ? 'tighter than golden' : 'golden',
    qW > PHI * 1.01 ? 'più larga dell\'aurea' : qW < PHI / 1.01 ? 'più stretta dell\'aurea' : 'aurea');
}

// Raup's shell space, the face (D, log W): whorls overlap under D W = 1
const SP = { x0: 34, x1: 290, y0: 22, y1: 186, Wmin: 1.1, Wmax: 1000, Dmax: 0.9 };
const spX = D => SP.x0 + (SP.x1 - SP.x0) * D / SP.Dmax;
const spY = W => SP.y1 - (SP.y1 - SP.y0) * Math.log(W / SP.Wmin) / Math.log(SP.Wmax / SP.Wmin);
function drawSpace() {
  const svg = $('space'); svg.replaceChildren();
  // the region where successive whorls overlap (planispiral, round aperture)
  let d = `M${spX(0)},${spY(SP.Wmin)}`;
  for (let i = 0; i <= 80; i++) {
    const D = SP.Dmax * i / 80, W = Math.min(SP.Wmax, Math.max(SP.Wmin, D > 0 ? 1 / D : SP.Wmax));
    d += `L${spX(D).toFixed(1)},${spY(W).toFixed(1)}`;
  }
  d += `L${spX(SP.Dmax)},${spY(SP.Wmin)}Z`;
  el('path', { class: 'overlap', d }, svg);
  let c = '';
  for (let i = 0; i <= 80; i++) {
    const D = 1 / SP.Wmax + (SP.Dmax - 1 / SP.Wmax) * i / 80;
    c += `${i ? 'L' : 'M'}${spX(D).toFixed(1)},${spY(Math.min(SP.Wmax, 1 / D)).toFixed(1)}`;
  }
  el('path', { class: 'touch', d: c }, svg);
  el('rect', { class: 'mapframe', x: SP.x0, y: SP.y0, width: SP.x1 - SP.x0, height: SP.y1 - SP.y0 }, svg);
  for (const W of [2, 10, 100, 1000]) {
    el('line', { class: 'grid', x1: SP.x0, x2: SP.x1, y1: spY(W), y2: spY(W) }, svg);
    el('text', { class: 'tick end', x: SP.x0 - 4, y: spY(W) + 4 }, svg).textContent = W;
  }
  for (const D of [0, 0.3, 0.6, 0.9]) el('text', { class: 'tick', x: spX(D), y: SP.y1 + 14 }, svg).textContent = D;
  el('text', { class: 'lab', x: SP.x1, y: SP.y1 + 28, 'text-anchor': 'end' }, svg).textContent = 'D';
  el('text', { class: 'lab', x: SP.x0 - 26, y: SP.y0 - 10 }, svg).textContent = 'W';
  el('text', { class: 'lab ovl', x: spX(0.03), y: spY(1.6) }, svg).textContent = t('whorls overlap', 'giri sovrapposti');
  el('text', { class: 'lab ovl', x: spX(0.16), y: spY(12) }, svg).textContent = 'D·W = 1';
  for (const [k, p] of Object.entries(presets)) {
    const m = el('circle', { class: 'pdot', cx: spX(p.D), cy: spY(p.W), r: 4 }, svg);
    el('title', {}, m).textContent = t(p.en, p.it);
  }
  el('circle', { class: 'here', cx: spX(state.D), cy: spY(state.W), r: 7 }, svg);
}

// a click or a drag in the shell space sets D and W
function spacePointer(e) {
  const svg = $('space'), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  const x = (e.clientX - r.left) * vb.width / r.width, y = (e.clientY - r.top) * vb.height / r.height;
  const D = Math.min(SP.Dmax, Math.max(0, (x - SP.x0) / (SP.x1 - SP.x0) * SP.Dmax));
  const W = SP.Wmin * Math.pow(SP.Wmax / SP.Wmin, Math.min(1, Math.max(0, (SP.y1 - y) / (SP.y1 - SP.y0))));
  set({ W, D, preset: '' });
}

/* ------------------------------------------------------ the controls ---- */

const W2s = W => Math.log10(W), s2W = s => Math.pow(10, s);

function show() {
  $('W').value = W2s(state.W); $('Wout').textContent = fmtW(state.W);
  $('D').value = state.D; $('Dout').textContent = state.D.toFixed(2);
  $('T').value = state.T; $('Tout').textContent = state.T.toFixed(2);
  $('S').value = Math.log2(state.S); $('Sout').textContent = state.S.toFixed(2);
  $('S').disabled = state.ap === 'circle';
  $('ap').value = state.ap;
  $('n').value = state.n; $('nout').textContent = state.n;
  $('preset').value = state.preset || '';
  history.replaceState(null, '', '#' + new URLSearchParams({
    W: +state.W.toPrecision(5), D: +state.D.toFixed(3), T: +state.T.toFixed(3), S: +state.S.toFixed(3), n: state.n, ap: state.ap,
  }));
}

let pending = 0;
function redraw() {
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; build(); drawFib(); drawSpace(); show(); });
}

function set(o) { Object.assign(state, o); redraw(); }

// a preset morphs from the current shell in a short glide, or jumps at once
// when the reader asked for reduced motion
let glide = 0;
function choose(name) {
  const p = presets[name]; if (!p) return;
  cancelAnimationFrame(glide);
  const from = { W: state.W, D: state.D, T: state.T, S: state.ap === 'circle' ? 1 : state.S, n: state.n };
  const to = { W: p.W, D: p.D, T: p.T, S: p.S, n: p.n }, ap = apOf(p);
  // during the glide the aperture is an ellipse, or a drop when the end is one
  const via = ap === 'drop' ? 'drop' : 'ellipse';
  if (still.matches) return set({ ...to, ap, preset: name });
  const t0 = performance.now(), dur = 700;
  const step = now => {
    const u = Math.min(1, (now - t0) / dur), e = u * u * (3 - 2 * u), mix = (a, b) => a + (b - a) * e;
    if (u === 1) return set({ ...to, ap, preset: name });
    set({ W: Math.exp(mix(Math.log(from.W), Math.log(to.W))), D: mix(from.D, to.D), T: mix(from.T, to.T),
      S: Math.exp(mix(Math.log(from.S), Math.log(to.S))), n: +mix(from.n, to.n).toFixed(2), ap: u < 1 ? via : ap, preset: name });
    if (u < 1) glide = requestAnimationFrame(step);
  };
  glide = requestAnimationFrame(step);
}

function fillPresets() {
  const sel = $('preset'), v = sel.value;
  sel.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = t('(your own)', '(personalizzata)'); sel.appendChild(none);
  for (const [k, p] of Object.entries(presets)) {
    const o = document.createElement('option'); o.value = k; o.textContent = t(p.en, p.it); sel.appendChild(o);
  }
  sel.value = v || state.preset || '';
  $('ap').options[0].textContent = t('circle', 'cerchio');
  $('ap').options[1].textContent = t('ellipse', 'ellisse');
  $('ap').options[2].textContent = t('drop', 'goccia');
}

/* ----------------------------------------------- download for printing -- */

// the solid is built by a worker (src/shells-print.js through src/print), so
// that the page goes on turning meanwhile
function printSetup() {
  const shellOf = () => ({ W: state.W, D: state.D, T: state.T, S: state.ap === 'circle' ? 1 : state.S, n: state.n, drop: state.ap === 'drop' });
  const opts = o => ({ size: o.size, thick: o.thick, base: o.base, fine: o.res === 'fine' });
  printPanel($('print'), {
    size: { value: 80, min: 20, max: 300, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'thick', label: { en: 'wall, mm', it: 'parete, mm' }, value: 1.6, min: 0.8, max: 6, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'flat base', it: 'base piana' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./shells-print.js', import.meta.url).href, fn: 'printMesh', args: o => [shellOf(), opts(o)] },
    name: o => fileName(shellOf(), opts(o)),
    head: 'binary STL, millimetres, shell after Raup (1966)',
    object: 'shell',
    note: info => (info.onLip ? t(', laid on its aperture', ', posata sull\'apertura') : ''),
  });
}

function init() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('W')) {
    const num = (k, lo, hi, d) => { const x = parseFloat(h.get(k)); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
    Object.assign(state, { W: num('W', 1.1, 1000, 3), D: num('D', 0, 0.9, 0), T: num('T', 0, 8, 0), S: num('S', 0.25, 4, 1),
      n: num('n', 0.5, 14, 3), ap: ['circle', 'ellipse', 'drop'].includes(h.get('ap')) ? h.get('ap') : 'circle', preset: '' });
    for (const [k, p] of Object.entries(presets))
      if (Math.abs(p.W - state.W) < 1e-3 * p.W && p.D === state.D && p.T === state.T && p.n === state.n) state.preset = k;
  }
  fillPresets();
  setup();
  $('preset').addEventListener('change', e => choose(e.target.value));
  $('W').addEventListener('input', e => set({ W: s2W(+e.target.value), preset: '' }));
  $('D').addEventListener('input', e => set({ D: +e.target.value, preset: '' }));
  $('T').addEventListener('input', e => set({ T: +e.target.value, preset: '' }));
  $('S').addEventListener('input', e => set({ S: Math.pow(2, +e.target.value), preset: '' }));
  $('ap').addEventListener('change', e => set({ ap: e.target.value, preset: '' }));
  $('n').addEventListener('input', e => set({ n: +e.target.value, preset: '' }));
  $('golden').addEventListener('click', () => choose('golden'));
  printSetup();
  $('view').addEventListener('click', () => { controls.reset(); camera.position.set(-2.2, -1.85, 1.45); controls.target.set(0, 0, 0); dirty = true; });
  const sp = $('space');
  sp.addEventListener('pointerdown', e => { sp.setPointerCapture(e.pointerId); spacePointer(e); });
  sp.addEventListener('pointermove', e => { if (sp.hasPointerCapture(e.pointerId)) spacePointer(e); });
  const aria = () => {
    $('fib').setAttribute('aria-label', t('Fibonacci spiral and the spiral of the shell', 'Spirale di Fibonacci e spirale della conchiglia'));
    $('space').setAttribute('aria-label', t('Shell space, D against W', 'Spazio delle conchiglie, D contro W'));
  };
  aria();
  onLang(() => { fillPresets(); drawFib(); drawSpace(); aria(); });
  onTheme(colours);
  still.addEventListener('change', () => { controls.enableDamping = !still.matches; if (still.matches) $('spin').checked = false; });
  redraw();
}

init();
