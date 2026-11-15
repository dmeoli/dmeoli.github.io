// Scene C in three variables: the polytope of max c.x, A x <= b, x >= 0, drawn
// in 3D; the simplex walking its edges (Dantzig's or Bland's rule) with the
// basis and the reduced costs, the barrier method along the central path, the
// level plane c.x = z following the current point. The algebra is in
// lp3-core.js, checked against vertex enumeration by tests/lp3d.html.

import * as THREE from 'three';
import { stage3d, rod, ball, clear, label } from './stage3d.js';
import { instances, randomInstance, geometry, simplex, barrier, bruteOpt, dot, varName, cons } from './lp3-core.js';
import { setTex } from './tex.js';

const $ = id => document.getElementById(id);
const fmt = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(3));
const vec = x => `(${x.map(fmt).join(', ')})`;
let P, Geo, opt, sc, steps, B, k = 0, timer = null, seed = 7;
let mode = 'simplex', rule = 'dantzig';
// the moving point: a polyline in display coordinates, run through in `dur` s
let anim = null, here = [0, 0, 0];

const S = stage3d($('stage'), { camera: [3.0, 2.15, 1.85], target: [0.45, 0.45, 0.38], aspect: 0.85, onTheme: build, onFrame });
const fixed = new THREE.Group(), moving = new THREE.Group();
S.content.add(fixed, moving);
let marker = null, level = null;

// display coordinates: every axis to [0, 1] when the extents differ a lot (the
// Klee-Minty cube spans 5, 25 and 125), one common scale otherwise
const D = x => x.map((v, j) => v / sc[j]);
const X = u => u.map((v, j) => v * sc[j]);

function load() {
  stop();
  const key = $('inst').value;
  P = instances[key].random ? randomInstance(seed, 5) : instances[key];
  $('regen').hidden = !instances[key].random;
  Geo = geometry(P); opt = bruteOpt(P);
  const ext = [0, 1, 2].map(j => Math.max(1e-9, ...Geo.V.map(v => v.x[j])));
  sc = Math.max(...ext) / Math.min(...ext) > 3 ? ext : ext.map(() => Math.max(...ext));
  build();
  reset();
}

function reset() {
  stop();
  k = 0; anim = null;
  if (mode === 'simplex') { steps = simplex(P, rule); here = D(steps[0].x); }
  else { B = barrier(P, { tol: 1e-6 }); here = D(B.dense[0].x); }
  drawPath(); show();
}

// the parts that do not move: faces, edges, vertices, optimum, objective, axes
function build() {
  if (!P) return;
  clear(fixed);
  const col = S.colors;
  const pos = [];
  for (const f of Geo.faces) {
    const p = f.poly.map(i => D(Geo.V[i].x));
    for (let t = 1; t + 1 < p.length; t++) pos.push(...p[0], ...p[t], ...p[t + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  fixed.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col.accent2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
  const em = new THREE.MeshBasicMaterial({ color: col.accent2 });
  for (const [i, j] of Geo.edges) fixed.add(rod(D(Geo.V[i].x), D(Geo.V[j].x), 0.005, em));
  const vm = new THREE.MeshLambertMaterial({ color: col.soft });
  for (const v of Geo.V) fixed.add(ball(D(v.x), 0.013, vm));
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), new THREE.MeshLambertMaterial({ color: col.accent, emissive: col.accent, emissiveIntensity: 0.3 }));
  star.position.set(...D(opt.x));
  fixed.add(star);
  // the objective: the gradient of c.x in display coordinates, c_j sc_j
  const dc = new THREE.Vector3(...P.c.map((v, j) => v * sc[j])).normalize();
  const a0 = new THREE.Vector3(1.0, -0.25, 0.1), a1 = a0.clone().addScaledVector(dc, 0.32);
  const am = new THREE.MeshBasicMaterial({ color: col.ink });
  fixed.add(rod(a0.toArray(), a1.toArray(), 0.008, am));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 14), am);
  head.position.copy(a1); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dc);
  fixed.add(head);
  const cl = label('c', col.ink, 0.07); cl.position.copy(a1).addScaledVector(dc, 0.08); fixed.add(cl);
  // the extent of each axis, as a tick value
  for (let j = 0; j < 3; j++) {
    const e = [0, 0, 0]; e[j] = 1;
    const t = label(fmt(sc[j]), col.soft, 0.06);
    t.position.set(...e.map((v, d) => v + (d === 2 && j !== 2 ? -0.05 : 0) + (j === 2 && d === 0 ? -0.07 : 0)));
    fixed.add(t);
  }
  S.setAxes({ origin: [0, 0, 0], ends: [[1.25, 0, 0], [0, 1.25, 0], [0, 0, 1.2]], names: ['x1', 'x2', 'x3'], size: 0.09 });
  drawPath();
}

// the parts that follow the method: the trail, the central path, the marker
function drawPath() {
  clear(moving);
  if (!P || (mode === 'simplex' ? !steps : !B)) return;
  const col = S.colors;
  marker = ball(here, 0.03, new THREE.MeshLambertMaterial({ color: col.gold, emissive: col.gold, emissiveIntensity: 0.35 }));
  moving.add(marker);
  const tm = new THREE.MeshLambertMaterial({ color: col.accent });
  if (mode === 'simplex') {
    // the edges walked so far, the last one up to the moving point
    const pts = steps.slice(0, k + 1).map(s => D(s.x));
    if (anim) pts[pts.length - 1] = here;
    for (let i = 0; i + 1 < pts.length; i++) moving.add(rod(pts[i], pts[i + 1], 0.012, tm));
    pts.forEach(p => moving.add(ball(p, 0.018, tm)));
  } else {
    const curve = B.dense.map(p => new THREE.Vector3(...D(p.x)));
    moving.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve), 200, 0.006, 8, false),
      new THREE.MeshLambertMaterial({ color: col.ink, transparent: true, opacity: 0.35 })));
    const idx = B.iters.slice(0, k + 1).map(i => B.dense[i].x);
    idx.forEach(x => moving.add(ball(D(x), 0.016, tm)));
    const ac = ball(D(B.dense[0].x), 0.022, new THREE.MeshLambertMaterial({ color: col.soft }));
    moving.add(ac);
  }
  level = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: col.gold, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  moving.add(level);
  placeLevel();
}

// the plane c.x = z through the moving point, cut by a box a little larger
// than the polytope
function placeLevel() {
  if (!level) return;
  level.visible = $('level').checked;
  const n = P.c.map((v, j) => v * sc[j]), d = dot(n, here), lo = -0.05, hi = 1.12, pts = [];
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => [b & 1 ? hi : lo, b & 2 ? hi : lo, b & 4 ? hi : lo]);
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const diff = corners[a].filter((v, i) => v !== corners[b][i]).length;
    if (diff !== 1) continue;
    const fa = dot(n, corners[a]) - d, fb = dot(n, corners[b]) - d;
    if (fa * fb > 0 || fa === fb) continue;
    const t = fa / (fa - fb);
    pts.push(corners[a].map((v, i) => v + t * (corners[b][i] - v)));
  }
  if (pts.length < 3) { level.geometry.dispose(); level.geometry = new THREE.BufferGeometry(); return; }
  const cen = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  const N = new THREE.Vector3(...n).normalize(), U = new THREE.Vector3(...pts[0]).sub(new THREE.Vector3(...cen)).normalize(), W = N.clone().cross(U);
  const ang = p => { const v = new THREE.Vector3(...p).sub(new THREE.Vector3(...cen)); return Math.atan2(v.dot(W), v.dot(U)); };
  pts.sort((p, q) => ang(p) - ang(q));
  const pos = [];
  for (let t = 1; t + 1 < pts.length; t++) pos.push(...pts[0], ...pts[t], ...pts[t + 1]);
  level.geometry.dispose();
  level.geometry = new THREE.BufferGeometry();
  level.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  level.geometry.computeVertexNormals();
}

// the moving point runs along its polyline; the trail is redrawn at the end
function onFrame(dt) {
  if (!anim) return;
  anim.s = Math.min(1, anim.s + dt / anim.dur);
  const L = anim.len.at(-1), s = anim.s * L;
  let i = 1;
  while (i < anim.len.length - 1 && anim.len[i] < s) i++;
  const t = (s - anim.len[i - 1]) / Math.max(1e-12, anim.len[i] - anim.len[i - 1]);
  here = anim.pts[i - 1].map((v, d) => v + t * (anim.pts[i][d] - v));
  marker.position.set(...here);
  placeLevel();
  if (anim.s >= 1) { anim = null; drawPath(); }
}
function go(pts, dur) {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(...pts[i].map((v, d) => v - pts[i - 1][d])));
  anim = { pts, len, s: 0, dur };
}

function step() {
  if (mode === 'simplex') {
    if (k + 1 >= steps.length) return stop();
    k++;
    go([D(steps[k - 1].x), D(steps[k].x)], 0.9);
  } else {
    if (k + 1 >= B.iters.length) return stop();
    k++;
    go(B.dense.slice(B.iters[k - 1], B.iters[k] + 1).map(p => D(p.x)), 0.5);
  }
  drawPath(); show();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = 'Play'; }
function play() { if (timer) return stop(); $('play').textContent = 'Pause'; timer = setInterval(step, mode === 'simplex' ? 1300 : 650); }

// the panel: the basis with the values and the reduced costs, or the barrier
function show() {
  save();
  const m = P.A.length, names = Array.from({ length: 3 + m }, (_, j) => varName(j, m));
  const C = cons(P);
  $('cname').textContent = mode === 'simplex' ? 'pivots' : 'iterations';
  $('iter').textContent = k;
  $('rule').disabled = mode !== 'simplex';
  if (mode === 'simplex') {
    const s = steps[k], nx = steps[k + 1];
    const cell = (j, v) => `<td class="${s.basis.includes(j) ? 'inb' : ''}${nx && nx.enter === j ? ' enter' : ''}${nx && nx.leave === j ? ' leave' : ''}">${v}</td>`;
    $('table').innerHTML = `<tr><th>variable</th>${names.map(n => `<th>${n}</th>`).join('')}</tr>`
      + `<tr><td>value</td>${names.map((_, j) => cell(j, fmt(s.vals[j]))).join('')}</tr>`
      + `<tr><td>reduced cost</td>${names.map((_, j) => cell(j, s.basis.includes(j) ? '·' : fmt(s.r[j]))).join('')}</tr>`;
    setTex($('tcap'), `The basis \\(\\{${s.basis.map(j => names[j].replace(/(\d)/, '_$1')).join(', ')}\\}\\) (in violet), the values of all the variables and the reduced costs \\(c_j - c_B B^{-1} A_j\\) of those out of the basis; the slack \\(s_i\\) belongs to row \\(i\\). Lilac: the variable that enters next, framed: the one that leaves.`);
    const tight = Geo.V.find(v => Math.hypot(...v.x.map((q, d) => q - s.x[d])) < 1e-7);
    const act = tight ? tight.act.map(q => C.names[q]).join(', ') : '';
    let txt = `Vertex ${vec(s.x)}, c·x = ${fmt(s.z)}, on ${act}. `;
    if (s.optimal) txt += 'No reduced cost is positive: the basis is optimal.';
    else if (s.unbounded) txt += 'The entering column has no positive entry: unbounded.';
    else txt += `Next: ${names[nx.enter]} enters (reduced cost ${fmt(s.r[nx.enter])}, ${rule === 'bland' ? 'the first positive one' : 'the largest'}), ${names[nx.leave]} leaves by the ratio test.`;
    $('info').textContent = txt;
    const feas = s.y.every(v => v >= -1e-9) && [0, 1, 2].every(j => P.A.reduce((a, row, i) => a + row[j] * s.y[i], 0) >= P.c[j] - 1e-9);
    $('dual').textContent = `Dual point of the basis y = ${vec(s.y)} (minus the reduced costs of the slacks): ${feas ? 'feasible, so b·y = c·x and both are optimal.' : 'infeasible until the basis is optimal.'}`;
    $('pval').textContent = fmt(s.z); $('dval').textContent = fmt(dot(P.b, s.y)); $('gap').textContent = fmt(dot(P.b, s.y) - s.z);
  } else {
    const p = B.dense[B.iters[k]], s = C.h.map((h, q) => h - dot(C.G[q], p.x));
    $('table').innerHTML = `<tr><th>constraint</th><th>slack</th><th>y estimate</th></tr>`
      + C.names.map((n, q) => `<tr><td>${n}</td><td>${s[q].toExponential(2)}</td><td>${k === 0 ? '·' : (p.mu / s[q]).toExponential(2)}</td></tr>`).join('');
    setTex($('tcap'), `Every constraint with its slack and its multiplier estimate \\(\\mu / s\\) (for \\(x_j \\ge 0\\), the reduced cost); on the central path the products are all \\(\\mu\\), so the gap is \\(${C.G.length}\\mu\\).`);
    $('info').textContent = k === 0
      ? 'The analytic center: the maximum of the sum of the logarithms of the slacks, where μ is infinite.'
      : `μ = ${p.mu.toExponential(2)}, x = ${vec(p.x.map(v => +v.toFixed(4)))}; each iteration divides μ by 0.6 and recenters with Newton's method.`;
    $('dual').textContent = k === 0 ? '' : `Dual estimate y = ${vec(p.y.map(v => +v.toFixed(4)))}; it is feasible all along and reaches the optimal dual as μ goes to 0.`;
    $('pval').textContent = p.z.toFixed(4);
    $('dval').textContent = k === 0 ? '' : p.dval.toFixed(4);
    $('gap').textContent = k === 0 ? '' : (p.dval - p.z).toExponential(2);
  }
}

// the state in the address: instance, method, rule, seed and the step shown
const H = { inst: 'klee', mode, rule, seed, k: 0 };
new URLSearchParams(location.hash.slice(1)).forEach((v, key) => { if (key in H) H[key] = typeof H[key] === 'number' ? +v : v; });
const save = () => history.replaceState(null, '', '#' + new URLSearchParams({ inst: $('inst').value, mode, rule, seed, k }));
for (const [key, v] of Object.entries(instances)) $('inst').append(new Option(v.label, key));
if (instances[H.inst]) $('inst').value = H.inst;
if (['simplex', 'ipm'].includes(H.mode)) mode = $('mode').value = H.mode;
if (['dantzig', 'bland'].includes(H.rule)) rule = $('rule').value = H.rule;
seed = H.seed;
$('inst').onchange = load;
$('regen').onclick = () => { seed = Math.floor(Math.random() * 1e6); load(); };
$('mode').onchange = e => { mode = e.target.value; reset(); };
$('rule').onchange = e => { rule = e.target.value; reset(); };
$('level').onchange = placeLevel;
$('step').onclick = step; $('play').onclick = play; $('reset').onclick = reset;
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
load();
// the step of the address, reached without animation
for (let i = 0; i < H.k; i++) step();
if (anim) { anim.s = 1; onFrame(0); }
