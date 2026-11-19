// Scene N: the latent space of an autoencoder with a code of 2 numbers and of
// its variational version, after G. E. Hinton and R. R. Salakhutdinov,
// "Reducing the Dimensionality of Data with Neural Networks" (Science, 2006),
// and D. P. Kingma and M. Welling, "Auto-Encoding Variational Bayes" (ICLR,
// 2014): the ideas rebuilt from their equations, no figure or code of theirs is
// used. The model (src/latent-model.js) is trained with Adam on the synthetic
// digits of src/convdata.js, scaled and centred (src/latent-data.js); the reader sees the codes of held-out digits move
// in the plane, the grid of images decoded over the same square, a point of
// the plane decoded as it is dragged, the interpolation between two digits,
// the code and the reconstruction of a digit drawn by hand, and the two terms
// of the loss.

import { makeModel, trainBatch, forward, losses, decode, code, D } from './latent-model.js';
import { palette, drawPlane, drawGrid, drawImage, drawStrip, drawCurves, toPx, toZ, FR, CF } from './latent-views.js';
import { makeNormSet, normalize } from './latent-data.js';
import { N } from './convnet.js';
import { rng } from './nn.js';
import { t, onLang, onTheme } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { model: 'ae', beta: 1, H: 128, lr: 0.002, seed: 1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => {
  if (k === 'model') { if (v === 'ae' || v === 'vae') S.model = v; }
  else if (k in S && Number.isFinite(+v)) S[k] = +v;
});
const NTRAIN = 4000, NTEST = 600, B = 32, G = 12, STEPS = 9;

let m, steps = 0, hist = [], acc = { rec: 0, kl: 0, n: 0 }, every = 5, order = [], at = 0, shuf = rng(1), noise = rng(2);
let running = false, P = null, lit = null;
// the state drawn by the views
const st = { view: { cx: 0, cy: 0, R: 3 }, codes: null, Y: null, sel: [], path: null, steps: STEPS, probe: [0, 0], drawn: null, grid: null, G, strip: null, vae: false };
let held = null;                          // the held-out terms of the last full pass
let pass = { at: 0, rec: 0, kl: 0 }, gridStamp = -1, fresh = false;
let pad = new Float64Array(D), padN = null;      // the drawing, and the same scaled and centred

// ------------------------------------------------------------------ the data, made in slices
// the held-out digits first, then the training digits; training may start
// once the first 500 of these are written
let test = null, data = null;
const pool = { X: [], Y: [] }, te = { X: [], Y: [] };
function makeData(ready) {
  const chunk = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 14 && pool.X.length < NTRAIN) {
      if (te.X.length < NTEST) { const p = makeNormSet(25, 2 + te.X.length / 25); te.X.push(...p.X); te.Y.push(...p.Y); }
      else { const p = makeNormSet(25, 1000 + pool.X.length / 25); pool.X.push(...p.X); pool.Y.push(...p.Y); }
    }
    if (te.X.length >= NTEST && !test) { test = te; st.Y = te.Y; st.codes = new Array(NTEST).fill(null); }
    if (test && pool.X.length >= 500 && !data) { data = pool; ready(); }
    if (pool.X.length < NTRAIN) requestAnimationFrame(chunk);
    if (!data) $('explain').textContent = t(`Writing the digits: ${te.X.length + pool.X.length} of ${NTEST + NTRAIN}.`, `Scrittura delle cifre: ${te.X.length + pool.X.length} su ${NTEST + NTRAIN}.`);
    else if (!running) refresh();
  };
  chunk();
}

function reset() {
  stop();
  m = makeModel(S.model === 'vae', S.H, S.seed);
  st.vae = m.vae;
  steps = 0; hist = []; acc = { rec: 0, kl: 0, n: 0 }; every = 5; order = []; at = 0;
  shuf = rng(S.seed + 1); noise = rng(S.seed + 2);
  held = null; pass = { at: 0, rec: 0, kl: 0 }; fresh = true;
  if (st.codes) st.codes.fill(null);
  $('beta').disabled = S.model !== 'vae';
  save(); kick(); refresh();
}

function step() {
  if (at + B > order.length) {           // a new epoch: the training set reshuffled
    order = data.X.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuf() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    at = 0;
  }
  const L = trainBatch(m, data.X, order.slice(at, at + B), S.lr, S.beta, noise);
  at += B; steps++;
  acc.rec += L.rec; acc.kl += L.kl; acc.n++;
  if (acc.n >= every) {
    hist.push({ step: steps, rec: acc.rec / acc.n, kl: acc.kl / acc.n }); acc = { rec: 0, kl: 0, n: 0 };
    if (hist.length > 320) {                // halve the resolution of the history
      const h = [];
      for (let i = 0; i + 1 < hist.length; i += 2) h.push({ step: hist[i + 1].step, rec: (hist[i].rec + hist[i + 1].rec) / 2, kl: (hist[i].kl + hist[i + 1].kl) / 2 });
      hist = h; every *= 2;
    }
  }
}

// the codes of the held-out digits (for the VAE its mean), a slice at a time;
// with full, also their terms of the loss (which need the decoder too)
function codeSlice(n, full = true) {
  if (!test) return false;
  if (!full) pass.partial = true;
  const to = Math.min(NTEST, pass.at + n);
  for (let i = pass.at; i < to; i++) {
    if (!full) { st.codes[i] = code(m, test.X[i]); continue; }
    const c = forward(m, test.X[i], [0, 0]), L = losses(m, c);
    st.codes[i] = [c.mu[0], c.mu[1]]; pass.rec += L.rec; pass.kl += L.kl;
  }
  pass.at = to;
  if (pass.at >= NTEST) {
    if (!pass.partial) held = { rec: pass.rec / NTEST, kl: pass.kl / NTEST, step: steps };
    pass = { at: 0, rec: 0, kl: 0 };
    return true;
  }
  return false;
}

// the square of the plane on view: for the VAE centred at the origin, for the
// autoencoder on the bulk of the codes (from the 2nd to the 98th percentile)
function target() {
  const c = st.codes && st.codes.filter(Boolean);
  if (!c || c.length < 50) return null;
  const q = (k, p) => { const a = c.map(z => z[k]).sort((u, v) => u - v); return a[Math.floor(p * (a.length - 1))]; };
  const lo = [q(0, 0.02), q(1, 0.02)], hi = [q(0, 0.98), q(1, 0.98)];
  if (m.vae) {
    const R = Math.max(2.6, 1.15 * Math.max(-lo[0], -lo[1], hi[0], hi[1]));
    return { cx: 0, cy: 0, R };
  }
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  return { cx, cy, R: Math.max(1e-3, 0.6 * Math.max(hi[0] - lo[0], hi[1] - lo[1])) };
}
function follow(a) {
  const t = target(); if (!t) return;
  const v = st.view;
  if (fresh) { Object.assign(v, t); st.probe = [t.cx, t.cy]; fresh = false; return; }
  v.cx += a * (t.cx - v.cx); v.cy += a * (t.cy - v.cy); v.R += a * (t.R - v.R);
}

function decodeGrid() {
  const v = st.view, g = [];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++)
    g.push(decode(m, [v.cx - v.R + (j + 0.5) * 2 * v.R / G, v.cy + v.R - (i + 0.5) * 2 * v.R / G]).y);
  st.grid = g;
}

function loop() {
  if (!running) return;
  const t0 = performance.now();
  do step(); while (performance.now() - t0 < 28);
  codeSlice(150, false); follow(0.12);
  if (t0 - gridStamp > 500) { gridStamp = t0; decodeGrid(); }
  refresh();
  requestAnimationFrame(loop);
}

// when paused, the codes and the grid are brought up to date a slice per frame
let idle = false;
function kick() {
  pass = { at: 0, rec: 0, kl: 0 };
  if (!idle) { idle = true; requestAnimationFrame(idleWork); }
}
function idleWork() {
  if (running || !test) { idle = false; return; }
  const done = codeSlice(200);
  if (done) { follow(1); decodeGrid(); idle = false; refresh(); return; }
  refresh();
  requestAnimationFrame(idleWork);
}

function start() {
  if (!data) return;
  running = true; $('train').textContent = t('Pause', 'Pausa');
  requestAnimationFrame(loop);
}
function stop() {
  if (!running) return;
  running = false; $('train').textContent = t('Play', 'Avvia');
  kick(); refresh();
}

// ------------------------------------------------------------------ everything
const has = x => x.some(v => v > 0);
function refresh() {
  if (!P) { palette_(); }
  // the interpolation, between the current codes of the two clicked digits
  if (st.sel.length === 2 && st.codes[st.sel[0]] && st.codes[st.sel[1]]) {
    const [a, b] = st.sel.map(k => st.codes[k]);
    st.path = [a, b];
    st.strip = [test.X[st.sel[0]]];
    for (let t = 0; t <= STEPS; t++) st.strip.push(decode(m, [a[0] + t / STEPS * (b[0] - a[0]), a[1] + t / STEPS * (b[1] - a[1])]).y);
    st.strip.push(test.X[st.sel[1]]);
  } else { st.path = null; st.strip = null; }
  padN = has(pad) ? normalize(pad) : null;
  st.drawn = padN ? code(m, padN) : null;
  // the ring stays inside the square on view, which follows the codes
  const vw = st.view;
  st.probe = st.probe.map((t, k) => Math.max((k ? vw.cy : vw.cx) - vw.R, Math.min((k ? vw.cy : vw.cx) + vw.R, t)));
  drawPlane($('lat'), st, P); drawGrid($('grid'), st, P);
  const yp = decode(m, st.probe).y;
  drawImage($('probe'), yp, P);
  drawStrip($('path'), st, P);
  drawPad();
  const lc = $('lc'), narrow = lc.clientWidth > 0 && lc.clientWidth < 600;
  if (narrow !== (lc.width === 520)) { lc.width = narrow ? 520 : 1040; lc.height = narrow ? 300 : 240; }
  curvesAt = drawCurves($('lc'), hist, m.vae, lit, P);
  // the readouts
  const ep = data ? steps * B / NTRAIN : 0;
  $('count').textContent = `${ep.toFixed(1)} · ${steps}`;
  $('step').disabled = $('train').disabled = !data;
  const v = st.view, cell = 2 * v.R / G, nb = nearest(st.probe);
  $('probenote').innerHTML = `z = (<b>${st.probe[0].toFixed(2)}</b>, <b>${st.probe[1].toFixed(2)}</b>)` +
    (m.vae ? t(`<br>density of the prior there: ${(Math.exp(-(st.probe[0] ** 2 + st.probe[1] ** 2) / 2) / (2 * Math.PI)).toFixed(3)} (at the origin 0.159)`,
      `<br>densità della prior in quel punto: ${(Math.exp(-(st.probe[0] ** 2 + st.probe[1] ** 2) / 2) / (2 * Math.PI)).toFixed(3)} (nell'origine 0.159)`) : '') +
    (nb ? t(`<br>nearest held-out code: a ${nb.y}, at distance ${nb.d.toFixed(2)}`, `<br>codice tenuto da parte più vicino: un ${nb.y}, a distanza ${nb.d.toFixed(2)}`) : '');
  const dist = st.path ? (Math.hypot(st.path[0][0] - st.path[1][0], st.path[0][1] - st.path[1][1])).toFixed(2) : '';
  $('pathnote').textContent = st.sel.length === 0 ? t('Click a digit on the plane to choose A, then another to choose B.', 'Clicca una cifra del piano per scegliere A, poi un\'altra per scegliere B.')
    : st.sel.length === 1 ? t(`A is a held-out ${test.Y[st.sel[0]]}; now click B.`, `A è un ${test.Y[st.sel[0]]} tenuto da parte; ora scegli B.`)
    : !st.path ? t(`From a ${test.Y[st.sel[0]]} to a ${test.Y[st.sel[1]]}.`, `Da un ${test.Y[st.sel[0]]} a un ${test.Y[st.sel[1]]}.`)
    : t(`From a ${test.Y[st.sel[0]]} to a ${test.Y[st.sel[1]]}, ${dist} apart in the plane; click again to start over.`,
      `Da un ${test.Y[st.sel[0]]} a un ${test.Y[st.sel[1]]}, a distanza ${dist} nel piano; clicca di nuovo per ricominciare.`);
  if (st.codes && st.codes.every(Boolean)) {
    let empty = 0;
    const full = new Uint8Array(G * G);
    for (const z of st.codes) {
      const j = Math.floor((z[0] - v.cx + v.R) / cell), i = Math.floor((v.cy + v.R - z[1]) / cell);
      if (i >= 0 && j >= 0 && i < G && j < G) full[i * G + j] = 1;
    }
    for (const f of full) if (!f) empty++;
    $('gridnote').textContent = t(`${empty} of the ${G * G} cells contain no held-out code; each cell is ${cell.toFixed(2)} wide.`,
      `${empty} delle ${G * G} celle non contengono alcun codice tenuto da parte; ogni cella è larga ${cell.toFixed(2)}.`);
  } else $('gridnote').textContent = '';
  if (st.drawn) {
    const c = forward(m, padN, [0, 0]), L = losses(m, c);
    $('padnote').innerHTML = t(`code (<b>${st.drawn[0].toFixed(2)}</b>, <b>${st.drawn[1].toFixed(2)}</b>); reconstruction error ${L.rec.toFixed(1)} nats`,
      `codice (<b>${st.drawn[0].toFixed(2)}</b>, <b>${st.drawn[1].toFixed(2)}</b>); errore di ricostruzione ${L.rec.toFixed(1)} nat`) +
      (m.vae ? `, KL ${L.kl.toFixed(2)}, σ = (${Math.exp(c.lv[0] / 2).toFixed(2)}, ${Math.exp(c.lv[1] / 2).toFixed(2)})` : '');
  } else $('padnote').textContent = t('The pad is empty.', 'Il riquadro è vuoto.');
  if (!data) return;
  const last = hist.length ? hist[hist.length - 1] : null;
  $('lossnote').textContent = last ? t(`On the last ${every} batches of ${B}: reconstruction ${last.rec.toFixed(1)} nats per digit`,
    `Sugli ultimi ${every} batch da ${B}: ricostruzione ${last.rec.toFixed(1)} nat per cifra`) +
    (m.vae ? t(`, KL ${last.kl.toFixed(2)}, so a loss of ${(last.rec + S.beta * last.kl).toFixed(1)} with β = ${S.beta}.`, `, KL ${last.kl.toFixed(2)}, quindi una loss di ${(last.rec + S.beta * last.kl).toFixed(1)} con β = ${S.beta}.`) : '.') : '';
  $('explain').textContent = (m.vae ? t(`VAE with β = ${S.beta}`, `VAE con β = ${S.beta}`) : 'Autoencoder') + t(`, ${S.H} hidden units per side. `, `, ${S.H} unità nascoste per lato. `) +
    (held ? t(`On the ${NTEST} held-out digits (at the mean code${held.step === steps ? '' : `, as of step ${held.step}`}): reconstruction error ${held.rec.toFixed(1)} nats per digit`,
      `Sulle ${NTEST} cifre tenute da parte (nel codice medio${held.step === steps ? '' : `, al passo ${held.step}`}): errore di ricostruzione ${held.rec.toFixed(1)} nat per cifra`) +
      (m.vae ? `, KL ${held.kl.toFixed(2)}` : '') + '.' : t('Coding the held-out digits…', 'Codifica delle cifre tenute da parte…')) +
    (data.X.length < NTRAIN ? t(` Training digits written so far: ${data.X.length} of ${NTRAIN}.`, ` Cifre di addestramento scritte finora: ${data.X.length} su ${NTRAIN}.`) : '');
}

function nearest(z) {
  if (!st.codes || !st.codes.every(Boolean)) return null;
  let best = null;
  st.codes.forEach((c, i) => { const d = Math.hypot(c[0] - z[0], c[1] - z[1]); if (!best || d < best.d) best = { d, y: st.Y[i] }; });
  return best;
}

function drawPad() {
  drawImage($('pad'), pad, P);
  const ctx = $('pad').getContext('2d'), c = $('pad').width / N;
  ctx.strokeStyle = P.rule; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.beginPath();
  for (let k = 1; k < N; k++) { ctx.moveTo(k * c, 0); ctx.lineTo(k * c, 240); ctx.moveTo(0, k * c); ctx.lineTo(240, k * c); }
  ctx.stroke(); ctx.globalAlpha = 1;
  if (st.drawn) drawImage($('recon'), decode(m, st.drawn).y, P);
  else { const r = $('recon').getContext('2d'); r.fillStyle = P.panel; r.fillRect(0, 0, 240, 240); }
}

function palette_() {
  P = palette();
  $('keys').innerHTML = P.cls.map((c, k) => `<li><i style="background:${c}"></i><span style="color:${c}">${k}</span></li>`).join('');
}

function save() { history.replaceState(null, '', '#' + new URLSearchParams({ model: S.model, beta: S.beta, H: S.H, lr: S.lr, seed: S.seed })); }

// ------------------------------------------------------------------ the reader's hand
function canvasPoint(cv, e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height];
}
// on the two views: a drag moves the ring, a click on a digit chooses it for
// the interpolation, a click elsewhere puts the ring there
for (const id of ['lat', 'grid']) {
  const cv = $(id);
  let down = null;
  const inside = ([px, py]) => px >= FR.x0 && py >= FR.y0 && px <= FR.x0 + FR.side && py <= FR.y0 + FR.side;
  cv.addEventListener('pointerdown', e => {
    const p = canvasPoint(cv, e); if (!inside(p)) return;
    down = { p, moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
  });
  cv.addEventListener('pointermove', e => {
    if (!down) return;
    const p = canvasPoint(cv, e);
    if (!down.moved && Math.hypot(p[0] - down.p[0], p[1] - down.p[1]) < 4) return;
    down.moved = true;
    const q = [Math.max(FR.x0, Math.min(FR.x0 + FR.side, p[0])), Math.max(FR.y0, Math.min(FR.y0 + FR.side, p[1]))];
    st.probe = toZ(st.view, ...q); if (!running) refresh();
  });
  const up = e => {
    if (!down) return;
    const wasMove = down.moved, p = down.p; down = null;
    if (wasMove) return;
    let hit = -1;
    if (id === 'lat' && st.codes) {
      let bd = 9;
      st.codes.forEach((c, i) => { if (!c) return; const q = toPx(st.view, c), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; hit = i; } });
    }
    if (hit >= 0) st.sel = st.sel.length >= 2 ? [hit] : [...st.sel, hit];
    else st.probe = toZ(st.view, ...p);
    if (!running) refresh();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { down = null; });
}

// the pad: a soft round brush, in grid units
let drawing = false, last = null;
function brush(gx, gy) {
  for (let i = Math.floor(gy - 2); i <= gy + 2; i++) for (let j = Math.floor(gx - 2); j <= gx + 2; j++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const d = Math.hypot(i + 0.5 - gy, j + 0.5 - gx), v = Math.min(1, Math.max(0, (1.75 - d) / 0.8));
    if (v > pad[i * N + j]) pad[i * N + j] = v;
  }
}
function ink(e) {
  const [px, py] = canvasPoint($('pad'), e), c = $('pad').width / N, p = [px / c, py / c];
  if (last) { const n = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 0.3); for (let t = 1; t <= n; t++) brush(last[0] + (p[0] - last[0]) * t / n, last[1] + (p[1] - last[1]) * t / n); }
  else brush(p[0], p[1]);
  last = p; if (!running) refresh();
}
$('pad').addEventListener('pointerdown', e => { drawing = true; last = null; try { $('pad').setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ } ink(e); });
$('pad').addEventListener('pointermove', e => { if (drawing) ink(e); });
$('pad').addEventListener('pointerup', () => { drawing = false; });
$('pad').addEventListener('pointercancel', () => { drawing = false; });
$('clear').onclick = () => { pad = new Float64Array(D); refresh(); };
let sampleR = rng(7);
$('sample').onclick = () => { if (!test) return; pad = Float64Array.from(test.X[Math.floor(sampleR() * NTEST)]); refresh(); };

// the curves and the formula light each other
let curvesAt = null;
const setLit = v => {
  if (lit === v) return;
  lit = v; v ? $('fig-loss').dataset.lit = v : delete $('fig-loss').dataset.lit;
  drawCurves($('lc'), hist, m.vae, lit, P);
};
$('lc').addEventListener('pointermove', e => {
  if (!curvesAt || !hist.length) return setLit(null);
  const [px, py] = canvasPoint($('lc'), e);
  let k = 0, bd = Infinity;
  hist.forEach((p, i) => { const d = Math.abs(curvesAt.X(p.step) - px); if (d < bd) { bd = d; k = i; } });
  const dr = Math.abs(curvesAt.Yv(hist[k].rec) - py), dk = m.vae ? Math.abs(curvesAt.Yv(hist[k].kl) - py) : Infinity;
  setLit(Math.min(dr, dk) > 40 || px < CF.x0 ? null : dr <= dk ? 'rec' : 'kl');
});
$('lc').addEventListener('pointerleave', () => setLit(null));
for (const formula of document.querySelectorAll('#fig-loss .formula')) {
  formula.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('.frec, .fkl');
    setLit(t ? (t.classList.contains('frec') ? 'rec' : 'kl') : null);
  });
  formula.addEventListener('mouseleave', () => setLit(null));
}

// ------------------------------------------------------------------ controls
for (const k of ['model', 'beta', 'H', 'lr', 'seed']) {
  $(k).value = String(S[k]);
  $(k).onchange = e => { S[k] = k === 'model' ? e.target.value : +e.target.value; reset(); };
}
$('reset').onclick = reset;
$('step').onclick = () => { if (!data) return; stop(); step(); kick(); refresh(); };
$('train').onclick = () => running ? stop() : start();
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('select, input, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('train').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('step').click(); }
});
// a change of the theme on the site, or of the system, recolours the canvases
addEventListener('resize', () => { if (!running) refresh(); });
onTheme(() => { palette_(); refresh(); });

// the texts that are not in the page twice: title, buttons, options
function labels() {
  document.title = t('Latent space playground', 'Laboratorio dello spazio latente');
  $('step').textContent = t('Step', 'Passo'); $('reset').textContent = t('Reset', 'Ricomincia');
  $('train').textContent = running ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('clear').textContent = t('Clear', 'Cancella');
  $('sample').textContent = t('Held-out digit', 'Cifra tenuta da parte');
  for (const o of $('model').options) o.textContent = o.value === 'ae' ? 'autoencoder' : t('variational (VAE)', 'variazionale (VAE)');
}
onLang(() => { labels(); refresh(); });

labels();
reset();
makeData(() => {
  pad = Float64Array.from(test.X[3]);
  st.sel = [1, 7];                        // a 1 and a 7 to start the interpolation with
  kick(); refresh();
});
