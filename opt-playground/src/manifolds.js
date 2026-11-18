// Scene G: the hidden layers of a network as a deformation of the plane, after
// C. Olah, "Neural Networks, Manifolds, and Topology" (2014),
// https://colah.github.io/posts/2014-03-NN-Manifolds-Topology/ (the idea, rebuilt
// from its equations; no figure or code of the post is used).
// A network 2 -> (w) x L -> 1, w = 2 or 3, is trained in the page. A layer
// z -> act(W z + b) is shown as a continuous deformation in three phases: the
// linear map (1-s) z + s W z, the translation + s b, the activation
// (1-s) u + s act(u). With tanh and det W > 0 every phase is a homeomorphism, so
// a layer of width 2 can bend the plane but never tear it: the disc inside the
// ring cannot be separated, however long one trains. With w = 3 the plane is
// laid in space (z = 0) and the disc can be lifted out of the ring, after which
// a plane separates them.

import { forward, rng } from './nn.js';
import * as M from './manifolds-model.js';
import { THREE, stage3d, axes, tok, onTheme } from './stage3d-b.js';
import { setTex } from './tex.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { data: 'curves', width: 2, layers: 2, act: 'tanh', seed: 3, T: 0 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });

let net, pts, timer = null, morph = null, epoch = 0;
function reset() {
  stopTrain();
  net = M.makeNet(S.width, S.layers, S.act, S.seed);
  pts = M.makeData(S.data, rng(S.seed * 31 + 7));
  $('hidden').hidden = S.width === 3; $('hidden3d').hidden = S.width !== 3; view = null; g3 = null;
  epoch = 0; S.T = Math.min(S.T, 3 * S.layers);
  $('T').max = 3 * S.layers;
  save(); draw();
}

function trainEpoch() { M.trainEpoch(net, pts, epoch); epoch++; }
const layerParams = k => M.layerParams(net, k);
const deform = (p, T) => M.deform(net, S.act, p, T);

// ------------------------------------------------------------------ drawing
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function plane(cv, map, bounds, region) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const [x0, x1, y0, y1] = bounds, X = x => (x - x0) / (x1 - x0) * W, Y = y => H - (y - y0) / (y1 - y0) * H;
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, W, H);
  if (region) {                         // the decision of the network over the input plane,
    const n = 64, img = new ImageData(n, n);  // drawn as a small image scaled smoothly
    const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), A = hex(css('--accent')), G = hex(css('--gold')), B = hex(css('--ground'));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -1.2 + 2.4 * (i + 0.5) / n, y = 1.2 - 2.4 * (j + 0.5) / n, o = forward(net, [x, y]), c = o > 0 ? A : G, a = 0.1 + 0.3 * Math.abs(o), k = 4 * (j * n + i);
      for (let t = 0; t < 3; t++) img.data[k + t] = B[t] + a * (c[t] - B[t]);
      img.data[k + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = off.height = n; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
  }
  // the grid of the input plane, carried by the deformation
  ctx.strokeStyle = css('--ink-soft'); ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  for (let i = -6; i <= 6; i++) for (const dir of [0, 1]) {
    ctx.beginPath();
    for (let j = 0; j <= 60; j++) {
      const t = -1.2 + 2.4 * j / 60, c = i * 0.2, q = map(dir ? [c, t] : [t, c]);
      j ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1]));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of pts) {
    const q = map([p.x, p.y]);
    ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 3, 0, 2 * Math.PI);
    ctx.fillStyle = p.label > 0 ? css('--accent') : css('--gold'); ctx.fill();
    ctx.strokeStyle = css('--ground'); ctx.lineWidth = 1; ctx.stroke();
  }
  return { X, Y };
}

let view = null;                         // the frame of the right plane, eased
function draw() {
  plane($('input'), p => p, [-1.2, 1.2, -1.2, 1.2], true);
  const qs = pts.map(p => deform([p.x, p.y], S.T));
  let m = 1.1;
  for (const q of qs) for (const c of q) m = Math.max(m, Math.abs(c) * 1.1);
  view = view === null ? m : view + 0.3 * (m - view);
  const end = S.T >= 3 * S.layers - 1e-9;
  if (S.width === 3) draw3d(qs, end);
  else {
    const f = plane($('hidden'), p => deform(p, S.T), [-view, view, -view, view], false);
    // in the space of the last layer the output unit is a line w.h + b = 0
    if (end) {
      const o = net.at(-1)[0], w = o.inputs.map(l => l.w), b = o.bias, ctx = $('hidden').getContext('2d');
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      if (Math.abs(w[1]) > Math.abs(w[0])) { ctx.moveTo(f.X(-view), f.Y((-b + w[0] * view) / w[1])); ctx.lineTo(f.X(view), f.Y((-b - w[0] * view) / w[1])); }
      else { ctx.moveTo(f.X((-b + w[1] * view) / w[0]), f.Y(-view)); ctx.lineTo(f.X((-b - w[1] * view) / w[0]), f.Y(view)); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  const k = Math.min(Math.floor(S.T / 3), S.layers - 1), loc = S.T - 3 * k;
  const actTex = S.act === 'tanh' ? '\\(\\tanh\\)' : '\\(\\mathrm{ReLU}\\)';
  const phase = S.T >= 3 * S.layers ? t(`the last hidden layer, where the output unit draws a ${S.width === 3 ? 'plane (translucent)' : 'line (dashed)'}`,
    `l'ultimo strato nascosto, dove l'unità di uscita traccia ${S.width === 3 ? 'un piano (traslucido)' : 'una retta (tratteggiata)'}`) :
    `${t('layer', 'strato')} ${k + 1}, ${[t('the linear map \\(W\\)', 'la trasformazione lineare \\(W\\)'), t('the translation \\(b\\)', 'la traslazione \\(b\\)'), t(`the activation ${actTex}`, `l'attivazione ${actTex}`)][Math.min(2, Math.floor(loc))]}`;
  const { W } = layerParams(k), det = M.det(W);
  // the formulas are typeset only when they change, the number is plain text
  setTex($('phase'), phase);
  if (S.width === 3 && k === 0) {
    setTex($('detW'), t('\\(W_1\\) is \\(3 \\times 2\\): it maps the plane onto a plane in space', '\\(W_1\\) è \\(3 \\times 2\\): manda il piano su un piano nello spazio'));
    $('det').textContent = ''; $('detNeg').textContent = '';
  } else {
    setTex($('detW'), `\\(\\det W_${k + 1} =\\) `);
    $('det').textContent = det.toFixed(3);
    $('detNeg').textContent = det < 0 ? t(` (negative: a reflection, not reachable by a continuous deformation of the ${S.width === 3 ? 'space' : 'plane'})`,
      ` (negativo: una riflessione, che nessuna deformazione continua ${S.width === 3 ? 'dello spazio' : 'del piano'} raggiunge)`) : '';
  }
  let ok = 0; for (const p of pts) if (Math.sign(forward(net, [p.x, p.y])) === p.label) ok++;
  $('acc').textContent = `${(100 * ok / pts.length).toFixed(1)}%`;
  $('epoch').textContent = epoch;
  $('Tv').textContent = S.T.toFixed(2);
}

// ------------------------------------------------------------ width 3, in space
// the content (points, grid, the sheet of the plane, the separating plane) lives
// in [-view, view]^3 and is scaled into the cube [-1, 1]^3 where the axes are
let st = null, g3 = null, axesView = 0;
const NG = 24, GRID = 13, GS = 60;
function build3d() {
  if (!st) st = stage3d($('hidden3d'), { position: [3.7, -4.6, 3.2], label: 'hidden space' });
  st.clear();
  const T = THREE, content = new T.Group();
  const ball = new T.SphereGeometry(0.022, 10, 8);
  const dots = new T.InstancedMesh(ball, new T.MeshLambertMaterial(), pts.length);
  const A = tok('--accent'), G = tok('--gold');
  pts.forEach((p, i) => dots.setColorAt(i, p.label > 0 ? A : G));
  const grid = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: tok('--ink-soft'), transparent: true, opacity: 0.4 }));
  grid.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(GRID * 2 * GS * 6), 3));
  const sheetGeo = new T.PlaneGeometry(2.4, 2.4, NG, NG);
  sheetGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(sheetGeo.attributes.position.count * 3), 3));
  const sheet = new T.Mesh(sheetGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }));
  const clip = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(n => new T.Plane(new T.Vector3(...n), 1));
  const sep = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: tok('--accent'), side: T.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false, clippingPlanes: clip }));
  const sepEdge = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1, 8, 8)), new T.LineBasicMaterial({ color: tok('--accent'), transparent: true, opacity: 0.35, clippingPlanes: clip }));
  const sepG = new T.Group(); sepG.add(sep, sepEdge);
  content.add(sheet, grid, dots, sepG);
  const ax = new T.Group();
  st.group.add(content, ax);
  g3 = { content, dots, grid, sheet, sepG, ax };
  axesView = 0;
}
function draw3d(qs, end) {
  if (!g3) build3d();
  const T = THREE, { content, dots, grid, sheet, sepG, ax } = g3, mat = new T.Matrix4();
  content.scale.setScalar(1 / view);
  qs.forEach((q, i) => dots.setMatrixAt(i, mat.makeScale(view, view, view).setPosition(q[0], q[1], q[2])));
  dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  // the grid of the input plane, carried by the deformation
  const gp = grid.geometry.attributes.position.array; let o = 0;
  for (let i = -6; i <= 6; i++) for (const dir of [0, 1]) {
    let prev = null;
    for (let j = 0; j <= GS; j++) {
      const t = -1.2 + 2.4 * j / GS, c = i * 0.2, q = deform(dir ? [c, t] : [t, c], S.T);
      if (prev) { gp.set(prev, o); gp.set(q, o + 3); o += 6; }
      prev = q;
    }
  }
  grid.geometry.attributes.position.needsUpdate = true; grid.geometry.computeBoundingSphere();
  // the sheet of the input plane, tinted by the decision of the network
  const sp = sheet.geometry.attributes.position, sc = sheet.geometry.attributes.color;
  const hex = c => new T.Color(c), Ac = hex(css('--accent')), Gc = hex(css('--gold')), Bc = hex(css('--ground')), tmp = new T.Color();
  for (let q = 0; q < sp.count; q++) {
    const x = -1.2 + 2.4 * (q % (NG + 1)) / NG, y = 1.2 - 2.4 * Math.floor(q / (NG + 1)) / NG, z = deform([x, y], S.T), out = forward(net, [x, y]);
    sp.setXYZ(q, z[0], z[1], z[2]);
    tmp.copy(Bc).lerp(out > 0 ? Ac : Gc, 0.25 + 0.5 * Math.abs(out)); sc.setXYZ(q, tmp.r, tmp.g, tmp.b);
  }
  sp.needsUpdate = true; sc.needsUpdate = true; sheet.geometry.computeBoundingSphere();
  // the output unit in the last layer: the plane w.h + b = 0, cut by the cube
  sepG.visible = end;
  if (end) {
    const out = net.at(-1)[0], w = new T.Vector3(...out.inputs.map(l => l.w)), n2 = w.lengthSq() || 1;
    sepG.position.copy(w.clone().multiplyScalar(-out.bias / n2));
    sepG.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), w.clone().normalize());
    sepG.scale.setScalar(8 * view);
  }
  // the axes, named with the half-width of the view
  if (Math.abs(view - axesView) > 0.02 * view) {
    st.clear(ax); axesView = view;
    const v = view.toFixed(2);
    ax.add(axes({ x: [-1, 1, `h\u2081 \u00b1${v}`], y: [-1, 1, `h\u2082 \u00b1${v}`], z: [-1, 1, `h\u2083 \u00b1${v}`] }));
  }
  st.render();
}
onTheme(() => { g3 = null; draw(); });

function save() { history.replaceState(null, '', '#' + new URLSearchParams({ data: S.data, width: S.width, layers: S.layers, act: S.act, seed: S.seed, T: S.T.toFixed(2) })); }
function stopTrain() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function stopMorph() { clearInterval(morph); morph = null; $('morph').textContent = t('Animate', 'Anima'); }

$('data').value = S.data; $('width').value = S.width; $('layers').value = S.layers; $('act').value = S.act; $('T').max = 3 * S.layers; $('T').value = S.T;
$('data').onchange = e => { S.data = e.target.value; reset(); };
$('layers').onchange = e => { S.layers = +e.target.value; reset(); };
$('width').onchange = e => { S.width = +e.target.value; reset(); };
$('act').onchange = e => { S.act = e.target.value; reset(); };
$('seed').onclick = () => { S.seed++; reset(); };
$('T').oninput = e => { stopMorph(); S.T = +e.target.value; save(); draw(); };
$('reset').onclick = reset;
$('step').onclick = () => { trainEpoch(); draw(); };
$('play').onclick = () => {
  if (timer) return stopTrain();
  $('play').textContent = t('Pause', 'Pausa');
  timer = setInterval(() => { for (let i = 0; i < 2; i++) trainEpoch(); draw(); }, 40);
};
$('morph').onclick = () => {
  if (morph) return stopMorph();
  $('morph').textContent = t('Pause', 'Pausa');
  if (S.T >= 3 * S.layers) S.T = 0;
  morph = setInterval(() => {
    S.T = Math.min(3 * S.layers, S.T + 0.04); $('T').value = S.T;
    if (S.T >= 3 * S.layers) stopMorph();
    save(); draw();
  }, 40);
};
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') $('step').click();
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
});
// the texts of the language: the title, the options of the selects, the buttons
const OPTS = {
  data: { curves: ['Two curves', 'Due curve'], spiral: ['Two spirals', 'Due spirali'], xor: ['XOR', 'XOR'], ring: ['Disc inside a ring', "Disco dentro un anello"] },
  act: { tanh: ['tanh', 'tanh'], relu: ['ReLU (folds the plane)', 'ReLU (piega il piano)'] },
};
function words() {
  document.title = t('Manifolds playground', 'Laboratorio delle varietà');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = t(...o[op.value]);
  $('seed').textContent = t('New weights', 'Nuovi pesi');
  $('reset').textContent = t('Reset', 'Ricomincia'); $('step').textContent = t('Step', 'Passo');
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('morph').textContent = morph ? t('Pause', 'Pausa') : t('Animate', 'Anima');
}
onLang(() => { words(); draw(); });
words();
reset();
