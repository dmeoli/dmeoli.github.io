// The hat and the Spectre: a supertile of the tiling drawn in SVG, the shape
// chosen in the family Tile(a, b), and the printed puzzle (a tray and its
// tiles) in three.js, with the download panel of src/print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onTheme, onLang } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { patch, polygons, shapeAB, puzzle, pieces, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SHAPES = [
  ['hat', 'hat, Tile(1, √3)', 'cappello, Tile(1, √3)'],
  ['spectre', 'Spectre', 'Spettro'],
  ['tile11', 'Tile(1, 1)', 'Tile(1, 1)'],
  ['turtle', 'turtle, Tile(√3, 1)', 'tartaruga, Tile(√3, 1)'],
  ['mix', 'Tile(a, b)', 'Tile(a, b)'],
];
const SPEC = {
  shape: { def: 'hat', values: SHAPES.map(s => s[0]) }, mix: { def: 0.25, min: 0, max: 1 },
  level: { def: 3, min: 1, max: 4, int: true }, mark: { def: true },
};
const state = { ...readState(SPEC), count: 24 };
const toHash = () => writeState(SPEC, state);

/* ------------------------------------------------------------ the plane -- */

const cache = {};
const tilesOf = level => (cache[level] ||= patch(level));
function draw() {
  const sh = shapeAB(state.shape, state.mix);
  const ps = polygons(tilesOf(state.level), sh.a, sh.b, { curve: sh.curve });
  // the tiles of the puzzle, matched by their exact vertices
  const pz = puzzle(state.count, sh), picked = new Set(pz.tiles.map(p => p.keys.join(';')));
  let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  for (const p of ps) for (const [x, y] of p.P) { mn = [Math.min(mn[0], x), Math.min(mn[1], y)]; mx = [Math.max(mx[0], x), Math.max(mx[1], y)]; }
  const pad = 0.5, w = mx[0] - mn[0] + 2 * pad, h = mx[1] - mn[1] + 2 * pad;
  const svg = $('tiling');
  svg.setAttribute('viewBox', `${mn[0] - pad} ${-mx[1] - pad} ${w} ${h}`);
  let s = '';
  for (const p of ps) {
    const d = 'M' + p.P.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join('L') + 'Z';
    const cls = p.mirrored ? 'mir' : 'o' + (Math.floor(p.T.k / 2) % 4);
    s += `<path d="${d}" class="${cls}${state.level === 3 && picked.has(p.keys.join(';')) ? ' pick' : ''}"/>`;
  }
  svg.innerHTML = s;
  svg.classList.toggle('plain', !state.mark);
  const nm = ps.filter(p => p.mirrored).length;
  $('stats').innerHTML = `<span>${t('tiles', 'tessere')} <b>${ps.length}</b></span>` +
    `<span>${t('mirror images', 'immagini speculari')} <b>${nm}</b> (${(100 * nm / ps.length).toFixed(1)}%)</span>` +
    `<span>a : b = <b>${(sh.a / sh.b).toFixed(3)}</b></span>`;
  $('mixlab').style.display = state.shape === 'mix' ? '' : 'none';
  $('mixout').textContent = `${sh.a.toFixed(2)}, ${sh.b.toFixed(2)}`;
}

/* --------------------------------------------------------- the 3D view -- */

let renderer, scene, camera, controls, dirty = true;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  camera.position.set(80, -330, 300);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-1, -2, 3); scene.add(sun);
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.8, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
// the tray, and the tiles in it but for a few lying beside it
let group = null;
function rebuild() {
  const P = pieces({ shape: state.shape, mix: state.mix, count: state.count, size: 150, thick: 3, gap: 0.3 });
  if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
  group = new THREE.Group();
  const geo = m => {
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g0.setIndex(new THREE.BufferAttribute(m.idx, 1));
    const g = g0.toNonIndexed(); g.computeVertexNormals(); return g;
  };
  mats.tray = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  mats.tile = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  mats.mir = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  paint();
  mats.line = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  paint();
  const withEdges = (g, mat) => {
    const o = new THREE.Group();
    o.add(new THREE.Mesh(g, mat), new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), mats.line));
    return o;
  };
  group.add(withEdges(geo(P.tray), mats.tray));
  const out = Math.ceil(P.tiles.length / 4);
  P.tiles.forEach((t, i) => {
    const sub = new THREE.Group();
    for (const m of [t.m, t.dot]) if (m) sub.add(withEdges(geo(m), t.mirrored ? mats.mir : mats.tile));
    if (i >= P.tiles.length - out) {
      // the last ones, the farthest from the centre, out of the tray
      const j = i - (P.tiles.length - out);
      const g = new THREE.Box3().setFromObject(sub), c = g.getCenter(new THREE.Vector3());
      sub.children.forEach(ch => ch.position.set(-c.x, -c.y, 0));
      sub.position.set(P.W / 2 + 22 + (j % 2) * 30, -P.H / 2 + 20 + Math.floor(j / 2) * 32, 0);
      sub.rotation.z = j * 1.3;
    } else sub.position.z = P.floor;
    group.add(sub);
  });
  const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
  group.position.sub(c);
  scene.add(group);
  const r = box.max.distanceTo(box.min) / 2;
  camera.position.set(0, -1.5 * r, 2.6 * r); controls.target.set(0, 0, 0); controls.update();
  dirty = true;
}
const mats = {};
function paint() {
  if (!mats.tray) return;
  mats.tray.color.set(css('--lilac') || '#d4b9eb');
  mats.tile.color.set(css('--accent') || '#7338a8');
  mats.mir.color.set(css('--mir') || '#c79a2e');
  if (mats.line) mats.line.color.set(css('--ink') || '#2e2040');
  dirty = true;
}

function init() {
  const sel = $('shape');
  const names = () => { sel.innerHTML = SHAPES.map(([v, en, it]) => `<option value="${v}"${v === state.shape ? ' selected' : ''}>${t(en, it)}</option>`).join(''); };
  names(); onLang(() => { names(); draw(); });
  $('mix').value = state.mix; $('level').value = state.level; $('mark').checked = state.mark; $('levelout').textContent = state.level;
  setup(); draw(); rebuild();
  sel.addEventListener('change', () => { state.shape = sel.value; toHash(); draw(); rebuild(); });
  $('mix').addEventListener('input', e => { state.mix = +e.target.value; toHash(); draw(); });
  $('mix').addEventListener('change', rebuild);
  $('level').addEventListener('input', e => { state.level = +e.target.value; $('levelout').textContent = state.level; toHash(); draw(); });
  $('mark').addEventListener('change', e => { state.mark = e.target.checked; toHash(); draw(); });
  const panel = printPanel($('print'), {
    size: { value: 110, min: 60, max: 300, what: { en: 'width of the tray', it: 'larghezza del vassoio' } },
    fields: [
      { key: 'count', label: { en: 'tiles', it: 'tessere' }, value: 24, min: 6, max: 80, step: 1 },
      { key: 'thick', label: { en: 'tile, mm', it: 'tessera, mm' }, value: 3, min: 1.6, max: 8, step: 0.1 },
      { key: 'gap', label: { en: 'gap, mm', it: 'gioco, mm' }, value: 0.3, min: 0.1, max: 1, step: 0.05 },
      { key: 'what', type: 'select', label: { en: 'parts', it: 'parti' }, value: 'both',
        options: [{ value: 'both', en: 'tray and tiles', it: 'vassoio e tessere' }, { value: 'tiles', en: 'tiles', it: 'tessere' }, { value: 'tray', en: 'tray', it: 'vassoio' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, an aperiodic monotile puzzle',
    object: 'monotile puzzle',
    share: () => shareUrl(SPEC, state),
    note: info => info.tiles ? `, ${info.tiles} ${t('tiles', 'tessere')}, ${info.mirrored} ${t('mirrored', 'speculari')}` : '',
  });
  // the outline of the puzzle follows the number of tiles of the panel
  const cnt = $('pcount');
  if (cnt) cnt.addEventListener('change', () => { state.count = Math.round(panel.read().count); draw(); rebuild(); });
  onTheme(paint);
}

init();
