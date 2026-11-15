// Scene G: the hidden layers of a network as a deformation of the plane, after
// C. Olah, "Neural Networks, Manifolds, and Topology" (2014),
// https://colah.github.io/posts/2014-03-NN-Manifolds-Topology/ (the idea, rebuilt
// from its equations; no figure or code of the post is used).
// A network 2 -> (2) x L -> 1 is trained in the page. A layer z -> act(W z + b)
// is shown as a continuous deformation in three phases: the linear map
// (1-s) z + s W z, the translation + s b, the activation (1-s) u + s act(u).
// With tanh and det W > 0 every phase is a homeomorphism, so a layer of width 2
// can bend the plane but never tear it: the disc inside the ring cannot be
// separated, however long one trains.

import { build, forward, backward, update, rng } from './nn.js';
import { setTex } from './tex.js';

const $ = id => document.getElementById(id);
const S = { data: 'curves', layers: 2, act: 'tanh', seed: 3, T: 0 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });

// the data, in [-1, 1]^2, labels +1 and -1
function makeData(kind, r) {
  const pts = [], n = 240, g = () => (r() - 0.5) * 0.08;
  for (let i = 0; i < n; i++) {
    const pos = i % 2 === 0;
    if (kind === 'curves') {             // two interleaved curves
      const x = 2 * r() - 1;
      pts.push({ x, y: 0.45 * Math.sin(3 * x) + (pos ? 0.22 : -0.22) + g(), label: pos ? 1 : -1 });
    } else if (kind === 'ring') {        // a disc inside a ring
      const a = 2 * Math.PI * r(), rad = pos ? 0.35 * Math.sqrt(r()) : 0.65 + 0.25 * r();
      pts.push({ x: rad * Math.cos(a), y: rad * Math.sin(a), label: pos ? 1 : -1 });
    } else if (kind === 'xor') {
      const x = 2 * r() - 1, y = 2 * r() - 1;
      pts.push({ x: x + Math.sign(x) * 0.05, y: y + Math.sign(y) * 0.05, label: x * y > 0 ? 1 : -1 });
    } else {                             // two spirals
      const t = 0.25 + 1.6 * Math.PI * r(), d = pos ? 0 : Math.PI, rad = t / (1.85 * Math.PI);
      pts.push({ x: rad * Math.cos(t + d) + g(), y: rad * Math.sin(t + d) + g(), label: pos ? 1 : -1 });
    }
  }
  return pts;
}

let net, pts, timer = null, morph = null, epoch = 0;
function reset() {
  stopTrain();
  net = build([2, ...Array(S.layers).fill(2), 1], S.act, 'tanh', S.seed * 17 + 1);
  pts = makeData(S.data, rng(S.seed * 31 + 7));
  epoch = 0; S.T = Math.min(S.T, 3 * S.layers);
  $('T').max = 3 * S.layers;
  save(); draw();
}

function trainEpoch() {
  const r = rng(epoch + 1), order = pts.map((_, i) => i).sort(() => r() - 0.5);
  for (let b = 0; b < order.length; b += 10) {
    const batch = order.slice(b, b + 10);
    for (const i of batch) { forward(net, [pts[i].x, pts[i].y]); backward(net, pts[i].label); }
    update(net, 'adam', 0.02, 'L2', 0.0005, batch.length);
  }
  epoch++;
}

// the coordinates of a point after the deformation T: layer k = floor(T / 3),
// phase floor(T) mod 3, and the fraction s inside the phase
const actf = { tanh: Math.tanh, relu: x => Math.max(0, x) };
function layerParams(k) {
  const L = net[k + 1];
  return { W: L.map(n => n.inputs.map(l => l.w)), b: L.map(n => n.bias) };
}
function deform(p, T) {
  let z = [p[0], p[1]];
  for (let k = 0; k < S.layers; k++) {
    const { W, b } = layerParams(k), loc = Math.min(3, T - 3 * k);
    const Wz = [W[0][0] * z[0] + W[0][1] * z[1], W[1][0] * z[0] + W[1][1] * z[1]];
    const s1 = Math.min(1, Math.max(0, loc)), s2 = Math.min(1, Math.max(0, loc - 1)), s3 = Math.min(1, Math.max(0, loc - 2));
    let u = [(1 - s1) * z[0] + s1 * Wz[0], (1 - s1) * z[1] + s1 * Wz[1]];
    u = [u[0] + s2 * b[0], u[1] + s2 * b[1]];
    z = [(1 - s3) * u[0] + s3 * actf[S.act](u[0]), (1 - s3) * u[1] + s3 * actf[S.act](u[1])];
    if (loc < 3) break;
  }
  return z;
}

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
  for (const q of qs) m = Math.max(m, Math.abs(q[0]) * 1.1, Math.abs(q[1]) * 1.1);
  view = view === null ? m : view + 0.3 * (m - view);
  const f = plane($('hidden'), p => deform(p, S.T), [-view, view, -view, view], false);
  // in the space of the last layer the output unit is a line w.h + b = 0
  if (S.T >= 3 * S.layers - 1e-9) {
    const o = net.at(-1)[0], w = o.inputs.map(l => l.w), b = o.bias, ctx = $('hidden').getContext('2d');
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    if (Math.abs(w[1]) > Math.abs(w[0])) { ctx.moveTo(f.X(-view), f.Y((-b + w[0] * view) / w[1])); ctx.lineTo(f.X(view), f.Y((-b - w[0] * view) / w[1])); }
    else { ctx.moveTo(f.X((-b + w[1] * view) / w[0]), f.Y(-view)); ctx.lineTo(f.X((-b - w[1] * view) / w[0]), f.Y(view)); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  const k = Math.min(Math.floor(S.T / 3), S.layers - 1), loc = S.T - 3 * k;
  const phase = S.T >= 3 * S.layers ? 'the last hidden layer, where the output unit draws a line (dashed)' :
    `layer ${k + 1}, ${['the linear map \\(W\\)', 'the translation \\(b\\)', `the activation ${S.act === 'tanh' ? '\\(\\tanh\\)' : '\\(\\mathrm{ReLU}\\)'}`][Math.min(2, Math.floor(loc))]}`;
  const { W } = layerParams(k), det = W[0][0] * W[1][1] - W[0][1] * W[1][0];
  // the formulas are typeset only when they change, the number is plain text
  setTex($('phase'), phase);
  setTex($('detW'), `\\(\\det W_${k + 1} =\\) `);
  $('det').textContent = det.toFixed(3);
  $('detNeg').textContent = det < 0 ? ' (negative: a reflection, not reachable by a continuous deformation of the plane)' : '';
  let ok = 0; for (const p of pts) if (Math.sign(forward(net, [p.x, p.y])) === p.label) ok++;
  $('acc').textContent = `${(100 * ok / pts.length).toFixed(1)}%`;
  $('epoch').textContent = epoch;
  $('Tv').textContent = S.T.toFixed(2);
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams({ data: S.data, layers: S.layers, act: S.act, seed: S.seed, T: S.T.toFixed(2) })); }
function stopTrain() { clearInterval(timer); timer = null; $('train').textContent = 'Train'; }
function stopMorph() { clearInterval(morph); morph = null; $('play').textContent = 'Play'; }

$('data').value = S.data; $('layers').value = S.layers; $('act').value = S.act; $('T').max = 3 * S.layers; $('T').value = S.T;
$('data').onchange = e => { S.data = e.target.value; reset(); };
$('layers').onchange = e => { S.layers = +e.target.value; reset(); };
$('act').onchange = e => { S.act = e.target.value; reset(); };
$('seed').onclick = () => { S.seed++; reset(); };
$('T').oninput = e => { stopMorph(); S.T = +e.target.value; save(); draw(); };
$('train').onclick = () => {
  if (timer) return stopTrain();
  $('train').textContent = 'Pause';
  timer = setInterval(() => { for (let i = 0; i < 5; i++) trainEpoch(); draw(); }, 60);
};
$('play').onclick = () => {
  if (morph) return stopMorph();
  $('play').textContent = 'Pause';
  if (S.T >= 3 * S.layers) S.T = 0;
  morph = setInterval(() => {
    S.T = Math.min(3 * S.layers, S.T + 0.04); $('T').value = S.T;
    if (S.T >= 3 * S.layers) stopMorph();
    save(); draw();
  }, 40);
};
reset();
