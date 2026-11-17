// Coral and Turing: the page. A worker (sim.js) grows the coral or the
// pattern and posts snapshots; the view draws the coral as spheres and
// branches, the vase as the very mesh that is printed; the side shows the
// mass-radius plot of the coral, or Pearson's map of (F, k) and the unrolled
// wall of the vase. The state lives in the address after #.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel } from '../../print/index.js';
import { DLA, GrayScott, massRadius, loads, branchR, vaseMesh, relief, GS_PRESETS, DLA_DEFAULT, GS_DEFAULT, fileName } from './model.js';

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

const state = { mode: 'coral', ...DLA_DEFAULT, ...GS_DEFAULT, seed: 7 };
let last = null, lastMR = null, running = false;

/* ---------------------------------------------------------- colours ---- */

// a violet scale from the deep accent of the site to a pale lilac, the same
// in both themes (it reads on the light and on the dark ground)
const C0 = new THREE.Color('#4a1f78'), C1 = new THREE.Color('#7338a8'), C2 = new THREE.Color('#e4d2f4');
const ramp = (x, out) => (x < 0.5 ? out.copy(C0).lerp(C1, 2 * x) : out.copy(C1).lerp(C2, 2 * x - 1));

/* --------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, group, dirty = true;
let spheres = null, sticks = null, cap = 0, vase = null, ground = null;
const matI = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
const matV = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, vertexColors: true });
const matG = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, transparent: true, opacity: 0.55 });

function theme() { matG.color.set(css('--lilac')); dirty = true; }

const HOME = { coral: [1.25, -1.45, 0.8], turing: [1.6, -1.9, 1.05] };
function home() {
  camera.position.set(...HOME[state.mode]);
  controls.target.set(0, 0, state.mode === 'coral' ? -0.06 : 0);
  controls.update(); dirty = true;
}

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 1.2;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(3, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-3, 3, -1); scene.add(rim);
  group = new THREE.Group(); scene.add(group);
  ground = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96), matG);
  ground.rotation.x = Math.PI / 2; scene.add(ground);
  theme();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.82, 620));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  controls.addEventListener('change', () => { dirty = true; });
  $('spin').checked = !still.matches;
  home();
  const loop = () => {
    controls.autoRotate = $('spin').checked;
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  loop();
}

function clearGroup() {
  for (const o of [spheres, sticks, vase]) if (o) { group.remove(o); o.geometry.dispose(); }
  spheres = sticks = vase = null; cap = 0;
}

// the coral: a sphere on every particle and a cylinder to its parent, the
// whole scaled into a box of side 1 standing on z = -0.5
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function drawCoral({ P, parent, n }) {
  if (n > cap) {
    clearGroup();
    cap = Math.max(2048, 2 * n);
    spheres = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), matI, cap);
    sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), matI, cap);
    group.add(spheres, sticks);
  }
  const L = loads({ parent, n });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = 1;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, P[3 * i]); x1 = Math.max(x1, P[3 * i]); y0 = Math.min(y0, P[3 * i + 1]); y1 = Math.max(y1, P[3 * i + 1]);
    z1 = Math.max(z1, P[3 * i + 2]);
  }
  const ext = Math.max(x1 - x0 + 2, y1 - y0 + 2, z1 + 1, 8), k = 1 / ext;
  group.scale.setScalar(k);
  group.position.set(-(x0 + x1) / 2 * k, -(y0 + y1) / 2 * k, -0.5 * (z1 + 1) * k);
  const R = i => branchR(L[i]);
  for (let i = 0; i < n; i++) {
    const r = R(i);
    _p.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
    _m.compose(_p, _q.identity(), _s.set(r, r, r));
    spheres.setMatrixAt(i, _m);
    // the colour by age, the oldest darkest
    ramp(0.15 + 0.85 * Math.pow(i / Math.max(1, n - 1), 1.6), _c);
    spheres.setColorAt(i, _c); sticks.setColorAt(i, _c);
    const q = parent[i];
    if (q < 0) { _m.makeScale(0, 0, 0); sticks.setMatrixAt(i, _m); continue; }
    _d.set(P[3 * q] - _p.x, P[3 * q + 1] - _p.y, P[3 * q + 2] - _p.z);
    const len = _d.length(), rr = Math.min(r, R(q));
    _q.setFromUnitVectors(_up, _d.normalize());
    _p.set((P[3 * i] + P[3 * q]) / 2, (P[3 * i + 1] + P[3 * q + 1]) / 2, (P[3 * i + 2] + P[3 * q + 2]) / 2);
    _m.compose(_p, _q, _s.set(rr, len, rr));
    sticks.setMatrixAt(i, _m);
  }
  spheres.count = sticks.count = n;
  spheres.instanceMatrix.needsUpdate = sticks.instanceMatrix.needsUpdate = true;
  spheres.instanceColor.needsUpdate = sticks.instanceColor.needsUpdate = true;
  spheres.computeBoundingSphere(); sticks.computeBoundingSphere();
  // the base disc under the root, as the print has it
  const bR = Math.min((Math.max(x1 - x0, y1 - y0) + 2) / 2 * 0.5 + 3, (Math.max(x1 - x0, y1 - y0) + 2) / 2);
  ground.visible = true;
  ground.scale.set(bR * k, 0.025, bR * k);
  ground.position.set(0, 0, -0.5 * (z1 + 1) * k - 0.0125);
  dirty = true;
}

// the vase: the mesh of the print at the resolution of the simulation
function drawVase(data) {
  const m = vaseMesh(data, { up: 1 });
  if (!vase || vase.geometry.attributes.position.count !== m.pos.length / 3) {
    clearGroup();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.pos.length), 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    vase = new THREE.Mesh(g, matV); group.add(vase);
    const k = 1 / 135;
    group.scale.setScalar(k); group.position.set(0, 0, -76 * k);
  } else vase.geometry.attributes.position.array.set(m.pos);
  const col = vase.geometry.attributes.color.array;
  for (let i = 0; i < m.val.length; i++) { ramp(0.3 + 0.7 * m.val[i], _c); col[3 * i] = _c.r; col[3 * i + 1] = _c.g; col[3 * i + 2] = _c.b; }
  // the inner face and the floor a little lighter than the low wall
  vase.geometry.attributes.position.needsUpdate = true; vase.geometry.attributes.color.needsUpdate = true;
  vase.geometry.computeVertexNormals(); vase.geometry.computeBoundingSphere();
  ground.visible = false;
  dirty = true;
}

/* ------------------------------------------------------- side figures -- */

function drawMR(mr) {
  const svg = $('mr'); svg.replaceChildren();
  const X0 = 40, X1 = 290, Y0 = 12, Y1 = 180;
  const rmax = Math.max(10, mr.rmax), nmax = Math.max(100, mr.pts.at(-1)[1]);
  const lx = r => X0 + (X1 - X0) * Math.log(r) / Math.log(rmax), ly = N => Y1 - (Y1 - Y0) * Math.log(N) / Math.log(nmax);
  for (const r of [1, 3, 10, 30, 100]) if (r <= rmax) {
    el('line', { class: 'grid', x1: lx(r), x2: lx(r), y1: Y0, y2: Y1 }, svg);
    el('text', { class: 'tick mid', x: lx(r), y: Y1 + 13 }, svg).textContent = r;
  }
  for (const N of [1, 10, 100, 1000, 10000]) if (N <= nmax) {
    el('line', { class: 'grid', x1: X0, x2: X1, y1: ly(N), y2: ly(N) }, svg);
    el('text', { class: 'tick end', x: X0 - 4, y: ly(N) + 3 }, svg).textContent = N;
  }
  el('text', { class: 'tick mid', x: (X0 + X1) / 2, y: 206 }, svg).textContent = t('distance r from the seed', 'distanza r dal seme');
  el('text', { class: 'tick', x: X0 + 4, y: Y0 + 10 }, svg).textContent = 'N(r)';
  // slopes 2 and 3 through the point at r = 3
  const p3 = mr.pts.find(p => p[0] >= 3) || mr.pts[0];
  for (const s of [2, 3]) {
    const r2 = Math.min(rmax, p3[0] * Math.pow(nmax / p3[1], 1 / s));
    el('line', { class: 'mrref', x1: lx(p3[0]), y1: ly(p3[1]), x2: lx(r2), y2: ly(p3[1] * Math.pow(r2 / p3[0], s)) }, svg);
  }
  for (const [r, N] of mr.pts) if (N > 0) el('circle', { class: 'mrdot', cx: lx(r), cy: ly(N), r: 2.6 }, svg);
  if (isFinite(mr.D)) {
    const fit = mr.pts.filter(([r]) => r >= 3 && r <= 0.6 * mr.rmax), a = fit[0], b = fit.at(-1);
    const lnA = Math.log(a[1]) - mr.D * Math.log(a[0]), N = r => Math.exp(lnA + mr.D * Math.log(r));
    el('line', { class: 'mrfit', x1: lx(a[0] / 1.5), y1: ly(N(a[0] / 1.5)), x2: lx(b[0] * 1.5), y2: ly(N(b[0] * 1.5)) }, svg);
  }
  el('rect', { class: 'axis', x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0 }, svg);
}

const FK = { x0: 38, x1: 282, y0: 12, y1: 186, k0: 0.045, k1: 0.07, F0: 0, F1: 0.08 };
const fkX = k => FK.x0 + (FK.x1 - FK.x0) * (k - FK.k0) / (FK.k1 - FK.k0);
const fkY = F => FK.y1 - (FK.y1 - FK.y0) * (F - FK.F0) / (FK.F1 - FK.F0);
function drawFK() {
  const svg = $('fk'); svg.replaceChildren();
  // the region with a second uniform state, k < sqrt(F)/2 - F, clipped to the box
  const cut = F => Math.min(FK.k1, Math.max(FK.k0, Math.sqrt(F) / 2 - F));
  let d = `M${fkX(FK.k0)},${fkY(FK.F0)}`, c = '';
  for (let i = 0; i <= 120; i++) {
    const F = FK.F0 + (FK.F1 - FK.F0) * i / 120, x = fkX(cut(F)), y = fkY(F);
    d += `L${x.toFixed(1)},${y.toFixed(1)}`; c += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  d += `L${fkX(FK.k0)},${fkY(FK.F1)}Z`;
  el('path', { class: 'sn', d }, svg); el('path', { class: 'snline', d: c }, svg);
  for (const k of [0.05, 0.055, 0.06, 0.065, 0.07]) {
    el('line', { class: 'grid', x1: fkX(k), x2: fkX(k), y1: FK.y0, y2: FK.y1 }, svg);
    el('text', { class: 'tick mid', x: fkX(k), y: FK.y1 + 13 }, svg).textContent = k.toFixed(3);
  }
  for (const F of [0, 0.02, 0.04, 0.06, 0.08]) {
    el('line', { class: 'grid', x1: FK.x0, x2: FK.x1, y1: fkY(F), y2: fkY(F) }, svg);
    el('text', { class: 'tick end', x: FK.x0 - 4, y: fkY(F) + 3 }, svg).textContent = F.toFixed(2);
  }
  el('text', { class: 'tick mid', x: (FK.x0 + FK.x1) / 2, y: 214 }, svg).textContent = 'k';
  el('text', { class: 'tick', x: FK.x0 + 4, y: FK.y0 + 10 }, svg).textContent = 'F';
  el('rect', { class: 'axis', x: FK.x0, y: FK.y0, width: FK.x1 - FK.x0, height: FK.y1 - FK.y0 }, svg);
  for (const [id, p] of Object.entries(GS_PRESETS)) {
    const dot = el('circle', { class: 'pdot', cx: fkX(p.k), cy: fkY(p.F), r: 4.5 }, svg);
    dot.addEventListener('click', e => { e.stopPropagation(); choose(id); });
    const left = id === 'labyrinth' || id === 'holes';
    el('text', { class: 'plab', x: fkX(p.k) + (left ? -8 : 8), y: fkY(p.F) + (id === 'holes' ? -5 : id === 'labyrinth' ? -7 : 3.5), 'text-anchor': left ? 'end' : 'start' }, svg).textContent = t(p.en, p.it);
  }
  el('circle', { class: 'here', cx: fkX(state.k), cy: fkY(state.F), r: 8 }, svg);
}

function drawUnroll(data) {
  const cv = $('unroll'), { NT, NS } = data, h = relief(data);
  if (cv.width !== NT || cv.height !== NS) { cv.width = NT; cv.height = NS; }
  const g = cv.getContext('2d'), img = g.createImageData(NT, NS);
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    ramp(0.15 + 0.85 * h[i * NT + j], _c);
    const o = 4 * ((NS - 1 - i) * NT + j);
    img.data[o] = 255 * _c.r; img.data[o + 1] = 255 * _c.g; img.data[o + 2] = 255 * _c.b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------ the run -- */

// with #now in the address the whole growth is done at once on the page, for
// the thumbnails of the site (headless shots do not wait for workers)
function now() {
  if (state.mode === 'coral') {
    const d = new DLA(state); d.grow(state.n); last = d.data();
    drawCoral(last); drawMR(lastMR = massRadius(last));
    $('sN').textContent = last.n; $('sD').textContent = lastMR.D.toFixed(2); $('sW').textContent = d.walks; $('count').textContent = last.n;
  } else {
    const g = new GrayScott(state); g.step(state.steps); last = g.data();
    drawVase(last); drawUnroll(last); $('count').textContent = last.t;
  }
}

let worker = null;
const send = m => { if (!worker) start(false); worker.postMessage(m); };
function start(play = true) {
  if (worker) worker.terminate();
  worker = new Worker(new URL('./sim.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    if (m.mode !== state.mode) return;
    last = m.data;
    if (m.mode === 'coral') {
      drawCoral(m.data); drawMR(lastMR = m.extra.mr);
      $('sN').textContent = m.data.n; $('sD').textContent = isFinite(m.extra.mr.D) ? m.extra.mr.D.toFixed(2) : '–';
      $('sW').textContent = m.extra.walks; $('count').textContent = m.data.n;
    } else {
      drawVase(m.data); drawUnroll(m.data); $('count').textContent = m.data.t;
    }
    if (m.done) setRunning(false);
  };
  const o = state.mode === 'coral'
    ? { stick: state.stick, drift: state.drift, up: state.up, seed: state.seed }
    : { F: state.F, k: state.k, seed: state.seed };
  clearGroup();
  worker.postMessage({ cmd: 'start', mode: state.mode, o, target: state.mode === 'coral' ? state.n : state.steps, play });
  setRunning(play);
}
function setRunning(on) {
  running = on;
  $('play').textContent = on ? t('Pause', 'Pausa') : t('Play', 'Avvia');
}

/* ---------------------------------------------------------- controls --- */

const fmt = { n: v => v, stick: v => (+v).toFixed(2), drift: v => (+v).toFixed(2), up: v => (+v).toFixed(2), F: v => (+v).toFixed(4), k: v => (+v).toFixed(4), steps: v => v };
function show() {
  document.body.dataset.mode = state.mode;
  $('mode').value = state.mode;
  for (const k of Object.keys(fmt)) { $(k).value = state[k]; $(k + 'out').textContent = fmt[k](state[k]); }
  $('seed').value = state.seed;
  $('preset').value = GS_PRESETS[state.preset] ? state.preset : 'custom';
  $('cname').innerHTML = state.mode === 'coral' ? t('particles', 'particelle') : t('steps', 'passi');
  drawFK();
  save();
}
function save() {
  const keys = state.mode === 'coral' ? ['mode', 'n', 'stick', 'drift', 'up', 'seed'] : ['mode', 'preset', 'F', 'k', 'steps', 'seed'];
  const h = new URLSearchParams();
  for (const k of keys) h.set(k, state[k]);
  history.replaceState(null, '', '#' + h);
}
let sync = false;
function load() {
  const h = new URLSearchParams(location.hash.slice(1));
  sync = h.has('now');
  if (h.get('mode') === 'turing') state.mode = 'turing';
  if (h.get('preset') && GS_PRESETS[h.get('preset')]) { state.preset = h.get('preset'); Object.assign(state, { F: GS_PRESETS[state.preset].F, k: GS_PRESETS[state.preset].k }); }
  for (const k of ['n', 'stick', 'drift', 'up', 'F', 'k', 'steps', 'seed']) if (h.has(k) && isFinite(+h.get(k))) state[k] = +h.get(k);
}
function choose(id) {
  state.preset = id; state.F = GS_PRESETS[id].F; state.k = GS_PRESETS[id].k;
  show(); start();
}
function presetNames() {
  const sel = $('preset'); sel.replaceChildren();
  for (const [id, p] of Object.entries(GS_PRESETS)) sel.appendChild(new Option(t(p.en, p.it), id));
  sel.appendChild(new Option(t('custom', 'a scelta'), 'custom'));
  sel.value = GS_PRESETS[state.preset] ? state.preset : 'custom';
  $('mode').options[0].textContent = t('coral (aggregation)', 'corallo (aggregazione)');
  $('mode').options[1].textContent = t('Turing vase', 'vaso di Turing');
}

function init() {
  load(); setup(); presetNames(); show();
  $('mode').addEventListener('change', e => { state.mode = e.target.value; show(); home(); start(); });
  for (const k of Object.keys(fmt)) $(k).addEventListener('input', e => {
    state[k] = +e.target.value; $(k + 'out').textContent = fmt[k](state[k]);
    if (k === 'F' || k === 'k') { state.preset = 'custom'; $('preset').value = 'custom'; drawFK(); }
    save();
  });
  // a change of a number restarts the growth once the slider is let go;
  // more particles or more steps only extend it
  for (const k of ['stick', 'drift', 'up', 'F', 'k']) $(k).addEventListener('change', () => start());
  for (const k of ['n', 'steps']) $(k).addEventListener('change', () => {
    send({ cmd: 'play', target: state[k] }); setRunning(true);
  });
  $('preset').addEventListener('change', e => { if (GS_PRESETS[e.target.value]) choose(e.target.value); });
  $('seed').addEventListener('change', e => { state.seed = Math.max(1, Math.round(+e.target.value || 1)); show(); start(); });
  $('dice').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 99999); show(); start(); });
  $('view').addEventListener('click', home);
  $('reset').addEventListener('click', () => start(false));
  $('step').addEventListener('click', () => { send({ cmd: 'step' }); setRunning(false); });
  $('play').addEventListener('click', () => {
    if (running) { send({ cmd: 'pause' }); setRunning(false); }
    else { send({ cmd: 'play' }); setRunning(true); }
  });
  // the (F, k) map: click or drag
  const fk = $('fk');
  const pick = e => {
    const r = fk.getBoundingClientRect(), x = (e.clientX - r.left) * 300 / r.width, y = (e.clientY - r.top) * 220 / r.height;
    const k = FK.k0 + (FK.k1 - FK.k0) * (x - FK.x0) / (FK.x1 - FK.x0), F = FK.F0 + (FK.F1 - FK.F0) * (FK.y1 - y) / (FK.y1 - FK.y0);
    state.k = +Math.min(0.07, Math.max(0.045, k)).toFixed(4); state.F = +Math.min(0.08, Math.max(0.01, F)).toFixed(4);
    state.preset = 'custom'; show();
  };
  let drag = false;
  fk.addEventListener('pointerdown', e => { if (e.target.classList.contains('pdot')) return; drag = true; fk.setPointerCapture(e.pointerId); pick(e); });
  fk.addEventListener('pointermove', e => { if (drag) pick(e); });
  fk.addEventListener('pointerup', () => { if (drag) { drag = false; start(); } });

  const coralPanel = document.createElement('div'), vasePanel = document.createElement('div');
  coralPanel.className = 'only-coral'; vasePanel.className = 'only-turing';
  $('print').append(coralPanel, vasePanel);
  const args = o => [{ ...state, ...o, data: last }];
  printPanel(coralPanel, {
    size: { value: 80, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'twig', label: { en: 'smallest twig, mm', it: 'rametto minimo, mm' }, value: 1, min: 0.6, max: 3, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true,
        thick: { key: 'baseThick', label: { en: 'base, mm', it: 'base, mm' }, value: 2.4, min: 1, max: 8, step: 0.1 } },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => args({ ...o, mode: 'coral' }) },
    name: o => fileName({ ...state, ...o, mode: 'coral', n: last && last.n }),
    head: 'binary STL, millimetres, a coral grown by diffusion-limited aggregation',
    object: 'DLA coral',
    prefix: 'pc',
    // the link to the scene: the address holds every number of the mode
    share: () => { save(); return location.href; },
  });
  printPanel(vasePanel, {
    size: { value: 90, min: 40, max: 250, what: { en: 'height', it: 'altezza' } },
    fields: [
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 1.4, min: 0.4, max: 3, step: 0.1 },
      { key: 'wall', label: { en: 'wall, mm', it: 'parete, mm' }, value: 1.8, min: 1, max: 4, step: 0.1 },
      { key: 'floor', label: { en: 'floor, mm', it: 'fondo, mm' }, value: 2, min: 1, max: 6, step: 0.1 },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => args({ ...o, mode: 'turing' }) },
    name: o => fileName({ ...state, ...o, mode: 'turing' }),
    head: 'binary STL, millimetres, a vase with a Gray-Scott pattern',
    object: 'Turing vase',
    prefix: 'pv',
    share: () => { save(); return location.href; },
  });
  onLang(() => { presetNames(); show(); setRunning(running); if (lastMR) drawMR(lastMR); });
  onTheme(theme);
  if (sync) now(); else start();
}

init();
