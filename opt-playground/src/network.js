// Scene F: the neural network, with what the TensorFlow Playground has (data
// sets, noise, ratio, batch size, features, layers and neurons, activation,
// learning rate, regularization, problem type, the map of every neuron, the
// weights as links, training and test loss) and, on top of it, the optimizer
// chosen among those of optiml, dropout during training, and a race of two
// networks from the same weights.

import { build, forward, backward, dropMask, update, optimizers, dataset, features, rng } from './nn.js';
import { texClear, texSet } from './tex.js';
import { getV, landscape, project, at } from './landscape.js';
import { THREE, stage3d, axes, tok, css, onTheme } from './stage3d-b.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.hash.slice(1));
const S = {
  data: q.get('data') || 'circle', problem: q.get('problem') || 'classification',
  noise: +(q.get('noise') ?? 0), ratio: +(q.get('ratio') ?? 50), batch: +(q.get('batch') ?? 10),
  feats: (q.get('feats') || 'x1,x2').split(','), hidden: (q.get('hidden') || '4,2').split(',').filter(Boolean).map(Number),
  act: q.get('act') || 'tanh', lr: +(q.get('lr') ?? 0.03), reg: q.get('reg') || 'none', regRate: +(q.get('regRate') ?? 0), drop: +(q.get('drop') ?? 0),
  opt: q.get('opt') || 'sgd', race: q.get('race') === '1', optB: q.get('optB') || 'adam',
  showTest: q.get('test') === '1', discretize: q.get('disc') === '1', land3d: q.get('land') === '3d', landDir: q.get('dir') === 'pca' ? 'pca' : 'random', seed: +(q.get('seed') ?? 7),
};
let train = [], test = [], nets = [], epoch = 0, timer = null, focus = null, history = [[], []], dropR = [];

function save() {
  const o = { ...S, feats: S.feats.join(','), hidden: S.hidden.join(','), race: S.race ? 1 : 0, test: S.showTest ? 1 : 0, disc: S.discretize ? 1 : 0, land: S.land3d ? '3d' : 'map', dir: S.landDir };
  delete o.showTest; delete o.discretize; delete o.land3d; delete o.landDir;
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
  dropR = [rng(S.seed * 17 + 3), rng(S.seed * 17 + 3)];                           // and the same masks
  epoch = 0; history = [[], []]; snapshots = [getV(nets[0])];
}
function loss(net, pts) {
  return pts.reduce((s, p) => s + 0.5 * (forward(net, input(p)) - p.label) ** 2, 0) / Math.max(pts.length, 1);
}
// one dropout mask per mini-batch (rather than per example), so that the
// drawing can show which neurons the last update did not see
function oneEpoch(net, opt, r) {
  for (let i = 0; i < train.length; i += S.batch) {
    const b = train.slice(i, i + S.batch);
    dropMask(net, S.drop, r);
    for (const p of b) { forward(net, input(p), true); backward(net, p.label); }
    update(net, opt, S.lr, S.reg, S.regRate, b.length);
  }
}
function step() {
  oneEpoch(nets[0], S.opt, dropR[0]);
  if (S.race) oneEpoch(nets[1], S.optB, dropR[1]);
  epoch++;
  snapshots.push(getV(nets[0]));
  if (land) drawLand(false);
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
  const pos = new Map(), off = n => S.drop > 0 && epoch > 0 && n.keep === 0;   // dropped in the last mini-batch
  net.forEach((layer, l) => layer.forEach((n, i) => {
    pos.set(n, [colX(l, L), H / 2 + (i - (layer.length - 1) / 2) * DY]);
  }));
  const el = (t, a, p = svg) => { const e = document.createElementNS(NS, t); for (const [x, v] of Object.entries(a)) e.setAttribute(x, v); p.appendChild(e); return e; };
  for (const layer of net) for (const n of layer) for (const lk of n.inputs) {
    const [x1, y1] = pos.get(lk.src), [x2, y2] = pos.get(n), w = lk.w;
    const dpath = `M${x1 + R},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - R},${y2}`;
    el('path', { d: dpath, fill: 'none', stroke: w >= 0 ? '#7338a8' : '#b59a45', 'stroke-width': Math.min(8, 0.4 + 2.2 * Math.abs(w)), opacity: off(lk.src) || off(n) ? 0.12 : 0.75 });
    // a wide transparent twin of the link, to click on it and edit its weight
    const hit = el('path', { d: dpath, fill: 'none', stroke: 'transparent', 'stroke-width': 10, class: 'linkhit' });
    hit.addEventListener('click', e => editWeight(lk, e));
    hit.appendChild(document.createElementNS(NS, 'title')).textContent = `weight ${w.toFixed(3)} (click to edit)`;
  }
  net.forEach((layer, l) => layer.forEach((n, i) => {
    const [x, y] = pos.get(n), size = 2 * R;
    const fo = el('foreignObject', { x: x - R, y: y - R, width: size, height: size, ...(off(n) ? { opacity: 0.25 } : {}) });
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

// the loss landscape (src/landscape.js): computed on demand around the current
// weights, on two filter-normalized random directions or on the two principal
// directions of the path; the path of the past
// epochs and the current weights are projected on its plane at every epoch,
// drawn as a map or as a surface (src/stage3d-b.js)
let land = null, snapshots = [], stage = null;
function clearLandscape() { land = null; surfG = null; $('land').hidden = true; $('land3d').hidden = true; $('landNote').hidden = false; }
function landscapeCompute() {
  land = landscape(nets[0], net => loss(net, train), snapshots, S.landDir);
  $('landNote').hidden = true;
  drawLand(true);
}
const hexc = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
// the height of a loss in [0, 1], on a log scale, and its colour: accent low, lilac high
const lheight = v => Math.log(1 + Math.max(0, v - land.lo)) / Math.log(1 + (land.hi - land.lo) || 2);
function landColor(t) { const A = hexc(css('--accent')), L = hexc(css('--lilac')); return A.map((a, i) => a + t * (L[i] - a)); }
function pathCoords() {
  const P = land.proj || (land.proj = []), pr = v => project(v, land.v0, land.d1, land.d2);
  while (P.length < snapshots.length) P.push(pr(snapshots[P.length]));
  return [...P, pr(getV(nets[0]))];
}
function drawLand(full) {
  if (!land) return;
  const three = S.land3d;
  $('land').hidden = three; $('land3d').hidden = !three;
  document.querySelectorAll('#landView button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '3d') === three)));
  if (three) return drawLand3d(full);
  const cv = $('land'), ctx = cv.getContext('2d'), W = cv.width, { G, R, vals } = land;
  if (full || !land.img) {
    const img = ctx.createImageData(G, G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const t = lheight(vals[j * G + i]), band = Math.floor(t * 12) % 2 * 10, c = landColor(t);
      img.data.set([c[0] - band, c[1] - band, c[2] - band, 255], ((G - 1 - j) * G + i) * 4);
    }
    land.img = document.createElement('canvas'); land.img.width = land.img.height = G; land.img.getContext('2d').putImageData(img, 0, 0);
  }
  ctx.imageSmoothingEnabled = true; ctx.drawImage(land.img, 0, 0, W, W);
  const X = a => (a + R) / (2 * R) * W, Y = b => (R - b) / (2 * R) * W, pts = pathCoords();
  ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5; ctx.beginPath();
  let pen = false;
  for (const [a, b] of pts) { const inside = Math.abs(a) <= R && Math.abs(b) <= R; if (inside) pen ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)); pen = inside; }
  ctx.stroke();
  ctx.strokeStyle = css('--ink-soft'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(W / 2, W / 2, 6, 0, 7); ctx.stroke();
  const [a, b] = pts.at(-1);
  ctx.fillStyle = css('--gold'); ctx.strokeStyle = css('--ground'); ctx.beginPath(); ctx.arc(X(a), Y(b), 5, 0, 7); ctx.fill(); ctx.stroke();
}
// the surface in [-1, 1]^2 x [0, 0.8]: a / R, b / R and the height of the loss
let surfG = null, pathG = null;
function drawLand3d(full) {
  if (!stage) stage = stage3d($('land3d'), { position: [2.6, -3.4, 4.4], target: [0, 0, 0.2], label: 'loss landscape' });
  const T = THREE, { G, R, vals } = land, Hs = 0.8;
  const z = (a, b) => Hs * lheight(at(land, a, b));
  if (full || !surfG) {
    stage.clear();
    const geo = new T.PlaneGeometry(2, 2, G - 1, G - 1), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let q = 0; q < pos.count; q++) {
      const i = q % G, j = G - 1 - Math.floor(q / G), t = lheight(vals[j * G + i]), c = landColor(t);
      pos.setXYZ(q, -1 + 2 * i / (G - 1), -1 + 2 * j / (G - 1), Hs * t);
      col.set(c.map(x => x / 255), q * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const surf = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
    const wire = new T.Mesh(geo.clone(), new T.MeshBasicMaterial({ color: tok('--ink'), wireframe: true, transparent: true, opacity: 0.07 }));
    const fmt = v => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toPrecision(2));
    stage.group.add(surf, wire, axes({ x: [-1, 1, `d\u2081 \u00b1${fmt(R)}`], y: [-1, 1, `d\u2082 \u00b1${fmt(R)}`], z: [0, Hs, `loss \u2264 ${fmt(land.hi)}`] }));
    // where the surface was computed: a ring on the surface
    const ring = new T.Mesh(new T.TorusGeometry(0.05, 0.008, 8, 32), new T.MeshBasicMaterial({ color: tok('--ink-soft') }));
    ring.position.set(0, 0, z(0, 0) + 0.01); stage.group.add(ring);
    surfG = surf; pathG = new T.Group(); stage.group.add(pathG);
  }
  stage.clear(pathG);
  // the path of the past epochs on the surface, broken where it leaves the square
  const pts = pathCoords(); let run = [];
  // (a tube, since lines of WebGL are one pixel wide, thin on a projector)
  const ink = new T.MeshBasicMaterial({ color: tok('--ink') });
  const flush = () => {
    if (run.length > 1) {
      const step = Math.ceil(run.length / 300), v = run.filter((_, k) => k % step === 0 || k === run.length - 1).map(p => new T.Vector3(...p));
      pathG.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(v), Math.min(900, 3 * v.length), 0.012, 6), ink));
    }
    run = [];
  };
  for (const [a, b] of pts) {
    if (Math.abs(a) <= R && Math.abs(b) <= R) run.push([a / R, b / R, z(a, b) + 0.02]); else flush();
  }
  flush();
  const [a, b] = pts.at(-1), cur = new T.Mesh(new T.SphereGeometry(0.04, 20, 14), new T.MeshStandardMaterial({ color: tok('--gold'), emissive: tok('--gold'), emissiveIntensity: 0.35 }));
  const ca = Math.max(-R, Math.min(R, a)), cb = Math.max(-R, Math.min(R, b));
  cur.position.set(ca / R, cb / R, z(ca, cb) + 0.03); pathG.add(cur);
  stage.render();
}

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
  sel('drop', [0, 0.1, 0.2, 0.3, 0.5].map(v => [v, v]), S.drop, v => { S.drop = +v; save(); draw(); });
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
$('landBtn').onclick = landscapeCompute;
$('landDir').value = S.landDir;
$('landDir').onchange = e => { S.landDir = e.target.value; save(); if (land) landscapeCompute(); };
document.querySelectorAll('#landView button').forEach(b => { b.onclick = () => { S.land3d = b.dataset.v === '3d'; save(); drawLand(true); }; });
onTheme(() => { drawLand(true); draw(); });
$('regen').onclick = () => { S.seed = Math.floor(Math.random() * 1e6); reset(); };
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});
reset();
