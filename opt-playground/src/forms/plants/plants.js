// L-system plants: the menu of plants of The Algorithmic Beauty of Plants,
// sliders for the steps, the angle, the tropism, the exponent of Leonardo, the
// twigs and the seed, the rules in an editable box, the view in three.js (its
// geometry built by the worker of view.js) and the download panel, whose
// solid is built by model.js in the worker of src/print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel } from '../../print/index.js';
import { presets, fileName } from './model.js';
import { build } from './viewgeom.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const still = matchMedia('(prefers-reduced-motion: reduce)');

const KEYS = ['n', 'delta', 'tropism', 'exp', 'tip', 'seed'];
const state = { preset: 'shrub', text: '', leaves: true };
const load = k => { const p = presets[k]; Object.assign(state, { preset: k, text: p.text, n: p.n, delta: p.delta, tropism: p.tropism, exp: p.exp, tip: p.tip, seed: p.seed }); };
load('shrub');

/* ---------------------------------------------------------------- 3D ---- */

let renderer, scene, camera, controls, group, bark, leaf, disc, dirty = true, fitR = 50;
const matBark = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
const matLeaf = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
const matDisc = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55 });

function colours() {
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  matBark.color.set(css('--gold'));
  if (!dark) matBark.color.lerp(new THREE.Color('#ffffff'), 0.12);
  matLeaf.color.set(dark ? css('--accent-2') : css('--accent'));
  matDisc.color.set(dark ? css('--lilac') : css('--rule'));
  dirty = true;
}

function home() {
  const r = fitR / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * (document.body.classList.contains('thumb') ? 0.98 : 1.08);
  camera.position.set(-r * 0.86, -r * 0.42, fitC.z + r * 0.28);
  controls.target.copy(fitC);
  camera.near = r / 50; camera.far = r * 6; camera.updateProjectionMatrix();
  controls.update(); dirty = true;
}
const fitC = new THREE.Vector3(0, 0, 40);

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
  controls.autoRotateSpeed = 1.4;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-2, -3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(3, 3, 1); scene.add(rim);
  group = new THREE.Group(); scene.add(group);
  colours();
  const resize = () => {
    const thumb = document.body.classList.contains('thumb');
    const w = thumb ? innerWidth : stage.clientWidth, h = thumb ? innerHeight : Math.round(Math.min(w * 0.9, 640));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  controls.addEventListener('change', () => { dirty = true; });
  const loop = () => {
    controls.autoRotate = $('spin').checked;
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  loop();
}

/* ------------------------------------------- the worker of the view ---- */

const worker = new Worker(new URL('./view.js', import.meta.url), { type: 'module' });
let asked = 0, busy = false, again = false, first = true;
const opts = () => ({ text: state.text, n: state.n, delta: state.delta, tropism: state.tropism, exp: state.exp, tip: state.tip, seed: state.seed });
function rebuild() {
  // the first plant is built here, at once (and so it is in a screenshot);
  // the next ones by the worker
  if (asked === 0) {
    asked = 1;
    let d;
    try { d = build(opts()); } catch (e) { d = { error: String(e && e.message || e) }; }
    return worker.onmessage({ data: d });
  }
  if (busy) { again = true; return; }
  busy = true;
  worker.postMessage({ id: ++asked, o: opts() });
}
worker.onmessage = ({ data }) => {
  busy = false;
  if (again) { again = false; rebuild(); }
  if (data.error) { $('err').textContent = t('Error: ', 'Errore: ') + data.error; return; }
  $('err').textContent = data.truncated ? t('The word grew beyond 300000 modules: the steps after are not taken.', 'La parola ha superato 300000 moduli: i passi seguenti non sono eseguiti.') : '';
  steps(data.lengths, data.modules);
  if (data.empty) { $('err').textContent = t('These rules draw no branch F.', 'Queste regole non disegnano alcun ramo F.'); return; }
  show(data);
};

worker.onerror = e => { busy = false; $('err').textContent = t('Error: ', 'Errore: ') + (e.message || 'worker'); };

function show(d) {
  for (const m of [bark, leaf, disc]) if (m) { group.remove(m); m.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  bark = new THREE.Mesh(g, matBark);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(d.lpos, 3));
  lg.setIndex(new THREE.BufferAttribute(d.lidx, 1));
  lg.computeVertexNormals();
  leaf = new THREE.Mesh(lg, matLeaf);
  leaf.visible = state.leaves;
  g.computeBoundingBox();
  const bb = g.boundingBox, R = Math.max(12, d.trunk * 3, 0.42 * Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y));
  disc = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(40, R), Math.min(40, R), 2.4, 64).rotateX(Math.PI / 2).translate(0, 0, -1.2), matDisc);
  group.add(bark, leaf, disc);
  g.computeBoundingSphere();
  if (first) {
    first = false;
    fitC.copy(g.boundingSphere.center); fitR = g.boundingSphere.radius; home();
  }
  $('nmod').textContent = d.modules.toLocaleString();
  $('nseg').textContent = d.segs.toLocaleString();
  $('ntip').textContent = d.tips.toLocaleString();
  $('ratio').textContent = `${(2 * d.trunk).toFixed(1)} / ${(2 * d.tip).toFixed(1)} mm`;
  $('steep').textContent = `${(100 * d.steep).toFixed(0)}%`;
  dirty = true;
}

// the length of the word after each step, on a logarithmic scale
function steps(L, last) {
  const box = $('steps'); box.replaceChildren();
  const top = Math.log10(Math.max(10, ...L));
  L.forEach((v, k) => {
    const i = document.createElement('i');
    i.style.height = `${Math.max(4, 100 * Math.log10(1 + v) / top)}%`;
    i.title = `${k}: ${v}`;
    const s = document.createElement('span'); s.textContent = k; i.appendChild(s);
    box.appendChild(i);
  });
}

/* ------------------------------------------------------ the controls ---- */

const fmt = { n: v => v, delta: v => `${+v.toFixed(2)}°`, tropism: v => v.toFixed(2), exp: v => v.toFixed(2), tip: v => v.toFixed(2), seed: v => v };
function controlsShow() {
  for (const k of KEYS) { $(k).value = state[k]; $(k + 'out').textContent = fmt[k](state[k]); }
  $('preset').value = state.preset;
  $('seed').disabled = !/->\s*\(/.test(state.text);
  $('note').textContent = presets[state.preset] ? t(presets[state.preset].note.en, presets[state.preset].note.it) : '';
  history.replaceState(history.state, '', location.pathname + location.search + '#' + query(false));
}

// the scene in the address: the plant, the numbers that differ from it (all
// of them in a shared link), the leaves, and the rules when they were edited
function query(all) {
  const h = { preset: state.preset };
  if (document.body.classList.contains('thumb')) h.thumb = 1;
  const p = presets[state.preset];
  for (const k of KEYS) if (all || !p || state[k] !== p[k]) h[k] = state[k];
  if (all || !state.leaves) h.leaves = state.leaves ? 1 : 0;
  if (!p || state.text !== p.text) h.rules = state.text;
  return new URLSearchParams(h).toString();
}
const shareUrl = () => location.origin + location.pathname + '#' + query(true);

let pending = 0;
function redraw() {
  controlsShow();
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; rebuild(); });
}

function fillPresets() {
  const sel = $('preset');
  sel.replaceChildren();
  for (const [k, p] of Object.entries(presets)) {
    const o = document.createElement('option'); o.value = k; o.textContent = t(p.en, p.it); sel.appendChild(o);
  }
  sel.value = state.preset;
}

// the pose of the print follows the plant: lying flat for the plant in the plane
const poseOf = () => (presets[state.preset] ? presets[state.preset].pose : 'up');
function choose(k) {
  load(k); $('text').value = state.text; first = true;
  if ($('ppose')) $('ppose').value = poseOf();
  redraw();
}

function printSetup() {
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 300, what: { en: 'height standing, longer side lying', it: 'altezza in piedi, lato maggiore distesa' } },
    fields: [
      { key: 'pose', type: 'select', label: { en: 'pose', it: 'posa' }, value: poseOf(),
        options: [{ value: 'up', en: 'standing, trunk up', it: 'in piedi, tronco in alto' }, { value: 'flat', en: 'lying flat', it: 'distesa' }] },
      { key: 'base', type: 'check', label: { en: 'disc base', it: 'base a disco' }, value: true,
        thick: { key: 'baseThick', label: { en: 'base, mm', it: 'base, mm' }, value: 2.4, min: 1, max: 8, step: 0.1 } },
      { key: 'flatThick', label: { en: 'lying, thickness mm', it: 'distesa, spessore mm' }, value: 3, min: 1.2, max: 10, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...opts(), ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, an L-system plant',
    object: 'plant',
    share: shareUrl,
    note: info => (info.pose === 'flat' ? t(', lying flat, no supports', ', distesa, senza supporti')
      : t(`, ${info.steep}% of the branches over 55° from vertical`, `, ${info.steep}% dei rami oltre 55° dalla verticale`)),
  });
}

function init() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('thumb') === '1') document.body.classList.add('thumb');
  if (presets[h.get('preset')]) load(h.get('preset'));
  const lim = { n: [0, 12], delta: [5, 90], tropism: [-0.4, 0.4], exp: [1.6, 4], tip: [0.5, 2], seed: [1, 60] };
  for (const k of KEYS) if (h.has(k)) { const x = parseFloat(h.get(k)); if (isFinite(x)) state[k] = Math.min(lim[k][1], Math.max(lim[k][0], x)); }
  if (h.get('leaves') === '0') state.leaves = false;
  // edited rules from a link: their expressions may only name numbers, the
  // defines, the parameters and functions of Math (see lsystem.js)
  if (h.has('rules')) state.text = h.get('rules').slice(0, 4000);
  $('leaves').checked = state.leaves;
  fillPresets();
  $('text').value = state.text;
  setup();
  $('preset').addEventListener('change', e => choose(e.target.value));
  for (const k of KEYS) $(k).addEventListener('input', e => { state[k] = +e.target.value; redraw(); });
  $('leaves').addEventListener('change', e => { state.leaves = e.target.checked; if (leaf) leaf.visible = state.leaves; dirty = true; });
  $('apply').addEventListener('click', () => { state.text = $('text').value; first = true; redraw(); });
  $('restore').addEventListener('click', () => { if (presets[state.preset]) { state.text = presets[state.preset].text; $('text').value = state.text; redraw(); } });
  $('view').addEventListener('click', home);
  $('spin').checked = !still.matches && h.get('spin') !== '0';
  printSetup();
  onLang(() => { fillPresets(); controlsShow(); });
  onTheme(colours);
  still.addEventListener('change', () => { controls.enableDamping = !still.matches; if (still.matches) $('spin').checked = false; });
  redraw();
}

init();
