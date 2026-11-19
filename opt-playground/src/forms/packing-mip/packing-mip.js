// A packing puzzle solved by a MIP: the tray and the pieces as they are
// printed, the pieces placed where the solution of solve.py puts them, one
// colour each, and drawn apart by a slider; the numbers of the model; the
// download panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { puzzles, data, dimsOf, tray, piece, solid, fileName } from './model.js';

const $ = id => document.getElementById(id);
// #...&frame=1 makes the view as tall as the window (for the thumbnails)
const FRAME = /(^|[#&])frame=1/.test(location.hash);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SIZE = 90, CLEAR = 0.25;
const state = { puzzle: 'pent6x10', apart: 0.35 };

// the state in the address (src/print/state.js): a link restores the scene
const SPEC = { puzzle: { def: 'pent6x10', values: Object.keys(puzzles) }, apart: { def: 0.35, min: 0, max: 1 } };
function readHash() { Object.assign(state, readState(SPEC)); }
const writeHash = () => writeState(SPEC, state);

let renderer, scene, camera, controls, group, dirty = true, pieces = [];
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50406a, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-0.7, -1, 1.8); scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5); back.position.set(1, 1, 0.5); scene.add(back);
  const resize = () => {
    const w = stage.clientWidth, h = FRAME ? Math.round(innerHeight * 1.1) : Math.round(Math.min(w * 0.62, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; if (FRAME) camera.zoom = 0.95; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (controls.update()) dirty = true; if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

const geom = m => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  return g;
};
const nonIndexed = m => { const g = geom(m).toNonIndexed(); g.computeVertexNormals(); return g; };

function clear() {
  if (!group) return;
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.remove(group);
}

// the colours of the pieces: twelve hues around the circle, soft
const hue = (k, n) => new THREE.Color().setHSL((0.75 + k / n) % 1, 0.42, 0.62);

function build() {
  clear();
  group = new THREE.Group(); scene.add(group);
  const g = dimsOf(state.puzzle, SIZE, { clear: CLEAR }), { P, s } = g, off = CLEAR / 2 + g.wall;
  const T = tray(P.tray, P.w, P.h, s, CLEAR, g.wall, g.floor, g.depth);
  group.add(new THREE.Mesh(nonIndexed(T), new THREE.MeshStandardMaterial({ color: css('--accent'), roughness: 0.6 })));
  pieces = [];
  const sol = data[state.puzzle].solution, n = sol.length;
  const cx = P.w * s / 2, cy = P.h * s / 2;
  sol.forEach((p, k) => {
    const mat = new THREE.MeshStandardMaterial({ color: hue(k, n), roughness: 0.5 });
    let obj;
    if (g.cube) {
      // the cubes of the piece where the MIP put them
      obj = new THREE.Group();
      const bg = new THREE.BoxGeometry(s - CLEAR, s - CLEAR, s - CLEAR);
      for (const [x, y, z] of p.cells) { const b = new THREE.Mesh(bg, mat); b.position.set(off + (x + 0.5) * s, off + (y + 0.5) * s, g.floor + (z + 0.5) * s); obj.add(b); }
    } else {
      const m = piece(p.cells, s, CLEAR, g.unit);
      obj = new THREE.Mesh(nonIndexed(m), mat);
      obj.position.set(off, off, g.floor);
    }
    const c = [0, 1, 2].map(a => p.cells.reduce((q, v) => q + v[a], 0) / p.cells.length);
    obj.userData.dir = new THREE.Vector3((c[0] + 0.5) * s - cx, (c[1] + 0.5) * s - cy, g.cube ? (c[2] - 1) * s : 0);
    obj.userData.base = obj.position.clone();
    group.add(obj); pieces.push(obj);
  });
  const span = Math.max(P.w, P.h) * s;
  // the cube is as tall as it is wide and its pieces rise when drawn apart:
  // the camera stands farther back and aims higher than for a flat tray
  controls.target.set(off + cx, off + cy, g.cube ? span * 0.55 : 2);
  if (g.cube) camera.position.set(off + cx + span * 1.3, off + cy - span * 2.6, span * 2.3);
  else camera.position.set(off + cx + span * 0.4, off + cy - span * 1.5, span * 1.3);
  apart();
}

function apart() {
  const a = state.apart, g = dimsOf(state.puzzle, SIZE, { clear: CLEAR });
  for (const o of pieces) {
    const d = o.userData.dir;
    o.position.copy(o.userData.base).add(new THREE.Vector3(d.x * 0.55 * a, d.y * 0.55 * a, d.z * 0.9 * a + a * (g.cube ? 1.3 : 0.9) * g.s));
  }
  dirty = true;
}

function stats() {
  const d = data[state.puzzle];
  $('stats').innerHTML = [
    [t('placements (variables)', 'piazzamenti (variabili)'), d.vars],
    [t('rows', 'righe'), d.rows],
    [t('cells of the tray', 'celle del vassoio'), d.cells],
    [t('optimum', 'ottimo'), `${d.optimum} / ${d.cells}`],
    [t('LP bound', 'bound del rilassamento'), d.lp],
    [t('B&B nodes', 'nodi del B&B'), d.nodes],
  ].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
}

function names() { for (const o of $('puzzle').options) o.textContent = t(puzzles[o.value].en, puzzles[o.value].it); }

function init() {
  readHash(); setup();
  for (const k of Object.keys(puzzles)) $('puzzle').appendChild(new Option(k, k));
  names();
  $('puzzle').value = state.puzzle; $('apart').value = state.apart;
  $('puzzle').addEventListener('change', e => { state.puzzle = e.target.value; build(); stats(); writeHash(); });
  $('apart').addEventListener('input', e => { state.apart = +e.target.value; apart(); writeHash(); });
  build(); stats(); writeHash();
  printPanel($('print'), {
    size: { value: SIZE, min: 50, max: 250, what: { en: 'longest side of the tray', it: 'lato maggiore del vassoio' } },
    fields: [
      { key: 'clear', label: { en: 'clearance, mm', it: 'gioco, mm' }, value: CLEAR, min: 0.1, max: 0.6, step: 0.05 },
      { key: 'tray', type: 'check', label: { en: 'tray', it: 'vassoio' }, value: true },
      { key: 'pieces', type: 'check', label: { en: 'pieces', it: 'pezzi' }, value: true },
    ],
    build: o => solid({ puzzle: state.puzzle, ...o }),
    name: o => fileName({ puzzle: state.puzzle, ...o }),
    head: 'binary STL, millimetres, a packing puzzle: tray and pieces',
    object: 'packing puzzle',
    share: () => shareUrl(SPEC, state),
    note: info => (info && info.cell ? t(`, cell ${info.cell} mm`, `, cella ${info.cell} mm`) : ''),
  });
  onLang(() => { names(); stats(); });
  onTheme(build);
}

init();
