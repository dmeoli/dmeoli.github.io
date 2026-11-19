// Scene Q: Hopfield networks, after J. J. Hopfield, "Neural networks and
// physical systems with emergent collective computational abilities" (1982),
// D. Krotov and J. J. Hopfield, "Dense associative memory for pattern
// recognition" (2016), and H. Ramsauer et al., "Hopfield networks is all you
// need" (2020). The network recalls a glyph of 12 x 12 pixels from a
// corrupted cue while its energy goes down; the landscape is drawn on the
// plane of the first two principal directions of the stored glyphs; the
// capacity is measured on random patterns, adding them one at a time.

import * as THREE from 'three';
import { stage3d, rod, ball, clear, label } from './stage3d.js';
import { t as tx, onLang, onTheme } from './i18n.js';
import {
  N, KEYS, glyph, rng, corrupt, randomPattern, hebbian, projection, energy, update, permutation,
  overlaps, denseUpdate, denseEnergy, recallClassical, recallDense, plane, dot,
} from './hopfield-model.js';
import { drawState, drawGlyphs, drawBars, drawEnergy, drawCapacity } from './hopfield-views.js';

const $ = id => document.getElementById(id);
const GLYPHS = Object.fromEntries(KEYS.map(k => [k, glyph(k)]));
const S = { net: 'hebb', noise: 0.1, lb: -0.7, stored: 'IQVXZ', cue: 'Q', seed: 1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
if (!['hebb', 'proj', 'dense'].includes(S.net)) S.net = 'hebb';
S.stored = [...new Set([...String(S.stored).toUpperCase()].filter(k => KEYS.includes(k)))].join('') || 'IQVXZ';
S.noise = Math.max(0, Math.min(0.5, S.noise || 0)); S.lb = Math.max(-2.5, Math.min(0, S.lb || 0));
if (S.cue !== 'random' && !S.stored.includes(S.cue)) S.cue = S.stored[0];
const beta = () => 10 ** S.lb;
const dense = () => S.net === 'dense';

// the memory: the stored glyphs, the weights, the plane of the landscape
let keys, X, W, P2, cue, run, timer = null, glyphHits = [];
function memory() {
  keys = [...S.stored]; X = keys.map(k => GLYPHS[k]);
  W = S.net === 'proj' ? projection(X) : hebbian(X);
  P2 = plane(X, rng(5));
  surface();
}
function newCue() {
  const r = rng(S.seed * 7919 + 13);
  cue = S.cue === 'random' ? randomPattern(r) : S.cue === 'drawn' ? cue : corrupt(GLYPHS[S.cue], S.noise, r);
  reset();
}
const E = s => dense() ? denseEnergy(X, s, beta()) : energy(W, s);
function reset() {
  stop();
  const s = Float64Array.from(cue);
  run = { s, t: 0, hot: -1, last: null, quiet: 0, done: false, order: [], pos: 0, r: rng(S.seed * 31 + 7), hist: [{ t: 0, E: E(s) }], path: [] };
  run.path.push(point(s, run.hist[0].E));
  save(); draw();
}
const point = (s, e) => { const [a, b] = P2.coords(s); return { a, b, E: e }; };

// one update: a neuron of the classical network, or the whole state of the dense one
function step() {
  if (run.done) return;
  if (dense()) {
    const { xi, p } = denseUpdate(X, run.s, beta());
    let d = 0; for (let j = 0; j < N; j++) d = Math.max(d, Math.abs(xi[j] - run.s[j]));
    run.s = xi; run.t++; run.last = { p, d };
    const e = E(xi); run.hist.push({ t: run.t, E: e }); run.path.push(point(xi, e));
    if (d < 1e-6 || run.t >= 40) run.done = true;
    return;
  }
  if (run.pos >= run.order.length) { run.order = permutation(run.r); run.pos = 0; }
  const u = update(W, run.s, run.order[run.pos++]);
  run.t++; run.hot = u.i; run.last = u;
  const e = run.hist.at(-1).E + u.dE;
  run.hist.push({ t: run.t, E: e });
  if (u.flipped) { run.quiet = 0; run.path.push(point(run.s, e)); } else if (++run.quiet >= N) run.done = true;
}

// ------------------------------------------------------------------ drawing
function draw() {
  drawState($('state'), { s: run.s, hot: dense() ? -1 : run.hot, flipped: run.last && run.last.flipped });
  glyphHits = drawGlyphs($('glyphs'), { keys: KEYS, glyphs: GLYPHS, stored: new Set(keys), cue: S.cue });
  const w = dense() ? (run.last ? run.last.p : denseUpdate(X, run.s, beta()).p) : overlaps(X, run.s);
  drawBars($('bars'), { keys, values: w, signed: !dense(), cue: S.cue });
  drawEnergy($('energy'), run.hist, dense());
  drawPath();
  report(w);
  $('count').textContent = run.t;
  $('noisev').textContent = `${Math.round(100 * S.noise)}%`;
  $('betav').textContent = beta() < 0.1 ? beta().toFixed(3) : beta().toFixed(2);
  $('lb').disabled = !dense();
  for (const e of document.querySelectorAll('[data-net]')) e.hidden = !e.dataset.net.split(' ').includes(S.net);
  // the live values beside the equations
  const L = run.last;
  $('vE').textContent = $('vE2').textContent = run.hist.at(-1).E.toFixed(2);
  if (!dense()) {
    $('vh').textContent = L ? `h = ${L.h.toFixed(3)}` : '';
    $('vdE').textContent = L ? `${tx('last', 'ultimo')}: ${L.dE.toFixed(3)}` : '';
  } else $('vp').textContent = L ? `max ${Math.max(...L.p).toFixed(3)}` : '';
}

function report(w) {
  const name = k => (k === 'random' ? tx('a random state', 'uno stato casuale') : k === 'drawn' ? tx('the drawing', 'il disegno') : k);
  const best = w.reduce((b, v, m) => (Math.abs(v) > Math.abs(w[b]) ? m : b), 0);
  const ov = overlaps(X, dense() ? run.s.map(v => (v >= 0 ? 1 : -1)) : run.s), bo = ov.reduce((b, v, m) => (Math.abs(v) > Math.abs(ov[b]) ? m : b), 0);
  const m = ov[bo], k = keys[bo], f = v => v.toFixed(2);
  let s;
  if (!run.t) s = tx(`The cue is ${name(S.cue)}${S.cue.length === 1 ? ` with ${Math.round(100 * S.noise)}% of its pixels flipped` : ''}, at energy ${f(run.hist[0].E)}; Step updates ${dense() ? 'the whole state once' : 'one neuron, Play keeps going until a whole sweep flips nothing'}.`,
    `L'indizio è ${name(S.cue)}${S.cue.length === 1 ? ` con il ${Math.round(100 * S.noise)}% dei pixel invertiti` : ''}, con energia ${f(run.hist[0].E)}; Passo aggiorna ${dense() ? "l'intero stato una volta" : 'un neurone, Avvia prosegue finché un giro completo non inverte più nulla'}.`);
  else if (!run.done && !dense()) {
    const L = run.last, r = Math.floor(L.i / 12) + 1, c = (L.i % 12) + 1;
    s = L.flipped
      ? tx(`Update ${run.t}: the neuron in row ${r}, column ${c} has local field h = ${L.h.toFixed(3)} and flips from ${L.old} to ${L.v}, so the energy drops by 2|h| = ${(-L.dE).toFixed(3)}.`,
        `Aggiornamento ${run.t}: il neurone di riga ${r}, colonna ${c} ha campo locale h = ${L.h.toFixed(3)} e passa da ${L.old} a ${L.v}, così l'energia scende di 2|h| = ${(-L.dE).toFixed(3)}.`)
      : tx(`Update ${run.t}: the neuron in row ${r}, column ${c} has local field h = ${L.h.toFixed(3)}, of the same sign as its state, and stays; the energy does not change.`,
        `Aggiornamento ${run.t}: il neurone di riga ${r}, colonna ${c} ha campo locale h = ${L.h.toFixed(3)}, dello stesso segno del suo stato, e non cambia; l'energia non cambia.`);
  } else if (!run.done) {
    s = tx(`Update ${run.t}: the softmax puts ${f(Math.max(...run.last.p))} of its weight on ${keys[best]}, and the new state is the average of the stored glyphs with these weights.`,
      `Aggiornamento ${run.t}: la softmax mette ${f(Math.max(...run.last.p))} del suo peso su ${keys[best]}, e il nuovo stato è la media dei glifi memorizzati con questi pesi.`);
  } else {
    const where = dense()
      ? tx(`a fixed point after ${run.t} updates`, `un punto fisso dopo ${run.t} aggiornamenti`)
      : tx(`a fixed point after ${run.t} updates (a whole sweep without flips)`, `un punto fisso dopo ${run.t} aggiornamenti (un giro intero senza inversioni)`);
    const what = m >= 0.95 && S.cue.length > 1
      ? tx(`its signs have overlap ${f(m)} with ${k}, the stored glyph it has fallen into`, `i suoi segni hanno sovrapposizione ${f(m)} con ${k}, il glifo memorizzato in cui è caduto`)
      : m >= 0.95 && S.cue === k
      ? tx(`its signs have overlap ${f(m)} with ${k}, which is recalled`, `i suoi segni hanno sovrapposizione ${f(m)} con ${k}, che è richiamato`)
      : m <= -0.95 ? tx(`it is the negative of ${k}, which is a minimum as well since E(−s) = E(s)`, `è il negativo di ${k}, anch'esso un minimo poiché E(−s) = E(s)`)
        : m >= 0.95 ? tx(`its signs have overlap ${f(m)} with ${k}, not with the glyph of the cue`, `i suoi segni hanno sovrapposizione ${f(m)} con ${k}, non con il glifo dell'indizio`)
          : tx(`no stored glyph is there: the largest overlap is ${f(m)}, with ${k}, so it is a spurious minimum, typically a mixture of several glyphs`,
            `lì non c'è alcun glifo memorizzato: la sovrapposizione più grande è ${f(m)}, con ${k}, quindi è un minimo spurio, tipicamente una miscela di più glifi`);
    s = tx(`The state has reached ${where} at energy ${f(run.hist.at(-1).E)}; ${what}.`, `Lo stato ha raggiunto ${where} con energia ${f(run.hist.at(-1).E)}; ${what}.`);
  }
  $('rep').textContent = s;
}

// --------------------------------------------------------- the landscape in 3D
const G = 72;
let st = null, surfG = new THREE.Group(), marksG = new THREE.Group(), pathG = new THREE.Group(), scale = null;
function surface() {
  if (!st) {
    st = stage3d($('landscape'), { camera: [2.9, -3.3, 2.5], target: [0, 0, 0.25], aspect: 0.62, onTheme: () => { surface(); } });
    st.content.add(surfG, marksG, pathG);
  }
  clear(surfG); clear(marksG);
  const C = st.colors, cs = X.map(x => P2.coords(x));
  const R = 1.35 * Math.max(4, ...cs.flat().map(Math.abs));
  const vals = new Float64Array(G * G);
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    let x = P2.point((2 * j / (G - 1) - 1) * R, (2 * i / (G - 1) - 1) * R);
    if (!dense()) x = x.map(v => (v >= 0 ? 1 : -1));
    vals[i * G + j] = E(x);
  }
  let lo = Infinity, hi = -Infinity; for (const v of vals) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi - lo < 1e-9) hi = lo + 1;
  scale = { R, lo, hi, z: e => 0.85 * Math.max(-0.05, Math.min(1.1, (e - lo) / (hi - lo))) };
  const pos = new Float32Array(G * G * 3), colr = new Float32Array(G * G * 3), idx = [];
  const deep = C.accent, high = C.lilac.clone().lerp(C.ground, 0.3), tmp = new THREE.Color();
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const k = i * G + j, f = (vals[k] - lo) / (hi - lo);
    pos.set([2 * j / (G - 1) - 1, 2 * i / (G - 1) - 1, scale.z(vals[k])], 3 * k);
    tmp.copy(deep).lerp(high, f); colr.set([tmp.r, tmp.g, tmp.b], 3 * k);
    if (i < G - 1 && j < G - 1) idx.push(k, k + 1, k + G, k + 1, k + G + 1, k + G);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  surfG.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })));
  // the stored glyphs, at the height of their own energy
  const mat = new THREE.MeshLambertMaterial({ color: C.ink });
  X.forEach((x, m) => {
    const [a, b] = cs[m], p = [a / R, b / R, scale.z(E(x))];
    marksG.add(ball(p, 0.03, mat));
    const l = label(keys[m], C.ink, 0.09); l.position.set(p[0], p[1], p[2] + 0.1); marksG.add(l);
  });
  st.setAxes({ origin: [-1, -1, 0], ends: [[1.15, -1, 0], [-1, 1.15, 0], [-1, -1, 1.05]], names: ['u1', 'u2', 'E'], size: 0.07 });
  if (run) drawPath();
}
function drawPath() {
  if (!st || !scale) return;
  clear(pathG);
  const C = st.colors, mat = new THREE.MeshLambertMaterial({ color: C.gold });
  const P = run.path.map(q => [Math.max(-1.1, Math.min(1.1, q.a / scale.R)), Math.max(-1.1, Math.min(1.1, q.b / scale.R)), scale.z(q.E) + 0.02]);
  for (let k = 1; k < P.length; k++) pathG.add(rod(P[k - 1], P[k], 0.009, mat));
  pathG.add(ball(P[0], 0.025, new THREE.MeshLambertMaterial({ color: C.gold, transparent: true, opacity: 0.5 })));
  pathG.add(ball(P.at(-1), 0.04, mat));
}

// ---------------------------------------------------------------- capacity
const PMAX = 2 * N, SCHED = [];
for (let p = 1; p <= 32; p++) SCHED.push(p);
SCHED.push(36, 40, 48, 56, 64, 80, 96, 112, 128, 144, 176, 208, 240, 288);
let cap, capTimer = null;
function capReset() {
  capStop();
  const r = rng(2024);
  cap = { pats: Array.from({ length: PMAX }, () => randomPattern(r)), k: 0, classical: [], dense: [] };
  drawCap();
}
const capTests = p => { const n = Math.min(p, 40); return Array.from({ length: n }, (_, k) => Math.floor(k * p / n)); };
function capStep() {
  if (cap.k >= SCHED.length) return capStop();
  const p = SCHED[cap.k++], Xp = cap.pats.slice(0, p), tests = capTests(p);
  const c = recallClassical(hebbian(Xp), Xp, tests, 0.1, rng(p * 101 + 1));
  cap.classical.push({ p, ...c });
  cap.dense.push({ p, r: recallDense(Xp, tests, 0.1, beta(), rng(p * 101 + 1)) });
  drawCap();
}
function capDense() { cap.dense = cap.classical.map(({ p }) => ({ p, r: recallDense(cap.pats.slice(0, p), capTests(p), 0.1, beta(), rng(p * 101 + 1)) })); }
function capStop() { clearInterval(capTimer); capTimer = null; $('capplay').textContent = tx('Play', 'Avvia'); }
function capPlay() {
  if (capTimer) return capStop();
  if (cap.k >= SCHED.length) capReset();
  $('capplay').textContent = tx('Pause', 'Pausa');
  capTimer = setInterval(capStep, 700);   // one value of p every 0.7 s, so that its report can be read
}
function drawCap() {
  drawCapacity($('cap'), { N, pMax: PMAX, classical: cap.classical, dense: cap.dense });
  $('capp').textContent = cap.k ? SCHED[cap.k - 1] : 0;
  const c = cap.classical.at(-1), d = cap.dense.at(-1), pct = v => `${Math.round(100 * v)}%`;
  $('caprep').textContent = !c
    ? tx(`No pattern stored yet; Add pattern stores the next random pattern of ${N} pixels and measures the recall of up to 40 of the stored ones, Play keeps adding until p = ${PMAX} = 2N.`,
      `Nessun pattern memorizzato; Aggiungi pattern memorizza il prossimo pattern casuale di ${N} pixel e misura il richiamo di al più 40 di quelli memorizzati, Avvia continua ad aggiungere fino a p = ${PMAX} = 2N.`)
    : tx(`With p = ${c.p} patterns (p/N = ${(c.p / N).toFixed(3)}) the classical network recalls ${pct(c.cue)} of them from a cue and keeps ${pct(c.self)} when started on the pattern itself` +
      (c.failOverlap != null ? `; the failed recalls stop at spurious minima with mean overlap ${c.failOverlap.toFixed(2)}` : '') + `; the dense network, with β = ${beta().toPrecision(2)}, recalls ${pct(d.r)} in one update.`,
    `Con p = ${c.p} pattern (p/N = ${(c.p / N).toFixed(3)}) la rete classica ne richiama il ${pct(c.cue)} da un indizio e ne conserva il ${pct(c.self)} partendo dal pattern stesso` +
      (c.failOverlap != null ? `; i richiami falliti si fermano in minimi spuri con sovrapposizione media ${c.failOverlap.toFixed(2)}` : '') + `; la rete densa, con β = ${beta().toPrecision(2)}, ne richiama il ${pct(d.r)} in un aggiornamento.`);
}

// ---------------------------------------------------------------- controls
function stop() { cancelAnimationFrame(timer); timer = null; $('play').textContent = tx('Play', 'Avvia'); }
function play() {
  if (timer) return stop();
  if (run.done) reset();
  $('play').textContent = tx('Pause', 'Pausa');
  let last = 0;
  const loop = now => {
    // a synchronous update of the dense network stays for 0.8 s; the classical
    // network runs through the neurons that keep their sign and stops for
    // 0.5 s on each one that flips, so that every flip is seen in its frame
    if (dense()) { if (now - last >= 800) { step(); last = now; draw(); } }
    else if (now - last >= 500) {
      for (let k = 0; k < N && !run.done; k++) { step(); if (run.last.flipped) break; }
      last = now; draw();
    }
    if (run.done) return stop();
    timer = requestAnimationFrame(loop);
  };
  timer = requestAnimationFrame(loop);
}
function save() { history.replaceState(null, '', '#' + new URLSearchParams({ net: S.net, noise: S.noise, lb: S.lb, stored: S.stored, cue: S.cue === 'drawn' ? S.stored[0] : S.cue, seed: S.seed })); }
function cueOptions() {
  const sel = $('cue');
  sel.replaceChildren(...[...keys, 'random', 'drawn'].map(k => {
    const o = document.createElement('option'); o.value = k;
    o.textContent = k === 'random' ? tx('random state', 'stato casuale') : k === 'drawn' ? tx('drawn by hand', 'disegnato a mano') : k;
    if (k === 'drawn') o.disabled = true;
    return o;
  }));
  sel.value = S.cue;
}

$('net').value = S.net; $('noise').value = S.noise; $('lb').value = S.lb;
$('net').onchange = e => { S.net = e.target.value; memory(); reset(); };
$('noise').oninput = e => { S.noise = +e.target.value; $('noisev').textContent = `${Math.round(100 * S.noise)}%`; };
$('noise').onchange = () => { if (S.cue === 'drawn') S.cue = keys[0]; cueOptions(); newCue(); };
$('lb').oninput = e => { S.lb = +e.target.value; if (dense()) { surface(); reset(); } else draw(); };
$('lb').onchange = () => { capDense(); drawCap(); };
$('cue').onchange = e => { S.cue = e.target.value; newCue(); };
$('newcue').onclick = () => { S.seed++; if (S.cue === 'drawn') { S.cue = keys[0]; cueOptions(); } newCue(); };
$('reset').onclick = reset;
$('step').onclick = () => { stop(); if (run.done) reset(); else { step(); draw(); } };
$('play').onclick = play;
$('capadd').onclick = () => { capStop(); capStep(); };
$('capplay').onclick = capPlay;
$('capreset').onclick = capReset;
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); $('step').onclick(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});

// a click on a glyph stores it or forgets it (one at least stays)
$('glyphs').onclick = e => {
  const r = $('glyphs').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const h = glyphHits.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  if (!h) return;
  if (S.stored.includes(h.key)) { if (S.stored.length > 1) S.stored = S.stored.replace(h.key, ''); }
  else S.stored += h.key;
  memory();
  if (S.cue.length === 1 && !S.stored.includes(S.cue)) { S.cue = S.stored[0]; cueOptions(); newCue(); }
  else { cueOptions(); reset(); }
};
// drawing on the state: the first pixel touched is flipped, the others take its new value
let paint = null;
const cell = e => {
  const r = $('state').getBoundingClientRect(), c = r.width / 12;
  const q = Math.floor((e.clientX - r.left) / c), w = Math.floor((e.clientY - r.top) / c);
  return q >= 0 && q < 12 && w >= 0 && w < 12 ? w * 12 + q : -1;
};
function paintAt(e) {
  const i = cell(e); if (i < 0) return;
  if (paint === null) paint = run.s[i] >= 0 ? -1 : 1;
  if (S.cue !== 'drawn') { cue = Float64Array.from(run.s.map(v => (v >= 0 ? 1 : -1))); S.cue = 'drawn'; $('cue').value = 'drawn'; }
  cue[i] = paint; reset();
}
$('state').onpointerdown = e => { stop(); paint = null; $('state').setPointerCapture(e.pointerId); paintAt(e); };
$('state').onpointermove = e => { if (paint !== null) paintAt(e); };
$('state').onpointerup = $('state').onpointercancel = () => { paint = null; };

let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { draw(); drawCap(); }, 100); });
onTheme(() => { if (run) { draw(); drawCap(); } });
const OPTS = { net: { hebb: ['classical, Hebbian rule', 'classica, regola di Hebb'], proj: ['classical, projection rule', 'classica, regola di proiezione'], dense: ['dense (modern)', 'densa (moderna)'] } };
function words() {
  document.title = tx('Hopfield Networks', 'Reti di Hopfield');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  $('reset').textContent = tx('Reset', 'Ricomincia'); $('step').textContent = tx('Step', 'Passo');
  $('play').textContent = timer ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('newcue').textContent = tx('New cue', 'Nuovo indizio');
  $('capadd').textContent = tx('Add pattern', 'Aggiungi pattern');
  $('capplay').textContent = capTimer ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('capreset').textContent = tx('Reset', 'Ricomincia');
  if (keys) cueOptions();
}
onLang(() => { words(); if (run) { draw(); drawCap(); } });
memory(); words(); cueOptions();
if (S.cue === 'drawn') S.cue = keys[0];
newCue(); capReset();
// for the checks: the state of the scene
window.hopfield = { S, get run() { return run; }, get cap() { return cap; }, X: () => X, W: () => W, dot };
