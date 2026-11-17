// The page of the robots: the robot of a seed turning in 3D, colored by the
// kind of its parts, its derivation in the grammar, its neighbours in seed,
// and the print panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { screenMesh, RULES, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = { seed: { def: 14, min: 0, max: 999999, int: true }, spin: { def: true } };
const state = readState(SPEC);

const cache = new Map();
const meshOf = (seed, cells) => {
  const key = seed + ':' + cells;
  if (!cache.has(key)) { cache.set(key, screenMesh(seed, cells)); if (cache.size > 40) cache.delete(cache.keys().next().value); }
  return cache.get(key);
};

function palette() {
  return [new THREE.Color(css('--ink-soft') || '#5f4b76').lerp(new THREE.Color('#b8b0c8'), 0.45), new THREE.Color(css('--accent') || '#7338a8'),
    new THREE.Color('#3a3150'), new THREE.Color('#e3b341')];
}

function geometry(m) {
  const pal = palette(), col = new Float32Array(m.pos.length);
  for (let i = 0; i < m.kinds.length; i++) { const c = pal[m.kinds[i]]; col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals(); g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -g.boundingBox.min.z);
  return g;
}

const lights = scene => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x403050, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-4, -6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8c8ff, 0.8); rim.position.set(5, 4, 3); scene.add(rim);
};
const material = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, obj, dirty = true;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene(); lights(scene);
  camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 4.6);
  camera.position.set(-9, -24, 9);
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.95, 600));
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, 5 / Math.sin(camera.fov * Math.PI / 360) * Math.max(1, 0.8 / camera.aspect));
    camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  let last = performance.now();
  const tick = now => {
    if (state.spin && obj) { obj.rotation.z += (now - last) / 4000; dirty = true; }
    last = now;
    if (dirty) { controls.update(); renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function show() {
  const m = meshOf(state.seed, 90), rz = obj ? obj.rotation.z : 0;
  if (obj) { scene.remove(obj); obj.geometry.dispose(); }
  obj = new THREE.Mesh(geometry(m), material());
  obj.rotation.z = rz;
  scene.add(obj); dirty = true;
}

/* ----------------------------------------------- the neighbours in seed -- */

let shoot = null;
function stills() {
  if (shoot) return shoot;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(200, 240, false);
  const sc = new THREE.Scene(); lights(sc);
  const cam = new THREE.PerspectiveCamera(30, 200 / 240, 0.5, 500);
  cam.up.set(0, 0, 1); cam.position.set(-8, -20, 9); cam.lookAt(0, 0, 4.4);
  shoot = (seed, canvas) => {
    const o = new THREE.Mesh(geometry(meshOf(seed, 44)), material());
    sc.add(o); r.render(sc, cam);
    canvas.getContext('2d').drawImage(r.domElement, 0, 0, canvas.width, canvas.height);
    sc.remove(o); o.geometry.dispose();
  };
  return shoot;
}

let token = 0;
async function siblings() {
  const my = ++token, box = $('siblings');
  box.replaceChildren();
  const list = [];
  for (let d = 1; d <= 6; d++) {
    const s = state.seed + d, b = document.createElement('button'), c = document.createElement('canvas');
    b.type = 'button'; c.width = 200; c.height = 240;
    const l = document.createElement('small'); l.textContent = `${t('seed', 'seme')} ${s}`;
    b.append(c, l); b.addEventListener('click', () => { state.seed = s; refresh(); });
    box.appendChild(b); list.push([s, c]);
  }
  for (const [s, c] of list) {
    await new Promise(r => setTimeout(r, 0));
    if (my !== token) return;
    stills()(s, c);
  }
}

/* ----------------------------------------------------------- everything -- */

const NAMES = {
  Legs: ['legs', 'gambe'], Torso: ['torso', 'torso'], Chest: ['chest', 'petto'], Head: ['head', 'testa'], Crest: ['crest', 'cresta'],
  Shoulders: ['shoulders', 'spalle'], Hands: ['hands', 'mani'], Back: ['back', 'schiena'],
};
const ALT = {
  straight: 'dritte', 'reversed knee': 'ginocchio rovesciato', heavy: 'pesanti', box: 'scatola', barrel: 'botte', wedge: 'cuneo',
  plate: 'piastra', core: 'nucleo', vents: 'prese d\'aria', dome: 'cupola', visor: 'visiera', none: 'nessuna', fin: 'pinna', ears: 'orecchie',
  antennae: 'antenne', pauldron: 'spallacci', sphere: 'sfere', layered: 'a lamelle', fist: 'pugno', claw: 'artiglio', thrusters: 'propulsori', wings: 'ali',
};
function derivation() {
  const ch = meshOf(state.seed, 90).choices;
  const rows = Object.keys(RULES).map(k => `<dt>${t(NAMES[k][0], NAMES[k][1])}</dt><dd>${RULES[k].map(a => (a === ch[k] ? `<b>${t(a, ALT[a])}</b>` : t(a, ALT[a]))).join(' | ')}</dd>`);
  $('derivation').innerHTML = rows.join('');
}

function refresh() {
  $('seed').value = state.seed; $('spin').checked = state.spin;
  writeState(SPEC, state);
  show(); derivation(); siblings();
}

function init() {
  setup();
  $('seed').addEventListener('change', e => { state.seed = Math.max(0, Math.round(+e.target.value || 0)); refresh(); });
  $('random').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 100000); refresh(); });
  $('prev').addEventListener('click', () => { state.seed = Math.max(0, state.seed - 1); refresh(); });
  $('next').addEventListener('click', () => { state.seed++; refresh(); });
  $('spin').addEventListener('change', e => { state.spin = e.target.checked; writeState(SPEC, state); });
  printPanel($('print'), {
    size: { value: 120, min: 50, max: 300, what: { en: 'height of the robot', it: 'altezza del robot' } },
    fields: [
      { key: 'mode', type: 'select', label: { en: 'print as', it: 'stampa come' }, value: 'one',
        options: [{ value: 'one', en: 'one body', it: 'un solo corpo' }, { value: 'parts', en: 'four parts with pins', it: 'quattro pezzi con perni' }] },
      { key: 'pin', label: { en: 'pin radius, mm', it: 'raggio del perno, mm' }, value: 2.5, min: 1.5, max: 6, step: 0.1 },
      { key: 'clearance', label: { en: 'clearance, mm', it: 'gioco, mm' }, value: 0.2, min: 0.05, max: 0.6, step: 0.05 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...o, seed: state.seed }] },
    name: o => fileName({ ...o, seed: state.seed }),
    head: 'binary STL, millimetres, a robot from a shape grammar',
    object: 'robot',
    share: () => shareUrl(SPEC, state),
  });
  refresh();
  onLang(() => { derivation(); siblings(); });
  onTheme(() => refresh());
  addEventListener('hashchange', () => { Object.assign(state, readState(SPEC)); refresh(); });
}

init();
