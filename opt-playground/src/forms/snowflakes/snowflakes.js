// Snowflakes: Reiter's cellular model grown in a worker and drawn frame by
// frame on its hexagonal grid, the plate of the print in three.js, the
// history of the air along the radius, and the download panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, shareUrl } from '../../print/index.js';
import { presets, history, fileName, simulate, plate } from './model.js';

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
  weather: ['from a seed, with weather', 'da un seme, con il tempo'],
  dendrite: ['stellar dendrite', 'dendrite stellare'],
  fern: ['fernlike dendrite', 'dendrite a felce'],
  sectored: ['sectored arms', 'bracci a settori'],
  stellar: ['stellar plate', 'piastra stellare'],
  plate: ['plate', 'piastra'],
};
const R = 72;
const state = { preset: 'weather', ...presets.weather };
const view = { thick: 2, relief: 0.8, ring: true };
// every parameter of the scene, for the link that a request of a print sends
const SPEC = {
  preset: { def: 'weather', values: Object.keys(presets) }, seed: { def: 123, min: 1, max: 999999, int: true },
  alpha: { def: 1.2, min: 0.3, max: 3 }, beta: { def: 0.45, min: 0.3, max: 0.95 }, gamma: { def: 0.002, min: 0, max: 0.06 },
  weather: { def: true },
};

/* ------------------------------------------------------ the 2D grid ---- */

const cv = $('grow'), g2 = cv.getContext('2d');
let lut = null, frame = null;
// the cell under every pixel of the canvas (or -1 outside the hexagon)
function table() {
  const S = cv.width, W = 2 * R + 1, sc = S / (2 * R + 3);
  lut = new Int32Array(S * S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    // the arms along the vertical, as in the print: x and y swapped
    const x = (S / 2 - py) / sc, y = -(px - S / 2) / sc;
    const r = y / (Math.sqrt(3) / 2), q = x - r / 2;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(-q - r), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    lut[py * S + px] = Math.max(Math.abs(rq), Math.abs(rr), Math.abs(rq + rr)) > R ? -1 : (rr + R) * W + rq + R;
  }
}
function rgb(c) { const k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255]; }
function draw() {
  if (!frame) return;
  if (!lut) table();
  const S = cv.width, img = g2.createImageData(S, S), D = img.data;
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  const ground = rgb(css('--ground')), panel = rgb(css('--panel'));
  const ice0 = rgb(css('--accent')), ice1 = rgb(dark ? '#ffffff' : css('--lilac'));
  const vap = rgb(dark ? '#8a83a3' : '#9e93b3');
  const { s, age, steps } = frame, beta = Math.max(0.3, state.beta);
  for (let p = 0; p < S * S; p++) {
    const i = lut[p], k = 4 * p;
    let c;
    if (i < 0) c = ground;
    else if (age[i] >= 0) {
      const a = Math.pow(1 - age[i] / Math.max(1, steps), 1.5);
      c = [ice0[0] + a * (ice1[0] - ice0[0]), ice0[1] + a * (ice1[1] - ice0[1]), ice0[2] + a * (ice1[2] - ice0[2])];
    } else {
      const v = Math.min(1, s[i] / (beta * 1.15)) * 0.55;
      c = [panel[0] + v * (vap[0] - panel[0]), panel[1] + v * (vap[1] - panel[1]), panel[2] + v * (vap[2] - panel[2])];
    }
    D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255;
  }
  g2.putImageData(img, 0, 0);
  $('steps').textContent = frame.steps;
  $('frozen').textContent = frame.frozen;
  $('radius').textContent = frame.radius.toFixed(0);
  drawHist();
}

// beta and gamma along the radius, the band reached marked
function drawHist() {
  const svg = $('hist'); svg.replaceChildren();
  const H = history(state), n = H.length, x0 = 36, x1 = 266, y0 = 8, y1 = 86;
  const X = f => x0 + (x1 - x0) * f, Yb = b => y1 - (y1 - y0) * (b - 0.3) / 0.65, Yg = gm => y1 - (y1 - y0) * Math.min(1, Math.max(0, (Math.log10(Math.max(1e-5, gm)) + 5) / 3.8));
  el('rect', { class: 'frame', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, svg);
  let db = '', dg = '';
  H.forEach(([b, gm], k) => {
    db += `${k ? 'L' : 'M'}${X(k / n)},${Yb(b)}L${X((k + 1) / n)},${Yb(b)}`;
    dg += `${k ? 'L' : 'M'}${X(k / n)},${Yg(gm)}L${X((k + 1) / n)},${Yg(gm)}`;
  });
  el('path', { class: 'b', d: db }, svg); el('path', { class: 'g', d: dg }, svg);
  if (frame) { const f = Math.min(1, frame.radius / (0.9 * R)); el('line', { class: 'now', x1: X(f), x2: X(f), y1: y0, y2: y1 }, svg); }
  el('text', { class: 'bl', x: 2, y: y0 + 8 }, svg).textContent = 'β .95';
  el('text', { class: 'bl', x: 2, y: y1 }, svg).textContent = 'β .3';
  el('text', { class: 'gl', x: x1 + 4, y: y0 + 8 }, svg).textContent = 'γ .06';
  el('text', { class: 'gl', x: x1 + 4, y: y1 }, svg).textContent = 'γ .00001';
  el('text', { x: x0, y: 104 }, svg).textContent = t('centre', 'centro');
  el('text', { x: x1, y: 104, 'text-anchor': 'end' }, svg).textContent = t('tips of the arms', 'punte dei bracci');
}

/* ---------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, meshObj, dirty = true;
const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
function colours() {
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  mat.color.set(dark ? css('--accent') : css('--accent-2'));
  mat.emissive.set(css('--accent')).multiplyScalar(dark ? 0.08 : 0.04);
  dirty = true;
}
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 1.0;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-40, 60, 90); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(60, -50, 20); scene.add(rim);
  colours();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(THUMB ? Math.min(w * 0.7, 620) : Math.min(w, 620));
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
  camera.position.set(0, -115, 175);
  controls.target.set(0, 4, 0);
  if (THUMB) { camera.position.set(0, -64, 134); controls.target.set(0, 3, 0); }
  controls.update(); dirty = true;
}
function show(d) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
  geo.computeVertexNormals(); geo.computeBoundingBox();
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, 0);
  if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
  meshObj = new THREE.Mesh(geo, mat); scene.add(meshObj); dirty = true;
}

/* ------------------------------------------------------------ worker ---- */

// #sync=1 grows on the main thread, for headless screenshots that do not
// wait for workers
const SYNC = new URLSearchParams(location.hash.slice(1)).get('sync') === '1';
// #thumb=1 leaves only the plate, for the thumbnail of the card
const THUMB = new URLSearchParams(location.hash.slice(1)).get('thumb') === '1';
if (THUMB) document.body.classList.add('thumb');
let worker = null;
function grow() {
  if (worker) worker.terminate();
  frame = null;
  if (SYNC) {
    const sim = simulate({ ...state, R });
    frame = { ...sim, band: sim.hist.length - 1 }; draw();
    show(plate(sim, { ...view, size: 80, h: 0.4 }));
    return;
  }
  worker = new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.frame) { frame = data; draw(); }
    if (data.mesh) show(data);
  };
  worker.postMessage({ o: { ...state, R }, view });
}

/* ---------------------------------------------------------- controls ---- */

function writeHash() {
  const h = new URLSearchParams({ preset: state.preset, seed: state.seed, alpha: state.alpha, beta: state.beta, gamma: state.gamma, weather: state.weather ? 1 : 0 });
  history_.replaceState(null, '', '#' + h);
}
const history_ = window.history;
function syncControls() {
  $('preset').value = state.preset; $('seed').value = state.seed;
  for (const k of ['alpha', 'beta']) { $(k).value = state[k]; $(k + 'out').textContent = state[k]; }
  $('gamma').value = Math.log10(Math.max(1e-5, state.gamma)); $('gammaout').textContent = +state.gamma.toPrecision(2);
  $('weather').checked = state.weather;
  $('seed').disabled = !state.weather;
}
function names() { $('preset').querySelectorAll('option').forEach(o => { const n = NAMES[o.value]; o.textContent = t(n[0], n[1]); }); }
let timer = 0;
function changed() { syncControls(); writeHash(); drawHist(); clearTimeout(timer); timer = setTimeout(grow, 150); }

function init() {
  for (const k of Object.keys(presets)) $('preset').appendChild(Object.assign(document.createElement('option'), { value: k }));
  names(); onLang(() => { names(); drawHist(); });
  const h = new URLSearchParams(location.hash.slice(1));
  if (presets[h.get('preset')]) Object.assign(state, presets[h.get('preset')], { preset: h.get('preset') });
  for (const [k, lo, hi] of [['alpha', 0.3, 3], ['beta', 0.3, 0.95], ['gamma', 0, 0.06]]) if (h.has(k) && isFinite(+h.get(k))) state[k] = Math.min(hi, Math.max(lo, +h.get(k)));
  if (h.has('seed')) state.seed = Math.max(1, Math.round(+h.get('seed')) || 1);
  if (h.has('weather')) state.weather = h.get('weather') !== '0';
  setup(); resetView(); syncControls(); drawHist(); grow();
  $('preset').addEventListener('change', e => { Object.assign(state, presets[e.target.value], { preset: e.target.value }); changed(); });
  for (const k of ['alpha', 'beta']) $(k).addEventListener('input', e => { state[k] = +e.target.value; changed(); });
  // gamma on a logarithmic slider, from 0.00001 to 0.06
  $('gamma').addEventListener('input', e => { state.gamma = +Math.pow(10, +e.target.value).toPrecision(2); changed(); });
  $('seed').addEventListener('change', e => { state.seed = Math.max(1, Math.round(+e.target.value) || 1); changed(); });
  $('weather').addEventListener('change', e => { state.weather = e.target.checked; changed(); });
  $('newflake').addEventListener('click', () => {
    if (!state.weather) Object.assign(state, presets.weather, { preset: 'weather' });
    state.seed = 1 + Math.floor(Math.random() * 999999); changed();
  });
  $('regrow').addEventListener('click', grow);
  $('view').addEventListener('click', resetView);
  onTheme(() => { colours(); draw(); });

  printPanel($('print'), {
    size: { value: 80, min: 40, max: 200, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'thick', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2, min: 1.2, max: 4, step: 0.1 },
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 0.8, min: 0, max: 1.5, step: 0.1 },
      { key: 'ring', type: 'check', label: { en: 'ring to hang', it: 'anello per appendere' }, value: true },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, R, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a snowflake after Reiter (2005)',
    object: 'snowflake',
    share: () => shareUrl(SPEC, state),
  });
}

init();
