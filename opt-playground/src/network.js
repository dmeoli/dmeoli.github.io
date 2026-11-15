// Scene F: the neural network, with what the TensorFlow Playground has (data
// sets, noise, ratio, batch size, features, layers and neurons, activation,
// learning rate, regularization, problem type, the map of every neuron, the
// weights as links, training and test loss) and, on top of it, the optimizer
// chosen among those of optiml and a race of two networks from the same weights.

import { build, forward, backward, update, optimizers, dataset, features, rng } from './nn.js';
import { texClear, texSet } from './tex.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.hash.slice(1));
const S = {
  data: q.get('data') || 'circle', problem: q.get('problem') || 'classification',
  noise: +(q.get('noise') ?? 0), ratio: +(q.get('ratio') ?? 50), batch: +(q.get('batch') ?? 10),
  feats: (q.get('feats') || 'x1,x2').split(','), hidden: (q.get('hidden') || '4,2').split(',').filter(Boolean).map(Number),
  act: q.get('act') || 'tanh', lr: +(q.get('lr') ?? 0.03), reg: q.get('reg') || 'none', regRate: +(q.get('regRate') ?? 0),
  opt: q.get('opt') || 'sgd', race: q.get('race') === '1', optB: q.get('optB') || 'adam',
  showTest: q.get('test') === '1', discretize: q.get('disc') === '1', seed: +(q.get('seed') ?? 7),
};
let train = [], test = [], nets = [], epoch = 0, timer = null, focus = null, history = [[], []];

function save() {
  const o = { ...S, feats: S.feats.join(','), hidden: S.hidden.join(','), race: S.race ? 1 : 0, test: S.showTest ? 1 : 0, disc: S.discretize ? 1 : 0 };
  delete o.showTest; delete o.discretize;
  history_replace(o);
}
function history_replace(o) { window.history.replaceState(null, '', '#' + new URLSearchParams(o)); }

const input = p => S.feats.map(k => features[k].f(p.x, p.y));

function makeData() {
  const r = rng(S.seed * 31 + 1), pts = dataset(S.data, 400, S.noise / 100, r);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const cut = Math.round(pts.length * S.ratio / 100);
  train = pts.slice(0, cut); test = pts.slice(cut);
}
function makeNets() {
  const shape = [S.feats.length, ...S.hidden, 1], out = S.problem === 'regression' ? 'linear' : 'tanh';
  nets = [build(shape, S.act, out, S.seed), build(shape, S.act, out, S.seed)];   // the same weights
  epoch = 0; history = [[], []]; snapshots = [getV(nets[0])];
}
function loss(net, pts) {
  return pts.reduce((s, p) => s + 0.5 * (forward(net, input(p)) - p.label) ** 2, 0) / Math.max(pts.length, 1);
}
function oneEpoch(net, opt) {
  for (let i = 0; i < train.length; i += S.batch) {
    const b = train.slice(i, i + S.batch);
    for (const p of b) { forward(net, input(p)); backward(net, p.label); }
    update(net, opt, S.lr, S.reg, S.regRate, b.length);
  }
}
function step() {
  oneEpoch(nets[0], S.opt);
  if (S.race) oneEpoch(nets[1], S.optB);
  epoch++;
  snapshots.push(getV(nets[0]));
  history[0].push([loss(nets[0], train), loss(nets[0], test)]);
  if (S.race) history[1].push([loss(nets[1], train), loss(nets[1], test)]);
  draw();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = 'Play'; }
function play() { if (timer) return stop(); $('play').textContent = 'Pause'; timer = setInterval(step, 40); }
function reset() { stop(); makeData(); makeNets(); save(); buildControls(); clearLandscape(); draw(); }

// ------------------------------------------------------------------ drawing
// the color of a value in [-1, 1]: gold for negative, lavender at zero, violet for positive
function color(v) {
  const t = Math.max(-1, Math.min(1, v));
  return t >= 0 ? [232 - 117 * t, 226 - 170 * t, 243 - 75 * t] : [232 - 51 * -t, 226 - 72 * -t, 243 - 174 * -t];
}
function heat(canvas, fn, size, pts) {
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let v = fn(-6 + 12 * (i + 0.5) / size, 6 - 12 * (j + 0.5) / size);
    if (S.discretize) v = v >= 0 ? 1 : -1;
    img.data.set([...color(v), 255], (j * size + i) * 4);
  }
  const off = document.createElement('canvas'); off.width = off.height = size; off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  if (pts) for (const [list, hollow] of pts) for (const p of list) {
    const X = (p.x + 6) / 12 * canvas.width, Y = (6 - p.y) / 12 * canvas.height;
    ctx.beginPath(); ctx.arc(X, Y, 3, 0, 7);
    ctx.fillStyle = `rgb(${color(p.label).map(Math.round)})`; ctx.strokeStyle = hollow ? '#2e2040' : '#ffffff';
    ctx.lineWidth = hollow ? 1.5 : 1; ctx.fill(); ctx.stroke();
  }
}
// the output of a node over the plane
function nodeFn(net, node) { return (x, y) => { forward(net, input({ x, y })); return node.out; }; }

// the frame of the drawing: the columns of the layers across its width, the
// rows of the neurons 50 apart; the headers of the layers use the same columns
const W = 640, X0 = 70, X1 = W - 30, R = 17, DY = 50;
const colX = (l, L) => X0 + l * (X1 - X0) / Math.max(L - 1, 1);
const frameH = net => Math.max(240, Math.max(...net.map(layer => layer.length)) * DY + 30);

function drawNet(net, svgId, k) {
  const svg = $(svgId), H = frameH(net), L = net.length, NS = 'http://www.w3.org/2000/svg';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const pos = new Map();
  net.forEach((layer, l) => layer.forEach((n, i) => {
    pos.set(n, [colX(l, L), H / 2 + (i - (layer.length - 1) / 2) * DY]);
  }));
  const el = (t, a, p = svg) => { const e = document.createElementNS(NS, t); for (const [x, v] of Object.entries(a)) e.setAttribute(x, v); p.appendChild(e); return e; };
  for (const layer of net) for (const n of layer) for (const lk of n.inputs) {
    const [x1, y1] = pos.get(lk.src), [x2, y2] = pos.get(n), w = lk.w;
    const dpath = `M${x1 + R},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - R},${y2}`;
    el('path', { d: dpath, fill: 'none', stroke: w >= 0 ? '#7338a8' : '#b59a45', 'stroke-width': Math.min(8, 0.4 + 2.2 * Math.abs(w)), opacity: 0.75 });
    // a wide transparent twin of the link, to click on it and edit its weight
    const hit = el('path', { d: dpath, fill: 'none', stroke: 'transparent', 'stroke-width': 10, class: 'linkhit' });
    hit.addEventListener('click', e => editWeight(lk, e));
    hit.appendChild(document.createElementNS(NS, 'title')).textContent = `weight ${w.toFixed(3)} (click to edit)`;
  }
  net.forEach((layer, l) => layer.forEach((n, i) => {
    const [x, y] = pos.get(n), size = 2 * R;
    const fo = el('foreignObject', { x: x - R, y: y - R, width: size, height: size });
    const c = document.createElement('canvas'); c.width = c.height = size; c.className = 'neuron';
    fo.appendChild(c);
    heat(c, nodeFn(net, n), 16);
    c.addEventListener('mouseenter', () => { focus = { k, node: n }; drawOut(); });
    c.addEventListener('mouseleave', () => { focus = null; drawOut(); });
    if (l === 0) el('text', { x: x - R - 6, y: y + 4, class: 'lab end' }).textContent = features[S.feats[i]].label;
  }));
}

// a small field next to the pointer, no dialog: Enter or leaving it applies
function editWeight(link, e) {
  stop();
  const box = $('wedit'), inp = box.querySelector('input');
  box.hidden = false; box.style.left = `${e.pageX + 8}px`; box.style.top = `${e.pageY - 14}px`;
  inp.value = link.w.toFixed(3); inp.focus(); inp.select();
  const apply = () => { const v = parseFloat(inp.value); if (isFinite(v)) link.w = v; box.hidden = true; inp.onchange = inp.onblur = null; draw(); };
  inp.onchange = apply; inp.onblur = apply;
}

// the loss over the plane of two random directions around the current weights
// (Li et al. 2018, without the filter normalization of large networks), with
// the weights of the past epochs projected on that plane
function params(net) { const out = []; for (let l = 1; l < net.length; l++) for (const n of net[l]) { out.push(n); for (const k of n.inputs) out.push(k); } return out; }
const getV = net => params(net).map(o => ('w' in o ? o.w : o.bias));
const setV = (net, v) => params(net).forEach((o, i) => { if ('w' in o) o.w = v[i]; else o.bias = v[i]; });
function clearLandscape() { $('land').hidden = true; $('landNote').hidden = false; }
function landscape() {
  $('land').hidden = false; $('landNote').hidden = true;
  const net = nets[0], v0 = getV(net), r = rng(99), n = v0.length;
  const rnd = () => Array.from({ length: n }, () => r() - 0.5);
  const norm = a => Math.hypot(...a), scaleTo = (a, len) => { const k = len / (norm(a) || 1); return a.map(x => x * k); };
  const len = Math.max(1, norm(v0)) * 0.6;
  let d1 = scaleTo(rnd(), len), d2 = rnd();
  const pr = d2.reduce((a, x, i) => a + x * d1[i], 0) / (len * len);
  d2 = scaleTo(d2.map((x, i) => x - pr * d1[i]), len);
  const G = 31, vals = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = -1 + 2 * i / (G - 1), b = 1 - 2 * j / (G - 1);
    setV(net, v0.map((x, k) => x + a * d1[k] + b * d2[k]));
    vals.push(loss(net, train));
  }
  setV(net, v0);
  const cv = $('land'), ctx = cv.getContext('2d'), W = cv.width, lo = Math.min(...vals), hi = Math.max(...vals);
  const img = ctx.createImageData(G, G);
  vals.forEach((v, q) => { const t = Math.log(1 + v - lo) / Math.log(1 + hi - lo || 2), band = Math.floor(t * 12) % 2 * 8; img.data.set([232 - 117 * (1 - t) - band, 226 - 170 * (1 - t) - band, 243 - 75 * (1 - t) - band, 255], q * 4); });
  const off = document.createElement('canvas'); off.width = off.height = G; off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, W);
  // the past weights, projected: coordinates (v - v0).d / |d|^2
  const pts = snapshots.map(v => [v.reduce((a, x, k) => a + (x - v0[k]) * d1[k], 0) / (len * len), v.reduce((a, x, k) => a + (x - v0[k]) * d2[k], 0) / (len * len)]);
  ctx.strokeStyle = '#2e2040'; ctx.lineWidth = 1.5; ctx.beginPath();
  pts.forEach(([a, b], i) => { const x = (a + 1) / 2 * W, y = (1 - b) / 2 * W; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = '#b59a45'; ctx.beginPath(); ctx.arc(W / 2, W / 2, 5, 0, 7); ctx.fill();
}
let snapshots = [];

function drawOut() {
  const show = [[train, false], ...(S.showTest ? [[test, true]] : [])];
  const [net, node] = focus ? [nets[focus.k], focus.node] : [nets[0], nets[0].at(-1)[0]];
  heat($('out'), nodeFn(net, node), 60, show);
  if (S.race) heat($('outB'), nodeFn(nets[1], nets[1].at(-1)[0]), 60, show);
}
function drawLoss() {
  const cv = $('loss'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  // the axes, so that the chart is there before the first epoch
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--rule'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(4, H - 4); ctx.lineTo(W - 4, H - 4); ctx.stroke();
  const all = history.flat().flat(), hi = Math.max(0.05, ...all), n = Math.max(20, history[0].length);
  const line = (h, i, col, dash) => {
    ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 2; ctx.beginPath();
    h.forEach((v, e) => { const x = 4 + e / n * (W - 8), y = H - 4 - v[i] / hi * (H - 8); e ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(history[0], 0, '#7338a8', []); line(history[0], 1, '#7338a8', [4, 3]);
  if (S.race) { line(history[1], 0, '#b59a45', []); line(history[1], 1, '#b59a45', [4, 3]); }
}
function draw() {
  drawNet(nets[0], 'net', 0);
  if (S.race) drawNet(nets[1], 'netB', 1);
  drawOut(); drawLoss();
  $('epoch').textContent = String(epoch).padStart(6, '0');
  const h = history[0].at(-1) || [loss(nets[0], train), loss(nets[0], test)];
  $('trainLoss').textContent = h[0].toFixed(3); $('testLoss').textContent = h[1].toFixed(3);
  if (S.race) { const g = history[1].at(-1) || [loss(nets[1], train), loss(nets[1], test)]; $('trainLossB').textContent = g[0].toFixed(3); $('testLossB').textContent = g[1].toFixed(3); }
  document.body.classList.toggle('racing', S.race);
  $('nameA').textContent = optimizers[S.opt].name; $('nameB').textContent = optimizers[S.optB].name;
}

// ----------------------------------------------------------------- controls
function sel(id, entries, value, on) {
  const s = $(id); s.replaceChildren(); for (const [k, l] of entries) s.append(new Option(l, k, false, String(k) === String(value)));
  s.onchange = () => on(s.value);
}
function buildControls() {
  const datas = S.problem === 'regression' ? [['plane', 'Plane'], ['gaussreg', 'Gaussians']] : [['circle', 'Circle'], ['xor', 'Exclusive or'], ['gauss', 'Gaussians'], ['spiral', 'Spiral']];
  sel('problem', [['classification', 'Classification'], ['regression', 'Regression']], S.problem, v => { S.problem = v; S.data = v === 'regression' ? 'plane' : 'circle'; reset(); });
  const db = $('datas'); db.replaceChildren();
  for (const [k, l] of datas) {
    const b = document.createElement('button'); b.type = 'button'; b.title = l;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k === S.data);
    const c = document.createElement('canvas'); c.width = c.height = 64; b.appendChild(c);
    thumb(c, k); b.onclick = () => { S.data = k; reset(); };
    db.appendChild(b);
  }
  sel('act', [['relu', 'ReLU'], ['tanh', 'Tanh'], ['sigmoid', 'Sigmoid'], ['linear', 'Linear']], S.act, v => { S.act = v; reset(); });
  sel('lr', [0.00001, 0.0001, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10].map(v => [v, v]), S.lr, v => { S.lr = +v; save(); });
  sel('reg', [['none', 'None'], ['L1', 'L1'], ['L2', 'L2']], S.reg, v => { S.reg = v; save(); });
  sel('regRate', [0, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10].map(v => [v, v]), S.regRate, v => { S.regRate = +v; save(); });
  const opts = Object.entries(optimizers).map(([k, o]) => [k, o.name]);
  sel('opt', opts, S.opt, v => { S.opt = v; reset(); });
  sel('optB', opts, S.optB, v => { S.optB = v; reset(); });
  $('race').checked = S.race; $('race').onchange = e => { S.race = e.target.checked; reset(); };
  $('showTest').checked = S.showTest; $('showTest').onchange = e => { S.showTest = e.target.checked; save(); drawOut(); };
  $('disc').checked = S.discretize; $('disc').onchange = e => { S.discretize = e.target.checked; save(); draw(); };
  for (const [id, key, f] of [['noise', 'noise', v => v], ['ratio', 'ratio', v => v], ['batch', 'batch', v => v]]) {
    $(id).value = S[key]; $(id + 'Out').textContent = S[key];
    $(id).oninput = e => { S[key] = f(+e.target.value); $(id + 'Out').textContent = e.target.value; reset(); };
  }
  const fb = $('feats'); texClear(fb); fb.replaceChildren();
  for (const [k, ft] of Object.entries(features)) {
    const l = document.createElement('label'); l.className = 'algo';
    l.innerHTML = `<input type="checkbox" ${S.feats.includes(k) ? 'checked' : ''}>\\(${ft.tex}\\)`;
    l.querySelector('input').onchange = e => {
      S.feats = e.target.checked ? [...S.feats, k] : S.feats.filter(x => x !== k);
      if (!S.feats.length) S.feats = ['x1'];
      reset();
    };
    fb.appendChild(l);
  }
  texSet(fb);
  // above the network, as in the TensorFlow Playground: + and − for the
  // layers, and over the column of each hidden layer + and − for its neurons
  const btn = (t, title, f) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.onclick = f; return b; };
  $('layersctl').replaceChildren(btn('+', 'add a hidden layer', () => { if (S.hidden.length < 6) S.hidden.push(2); reset(); }),
                                 btn('−', 'remove a hidden layer', () => { S.hidden.pop(); reset(); }));
  $('nlayers').textContent = `${S.hidden.length} hidden layer${S.hidden.length === 1 ? '' : 's'}`;
  const ch = $('colheads'); ch.replaceChildren();
  S.hidden.forEach((n, i) => {
    const g = document.createElement('div'); g.className = 'colhead';
    g.style.left = `${100 * colX(i + 1, S.hidden.length + 2) / W}%`;
    const pm = document.createElement('span'); pm.className = 'pm';
    pm.append(btn('+', 'add a neuron', () => { if (S.hidden[i] < 8) S.hidden[i]++; reset(); }), btn('−', 'remove a neuron', () => { if (S.hidden[i] > 1) S.hidden[i]--; reset(); }));
    g.append(pm, Object.assign(document.createElement('span'), { textContent: `${n} neuron${n === 1 ? '' : 's'}` }));
    ch.appendChild(g);
  });
}
// a small picture of a data set, its points on the colour of zero
function thumb(c, kind) {
  const ctx = c.getContext('2d'), r = rng(5), pts = dataset(kind, 160, 0, r), w = c.width;
  ctx.fillStyle = `rgb(${color(0)})`; ctx.fillRect(0, 0, w, w);
  for (const p of pts) {
    ctx.fillStyle = `rgb(${color(p.label).map(Math.round)})`;
    ctx.beginPath(); ctx.arc((p.x + 6) / 12 * w, (6 - p.y) / 12 * w, 1.8, 0, 7); ctx.fill();
  }
}

$('play').onclick = play; $('step').onclick = step; $('reset').onclick = reset;
$('landBtn').onclick = landscape;
$('regen').onclick = () => { S.seed = Math.floor(Math.random() * 1e6); reset(); };
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
reset();
