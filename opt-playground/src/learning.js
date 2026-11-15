// Scene E: learning is optimization. The test functions of optiml in two
// dimensions, and its algorithms racing on the same landscape from the same
// start, each with its color; a click on the map moves the start.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { proxMax } from './problems/lagrangian2d.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- functions
const functions = {
  quadratic: {
    label: 'Ill-conditioned quadratic', lr: 0.05,
    box: [-4, 4, -4, 4], start: [-3.5, 3],
    f: ([x, y]) => 0.5 * (x * x + 12 * y * y) + 0.4 * x * y,
    g: ([x, y]) => [x + 0.4 * y, 12 * y + 0.4 * x],
    h: () => [[1, 0.4], [0.4, 12]],
  },
  rosenbrock: {
    label: 'Rosenbrock', lr: 0.0015,
    box: [-2, 2, -1, 3], start: [-1.5, 2.5],
    f: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    g: ([x, y]) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    h: ([x, y]) => [[2 - 400 * (y - 3 * x * x), -400 * x], [-400 * x, 200]],
    log: true,
  },
  himmelblau: {
    label: 'Himmelblau (four minima)', lr: 0.01,
    box: [-5, 5, -5, 5], start: [-0.3, -0.8],
    f: ([x, y]) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    g: ([x, y]) => [4 * x * (x * x + y - 11) + 2 * (x + y * y - 7), 2 * (x * x + y - 11) + 4 * y * (x + y * y - 7)],
    h: ([x, y]) => [[12 * x * x + 4 * y - 42, 4 * x + 4 * y], [4 * x + 4 * y, 4 * x + 12 * y * y - 26]],
    log: true,
  },
  nonsmooth: {
    label: 'Nonsmooth: |x| + 3|y| + a ridge', lr: 0.05,
    box: [-4, 4, -4, 4], start: [-3.2, 2.6],
    f: ([x, y]) => Math.abs(x) + 3 * Math.abs(y) + Math.max(0, x + y - 1),
    g: ([x, y]) => [Math.sign(x) + (x + y > 1 ? 1 : 0), 3 * Math.sign(y) + (x + y > 1 ? 1 : 0)],
    h: null,
  },
};

// --------------------------------------------------------------- algorithms
// each: init(F, x0, p) -> state with x; step(F, s, p); the colors are the scale
// of the site and its gold
const add = (a, b, t = 1) => [a[0] + t * b[0], a[1] + t * b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const algorithms = {
  gd: { name: 'Gradient descent', color: '#5f4b76',
    step: (F, s, p) => { s.x = add(s.x, F.g(s.x), -p.lr); } },
  polyak: { name: 'Momentum (Polyak)', color: '#7338a8',
    step: (F, s, p) => { s.v = add([0.9 * (s.v?.[0] ?? 0), 0.9 * (s.v?.[1] ?? 0)], F.g(s.x), -p.lr); s.x = add(s.x, s.v); } },
  nesterov: { name: 'Nesterov', color: '#9363be',
    step: (F, s, p) => { const v = s.v ?? [0, 0], look = add(s.x, v, 0.9); s.v = add([0.9 * v[0], 0.9 * v[1]], F.g(look), -p.lr); s.x = add(s.x, s.v); } },
  adagrad: { name: 'AdaGrad', color: '#3b5fa8',
    step: (F, s, p) => { const g = F.g(s.x); s.G = add(s.G ?? [0, 0], [g[0] * g[0], g[1] * g[1]]); s.x = [s.x[0] - p.lr * 20 * g[0] / (Math.sqrt(s.G[0]) + 1e-8), s.x[1] - p.lr * 20 * g[1] / (Math.sqrt(s.G[1]) + 1e-8)]; } },
  rmsprop: { name: 'RMSProp', color: '#047b7d',
    step: (F, s, p) => { const g = F.g(s.x), E = s.E ?? [0, 0]; s.E = [0.9 * E[0] + 0.1 * g[0] * g[0], 0.9 * E[1] + 0.1 * g[1] * g[1]]; s.x = [s.x[0] - p.lr * 5 * g[0] / (Math.sqrt(s.E[0]) + 1e-8), s.x[1] - p.lr * 5 * g[1] / (Math.sqrt(s.E[1]) + 1e-8)]; } },
  adam: { name: 'Adam', color: '#c0281e',
    step: (F, s, p) => {
      const g = F.g(s.x), m = s.m ?? [0, 0], v = s.v2 ?? [0, 0], t = (s.t ?? 0) + 1;
      s.m = [0.9 * m[0] + 0.1 * g[0], 0.9 * m[1] + 0.1 * g[1]];
      s.v2 = [0.999 * v[0] + 0.001 * g[0] * g[0], 0.999 * v[1] + 0.001 * g[1] * g[1]]; s.t = t;
      const mh = [s.m[0] / (1 - 0.9 ** t), s.m[1] / (1 - 0.9 ** t)], vh = [s.v2[0] / (1 - 0.999 ** t), s.v2[1] / (1 - 0.999 ** t)];
      s.x = [s.x[0] - p.lr * 5 * mh[0] / (Math.sqrt(vh[0]) + 1e-8), s.x[1] - p.lr * 5 * mh[1] / (Math.sqrt(vh[1]) + 1e-8)];
    } },
  newton: { name: 'Newton', color: '#b59a45', smooth: true,
    step: (F, s) => {
      const g = F.g(s.x), H = F.h(s.x), det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
      if (Math.abs(det) < 1e-12) return;
      const d = [(H[1][1] * g[0] - H[0][1] * g[1]) / det, (-H[1][0] * g[0] + H[0][0] * g[1]) / det];
      s.x = add(s.x, d, -1);
    } },
  bfgs: { name: 'BFGS (Armijo)', color: '#6c5920', smooth: true,
    step: (F, s) => {
      const B = s.B ?? [[1, 0], [0, 1]], g = F.g(s.x);
      const d = [-(B[0][0] * g[0] + B[0][1] * g[1]), -(B[1][0] * g[0] + B[1][1] * g[1])];
      let a = 1; const f0 = F.f(s.x), gd = dot(g, d);
      while (F.f(add(s.x, d, a)) > f0 + 1e-4 * a * gd && a > 1e-10) a *= 0.5;
      const xn = add(s.x, d, a), sv = [xn[0] - s.x[0], xn[1] - s.x[1]], gn = F.g(xn), y = [gn[0] - g[0], gn[1] - g[1]], sy = dot(sv, y);
      if (sy > 1e-12) {
        // B <- (I - r s y') B (I - r y s') + r s s'
        const r = 1 / sy, I = [[1, 0], [0, 1]];
        const L = [[I[0][0] - r * sv[0] * y[0], I[0][1] - r * sv[0] * y[1]], [I[1][0] - r * sv[1] * y[0], I[1][1] - r * sv[1] * y[1]]];
        const mul = (P, Q) => [[P[0][0] * Q[0][0] + P[0][1] * Q[1][0], P[0][0] * Q[0][1] + P[0][1] * Q[1][1]], [P[1][0] * Q[0][0] + P[1][1] * Q[1][0], P[1][0] * Q[0][1] + P[1][1] * Q[1][1]]];
        const T = mul(mul(L, B), [[L[0][0], L[1][0]], [L[0][1], L[1][1]]]);
        s.B = [[T[0][0] + r * sv[0] * sv[0], T[0][1] + r * sv[0] * sv[1]], [T[1][0] + r * sv[1] * sv[0], T[1][1] + r * sv[1] * sv[1]]];
      }
      s.x = xn;
    } },
  bundle: { name: 'Proximal bundle', color: '#2e2040',
    step: (F, s, p) => {
      // minimize f: the model is the max of the cuts; in the terms of the
      // dual machinery, maximize -model over the box shifted to the origin
      const [x0, , y0] = F.box, W = Math.max(F.box[1] - F.box[0], F.box[3] - F.box[2]);
      const cut = x => { const fx = F.f(x), g = F.g(x), l = [x[0] - x0, x[1] - y0]; return { value: -(fx - dot(g, l)), slope: [-g[0], -g[1]] }; };
      s.cuts = s.cuts ?? [cut(s.x)];
      s.c = s.c ?? s.x;
      const r = proxMax(s.cuts, W, [s.c[0] - x0, s.c[1] - y0], p.t);
      const xn = [r.lam[0] + x0, r.lam[1] + y0];
      const pred = F.f(s.c) - (-Math.min(...s.cuts.map(k => k.value + dot(k.slope, r.lam))));
      if (pred < 1e-9) return;
      s.cuts.push(cut(xn));
      if (F.f(s.c) - F.f(xn) >= 0.1 * pred) s.c = xn;
      s.x = s.c;
      s.probe = xn;
    } },
};

// -------------------------------------------------------------------- state
let Fname = 'rosenbrock', F = functions[Fname], start = F.start.slice();
let chosen = new Set(['gd', 'polyak', 'adam', 'newton', 'bfgs', 'bundle']);
const params = { lr: 0.002, t: 0.5 };
let runs = [], timer = null, view = 'map';

function reset() {
  stop();
  for (const r of replays) r.n = 1;
  runs = [...chosen].filter(k => !(algorithms[k].smooth && !F.h)).map(k => ({ k, s: { x: start.slice() }, path: [start.slice()], vals: [F.f(start)] }));
  draw();
}
// the runs replayed from a trace of a real library (tools/optiml_trace.py):
// they advance one recorded iterate per step, drawn dashed
let replays = [];
const replayColors = ['#2e2040', '#7338a8', '#b59a45', '#047b7d', '#c0281e', '#3b5fa8', '#9363be'];
async function loadTrace(json) {
  const t = typeof json === 'string' ? await (await fetch(json)).json() : json;
  if (t.function && functions[t.function] && t.function !== Fname) { Fname = t.function; F = functions[Fname]; $('fn').value = Fname; useLr(); computeField(); }
  start = t.start || start;
  replays = t.runs.map((r, i) => ({ name: `${t.source || 'trace'}: ${r.name}`, color: replayColors[i % replayColors.length], all: r.points, n: 1 }));
  reset();
}

function step() {
  for (const r of replays) if (r.n < r.all.length) r.n++;
  for (const r of runs) {
    const x = r.s.x;
    if (!isFinite(x[0]) || Math.abs(x[0]) > 1e6) continue;
    algorithms[r.k].step(F, r.s, params);
    r.path.push(r.s.x.slice()); r.vals.push(F.f(r.s.x));
  }
  draw();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = 'Play'; }
function play() { if (timer) return stop(); $('play').textContent = 'Pause'; timer = setInterval(step, 60); }

// --------------------------------------------------------------------- map
const N = 220;
let field = null;
function computeField() {
  const [x0, x1, y0, y1] = F.box, v = new Float64Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const z = F.f([x0 + (i + 0.5) / N * (x1 - x0), y1 - (j + 0.5) / N * (y1 - y0)]);
    const w = F.log ? Math.log(1 + z) : z;
    v[j * N + i] = w; lo = Math.min(lo, w); hi = Math.max(hi, w);
  }
  field = { v, lo, hi };
}
function drawMap() {
  const cv = $('map'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const img = ctx.createImageData(N, N), { v, lo, hi } = field;
  for (let q = 0; q < N * N; q++) {
    const t = (v[q] - lo) / (hi - lo), band = Math.floor(t * 16) % 2;
    // the lavender of the site deepening to its violet, with level bands
    const c = [232 - 117 * t, 226 - 170 * t, 243 - 75 * t].map(x => x - band * 8);
    img.data.set([...c, 255], q * 4);
  }
  const off = document.createElement('canvas'); off.width = off.height = N;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
  const [x0, x1, y0, y1] = F.box, X = x => (x - x0) / (x1 - x0) * W, Y = y => (y1 - y) / (y1 - y0) * H;
  for (const r of runs) {
    ctx.strokeStyle = algorithms[r.k].color; ctx.lineWidth = 2.2; ctx.beginPath();
    r.path.forEach((p, i) => { const a = X(p[0]), b = Y(p[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
    const p = r.path.at(-1);
    ctx.fillStyle = algorithms[r.k].color; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const r of replays) {
    ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
    r.all.slice(0, r.n).forEach((p, i) => { const a = X(p[0]), b = Y(p[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke(); ctx.setLineDash([]);
    const p = r.all[r.n - 1];
    ctx.fillStyle = r.color; ctx.fillRect(X(p[0]) - 4, Y(p[1]) - 4, 8, 8);
  }
  ctx.fillStyle = '#b59a45'; ctx.beginPath(); ctx.arc(X(start[0]), Y(start[1]), 6, 0, 7); ctx.fill();
}

// ---------------------------------------------------------------------- 3D
let three = null;
function draw3d() {
  const box = $('surface');
  if (!three) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio); box.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
    camera.up.set(0, 0, 1); camera.position.set(1.7, -1.6, 1.5);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0.5, 0.5, 0.15); controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 1)); const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(1, -1, 2); scene.add(sun);
    const group = new THREE.Group(); scene.add(group);
    const resize = () => { const w = box.clientWidth || 500; renderer.setSize(w, w, false); };
    new ResizeObserver(resize).observe(box); resize();
    three = { renderer, scene, camera, controls, group };
    const loop = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }; loop();
  }
  const { group } = three; group.clear();
  const M = 100, [x0, x1, y0, y1] = F.box, geo = new THREE.PlaneGeometry(1, 1, M, M), pos = geo.attributes.position;
  const Zf = z => { const w = F.log ? Math.log(1 + z) : z; return 0.6 * (w - field.lo) / (field.hi - field.lo); };
  const colors = new Float32Array(pos.count * 3);
  for (let q = 0; q < pos.count; q++) {
    const i = q % (M + 1), j = Math.floor(q / (M + 1)), z = Zf(F.f([x0 + i / M * (x1 - x0), y0 + j / M * (y1 - y0)]));
    pos.setXYZ(q, i / M, j / M, z);
    const t = z / 0.6; colors.set([(232 - 117 * t) / 255, (226 - 170 * t) / 255, (243 - 75 * t) / 255], q * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  for (const r of runs) {
    const pts = r.path.filter(p => isFinite(p[0])).map(p => new THREE.Vector3((p[0] - x0) / (x1 - x0), (p[1] - y0) / (y1 - y0), Zf(F.f(p)) + 0.01));
    if (pts.length > 1) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: algorithms[r.k].color })));
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), new THREE.MeshLambertMaterial({ color: algorithms[r.k].color }));
    s.position.copy(pts.at(-1)); group.add(s);
  }
}

// ------------------------------------------------------------------- curves
function drawCurves() {
  const cv = $('curves'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const fmin = Math.min(...runs.flatMap(r => r.vals.filter(isFinite)), F.f(start));
  const all = runs.map(r => r.vals.map(v => Math.log10(Math.max(v - fmin, 0) + 1e-8)));
  const n = Math.max(10, ...runs.map(r => r.vals.length)), lo = -8, hi = Math.log10(Math.max(F.f(start) - fmin, 1e-8)) + 1;
  ctx.strokeStyle = '#d4c9e6'; ctx.beginPath(); ctx.moveTo(30, H - 18); ctx.lineTo(W, H - 18); ctx.stroke();
  ctx.fillStyle = '#5f4b76'; ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillText('f - best f found (log)', 32, 12); ctx.fillText('iteration', W - 70, H - 4);
  runs.forEach((r, k) => {
    ctx.strokeStyle = algorithms[r.k].color; ctx.lineWidth = 2; ctx.beginPath();
    all[k].forEach((v, i) => { const a = 30 + i / n * (W - 34), b = 16 + (hi - Math.min(hi, Math.max(v, lo))) / (hi - lo) * (H - 38); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
  });
}

function draw() {
  $('mapbox').hidden = view !== 'map'; $('surface').hidden = view !== '3d';
  if (view === 'map') drawMap(); else draw3d();
  drawCurves();
  $('legend').replaceChildren(...runs.map(r => {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${algorithms[r.k].color}"></i>${algorithms[r.k].name} <b>${r.vals.at(-1).toPrecision(4)}</b>`;
    return li;
  }), ...replays.map(r => {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${r.color};height:2px;border-top:2px dashed ${r.color}"></i>${r.name} <b>${F.f(r.all[r.n - 1]).toPrecision(4)}</b>`;
    return li;
  }));
  $('iter').textContent = Math.max(0, ...runs.map(r => r.path.length - 1));
}

// -------------------------------------------------------------------- setup
for (const [k, f] of Object.entries(functions)) $('fn').append(new Option(f.label, k, false, k === Fname));
function useLr() { params.lr = F.lr; $('lr').value = F.lr; $('lrOut').textContent = F.lr; }
$('fn').addEventListener('change', e => { Fname = e.target.value; F = functions[Fname]; start = F.start.slice(); useLr(); computeField(); reset(); });
const boxes = $('algos');
for (const [k, a] of Object.entries(algorithms)) {
  const lab = document.createElement('label'); lab.className = 'algo';
  lab.innerHTML = `<input type="checkbox" ${chosen.has(k) ? 'checked' : ''}><i style="background:${a.color}"></i>${a.name}`;
  lab.querySelector('input').addEventListener('change', e => { e.target.checked ? chosen.add(k) : chosen.delete(k); reset(); });
  boxes.appendChild(lab);
}
for (const k of ['lr', 't']) $(k).addEventListener('input', e => { params[k] = +e.target.value; $(k + 'Out').textContent = e.target.value; reset(); });
$('view').addEventListener('change', e => { view = e.target.value; draw(); });
$('map').addEventListener('click', e => {
  const r = e.target.getBoundingClientRect(), [x0, x1, y0, y1] = F.box;
  start = [x0 + (e.clientX - r.left) / r.width * (x1 - x0), y1 - (e.clientY - r.top) / r.height * (y1 - y0)];
  reset();
});
$('step').addEventListener('click', step);
$('traceSel').addEventListener('change', e => { if (e.target.value) loadTrace(e.target.value); else { replays = []; reset(); } });
$('traceFile').addEventListener('change', async e => { const f = e.target.files[0]; if (f) loadTrace(JSON.parse(await f.text())); });
$('play').addEventListener('click', play);
$('reset').addEventListener('click', reset);
document.addEventListener('keydown', e => { if (e.key === 'ArrowRight') step(); if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); play(); } });
useLr();
computeField();
reset();
