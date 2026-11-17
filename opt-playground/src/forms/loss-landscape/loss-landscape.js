// Two loss landscapes side by side, the network (not convex) and the logistic
// regression (convex), on the same data: the printed relief itself, coloured
// by height, with the descent path in gold; the directions of the plane and
// the scale of the heights can be changed; the download panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { data, solid, fileName, twinOffset, heightAt, scaler } from './model.js';

const $ = id => document.getElementById(id);
// #...&frame=1 makes the view as tall as the window (for the thumbnails)
const FRAME = /(^|[#&])frame=1/.test(location.hash);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const S = 120, R = 22, BASE = 3, CELL = 0.6;
const state = { dirs: 'interp', scale: 'log' };

// the state in the address (src/print/state.js): a link restores the scene
const SPEC = { dirs: { def: 'interp', values: ['interp', 'pca', 'random'] }, scale: { def: 'log', values: ['log', 'linear'] } };
function readHash() { Object.assign(state, readState(SPEC)); }
const writeHash = () => writeState(SPEC, state);

let renderer, scene, camera, controls, group, dirty = true;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  camera.position.set(S / 2 + 8, -88, 132);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(S / 2, S / 4.4, 4);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50406a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-0.8, -1, 1.6); scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5); back.position.set(1, 1, 0.5); scene.add(back);
  const resize = () => {
    const w = stage.clientWidth, h = FRAME ? Math.round(innerHeight * 1.1) : Math.round(Math.min(w * 0.6, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; if (FRAME) camera.zoom = 0.95; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (controls.update()) dirty = true; if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

function clear() {
  if (!group) return;
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.remove(group);
}

function draw() {
  clear();
  group = new THREE.Group(); scene.add(group);
  const m = solid({ which: 'both', dirs: state.dirs, scale: state.scale, size: S, relief: R, base: BASE, cell: CELL });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals();
  // colours by height: gold at the bottom of the valleys, then the accent,
  // lilac on the heights (the accent and lilac swap on a dark ground)
  let lo = new THREE.Color(css('--accent')), hi = new THREE.Color(css('--lilac'));
  const gr = new THREE.Color(css('--ground')), side = new THREE.Color(css('--ink-soft')).lerp(gr, 0.35), bottom = new THREE.Color(css('--gold'));
  if (gr.r + gr.g + gr.b < 1.2) [lo, hi] = [hi, lo];
  const p = m.pos, col = new Float32Array(p.length), c = new THREE.Color();
  for (let v = 0; v < p.length; v += 3) {
    const z = p[v + 2], u = Math.min(1, Math.max(0, (z - BASE - 1) / R));
    if (z < BASE + 0.5) c.copy(side);
    else if (u < 0.12) c.copy(bottom).lerp(lo, u / 0.12);
    else c.copy(lo).lerp(hi, ((u - 0.12) / 0.88) ** 0.7);
    col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
  // the paths in gold, a little above the surface
  const { side: sd, offset } = twinOffset(S, CELL), gold = new THREE.Color(css('--gold'));
  for (const [k, model] of [[0, 'net'], [1, 'logreg']]) {
    const P = data[model][state.dirs], pts = [];
    const toX = a => (a - P.lo[0]) / (P.hi[0] - P.lo[0]) * sd + k * offset, toY = b => (b - P.lo[1]) / (P.hi[1] - P.lo[1]) * sd;
    for (let i = 0; i < P.path.length; i++) {
      const [a, b] = P.path[i];
      pts.push(new THREE.Vector3(toX(a), toY(b), heightAt(model, state.dirs, state.scale, R, BASE, a, b) + 0.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, pts.length * 3), 0.55, 8), new THREE.MeshStandardMaterial({ color: gold, roughness: 0.35, metalness: 0.2 })));
    const s0 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12), new THREE.MeshStandardMaterial({ color: gold })); s0.position.copy(pts[0]); group.add(s0);
  }
  dirty = true;
}

function stats() {
  const f = (m, en, it) => {
    const d = data[m];
    return `<div><dt>${t(en, it)}</dt><dd>${d.weights} ${t('weights', 'pesi')}, ${t('loss', 'loss')} ${d.loss0} → ${d.loss}, ${t('accuracy', 'accuratezza')} ${Math.round(d.acc * 100)}%</dd></div>`;
  };
  $('stats').innerHTML = f('net', 'left: network, 8 x 16 tanh units', 'a sinistra: rete, 8 x 16 unità tanh') + f('logreg', 'right: logistic regression', 'a destra: regressione logistica');
}

// the options of the selects in both languages
const OPTS = {
  dirs: { interp: ['to the initial weights, and random', 'verso i pesi iniziali, e casuale'], pca: ['principal components of the path', 'componenti principali del cammino'], random: ['random, filter-normalized', 'casuali, normalizzate per filtro'] },
  scale: { log: ['log of the loss', 'logaritmo della loss'], linear: ['loss', 'loss'] },
};
const optNames = () => { for (const [id, m] of Object.entries(OPTS)) for (const o of $(id).options) if (m[o.value]) o.textContent = t(...m[o.value]); };

function init() {
  readHash();
  optNames(); onLang(optNames); setup();
  $('dirs').value = state.dirs; $('scale').value = state.scale;
  $('dirs').addEventListener('change', e => { state.dirs = e.target.value; draw(); writeHash(); });
  $('scale').addEventListener('change', e => { state.scale = e.target.value; draw(); writeHash(); });
  draw(); stats(); writeHash();
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'width', it: 'larghezza' } },
    fields: [
      { key: 'which', type: 'select', label: { en: 'landscape', it: 'paesaggio' }, value: 'net',
        options: [{ value: 'net', en: 'network', it: 'rete' }, { value: 'logreg', en: 'logistic regression', it: 'regressione logistica' }, { value: 'both', en: 'both, side by side', it: 'entrambi, affiancati' }] },
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 22, min: 5, max: 60, step: 1 },
      { key: 'path', type: 'check', label: { en: 'engrave the path', it: 'incidi il cammino' }, value: true },
      { key: 'base', label: { en: 'base, mm', it: 'base, mm' }, value: 3, min: 1, max: 10, step: 0.5 },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ dirs: state.dirs, scale: state.scale, ...o }] },
    name: o => fileName({ dirs: state.dirs, scale: state.scale, ...o }),
    head: 'binary STL, millimetres, a loss landscape',
    object: 'loss landscape',
    share: () => shareUrl(SPEC, state),
  });
  onLang(stats);
  onTheme(draw);
}

init();
