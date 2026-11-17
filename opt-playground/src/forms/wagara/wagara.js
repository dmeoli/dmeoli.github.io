// The page of the Japanese patterns: four copies of the tile side by side
// on a canvas, with the cell of the lattice and the motif that the group
// copies, the relief in 3D, and the print panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { PATTERNS, distance, tileUnits, solid, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  pattern: { def: 'asanoha', values: Object.keys(PATTERNS) },
  repeats: { def: 3, min: 1, max: 8, int: true },
  rings: { def: 4, min: 2, max: 7, int: true },
  inner: { def: 0.72, min: 0, max: 0.9 },
  shape: { def: 'tile', values: ['tile', 'square', 'round'] },
  cell: { def: true },
};
const state = readState(SPEC);

/* --------------------------------------------------- the tiles on paper -- */

const cv = $('flat'), cx = cv.getContext('2d');
const rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const v = m ? parseInt(m[1], 16) : 0x7338a8; return [v >> 16, (v >> 8) & 255, v & 255]; };
function draw() {
  const P = PATTERNS[state.pattern], o = { rings: state.rings, inner: state.inner }, D = distance(P, o);
  const [W, H] = tileUnits(P, state.repeats), N = 2;
  const px = 420, scale = px / (N * Math.max(W, H)), w = Math.round(N * W * scale), h = Math.round(N * H * scale);
  cv.width = w; cv.height = h;
  const img = cx.createImageData(w, h), ink = rgb(css('--accent')), bg = rgb(css('--panel'));
  const half = 0.035 * Math.max(1, 3 / state.repeats) * W / 3;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = D((i + 0.5) / scale, (h - j - 0.5) / scale), a = Math.max(0, Math.min(1, (half - d) * scale + 0.5)), o4 = 4 * (j * w + i);
    for (let c = 0; c < 3; c++) img.data[o4 + c] = bg[c] + (ink[c] - bg[c]) * a;
    img.data[o4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const X = x => x * scale, Y = y => h - y * scale;
  // the borders of the four tiles
  cx.setLineDash([6, 5]); cx.strokeStyle = css('--ink-soft'); cx.lineWidth = 1;
  for (let k = 1; k < N; k++) { cx.beginPath(); cx.moveTo(X(k * W), 0); cx.lineTo(X(k * W), h); cx.moveTo(0, Y(k * H)); cx.lineTo(w, Y(k * H)); cx.stroke(); }
  cx.setLineDash([]);
  if (!state.cell) return;
  // a cell of the lattice, the fundamental domain and the motif in it
  const [t1, t2] = P.lattice, ox = W * 0.5, oy = H * 0.5;
  const gold = css('--gold') || '#6c5920';
  cx.strokeStyle = gold; cx.lineWidth = 1.5;
  cx.beginPath();
  [[0, 0], t1, [t1[0] + t2[0], t1[1] + t2[1]], t2].forEach(([x, y], i) => (i ? cx.lineTo(X(ox + x), Y(oy + y)) : cx.moveTo(X(ox + x), Y(oy + y))));
  cx.closePath(); cx.stroke();
  cx.fillStyle = gold; cx.globalAlpha = 0.28;
  cx.beginPath();
  P.domain.forEach(([x, y], i) => (i ? cx.lineTo(X(ox + x), Y(oy + y)) : cx.moveTo(X(ox + x), Y(oy + y))));
  cx.closePath(); cx.fill(); cx.globalAlpha = 1;
  cx.lineWidth = 3; cx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of P.motif(o)) { cx.beginPath(); cx.moveTo(X(ox + x1), Y(oy + y1)); cx.lineTo(X(ox + x2), Y(oy + y2)); cx.stroke(); }
}

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, obj, dirty = true;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
  camera.up.set(0, 0, 1); camera.position.set(0, -105, 130);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x403050, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-60, -40, 90); scene.add(sun);
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const tick = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function rebuild3d() {
  const m = solid({ ...state, size: 90, line: 1.2, res: 'screen' });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals(); g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, 0);
  if (obj) { scene.remove(obj); obj.geometry.dispose(); }
  obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: css('--accent') || '#7338a8', roughness: 0.5 }));
  scene.add(obj); dirty = true;
}

/* ----------------------------------------------------------- everything -- */

const GROUPS = {
  p6m: { en: 'rotations by 60° about the lattice points, by 120° about the centres of the triangles, by 180° about the midpoints of the edges, and mirrors through all of them', it: 'rotazioni di 60° attorno ai punti del reticolo, di 120° attorno ai centri dei triangoli, di 180° attorno ai punti medi dei lati, e specchi per tutti questi punti' },
  p4m: { en: 'rotations by 90° about the lattice points and the centres of the squares, by 180° about the midpoints of the sides, and mirrors along the sides and the diagonals', it: 'rotazioni di 90° attorno ai punti del reticolo e ai centri dei quadrati, di 180° attorno ai punti medi dei lati, e specchi lungo i lati e le diagonali' },
  pmg: { en: 'parallel mirrors along the middle of each column, half turns on the lines between the columns, and glide reflections perpendicular to the mirrors', it: 'specchi paralleli lungo il mezzo di ogni colonna, mezzi giri sulle linee fra le colonne e glissoriflessioni perpendicolari a esse' },
  cm: { en: 'mirrors through the centres of the fans, and glide reflections halfway between them; no rotation, since each fan hides the one above it', it: 'specchi per i centri dei ventagli e glissoriflessioni a metà fra l\'uno e l\'altro; nessuna rotazione, perché ogni ventaglio nasconde quello sopra' },
};
function facts() {
  const P = PATTERNS[state.pattern], g = GROUPS[P.group];
  $('facts').innerHTML = `<dt>${t('group', 'gruppo')}</dt><dd>${P.group} (${t('orbifold', 'orbifold')} ${P.orbifold})</dd>`
    + `<dt>${t('symmetries', 'simmetrie')}</dt><dd>${t(g.en, g.it)}</dd>`
    + `<dt>${t('motif', 'motivo')}</dt><dd>${t(`${P.motif({ rings: state.rings, inner: state.inner }).length} segments in the shaded domain, copied ${P.ops.length} times by the point group and then by the lattice`,
      `${P.motif({ rings: state.rings, inner: state.inner }).length} segmenti nel dominio ombreggiato, copiati ${P.ops.length} volte dal gruppo di punto e poi dal reticolo`)}</dd>`;
  const sel = $('pattern');
  for (const op of sel.options) op.textContent = t(PATTERNS[op.value].en, PATTERNS[op.value].it);
  const sh = { tile: t('seamless tile', 'piastrella continua'), square: t('framed square', 'quadrato con cornice'), round: t('round coaster', 'sottobicchiere tondo') };
  for (const op of $('shape').options) op.textContent = sh[op.value];
}

function refresh({ view = true } = {}) {
  for (const id of ['pattern', 'repeats', 'rings', 'shape']) $(id).value = state[id];
  $('inner').value = state.inner; $('cell').checked = state.cell;
  $('repeatsout').textContent = state.repeats; $('ringsout').textContent = state.rings; $('innerout').textContent = state.inner;
  $('ringslab').hidden = state.pattern !== 'seigaiha'; $('innerlab').hidden = state.pattern !== 'kikko';
  writeState(SPEC, state);
  facts(); draw();
  if (view) rebuild3d();
}

function init() {
  const sel = $('pattern');
  for (const k of Object.keys(PATTERNS)) sel.appendChild(new Option(k, k));
  setup();
  sel.addEventListener('change', e => { state.pattern = e.target.value; refresh(); });
  $('shape').addEventListener('change', e => { state.shape = e.target.value; refresh(); });
  for (const id of ['repeats', 'rings', 'inner']) $(id).addEventListener('input', e => { state[id] = +e.target.value; refresh(); });
  $('cell').addEventListener('change', e => { state.cell = e.target.checked; refresh({ view: false }); });
  printPanel($('print'), {
    size: { value: 90, min: 30, max: 250, what: { en: 'width of the tile', it: 'larghezza della piastrella' } },
    fields: [
      { key: 'line', label: { en: 'line width, mm', it: 'larghezza delle linee, mm' }, value: 1.2, min: 0.6, max: 4, step: 0.1 },
      { key: 'height', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 1.2, min: 0.4, max: 4, step: 0.1 },
      { key: 'base', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2.4, min: 1.2, max: 8, step: 0.1 },
      { key: 'border', label: { en: 'frame, mm', it: 'cornice, mm' }, value: 4, min: 1, max: 15, step: 0.5 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a wagara relief tile',
    object: 'wagara tile',
    share: () => shareUrl(SPEC, state),
  });
  refresh();
  onLang(facts);
  onTheme(() => { if (obj) obj.material.color.set(css('--accent')); dirty = true; draw(); });
}

init();
