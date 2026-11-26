// The honeycomb scene: a patch of the plane drawn as the comb, as circles
// relaxing into hexagons, or as the Voronoi diagram of the lattice of seeds;
// a single cell in three dimensions with its rhombic base and the Maraldi
// angle; the comparison of the regular tilings by wall per unit area; and the
// download panel. The geometry is in model.js. No painter's name appears.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel } from '../../print/index.js';
import {
  KEYS, defaults, presets, fileName,
  centers, voronoi, relaxed, wallPerArea, cellSolid,
} from './model.js';

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

const state = { ...defaults(), preset: 'comb' };
const NUM = { cells: [7, 169, 0], relax: [0, 1, 2] };
const SHAPES = [['hex', 'hexagons', 'esagoni'], ['square', 'squares', 'quadrati'], ['tri', 'triangles', 'triangoli']];
const SHOWS = [['comb', 'the comb', 'il favo'], ['relax', 'circles into hexagons', 'cerchi in esagoni'], ['voronoi', 'Voronoi of the seeds', 'Voronoi dei semi']];
const CELLS3D = [['bee', "the bee's base", 'il fondo dell’ape'], ['toth', 'Fejes Tóth’s base', 'il fondo di Fejes Tóth'], ['tothflat', 'the flat back', 'il fondo piatto']];

/* ------------------------------------------------------- the 2D comb ---- */

// draws the chosen plane figure into the SVG, fitted to the view box. Only the
// interior cells (centers().draw) are drawn: the guard ring bounds them, so no
// unbounded Voronoi cell leaks out as a sliver.
function drawComb() {
  const svg = $('comb'); svg.replaceChildren();
  const { pts, draw, pitch } = centers(state.shape, Math.round(state.cells));
  const vcells = voronoi(pts, pitch);
  const cells = draw.map(i => ({ poly: vcells[i], c: pts[i] })).filter(o => o.poly.length >= 3);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const { poly } of cells) for (const [x, y] of poly) {
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  const W = 320, M = 10, span = Math.max(xmax - xmin, ymax - ymin) || 1;
  const s = (W - 2 * M) / span, ox = M - xmin * s, oy = M - ymin * s;
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  const P = ([x, y]) => [ox + x * s, W - (oy + y * s)];   // flip y for screen
  const toStr = poly => poly.map(p => P(p).map(v => v.toFixed(1)).join(',')).join(' ');

  for (const { poly, c } of cells) {
    if (state.show === 'voronoi') {
      el('polygon', { class: 'vor', points: toStr(poly) }, svg);
      const [cx, cy] = P(c); el('circle', { class: 'seed', cx, cy, r: 1.8 }, svg);
    } else if (state.show === 'relax') {
      const r = relaxed(poly, c, state.relax);
      el('polygon', { class: state.relax >= 1 ? 'comb' : 'drop', points: toStr(r) }, svg);
    } else {
      el('polygon', { class: 'comb', points: toStr(poly) }, svg);
    }
  }
}

/* ------------------------------------------------------- the 3D cell ---- */

let renderer, scene, camera, controls, group, dirty = true;
const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.02, side: THREE.DoubleSide, flatShading: true });
const HOME = [2.2, -2.6, 1.7];

function colours() {
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  mat.color.set(dark ? css('--accent') : css('--lilac'));
  mat.emissive.set(css('--gold')).multiplyScalar(dark ? 0.05 : 0.02);
  dirty = true;
}

function setup3d() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  camera.up.set(0, 0, 1); camera.position.set(...HOME);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 0.8;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 3, -1); scene.add(rim);
  group = new THREE.Group(); scene.add(group);
  colours();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w, 320));
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

function showCell() {
  const { pos, idx, meta } = cellSolid(state);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose?.(); group.remove(c); }
  group.add(new THREE.Mesh(geo, mat));
  group.position.set(0, 0, -0.4);
  dirty = true;
}

/* --------------------------------------------------- the comparison ---- */

function fillStats() {
  const w = wallPerArea();
  const fmt = x => x.toFixed(3);
  $('wHex').textContent = fmt(w.hex);
  $('wSquare').textContent = fmt(w.square);
  $('wTri').textContent = fmt(w.tri);
  $('wCircle').textContent = fmt(w.circle);
  // how much more wall than the hexagon (%), the circle as the unreachable bound
  $('eSquare').textContent = '+' + Math.round(100 * (w.square / w.hex - 1)) + '%';
  $('eTri').textContent = '+' + Math.round(100 * (w.tri / w.hex - 1)) + '%';
}

/* ------------------------------------------------------- the controls ---- */

function fill(sel, rows, v) {
  const s = $(sel); s.replaceChildren();
  for (const [k, en, it] of rows) { const o = document.createElement('option'); o.value = k; o.textContent = t(en, it); s.appendChild(o); }
  s.value = v;
}

function show() {
  for (const k of Object.keys(NUM)) { $(k).value = state[k]; $(k + 'out').textContent = (+state[k]).toFixed(NUM[k][2]); }
  $('shape').value = state.shape; $('showsel').value = state.show; $('cell3d').value = state.cell3d;
  $('relax').disabled = state.show !== 'relax';
  $('preset').value = state.preset || '';
  const h = {};
  if (state.preset) h.preset = state.preset; else for (const k of KEYS) h[k] = state[k];
  history.replaceState(null, '', '#' + new URLSearchParams(h));
}

function render() { drawComb(); showCell(); }

function set(o) { Object.assign(state, o); show(); render(); }

function fillSelects() {
  const sel = $('preset'), v = state.preset;
  sel.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = t('(your own)', '(a mano)'); sel.appendChild(none);
  for (const [k, p] of Object.entries(presets)) { const o = document.createElement('option'); o.value = k; o.textContent = t(p.en, p.it); sel.appendChild(o); }
  sel.value = v || '';
  fill('shape', SHAPES, state.shape);
  fill('showsel', SHOWS, state.show);
  fill('cell3d', CELLS3D, state.cell3d);
}

function choose(name) {
  const p = presets[name]; if (!p) return;
  set({ ...Object.fromEntries(KEYS.map(k => [k, p[k]])), preset: name });
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('preset') && presets[h.get('preset')]) {
    const p = presets[h.get('preset')];
    Object.assign(state, Object.fromEntries(KEYS.map(k => [k, p[k]])), { preset: h.get('preset') });
    return;
  }
  if (!h.has('shape') && !h.has('cells')) return;
  if (SHAPES.some(s => s[0] === h.get('shape'))) state.shape = h.get('shape');
  if (SHOWS.some(s => s[0] === h.get('show'))) state.show = h.get('show');
  if (CELLS3D.some(s => s[0] === h.get('cell3d'))) state.cell3d = h.get('cell3d');
  for (const [k, [lo, hi]] of Object.entries(NUM)) { const x = parseFloat(h.get(k)); if (isFinite(x)) state[k] = Math.min(hi, Math.max(lo, x)); }
  state.preset = '';
}

function init() {
  readHash();
  fillSelects();
  fillStats();
  setup3d();
  $('preset').addEventListener('change', e => choose(e.target.value));
  for (const k of Object.keys(NUM)) $(k).addEventListener('input', e => set({ [k]: +e.target.value, preset: '' }));
  $('shape').addEventListener('change', e => set({ shape: e.target.value, preset: '' }));
  $('showsel').addEventListener('change', e => set({ show: e.target.value, preset: '' }));
  $('cell3d').addEventListener('change', e => set({ cell3d: e.target.value, preset: '' }));
  $('view').addEventListener('click', () => { controls.reset(); camera.position.set(...HOME); controls.target.set(0, 0, 0); dirty = true; });
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'what', type: 'select', label: { en: 'object', it: 'oggetto' }, value: 'comb',
        options: [{ value: 'comb', en: 'comb panel', it: 'pannello di favo' }, { value: 'cell', en: 'single cell', it: 'cella singola' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...Object.fromEntries(KEYS.map(k => [k, state[k]])), show: o.what === 'cell' ? 'cell' : 'comb', ...o }] },
    name: o => fileName({ ...state, show: o.what === 'cell' ? 'cell' : 'comb' }),
    head: 'binary STL, millimetres, honeycomb',
    object: 'honeycomb',
  });
  onLang(() => { fillSelects(); render(); });
  onTheme(colours);
  still.addEventListener('change', () => { controls.enableDamping = !still.matches; if (still.matches) $('spin').checked = false; });
  show(); render();
}

init();
