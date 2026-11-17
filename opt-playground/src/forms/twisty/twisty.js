// The page of the twisty puzzles: the pieces of the chosen cuts turning in
// 3D (a click on a facelet turns the cap that holds it), the facts of the
// group, and the print panel for the sculpture of the present state.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { SOLIDS, puzzle, play, parseMoves, writeMoves, rotation, apply, sculpture, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  solid: { def: 'dodecahedron', values: Object.keys(SOLIDS) },
  kind: { def: 'vertex', values: ['face', 'vertex', 'edge'] },
  depth: { def: 0.62, min: 0, max: 0.95 },
  mv: { def: '' },
  rev: { def: false },
};
const state = readState(SPEC);
const COLORS = ['#7338a8', '#e3b341', '#d9534f', '#2f8f6f', '#3f7fd0', '#f2f0f5', '#e07a2e', '#b98ee6', '#1f4e79', '#8bc34a',
  '#c2185b', '#00acc1', '#6d4c41', '#fdd835', '#455a64', '#ff8a80', '#7cb342', '#5e35b1', '#26a69a', '#bdbdbd'];
let Z = null, list = [], rot = [], cen = [];

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, root, meshes = [], dirty = true, anim = null, sculpt = null;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(2.6, -4.2, 3.0);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, -3, 4); scene.add(sun);
  root = new THREE.Group(); scene.add(root);
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.9, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(1.65 / Math.sin(camera.fov * Math.PI / 360) * Math.max(1, 1 / camera.aspect)));
    camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const tick = now => {
    if (anim) {
      const u = Math.min(1, (now - anim.t0) / 260), R = rotation(anim.a, anim.th * (u * u * (3 - 2 * u)));
      for (const i of anim.ids) setMatrix(meshes[i], R, rot[i]);
      dirty = true;
      if (u >= 1) { const done = anim.done; anim = null; done(); }
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // a click (not a drag) on a facelet turns the cap that holds it
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || anim || sculpt) return;
    const r = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = ray.intersectObjects(meshes)[0];
    if (!hit) return;
    const i = meshes.indexOf(hit.object), nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    let best = -1, bd = -Infinity;
    Z.axes.forEach((x, j) => {
      const c = cen[i];
      if (c[0] * x.a[0] + c[1] * x.a[1] + c[2] * x.a[2] > x.c) { const d = nrm.x * x.a[0] + nrm.y * x.a[1] + nrm.z * x.a[2]; if (d > bd) { bd = d; best = j; } }
    });
    if (best >= 0) turn(best, !state.rev ^ e.shiftKey);
  });
}

function setMatrix(m, R, Q) {
  const M = R ? multiply(R, Q) : Q;
  m.matrix.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
  m.matrixWorldNeedsUpdate = true;
}
const multiply = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]));

function buildMeshes() {
  for (const m of meshes) { root.remove(m); m.geometry.dispose(); }
  meshes = [];
  Z.pieces.forEach(p => {
    const pos = [], col = [];
    for (const f of p.faces) {
      const c = new THREE.Color(f.label >= 0 ? COLORS[f.label % COLORS.length] : '#2a2238');
      // shrunk a little towards the centre of the piece, to show the cuts
      const q = f.pts.map(v => v.map((x, a) => p.c[a] + 0.975 * (x - p.c[a])));
      for (let i = 1; i + 1 < q.length; i++) for (const v of [q[0], q[i], q[i + 1]]) { pos.push(...v); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true }));
    m.matrixAutoUpdate = false;
    root.add(m); meshes.push(m);
  });
}

function place() { meshes.forEach((m, i) => setMatrix(m, null, rot[i])); dirty = true; }

function turn(axis, inv, quick = false) {
  const x = Z.axes[axis], ids = [];
  cen.forEach((c, i) => { if (c[0] * x.a[0] + c[1] * x.a[1] + c[2] * x.a[2] > x.c) ids.push(i); });
  const th = (inv ? -1 : 1) * 2 * Math.PI / x.k;
  const done = () => {
    const R = rotation(x.a, th);
    for (const i of ids) { rot[i] = multiply(R, rot[i]); cen[i] = apply(R, cen[i]); }
    list.push({ axis, inv }); state.mv = writeMoves(list).slice(-600); writeState(SPEC, state);
    place(); status();
  };
  if (quick) done(); else anim = { a: x.a, th, ids, t0: performance.now(), done };
}

/* ------------------------------------------------------------ the group -- */

let worker = null, orderKey = '', orderText = '';
function computeOrder() {
  const key = `${state.solid}|${state.kind}|${state.depth}`;
  if (key === orderKey) return;
  orderKey = key; orderText = '';
  if (worker) worker.terminate();
  worker = new Worker(new URL('./group-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { if (data.key !== orderKey) return; orderText = data.error ? '' : data.order; facts(); };
  worker.postMessage({ solid: state.solid, kind: state.kind, depth: state.depth, key });
}

function big(s) {
  if (s.length <= 15) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${s[0]}.${s.slice(1, 4)} × 10<sup>${s.length - 1}</sup>`;
}

function facts() {
  const byCount = new Map();
  Z.pieces.forEach(p => { const n = p.faces.filter(f => f.label >= 0).length; byCount.set(n, (byCount.get(n) || 0) + 1); });
  const kinds = [...byCount.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => (n ? t(`${c} with ${n} facelet${n > 1 ? 's' : ''}`, `${c} con ${n} faccett${n > 1 ? 'e' : 'a'}`) : t(`${c} hidden inside`, `${c} nascost${c > 1 ? 'i' : 'o'} dentro`))).join(', ');
  // do two caps share a piece? then the turns interact
  let overlap = false;
  for (const p of Z.pieces) { let c = 0; for (const x of Z.axes) if (p.c[0] * x.a[0] + p.c[1] * x.a[1] + p.c[2] * x.a[2] > x.c) c++; if (c > 1) { overlap = true; break; } }
  const k = Z.axes[0].k, m = Z.axes.length;
  const order = orderText ? big(orderText) : t('computing…', 'calcolo…');
  $('facts').innerHTML = `<dt>${t('axes', 'assi')}</dt><dd>${t(`${m}, each turning by 360°/${k}`, `${m}, ognuno ruota di 360°/${k}`)}</dd>`
    + `<dt>${t('pieces', 'pezzi')}</dt><dd>${Z.pieces.length}: ${kinds}</dd>`
    + `<dt>${t('caps', 'calotte')}</dt><dd>${overlap ? t('they overlap, so that the turns move each other\'s pieces', 'si sovrappongono, così che le rotazioni muovono i pezzi l\'una dell\'altra')
      : t(`disjoint: every turn moves its own pieces only, and the group is the product of ${m} cyclic groups of order ${k}`, `disgiunte: ogni rotazione muove solo i suoi pezzi, e il gruppo è il prodotto di ${m} gruppi ciclici di ordine ${k}`)}</dd>`
    + `<dt>${t('group order', 'ordine del gruppo')}</dt><dd>${order}</dd>`;
}

function status() {
  $('status').textContent = list.length ? t(`${list.length} moves from the start`, `${list.length} mosse dall'inizio`) : t('solved', 'risolto');
}

function legend() {
  const n = SOLIDS[state.solid].normals.length;
  $('legend').innerHTML = Array.from({ length: n }, (_, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${i + 1}</span>`).join('');
}

/* ----------------------------------------------------------- everything -- */

function rebuild() {
  if (state.solid === 'cube' && state.kind === 'face') state.kind = 'vertex';
  $('kind').querySelector('option[value=face]').disabled = state.solid === 'cube';
  for (const id of ['solid', 'kind']) $(id).value = state[id];
  $('depth').value = state.depth; $('depthout').textContent = state.depth.toFixed(2); $('rev').checked = state.rev;
  Z = puzzle(state);
  list = parseMoves(state.mv).filter(m => m.axis < Z.axes.length);
  ({ rot, cen } = play(Z, list));
  writeState(SPEC, state);
  buildMeshes(); place();
  if (sculpt) showSculpture(); legend(); computeOrder(); facts(); status();
}

function showSculpture() {
  for (const m of meshes) m.visible = false;
  if (sculpt && sculpt !== true) { root.remove(sculpt); sculpt.geometry.dispose(); }
  const last = list.length ? list[list.length - 1].axis : 0;
  const m = sculpture(Z, rot, { size: 80, res: 'screen', stroke: 1.4, twistAxis: last, twist: 0 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos.map(v => v / 30), 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals(); g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z);
  sculpt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: css('--accent'), roughness: 0.5 }));
  root.add(sculpt); dirty = true;
}

function init() {
  const sel = $('solid');
  for (const k of Object.keys(SOLIDS)) sel.appendChild(new Option(k, k));
  const names = () => {
    for (const op of sel.options) op.textContent = t(SOLIDS[op.value].en, SOLIDS[op.value].it);
    const kn = { face: t('face-turning', 'a facce'), vertex: t('corner-turning', 'a vertici'), edge: t('edge-turning', 'a spigoli') };
    for (const op of $('kind').options) op.textContent = kn[op.value];
  };
  names();
  setup();
  sel.addEventListener('change', e => { state.solid = e.target.value; state.mv = ''; rebuild(); });
  $('kind').addEventListener('change', e => { state.kind = e.target.value; state.mv = ''; rebuild(); });
  $('depth').addEventListener('input', e => { state.depth = +e.target.value; state.mv = ''; rebuild(); });
  $('rev').addEventListener('change', e => { state.rev = e.target.checked; writeState(SPEC, state); });
  $('scramble').addEventListener('click', () => {
    if (anim) return;
    for (let i = 0; i < 30; i++) turn(Math.floor(Math.random() * Z.axes.length), Math.random() < 0.5, true);
    if (sculpt) showSculpture();
  });
  $('reset').addEventListener('click', () => { state.mv = ''; rebuild(); });
  $('undo').addEventListener('click', () => { if (!list.length || anim) return; list.pop(); state.mv = writeMoves(list); rebuild(); });
  $('sculpt').addEventListener('change', e => {
    if (e.target.checked) { sculpt = true; showSculpture(); }
    else { if (sculpt && sculpt !== true) { root.remove(sculpt); sculpt.geometry.dispose(); } sculpt = null; for (const m of meshes) m.visible = true; dirty = true; }
  });
  printPanel($('print'), {
    size: { value: 80, min: 40, max: 200, what: { en: 'diameter of the sphere around the solid', it: 'diametro della sfera attorno al solido' } },
    fields: [
      { key: 'groove', label: { en: 'groove width, mm', it: 'larghezza dei solchi, mm' }, value: 0.8, min: 0.4, max: 3, step: 0.1 },
      { key: 'deep', label: { en: 'groove depth, mm', it: 'profondità dei solchi, mm' }, value: 1.2, min: 0.4, max: 5, step: 0.1 },
      { key: 'stroke', label: { en: 'digit stroke, mm', it: 'tratto delle cifre, mm' }, value: 1.4, min: 0.6, max: 3, step: 0.1 },
      { key: 'turn', label: { en: 'last cap turned on, °', it: 'ultima calotta girata ancora di, °' }, value: 0, min: 0, max: 72, step: 1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, ...o, twistAxis: list.length ? list[list.length - 1].axis : 0 }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a twisty puzzle sculpture',
    object: 'twisty puzzle',
    note: info => (info.skipped ? `; ${info.skipped} ${t('facelets too small for a number', 'faccette troppo piccole per un numero')}` : ''),
    share: () => shareUrl(SPEC, state),
  });
  rebuild();
  onLang(() => { names(); facts(); status(); });
  onTheme(() => { if (sculpt && sculpt !== true) sculpt.material.color.set(css('--accent')); dirty = true; });
}

init();
