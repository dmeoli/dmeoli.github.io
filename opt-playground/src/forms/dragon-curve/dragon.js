// The page of the dragon curves: the folded strip drawn as one box per
// segment (an InstancedMesh), the creases opened by the slider or by Play,
// the oblique creases lifting it into space, and the download panel. The
// state lives in the address.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { CURVES, turns, strip, extent, fileName } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = {
  kind: { def: 'heighway', values: Object.keys(CURVES) }, n: { def: 10, min: 1, max: 12, int: true },
  fold: { def: 1, min: 0, max: 1 }, tilt: { def: 0, min: 0, max: 90, int: true },
};
const state = readState(SPEC), FRESH = location.hash.length <= 1;
const THUMB = new URLSearchParams(location.hash.slice(1)).get('thumb') === '1';
if (THUMB) document.body.classList.add('thumb');
const still = matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, inst = null, dirty = true;
const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
const C0 = new THREE.Color('#5a2a92'), C1 = new THREE.Color('#9363be'), C2 = new THREE.Color('#e0b84a');
const ramp = (x, out) => (x < 0.5 ? out.copy(C0).lerp(C1, 2 * x) : out.copy(C1).lerp(C2, 2 * x - 1));

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6ff, 0x4a3a60, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2, -3, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8c8ff, 0.8); rim.position.set(-3, 2, 2); scene.add(rim);
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000); camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = THUMB ? innerWidth : stage.clientWidth, h = THUMB ? innerHeight : Math.round(Math.min(w * 0.75, 600));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => {
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const W = 0.8, T = 0.22;      // the strip on the screen, in segment lengths
const M = new THREE.Matrix4(), col = new THREE.Color();
let framedFor = '';
function draw() {
  const segs = strip(state.kind, state.n, { fold: state.fold, tilt: state.tilt });
  if (!inst || inst.count !== segs.length) {
    if (inst) { scene.remove(inst); inst.dispose(); }
    inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1 + T, W, T), mat, segs.length);
    scene.add(inst);
  }
  const [lo, hi] = extent(segs), c = lo.map((v, i) => (v + hi[i]) / 2);
  segs.forEach(({ a, H, W: Wv }, i) => {
    const N = [H[1] * Wv[2] - H[2] * Wv[1], H[2] * Wv[0] - H[0] * Wv[2], H[0] * Wv[1] - H[1] * Wv[0]];
    M.set(H[0], Wv[0], N[0], a[0] + H[0] / 2 - c[0], H[1], Wv[1], N[1], a[1] + H[1] / 2 - c[1], H[2], Wv[2], N[2], a[2] + H[2] / 2 - c[2], 0, 0, 0, 1);
    inst.setMatrixAt(i, M);
    inst.setColorAt(i, ramp(i / Math.max(1, segs.length - 1), col));
  });
  inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  // the camera is framed again only when the curve or its level changes
  const key = `${state.kind}|${state.n}|${state.tilt > 0}`;
  if (key !== framedFor && !playing) {
    framedFor = key;
    const [l1, h1] = extent(strip(state.kind, state.n, { fold: 1, tilt: state.tilt }));
    const r = 0.5 * Math.hypot(h1[0] - l1[0], h1[1] - l1[1], h1[2] - l1[2]) + 1;
    const d = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1 / camera.aspect : 1) * (THUMB ? 0.74 : 0.8);
    controls.target.set(0, 0, 0);
    camera.position.set(d * 0.18, -d * 0.62, d * 0.76);
    camera.near = d / 100; camera.far = d * 10; camera.updateProjectionMatrix();
  }
  dirty = true;
  info(segs.length);
}

function info(N) {
  const s = turns(state.kind, Math.min(state.n, 6)), str = Array.from(s.slice(0, 31), v => (v > 0 ? 'L' : v < 0 ? 'R' : '·')).join('');
  $('segs').textContent = N;
  $('folds').textContent = state.kind === 'ter' ? `3^${state.n}` : state.kind === 'twin' ? `2 × 2^${state.n}` : `2^${state.n}`;
  $('angle').textContent = `${(180 - state.fold * (180 - CURVES[state.kind].angle)).toFixed(0)}°`;
  $('seq').textContent = str + (s.length > 31 ? '…' : '');
}

/* ----------------------------------------------------------- controls -- */

function sync() {
  const C = CURVES[state.kind];
  state.n = Math.min(state.n, C.max);
  const n = $('n'); n.max = C.max; n.value = state.n; $('nv').textContent = state.n;
  $('fold').value = state.fold; $('foldv').textContent = state.fold.toFixed(2);
  $('tilt').value = state.tilt; $('tiltv').textContent = `${state.tilt}°`;
  for (const b of $('kinds').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.k === state.kind));
  writeState(SPEC, state);
}

let playing = 0;
function play() {
  if (playing) { cancelAnimationFrame(playing); playing = 0; $('play').classList.remove('on'); return; }
  $('play').classList.add('on');
  const t0 = performance.now(), dur = 4200;
  const step = now => {
    const u = Math.min(1, (now - t0) / dur);
    state.fold = +(0.5 - 0.5 * Math.cos(Math.PI * u)).toFixed(3);
    sync(); draw();
    if (u < 1) playing = requestAnimationFrame(step); else { playing = 0; $('play').classList.remove('on'); }
  };
  playing = requestAnimationFrame(step);
}

function init() {
  setup();
  const kb = $('kinds');
  for (const [k, c] of Object.entries(CURVES)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k;
    b.innerHTML = `<span data-l="en">${c.en}</span><span data-l="it" lang="it">${c.it}</span>`;
    b.addEventListener('click', () => { state.kind = k; state.n = Math.min(state.n, CURVES[k].max); if (k === 'ter' && state.n > 7) state.n = 6; sync(); draw(); });
    kb.appendChild(b);
  }
  $('n').addEventListener('input', e => { state.n = +e.target.value; sync(); draw(); });
  $('fold').addEventListener('input', e => { state.fold = +e.target.value; sync(); draw(); });
  $('tilt').addEventListener('input', e => { state.tilt = +e.target.value; sync(); draw(); });
  $('play').addEventListener('click', play);
  $('share').addEventListener('click', async () => {
    const u = shareUrl(SPEC, state);
    try { await navigator.clipboard.writeText(u); $('status').textContent = t('link copied: ', 'link copiato: ') + u; }
    catch { $('status').textContent = u; }
  });
  printPanel($('print'), {
    size: { value: 120, min: 40, max: 250, what: { en: 'largest side', it: 'lato maggiore' } },
    fields: [
      { key: 'strip', label: { en: 'strip width, mm', it: 'larghezza striscia, mm' }, value: 5, min: 1.5, max: 20, step: 0.5 },
      { key: 'wall', label: { en: 'wall, mm', it: 'parete, mm' }, value: 1.2, min: 0.6, max: 4, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: false },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a dragon curve as a folded strip',
    object: 'dragon curve',
    share: () => shareUrl(SPEC, state),
    note: info => `; ${info.segments} ${t('segments of', 'segmenti da')} ${info.seg} mm`,
  });
  sync(); draw();
  onLang(() => draw());
  onTheme(() => { dirty = true; });
  addEventListener('hashchange', () => { Object.assign(state, readState(SPEC)); sync(); draw(); });
  if (!THUMB && !still.matches && FRESH) { state.fold = 0; sync(); draw(); setTimeout(play, 600); }
}

init();
