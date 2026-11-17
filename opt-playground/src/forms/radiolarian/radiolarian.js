// Radiolarians: lattice spheres after Haeckel in three.js, their nets of
// cells mapped by the number of sides, and the download panel. The mesh of
// the view is the implicit solid of the print at a coarser grid, built by
// view-worker.js in two passes (coarse, then fine).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel } from '../../print/index.js';
import { presets, KEYS, defaults, fileName, icoFreq, viewMesh, stats } from './model.js';

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

const state = { ...defaults(), preset: 'hexacontium' };
const NUM = { cells: [12, 600, 0], relax: [0, 30, 0], bar: [0.1, 0.6, 2], shells: [1, 3, 0], len: [0, 1.5, 2], thorns: [0, 0.2, 2] };
const SPINES = [['none', 'none', 'nessuna'], ['six', 'six, octahedral', 'sei, ottaedriche'], ['ico', 'twelve, icosahedral', 'dodici, icosaedriche'],
  ['muller', 'twenty, Müller\'s law', 'venti, legge di Müller'], ['many', 'thirty-two, Fibonacci', 'trentadue, Fibonacci']];

/* ---------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, group, meshObj, dirty = true;
const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.02, vertexColors: true });
const HOME = [1.85, -2.5, 1.2];

function colours() {
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  mat.color.set(dark ? css('--accent') : css('--lilac'));
  mat.emissive.set(css('--gold')).multiplyScalar(dark ? 0.04 : 0.02);
  if (meshObj) paint(meshObj.geometry);
  dirty = true;
}

// the inner shells tinted towards gold, so that they read apart from the outer one
function paint(geo) {
  const P = geo.attributes.position.array, col = new Float32Array(P.length);
  const g = new THREE.Color(css('--gold')), w = new THREE.Color(1, 1, 1), c = new THREE.Color();
  for (let k = 0; k < P.length; k += 3) {
    const r = Math.hypot(P[k], P[k + 1], P[k + 2]), u = Math.max(0, Math.min(1, (0.9 - r) / 0.5));
    c.copy(w).lerp(g, 0.75 * u);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(...HOME);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-3, 3, -1); scene.add(rim);
  group = new THREE.Group(); scene.add(group);
  colours();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.86, 640));
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

function show3d(pos, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  paint(geo);
  if (meshObj) { meshObj.geometry.dispose(); group.remove(meshObj); }
  meshObj = new THREE.Mesh(geo, mat);
  group.add(meshObj);
  // the spines are scaled into the frame with the shell, which keeps its place
  group.scale.setScalar(0.8 / Math.max(1.04, 1 + 0.85 * (state.spines === 'none' ? 0 : state.len), 1 + state.thorns));
  dirty = true;
}

/* ---------------------------------------------------- the view worker ---- */

let worker = null, timer = 0;
const sync = new URLSearchParams(location.hash.slice(1)).get('sync') === '1';
function rebuild() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (worker) worker.terminate();
    worker = new Worker(new URL('./view-worker.js', import.meta.url), { type: 'module' });
    const o = Object.fromEntries(KEYS.map(k => [k, state[k]]));
    // cells of the grid: about two across a bar in the fine pass
    const n = o.lattice === 'ico' ? 10 * icoFreq(o.cells) ** 2 + 2 : o.cells, rb = o.bar * 1.1 / Math.sqrt(n);
    const ext = 2 * (1 + Math.max(o.len, o.thorns));
    const steps = [Math.max(ext / 100, rb / 0.75), Math.max(ext / 220, rb / 1.4)];
    // #sync=1 (for the thumbnails of the site, shot in a headless browser
    // whose clock does not wait for workers): the fine mesh on this thread
    if (sync) {
      worker.terminate(); worker = null;
      const { m, sk } = viewMesh(o, steps[1]), L = sk.Ls[0];
      show3d(m.pos, m.idx); lat = { seeds: L.seeds, verts: L.verts, cells: L.cells, stats: stats(L) }; drawNet();
      return;
    }
    $('busy').hidden = false;
    worker.onmessage = ({ data }) => {
      show3d(data.pos, data.idx);
      if (data.lattice) { lat = { ...data.lattice, stats: data.stats }; drawNet(); }
      if (data.last) { $('busy').hidden = true; worker.terminate(); worker = null; }
    };
    worker.postMessage({ o, steps });
  }, worker ? 140 : 0);
}

/* --------------------------------------------------- the map of cells ---- */

let lat = null;
// Lambert's azimuthal equal-area projection of each hemisphere: the north
// seen from above, the south from below
function drawNet() {
  if (!lat) return;
  const svg = $('net'); svg.replaceChildren();
  const R = 68, discs = [[76, 80, 1], [224, 80, -1]];
  for (const [cx, cy, s] of discs) {
    const P = p => { const z = s * p[2], k = Math.sqrt(2 / Math.max(1e-6, 1 + z)) * R / Math.SQRT2; return [cx + k * p[0], cy - s * k * p[1]]; };
    const clip = el('clipPath', { id: 'cl' + s }, svg);
    el('circle', { cx, cy, r: R + 0.5 }, clip);
    const g = el('g', { 'clip-path': `url(#cl${s})` }, svg);
    lat.cells.forEach((c, i) => {
      if (s * lat.seeds[i][2] < -0.25 || c.length < 3) return;
      const pts = c.map(v => P(lat.verts[v]));
      el('polygon', { class: 'cell c' + Math.min(8, Math.max(4, c.length)), points: pts.map(p => p.map(x => x.toFixed(1)).join(',')).join(' ') }, g);
    });
    el('circle', { class: 'rim', cx, cy, r: R }, svg);
    el('text', { class: 'lab', x: cx, y: cy + R + 16, 'text-anchor': 'middle' }, svg).textContent = s > 0 ? t('north', 'nord') : t('south', 'sud');
  }
  const st = lat.stats, by = st.by;
  $('nF').textContent = st.F;
  $('n5').textContent = by[5] || 0; $('n6').textContent = by[6] || 0; $('n7').textContent = by[7] || 0;
  const other = Object.entries(by).filter(([k]) => k < 5 || k > 7).reduce((a, [, m]) => a + m, 0);
  $('nOther').textContent = other;
  $('euler').textContent = `${st.V} − ${st.E} + ${st.F} = ${st.V - st.E + st.F}`;
  $('defect').textContent = Object.entries(by).sort((a, b) => a[0] - b[0]).map(([k, m]) => `${6 - k}·${m}`).join(' + ').replace(/\+ -/g, '− ') + ` = ${st.defect}`;
  const extra = (by[5] || 0) - 12;
  $('why').textContent = extra > 0
    ? t(`There are ${by[5]} pentagons, ${extra} more than 12: each extra pentagon is paid by a heptagon (or a larger cell), and the pairs of a pentagon and a heptagon are the dislocations of the net, where a row of hexagons ends.`,
      `Ci sono ${by[5]} pentagoni, ${extra} più di 12: ogni pentagono in più è pagato da un ettagono (o da una cella più grande), e le coppie di un pentagono e un ettagono sono le dislocazioni della rete, dove una fila di esagoni finisce.`)
    : (by[5] || 0) === 12 && !by[7]
      ? t('Exactly 12 pentagons and no heptagon: the fewest that any net of three-edged nodes on a sphere can have.',
        'Esattamente 12 pentagoni e nessun ettagono: il minimo che una rete di nodi a tre spigoli sulla sfera possa avere.')
      : t('Cells with four sides count twice in the sum: a quadrilateral stands for two pentagons.',
        'Le celle a quattro lati contano doppio nella somma: un quadrilatero vale due pentagoni.');
}

/* ------------------------------------------------------ the controls ---- */

function show() {
  for (const k of Object.keys(NUM)) { $(k).value = state[k]; $(k + 'out').textContent = (+state[k]).toFixed(NUM[k][2]); }
  $('lattice').value = state.lattice; $('spines').value = state.spines;
  $('relax').disabled = state.lattice === 'ico';
  $('len').disabled = state.spines === 'none';
  if (state.lattice === 'ico') $('cellsout').textContent = 10 * icoFreq(state.cells) ** 2 + 2;
  $('preset').value = state.preset || '';
  const h = {};
  if (state.preset) h.preset = state.preset; else for (const k of KEYS) h[k] = state[k];
  history.replaceState(null, '', '#' + new URLSearchParams(h));
}

function set(o) { Object.assign(state, o); show(); rebuild(); }

function fillSelects() {
  const sel = $('preset'), v = state.preset;
  sel.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = t('(your own)', '(a mano)'); sel.appendChild(none);
  for (const [k, p] of Object.entries(presets)) { const o = document.createElement('option'); o.value = k; o.textContent = t(p.en, p.it); sel.appendChild(o); }
  sel.value = v || '';
  const sp = $('spines'); sp.replaceChildren();
  for (const [k, en, it] of SPINES) { const o = document.createElement('option'); o.value = k; o.textContent = t(en, it); sp.appendChild(o); }
  sp.value = state.spines;
  $('lattice').options[0].textContent = t('Fibonacci sphere', 'sfera di Fibonacci');
  $('lattice').options[1].textContent = t('icosahedral', 'icosaedrica');
}

function choose(name) {
  const p = presets[name]; if (!p) return;
  set({ ...Object.fromEntries(KEYS.map(k => [k, p[k]])), preset: name });
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('preset') && presets[h.get('preset')]) { const p = presets[h.get('preset')]; Object.assign(state, Object.fromEntries(KEYS.map(k => [k, p[k]])), { preset: h.get('preset') }); return; }
  if (!h.has('cells')) return;
  for (const [k, [lo, hi]] of Object.entries(NUM)) { const x = parseFloat(h.get(k)); if (isFinite(x)) state[k] = Math.min(hi, Math.max(lo, x)); }
  if (['fib', 'ico'].includes(h.get('lattice'))) state.lattice = h.get('lattice');
  if (SPINES.some(s => s[0] === h.get('spines'))) state.spines = h.get('spines');
  state.preset = '';
}

function init() {
  readHash();
  fillSelects();
  setup();
  $('preset').addEventListener('change', e => choose(e.target.value));
  for (const k of Object.keys(NUM)) $(k).addEventListener('input', e => set({ [k]: +e.target.value, preset: '' }));
  $('lattice').addEventListener('change', e => set({ lattice: e.target.value, preset: '' }));
  $('spines').addEventListener('change', e => set({ spines: e.target.value, len: e.target.value !== 'none' && !state.len ? 0.5 : state.len, preset: '' }));
  $('view').addEventListener('click', () => { controls.reset(); camera.position.set(...HOME); controls.target.set(0, 0, 0); dirty = true; });
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'base', type: 'check', label: { en: 'stand', it: 'piedistallo' }, value: true },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...Object.fromEntries(KEYS.map(k => [k, state[k]])), ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, radiolarian after Haeckel (1904)',
    object: 'radiolarian',
    note: info => (info.bar ? t(`, bars ${info.bar} mm thick`, `, barre spesse ${info.bar} mm`) : ''),
  });
  onLang(() => { fillSelects(); drawNet(); });
  onTheme(colours);
  still.addEventListener('change', () => { controls.enableDamping = !still.matches; if (still.matches) $('spin').checked = false; });
  show(); rebuild();
}

init();
