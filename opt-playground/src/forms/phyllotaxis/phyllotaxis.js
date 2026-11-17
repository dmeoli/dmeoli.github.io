// Phyllotaxis: the form of Vogel's model in three.js, built in a worker at
// every change, Vogel's disc with its parastichies, and the curve of packing
// against the divergence angle; the download panel builds the same form at
// a finer grid.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, bi, onLang, onTheme } from '../../i18n.js';
import { printPanel, shareUrl } from '../../print/index.js';
import { presets, GOLDEN, FIB, fileName, form, vogel, links, families, packingCurve } from './model.js';

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

const NAMES = {
  sunflower: ['sunflower (disc)', 'girasole (disco)'],
  pinecone: ['pine cone (ovoid)', 'pigna (ovoide)'],
  pineapple: ['pineapple (barrel)', 'ananas (botte)'],
  cactus: ['Mammillaria cactus (sphere)', 'cactus Mammillaria (sfera)'],
};
const COLS = { plain: ['cells', 'celle'], a: ['first family', 'prima famiglia'], b: ['second family', 'seconda famiglia'] };
const state = { preset: 'sunflower', ...presets.sunflower, alpha: GOLDEN, col: 'b' };
// every parameter of the scene, for the link that a request of a print sends
const SPEC = {
  preset: { def: 'sunflower', values: Object.keys(presets) }, alpha: { def: GOLDEN, min: 90, max: 180 },
  N: { def: 420, min: 40, max: 1500, int: true }, relief: { def: 1, min: 0.2, max: 2 },
  col: { def: 'b', values: ['plain', 'a', 'b'] }, petals: { def: true },
};

/* ---------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, meshObj, dirty = true, last = null;
const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, vertexColors: true });

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 1.2;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2.5, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 3, 1); scene.add(rim);
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

function resetView() {
  const head = state.preset === 'sunflower';
  // the head is seen from above at a slant, the others from the side
  if (head) camera.position.set(0.9, -2.3, 2.6); else camera.position.set(1.6, -2.9, 1.05);
  if (document.body.classList.contains('thumb')) camera.position.multiplyScalar(0.8);
  controls.target.set(0, 0, head ? -0.08 : 0);
  controls.update(); dirty = true;
}

// the colours of the vertices: the cell of each floret, darker in the
// grooves, and with a family chosen, alternate colours on its spirals
function paint() {
  if (!last || !meshObj) return;
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  const A = new THREE.Color(dark ? css('--accent') : css('--lilac')), Bc = new THREE.Color(css('--gold'));
  const plain = new THREE.Color(dark ? css('--accent') : css('--lilac'));
  if (!dark) Bc.lerp(new THREE.Color('#e9c25a'), 0.6);
  const soil = new THREE.Color(dark ? '#8f7fa8' : '#b8a7cf');
  const k = state.col === 'a' ? last.fam[0] : state.col === 'b' ? last.fam[1] : 0;
  const { cell, groove } = last, n = cell.length, col = new Float32Array(3 * n), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (cell[i] < 0) c.copy(soil);
    else if (k > 1) c.copy(((cell[i] % k) & 1) ? Bc : A);
    else c.copy(plain);
    const g = 0.5 + 0.5 * groove[i];
    col[3 * i] = c.r * g; col[3 * i + 1] = c.g * g; col[3 * i + 2] = c.b * g;
  }
  meshObj.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  dirty = true;
}

function show(d) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const bs = geo.boundingSphere;
  if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
  meshObj = new THREE.Mesh(geo, mat);
  meshObj.scale.setScalar(1 / bs.radius);
  meshObj.position.copy(bs.center).multiplyScalar(-1 / bs.radius);
  scene.add(meshObj);
  last = d; paint();
}

/* ------------------------------------------------------------ worker ---- */

const worker = new Worker(new URL('./view-worker.js', import.meta.url), { type: 'module' });
let busy = false, queued = false, seq = 0, curve = null;
const opts = () => ({ shape: state.shape, style: state.style, N: state.N, relief: state.relief, alpha: state.alpha, petals: state.petals });
// #sync=1 computes on the main thread, for headless screenshots that do
// not wait for workers
const SYNC = new URLSearchParams(location.hash.slice(1)).get('sync') === '1';
// #thumb=1 leaves only the form, for the thumbnail of the card
if (new URLSearchParams(location.hash.slice(1)).get('thumb') === '1') document.body.classList.add('thumb');
function request() {
  if (busy) { queued = true; return; }
  busy = true; queued = false;
  const res = innerWidth < 600 ? [240, 160] : [360, 230];
  if (SYNC) {
    const o = opts(), m = form(o, res, 40), V = vogel(m.N, o.alpha), s = Math.sqrt(2 * Math.PI / Math.sqrt(3));
    receive({ ...m, V, L: links(V, m.N), inner: families(V, m.N, s, Math.round(0.2 * m.N), Math.round(0.3 * m.N)), outer: families(V, m.N, s, Math.round(0.85 * m.N), m.N) });
    return;
  }
  worker.postMessage({ id: ++seq, o: opts(), res });
}
worker.onmessage = ({ data }) => receive(data);
function receive(data) {
  busy = false;
  show(data); drawDisc(data); stats(data);
  if (queued) request();
}

/* ------------------------------------------------------ Vogel's disc ---- */

function drawDisc(d) {
  const svg = $('disc'); svg.replaceChildren();
  const R = Math.sqrt(d.N), sc = 150 / R, V = d.V, L = d.L;
  // the differences of index that join many pairs, ascending: consecutive
  // ones alternate in colour, so two crossing families never share one
  const cnt = new Map();
  for (let i = 2; i < L.length; i += 3) cnt.set(L[i], (cnt.get(L[i]) || 0) + 1);
  const big = [...cnt.entries()].filter(e => e[1] > 0.03 * d.N).map(e => e[0]).sort((a, b) => a - b);
  const cls = new Map(big.map((k, i) => [k, 'l' + (i & 1)]));
  const paths = { l0: '', l1: '', l2: '' };
  for (let i = 0; i < L.length; i += 3) {
    const p = L[i], q = L[i + 1], c = cls.get(L[i + 2]) || 'l2';
    paths[c] += `M${(V[3 * p] * sc).toFixed(1)},${(-V[3 * p + 1] * sc).toFixed(1)}L${(V[3 * q] * sc).toFixed(1)},${(-V[3 * q + 1] * sc).toFixed(1)}`;
  }
  for (const c of ['l2', 'l0', 'l1']) el('path', { class: c, d: paths[c] }, svg);
  const r = Math.max(0.9, Math.min(2.6, 0.32 * sc * 1.9));
  let dots = '';
  for (let n = 0; n < d.N; n++) {
    const x = V[3 * n] * sc, y = -V[3 * n + 1] * sc;
    dots += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0`;
  }
  el('path', { class: 'pt', d: dots }, svg);
}

function stats(d) {
  const set = (id, v) => { $(id).textContent = v; };
  set('fa', d.fam[0]); set('fb', d.fam[1]);
  set('ia', d.inner[0]); set('ib', d.inner[1]);
  set('oa', d.outer[0]); set('ob', d.outer[1]);
  const fib = [d.fam, d.inner, d.outer].every(p => FIB.includes(p[0]) && FIB.includes(p[1]));
  $('isfib').textContent = fib ? t('all of them', 'tutti') : t('not all', 'non tutti');
}

/* --------------------------------------------------- packing curve ---- */

const PK = { x0: 34, x1: 312, y0: 12, y1: 140, a0: 130, a1: 145 };
const pX = a => PK.x0 + (PK.x1 - PK.x0) * (a - PK.a0) / (PK.a1 - PK.a0);
const pY = q => PK.y1 - (PK.y1 - PK.y0) * Math.min(1, q);
function drawPack() {
  const svg = $('pack'); svg.replaceChildren();
  el('rect', { class: 'frame', x: PK.x0, y: PK.y0, width: PK.x1 - PK.x0, height: PK.y1 - PK.y0 }, svg);
  if (curve) {
    let d = `M${PK.x0},${PK.y1}`;
    for (let i = 0; i <= curve.steps; i++) d += `L${pX(curve.a0 + (curve.a1 - curve.a0) * i / curve.steps).toFixed(2)},${pY(curve.q[i]).toFixed(1)}`;
    el('path', { class: 'area', d: d + `L${PK.x1},${PK.y1}Z` }, svg);
    el('path', { class: 'curve', d: 'M' + d.slice(d.indexOf('L') + 1) }, svg);
  }
  for (const a of [130, 135, 140, 145]) el('text', { class: 'tick', x: pX(a), y: PK.y1 + 14 }, svg).textContent = a + '°';
  for (const q of [0, 0.5, 1]) el('text', { class: 'tick end', x: PK.x0 - 4, y: pY(q) + 3 }, svg).textContent = q;
  el('line', { class: 'gold', x1: pX(GOLDEN), x2: pX(GOLDEN), y1: PK.y0, y2: PK.y1 }, svg);
  el('text', { class: 'lab', x: pX(GOLDEN) + 4, y: PK.y0 + 12 }, svg).textContent = '137.508°';
  if (state.alpha >= PK.a0 && state.alpha <= PK.a1) el('line', { class: 'now', x1: pX(state.alpha), x2: pX(state.alpha), y1: PK.y0, y2: PK.y1 }, svg);
  el('text', { class: 'tick', x: (PK.x0 + PK.x1) / 2, y: 168 }, svg).textContent = t('divergence angle α', 'angolo di divergenza α');
  why();
}

// a line on the angle: the nearest fraction p/q with a small q
function why() {
  const f = state.alpha / 360;
  let best = null;
  for (let q = 2; q <= 60; q++) {
    const p = Math.round(f * q), e = Math.abs(f - p / q) * 360;
    if (!best || e < best.e - 1e-9) { if (e < 0.6) { best = { p, q, e }; break; } }
  }
  const g = Math.abs(state.alpha - GOLDEN) < 0.005;
  $('why').textContent = g
    ? t('The golden angle: no fraction is close to it for long, and the florets never line up in spokes.',
      'L\'angolo aureo: nessuna frazione gli resta vicina a lungo, e i fiori non si allineano mai in raggi.')
    : best
      ? t(`Close to 360° × ${best.p}/${best.q} (by ${best.e.toFixed(3)}°): the florets line up on ${best.q} spokes, which bend as n grows.`,
        `Vicino a 360° × ${best.p}/${best.q} (di ${best.e.toFixed(3)}°): i fiori si allineano su ${best.q} raggi, che si incurvano al crescere di n.`)
      : t('Far from every fraction with a small denominator.', 'Lontano da ogni frazione con denominatore piccolo.');
}

/* ---------------------------------------------------------- controls ---- */

function writeHash() {
  const h = new URLSearchParams({ preset: state.preset, alpha: state.alpha.toFixed(3), N: state.N, relief: state.relief, col: state.col, petals: state.petals ? 1 : 0 });
  history.replaceState(null, '', '#' + h);
}
function syncControls() {
  $('preset').value = state.preset;
  $('alpha').value = state.alpha; $('alphaout').textContent = state.alpha.toFixed(3) + '°';
  $('N').value = state.N; $('Nout').textContent = state.N;
  $('relief').value = state.relief; $('reliefout').textContent = (+state.relief).toFixed(2);
  $('col').value = state.col; $('petals').checked = state.petals;
  $('petalsbox').style.display = state.shape === 'head' ? '' : 'none';
}
function names() {
  $('preset').querySelectorAll('option').forEach(o => { const n = NAMES[o.value]; o.textContent = t(n[0], n[1]); });
  $('col').querySelectorAll('option').forEach(o => { const n = COLS[o.value]; o.textContent = t(n[0], n[1]); });
}
function changed() { syncControls(); writeHash(); drawPack(); request(); }

function init() {
  for (const k of Object.keys(presets)) $('preset').appendChild(Object.assign(document.createElement('option'), { value: k }));
  for (const k of Object.keys(COLS)) $('col').appendChild(Object.assign(document.createElement('option'), { value: k }));
  names(); onLang(() => { names(); drawPack(); if (last) stats(last); });
  const h = new URLSearchParams(location.hash.slice(1));
  if (presets[h.get('preset')]) Object.assign(state, presets[h.get('preset')], { preset: h.get('preset') });
  if (h.has('alpha')) state.alpha = Math.min(180, Math.max(90, +h.get('alpha') || GOLDEN));
  if (h.has('N')) state.N = Math.min(1500, Math.max(40, Math.round(+h.get('N')) || state.N));
  if (h.has('relief')) state.relief = Math.min(2, Math.max(0.2, +h.get('relief') || 1));
  if (COLS[h.get('col')]) state.col = h.get('col');
  if (h.has('petals')) state.petals = h.get('petals') !== '0';
  setup(); resetView(); syncControls(); drawPack();
  request();
  // the curve in a worker of its own, so that the form comes first
  if (SYNC) { curve = { a0: PK.a0, a1: PK.a1, steps: 600, q: packingCurve(PK.a0, PK.a1, 600) }; drawPack(); }
  const cw = new Worker(new URL('./view-worker.js', import.meta.url), { type: 'module' });
  cw.onmessage = ({ data }) => { curve = data.curve; drawPack(); cw.terminate(); };
  cw.postMessage({ curve: { a0: PK.a0, a1: PK.a1, steps: 1500 } });
  $('preset').addEventListener('change', e => { Object.assign(state, presets[e.target.value], { preset: e.target.value }); resetView(); changed(); });
  $('alpha').addEventListener('input', e => { state.alpha = +e.target.value; changed(); });
  $('golden').addEventListener('click', () => { state.alpha = GOLDEN; changed(); });
  $('N').addEventListener('input', e => { state.N = +e.target.value; changed(); });
  $('relief').addEventListener('input', e => { state.relief = +e.target.value; changed(); });
  $('petals').addEventListener('change', e => { state.petals = e.target.checked; changed(); });
  $('col').addEventListener('change', e => { state.col = e.target.value; writeHash(); paint(); });
  $('view').addEventListener('click', resetView);
  // the packing curve sets alpha
  const pick = e => {
    const svg = $('pack'), r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 320;
    const a = PK.a0 + (PK.a1 - PK.a0) * (x - PK.x0) / (PK.x1 - PK.x0);
    state.alpha = Math.round(Math.min(PK.a1, Math.max(PK.a0, a)) * 1000) / 1000; changed();
  };
  let drag = false;
  $('pack').addEventListener('pointerdown', e => { drag = true; $('pack').setPointerCapture(e.pointerId); pick(e); });
  $('pack').addEventListener('pointermove', e => { if (drag) pick(e); });
  $('pack').addEventListener('pointerup', () => { drag = false; });
  onTheme(paint);

  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'base', type: 'check', label: { en: 'stand (ovoid, barrel, sphere)', it: 'piedistallo (ovoide, botte, sfera)' }, value: false },
      { key: 'res', type: 'select', label: { en: 'grid', it: 'griglia' }, value: 'normal',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'normal', en: 'normal', it: 'normale' }, { value: 'fine', en: 'fine', it: 'fine' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...opts(), preset: state.preset, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, phyllotaxis after Vogel',
    object: 'phyllotaxis',
    share: () => shareUrl(SPEC, state),
    note: info => info.families ? ' · ' + t('parastichies ', 'parastiche ') + info.families + (info.petals ? ' · ' + info.petals + t(' petals', ' petali') : '') : '',
  });
  void bi;
}

init();
