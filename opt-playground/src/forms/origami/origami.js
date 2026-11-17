// The page of origami and kirigami: the crease or cut pattern on a canvas,
// the sheet folding (or opening) in 3D, the printed sheet, and the panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { miuraFlat, miuraFolded, squaresAt, solid, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  pattern: { def: 'miura', values: ['miura', 'squares'] },
  m: { def: 6, min: 2, max: 16, int: true },
  n: { def: 6, min: 2, max: 16, int: true },
  alpha: { def: 70, min: 45, max: 85, int: true },
  ratio: { def: 1, min: 0.5, max: 2 },
  fold: { def: 0.5, min: 0, max: 1 },
  play: { def: true },
  print: { def: false },
};
const state = readState(SPEC);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------- the pattern on paper -- */

// mountain (+1) or valley (-1) of the crease from p to q between the panels
// with normals n1 (left of p -> q) and n2, seen from above
const kind = (p, q, n1, n2) => Math.sign(cross(n1, n2).reduce((s, v, i) => s + v * (q[i] - p[i]), 0));

function drawPattern() {
  const cv = $('flat'), cx = cv.getContext('2d'), W = cv.width = 420, H = cv.height = 420;
  cx.clearRect(0, 0, W, H);
  const ink = css('--accent'), soft = css('--ink-soft');
  if (state.pattern === 'squares') {
    const sq = squaresAt(state, 0, 1), span = Math.max(state.m, state.n), k = (W - 30) / span;
    cx.strokeStyle = ink; cx.lineWidth = 2;
    for (const c of sq) { cx.beginPath(); c.forEach(([x, y], i) => (i ? cx.lineTo(15 + k * (x + 0.5), H - 15 - k * (y + 0.5)) : cx.moveTo(15 + k * (x + 0.5), H - 15 - k * (y + 0.5)))); cx.closePath(); cx.stroke(); }
    // the hinges, as dots on the corners that stay joined
    cx.fillStyle = css('--gold');
    for (let i = 0; i < state.m; i++) for (let j = 0; j < state.n; j++) {
      const c = sq[i * state.n + j];
      if (i + 1 < state.m) { const v = (i + j) % 2 ? c[1] : c[2]; cx.beginPath(); cx.arc(15 + k * (v[0] + 0.5), H - 15 - k * (v[1] + 0.5), 3.5, 0, 7); cx.fill(); }
      if (j + 1 < state.n) { const v = (i + j) % 2 ? c[2] : c[3]; cx.beginPath(); cx.arc(15 + k * (v[0] + 0.5), H - 15 - k * (v[1] + 0.5), 3.5, 0, 7); cx.fill(); }
    }
    return;
  }
  const F = miuraFlat({ ...state, a: state.ratio, b: 1 }), G = miuraFolded({ ...state, a: state.ratio, b: 1 }, 0.5);
  const xs = F.flat().map(v => v[0]), ys = F.flat().map(v => v[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), k = (W - 30) / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const X = v => 15 + k * (v[0] - x0), Y = v => H - 15 - k * (v[1] - y0);
  const nrm = (i, j) => cross(sub(G[i + 1][j], G[i][j]), sub(G[i][j + 1], G[i][j]));
  const line = (a, b, mv) => {
    cx.strokeStyle = mv === 1 ? ink : soft; cx.setLineDash(mv < 0 ? [5, 4] : []); cx.lineWidth = mv === 2 ? 1 : mv > 0 ? 2.2 : 1.6;
    cx.beginPath(); cx.moveTo(X(a), Y(a)); cx.lineTo(X(b), Y(b)); cx.stroke();
  };
  const { m, n } = state;
  for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) {
    // the straight crease from (i, j) up, between panels (i - 1, j) and (i, j)
    if (j < n) line(F[i][j], F[i][j + 1], i > 0 && i < m ? -kind(G[i][j], G[i][j + 1], nrm(i - 1, j), nrm(i, j)) : 2);
    // the zigzag crease from (i, j) right, between panels (i, j - 1) and (i, j)
    if (i < m) line(F[i][j], F[i + 1][j], j > 0 && j < n ? kind(G[i][j], G[i + 1][j], nrm(i, j - 1), nrm(i, j)) : 2);
  }
  cx.setLineDash([]);
}

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, group, dirty = true, fit = () => {};
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
  camera.up.set(0, 0, 1); camera.position.set(-60, -150, 130);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x403050, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-50, -80, 120); scene.add(sun);
  group = new THREE.Group(); scene.add(group);
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.85, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // far enough for the widest sheet (the squares fully open, about 170)
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = (state.pattern === 'squares' ? 95 : 66) / Math.sin(camera.fov * Math.PI / 360) * Math.max(1, 1 / camera.aspect);
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  fit = resize;
  let last = performance.now();
  const tick = now => {
    if (state.play && !state.print) {
      state.fold = (state.fold + (now - last) / 6000) % 2;
      dirty = true; pose();
    }
    last = now;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// quads [[p0, p1, p2, p3], ...] as one geometry, two colors in a checkerboard
function quads(list, parity) {
  const pos = new Float32Array(list.length * 18), col = new Float32Array(list.length * 18);
  const c1 = new THREE.Color(css('--accent')), c2 = new THREE.Color(css('--lilac'));
  list.forEach((q, k) => {
    const c = parity(k) ? c1 : c2;
    [q[0], q[1], q[2], q[0], q[2], q[3]].forEach((p, v) => { pos.set([p[0], p[1], p[2] || 0], 18 * k + 3 * v); col.set([c.r, c.g, c.b], 18 * k + 3 * v); });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function clear() { for (const c of [...group.children]) { group.remove(c); c.geometry.dispose(); } }

// the sheet in its current state: folded panels, or the printed solid
function pose() {
  const f = state.fold > 1 ? 2 - state.fold : state.fold;
  $('foldv').value = f; $('foldout').textContent = f.toFixed(2);
  if (state.print) return;
  if (state.pattern === 'miura') facts();
  clear();
  let list, parity;
  const sc = 120 / Math.max(state.m, state.n);
  if (state.pattern === 'squares') {
    list = squaresAt(state, 45 * f, sc).map(q => q.map(([x, y]) => [x, y, 0]));
    parity = k => (Math.floor(k / state.n) + k % state.n) % 2;
  } else {
    const G = miuraFolded({ ...state, a: state.ratio * sc / 1.4, b: sc / 1.4 }, f);
    list = []; for (let i = 0; i < state.m; i++) for (let j = 0; j < state.n; j++) list.push([G[i][j], G[i + 1][j], G[i + 1][j + 1], G[i][j + 1]]);
    parity = k => (Math.floor(k / state.n) + k % state.n) % 2;
  }
  const g = quads(list, parity);
  g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, flatShading: true }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), new THREE.LineBasicMaterial({ color: css('--ink') }));
  group.add(mesh, edges); dirty = true;
}

function printed() {
  clear();
  const m = solid({ ...state, size: 120 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, 0);
  const nonIndexed = g.toNonIndexed(); nonIndexed.computeVertexNormals();
  group.add(new THREE.Mesh(nonIndexed, new THREE.MeshStandardMaterial({ color: css('--accent'), roughness: 0.5, flatShading: true })));
  g.dispose(); dirty = true;
}

/* ----------------------------------------------------------- everything -- */

function facts() {
  const { m, n, alpha, ratio } = state;
  let s;
  if (state.pattern === 'squares') {
    s = t(`${m} × ${n} squares; each turns by ±θ about its centre, the sign alternating like the colors of a chessboard, and the sheet grows by the factor cos θ + sin θ in both directions, up to √2 = 1.41 at θ = 45°. Since it grows as much across as along, its Poisson's ratio is −1.`,
      `${m} × ${n} quadrati; ognuno ruota di ±θ attorno al suo centro, con il segno alternato come i colori di una scacchiera, e il foglio cresce del fattore cos θ + sin θ in entrambe le direzioni, fino a √2 = 1.41 a θ = 45°. Poiché cresce di traverso quanto per lungo, il suo coefficiente di Poisson è −1.`);
  } else {
    // the footprint of a cell, folded against flat: (S / b sin alpha) (L / a)
    const f = Math.min(0.999, state.fold > 1 ? 2 - state.fold : state.fold), sa = Math.sin(alpha * Math.PI / 180);
    const Hh = f * ratio * sa, L = Math.sqrt(ratio * ratio - Hh * Hh), V = ratio * Math.cos(alpha * Math.PI / 180) / L, S = Math.sqrt(Math.max(0, 1 - V * V));
    const area = 100 * (S / sa) * (L / ratio);
    s = t(`${m} × ${n} parallelograms with sides ${ratio.toFixed(2)} and 1 and angle α = ${alpha}°; four creases meet at every inner vertex, three of one kind and one of the other, and the angles opposite each other add up to 180° (Kawasaki), so that the vertex folds flat. One number, the fold, sets the whole shape: the sheet shrinks in both directions at once, at the fold shown it covers ${area.toFixed(0)}% of its flat area, and its Poisson's ratio in the plane is negative.`,
      `${m} × ${n} parallelogrammi di lati ${ratio.toFixed(2)} e 1 e angolo α = ${alpha}°; in ogni vertice interno si incontrano quattro pieghe, tre di un tipo e una dell'altro, e gli angoli opposti sommano a 180° (Kawasaki), così che il vertice si piega in piano. Un solo numero, la piegatura, fissa tutta la forma: il foglio si restringe in entrambe le direzioni insieme, alla piegatura mostrata copre il ${area.toFixed(0)}% della sua area distesa, e il suo coefficiente di Poisson nel piano è negativo.`);
  }
  $('facts').textContent = s;
  for (const op of $('pattern').options) op.textContent = op.value === 'miura' ? 'Miura-ori' : t('rotating squares (kirigami)', 'quadrati rotanti (kirigami)');
}

function refresh({ view = true } = {}) {
  for (const id of ['pattern', 'm', 'n', 'alpha', 'ratio']) $(id).value = state[id];
  $('mout').textContent = state.m; $('nout').textContent = state.n; $('alphaout').textContent = state.alpha + '°'; $('ratioout').textContent = state.ratio.toFixed(2);
  $('play').checked = state.play; $('printed').checked = state.print;
  for (const id of ['alphalab', 'ratiolab']) $(id).hidden = state.pattern !== 'miura';
  document.body.classList.toggle('kiri', state.pattern === 'squares');
  writeState(SPEC, state);
  facts(); drawPattern();
  if (view) { if (state.print) printed(); else pose(); }
}

function init() {
  setup();
  $('pattern').addEventListener('change', e => { state.pattern = e.target.value; fit(); refresh(); });
  for (const id of ['m', 'n', 'alpha', 'ratio']) $(id).addEventListener('input', e => { state[id] = +e.target.value; refresh(); });
  $('foldv').addEventListener('input', e => { state.fold = +e.target.value; state.play = false; $('play').checked = false; writeState(SPEC, state); pose(); });
  $('play').addEventListener('change', e => { state.play = e.target.checked; writeState(SPEC, state); });
  $('printed').addEventListener('change', e => { state.print = e.target.checked; refresh(); });
  printPanel($('print'), {
    size: { value: 150, min: 40, max: 300, what: { en: 'longest side of the flat sheet', it: 'lato maggiore del foglio disteso' } },
    fields: [
      { key: 'thick', label: { en: 'panels, mm', it: 'pannelli, mm' }, value: 2, min: 1, max: 5, step: 0.1 },
      { key: 'film', label: { en: 'hinge film, mm (Miura)', it: 'film delle cerniere, mm (Miura)' }, value: 0.4, min: 0.2, max: 1, step: 0.05 },
      { key: 'gap', label: { en: 'gap at the hinge, mm (Miura)', it: 'fessura alla cerniera, mm (Miura)' }, value: 0.8, min: 0.4, max: 3, step: 0.1 },
      { key: 'limit', label: { en: 'turn per crease, ° (Miura)', it: 'rotazione per piega, ° (Miura)' }, value: 120, min: 60, max: 150, step: 5 },
      { key: 'cut', label: { en: 'cut, mm (kirigami)', it: 'taglio, mm (kirigami)' }, value: 1, min: 0.5, max: 4, step: 0.1 },
      { key: 'neck', label: { en: 'neck, mm (kirigami)', it: 'collo, mm (kirigami)' }, value: 1, min: 0.5, max: 4, step: 0.1 },
    ],
    build: o => solid({ ...state, ...o }),
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a foldable sheet',
    object: 'foldable sheet',
    note: info => (info.panel ? `; ${t('panel side', 'lato del pannello')} ${info.panel} mm, ${t('turn per crease', 'rotazione per piega')} ${info.turn}°` : info.square ? `; ${t('square side', 'lato del quadrato')} ${info.square} mm` : ''),
    share: () => shareUrl(SPEC, { ...state, fold: Math.min(1, state.fold > 1 ? 2 - state.fold : state.fold) }),
  });
  refresh();
  onLang(facts);
  onTheme(() => { drawPattern(); refresh(); });
}

init();
