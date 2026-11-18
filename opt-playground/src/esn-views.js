// The drawings of the echo state scene, on canvases sized to their box: the
// series with the readout, the reservoir as a ring, the eigenvalues of W, the
// distance between two runs, the readout weights, the memory capacity and the
// comparison with the two networks of LAB3_1. The colours are the tokens of
// style.css, read at every drawing so that both themes work.

import { t as tx } from './i18n.js';

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(c) {
  if (c[0] === '#') {
    if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join('');
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
const mix = (a, b, s) => `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * s)).join(',')})`;
const col = (a, al = 1) => `rgba(${a.join(',')},${al})`;
function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
  return P;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const signed = (P, v, base = P.ground) => mix(base, v >= 0 ? P.accent : P.gold, clamp(Math.abs(v), 0, 1));
const MONO = "'IBM Plex Mono', monospace";
// the colours of the three models, the same in every drawing
export const MODEL = { esn: 'accent', idnn: 'gold', rnn: 'ink-soft' };

function fit(cv, h, square = false) {
  const w = Math.max(240, Math.round(cv.getBoundingClientRect().width || cv.parentNode.clientWidth || 600));
  if (square) h = Math.min(w, h);
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const P = palette();
  ctx.fillStyle = col(P.ground); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w, H: h, P };
}
function text(ctx, P, s, x, y, o = {}) {
  ctx.font = `${o.size || 11}px ${MONO}`; ctx.fillStyle = col(P[o.c || 'ink-soft']);
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.fillText(s, x, y);
}
function line(ctx, pts, style, w = 1.5, dash = []) {
  ctx.strokeStyle = style; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath();
  let pen = false;
  for (const [x, y] of pts) { if (!isFinite(y)) { pen = false; continue; } if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } }
  ctx.stroke(); ctx.setLineDash([]);
}
export const fmt = v => (!isFinite(v) ? '-' : v === 0 ? '0' : Math.abs(v) >= 0.01 && Math.abs(v) < 1000 ? v.toPrecision(3) : v.toExponential(2));
const sup = k => String(k).replace(/-/g, '−').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
const pow10 = k => `10${sup(k)}`;

// ----------------------------------------------------------------- the series
// o = { u, y, yh, t, wash, design, win }; returns the map from an x on the
// overview strip to a step
export function drawSeries(cv, o) {
  const { ctx, W, P } = fit(cv, 250);
  const { u, y, yh, t, wash, design } = o, T = y.length, L = 52, R = W - 10;
  // the overview: the target over the whole series, the regions, the window
  const oy0 = 16, oh = 34, X = s => L + (R - L) * s / T;
  let lo = Infinity, hi = -Infinity;
  for (let s = 0; s < T; s++) { lo = Math.min(lo, y[s]); hi = Math.max(hi, y[s]); }
  const pad = 0.08 * (hi - lo || 1); lo -= pad; hi += pad;
  ctx.fillStyle = col(P.rule, 0.6); ctx.fillRect(X(0), oy0, X(wash) - X(0), oh);
  ctx.fillStyle = col(P.lilac, 0.45); ctx.fillRect(X(design), oy0, R - X(design), oh);
  ctx.strokeStyle = col(P['ink-soft'], 0.8); ctx.lineWidth = 1; ctx.beginPath();
  const cols = Math.round(R - L);
  for (let c = 0; c < cols; c++) {
    const s0 = Math.floor(c * T / cols), s1 = Math.max(s0 + 1, Math.floor((c + 1) * T / cols));
    let a = Infinity, b = -Infinity; for (let s = s0; s < s1; s++) { a = Math.min(a, y[s]); b = Math.max(b, y[s]); }
    const Y = v => oy0 + oh - oh * (v - lo) / (hi - lo);
    ctx.moveTo(L + c + 0.5, Y(a)); ctx.lineTo(L + c + 0.5, Math.min(Y(a) - 0.5, Y(b)));
  }
  ctx.stroke();
  const wl = X(wash) - X(0) > 64;
  if (wl) text(ctx, P, 'washout', X(0) + 3, oy0 - 4, { size: 10 });
  const dl = tx('design: the readout is fitted here', 'design: qui si stima il readout'), dx = wl ? X(wash) + 4 : X(0) + 3;
  ctx.font = `10px ${MONO}`;
  text(ctx, P, dx + ctx.measureText(dl).width + 8 < X(design) ? dl : tx('design', 'design'), dx, oy0 - 4, { size: 10 });
  text(ctx, P, tx('test', 'test'), X(design) + 4, oy0 - 4, { size: 10 });
  const win = o.win, w0 = clamp(t - Math.round(0.75 * win), 0, T - win), w1 = w0 + win;
  ctx.strokeStyle = col(P.accent); ctx.lineWidth = 1.5; ctx.strokeRect(X(w0), oy0 - 1, Math.max(2, X(w1) - X(w0)), oh + 2);
  // the window: the input on top, the target and the readout below
  const x = s => L + (R - L) * (s - w0) / (win - 1);
  const uy0 = 72, uh = 44, yy0 = 132, yh0 = 98;
  let ua = Infinity, ub = -Infinity, ya = Infinity, yb = -Infinity;
  for (let s = w0; s < w1; s++) {
    ua = Math.min(ua, u[s]); ub = Math.max(ub, u[s]); ya = Math.min(ya, y[s]); yb = Math.max(yb, y[s]);
    if (yh && s >= wash) { ya = Math.min(ya, yh[s]); yb = Math.max(yb, yh[s]); }
  }
  const up = 0.05 * (ub - ua || 1), yp = 0.06 * (yb - ya || 1);
  ua -= up; ub += up; ya -= yp; yb += yp;
  const UY = v => uy0 + uh - uh * (v - ua) / (ub - ua), YY = v => yy0 + yh0 - yh0 * (v - ya) / (yb - ya);
  for (const [a, b, c, al] of [[w0, Math.min(w1, wash), P.rule, 0.6], [Math.max(w0, design), w1, P.lilac, 0.45]]) {
    if (b > a) { ctx.fillStyle = col(c, al); ctx.fillRect(x(a) - 0.5, uy0 - 4, x(b - 1) - x(a) + 1, yy0 + yh0 - uy0 + 8); }
  }
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(L, uy0 + uh + 0.5); ctx.lineTo(R, uy0 + uh + 0.5); ctx.moveTo(L, yy0 + yh0 + 0.5); ctx.lineTo(R, yy0 + yh0 + 0.5); ctx.stroke();
  text(ctx, P, 'u(t)', L - 6, uy0 + uh / 2, { align: 'right', base: 'middle', c: 'gold' });
  text(ctx, P, 'y(t)', L - 6, yy0 + yh0 / 2 - 8, { align: 'right', base: 'middle', c: 'ink' });
  text(ctx, P, 'ŷ(t)', L - 6, yy0 + yh0 / 2 + 8, { align: 'right', base: 'middle', c: 'accent' });
  const su = [], sy = [], sh = [];
  for (let s = w0; s < w1; s++) { su.push([x(s), UY(u[s])]); sy.push([x(s), YY(y[s])]); sh.push([x(s), yh && s >= wash ? YY(yh[s]) : NaN]); }
  line(ctx, su, col(P.gold), 1.2);
  line(ctx, sy, col(P.ink), 1.6);
  line(ctx, sh, col(P.accent), 1.6, [4, 3]);
  // the step shown in the ring
  ctx.strokeStyle = col(P.accent, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x(t) + 0.5, uy0 - 6); ctx.lineTo(x(t) + 0.5, yy0 + yh0 + 4); ctx.stroke();
  for (let s = Math.ceil(w0 / 50) * 50; s < w1; s += 50) text(ctx, P, String(s), x(s), yy0 + yh0 + 15, { align: 'center', size: 10 });
  text(ctx, P, `t = ${t}`, Math.min(R - 30, x(t) + 4), uy0 - 8, { c: 'accent', size: 10 });
  return xx => (xx >= L && xx <= R && 1) ? clamp(Math.round((xx - L) / (R - L) * T), 0, T - 1) : null;
}

// ------------------------------------------------------------------- the ring
// o = { N, x (the state at t), u, wout, edges: [[i, j, w]], scale }
export function drawRing(cv, o) {
  const { ctx, W, H, P } = fit(cv, 380);
  const { N, x, wout, edges } = o, cx = W / 2, cy = H / 2, Rr = Math.min(W, H) / 2 - 44;
  const ang = i => -Math.PI / 2 + 2 * Math.PI * i / N, px = i => cx + Rr * Math.cos(ang(i)), py = i => cy + Rr * Math.sin(ang(i));
  // the strongest connections, as chords
  let wm = 0; for (const e of edges) wm = Math.max(wm, Math.abs(e[2]));
  ctx.lineWidth = 0.7;
  for (const [i, j, w] of edges) {
    const a = 0.04 + 0.22 * (Math.abs(w) / (wm || 1)) ** 2;
    ctx.strokeStyle = col(w >= 0 ? P['accent-2'] : P.gold, a);
    ctx.beginPath(); ctx.moveTo(px(j), py(j)); ctx.quadraticCurveTo(cx + 0.35 * (px(i) + px(j) - 2 * cx), cy + 0.35 * (py(i) + py(j) - 2 * cy), px(i), py(i)); ctx.stroke();
  }
  // the readout: outside each unit a radial bar W_out,i x_i(t), outwards when positive
  let cm = 0; for (let i = 0; i < N; i++) cm = Math.max(cm, Math.abs(wout ? wout[i + 1] * x[i] : 0));
  if (wout && cm > 0) {
    ctx.lineWidth = Math.max(1, Math.min(4, 2 * Math.PI * Rr / N * 0.6));
    for (let i = 0; i < N; i++) {
      const c = wout[i + 1] * x[i], l = 26 * Math.abs(c) / cm, r0 = Rr + 9, ca = Math.cos(ang(i)), sa = Math.sin(ang(i));
      ctx.strokeStyle = col(c >= 0 ? P.accent : P.gold, 0.85);
      ctx.beginPath(); ctx.moveTo(cx + r0 * ca, cy + r0 * sa); ctx.lineTo(cx + (r0 + l) * ca, cy + (r0 + l) * sa); ctx.stroke();
    }
  }
  // the units, coloured by their state
  const nr = clamp(2 * Math.PI * Rr / N * 0.42, 1.6, 7);
  for (let i = 0; i < N; i++) {
    ctx.fillStyle = signed(P, x[i]); ctx.beginPath(); ctx.arc(px(i), py(i), nr, 0, 2 * Math.PI); ctx.fill();
    if (nr > 3) { ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.stroke(); }
  }
  // the input, in the centre
  ctx.fillStyle = mix(P.ground, P.gold, clamp(Math.abs(o.uScaled), 0, 1)); ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = col(P.gold); ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, P, 'u(t)', cx, cy, { align: 'center', base: 'middle', c: 'ink', size: 10 });
  text(ctx, P, `ŷ(t) = ${fmt(o.yhat)}`, 8, H - 8, { c: 'accent' });
  text(ctx, P, `y(t) = ${fmt(o.y)}`, W - 8, H - 8, { c: 'ink', align: 'right' });
  text(ctx, P, tx(`${edges.length} strongest of ${o.nnz} connections`, `le ${edges.length} connessioni più forti di ${o.nnz}`), 8, 14, { size: 10 });
}

// ------------------------------------------------------------ the eigenvalues
export function drawEig(cv, o) {
  const { ctx, W, H, P } = fit(cv, 300, true);
  const { re, im, scale, rho } = o, ext = Math.max(1.25, rho * 1.2), cx = W / 2, cy = H / 2, k = (Math.min(W, H) / 2 - 18) / ext;
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - ext * k, cy + 0.5); ctx.lineTo(cx + ext * k, cy + 0.5); ctx.moveTo(cx + 0.5, cy - ext * k); ctx.lineTo(cx + 0.5, cy + ext * k); ctx.stroke();
  ctx.strokeStyle = col(P['ink-soft']); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(cx, cy, k, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rho * k, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = col(P.gold, 0.85);
  const r = re.length > 300 ? 1.6 : 2.2;
  for (let i = 0; i < re.length; i++) { ctx.beginPath(); ctx.arc(cx + re[i] * scale * k, cy - im[i] * scale * k, r, 0, 2 * Math.PI); ctx.fill(); }
  text(ctx, P, 'Re', cx + ext * k - 2, cy - 5, { align: 'right' });
  text(ctx, P, 'Im', cx + 5, cy - ext * k + 10);
  text(ctx, P, '1', cx + k + 3, cy + 12);
  text(ctx, P, `ρ = ${rho.toFixed(2)}`, cx + rho * k * 0.72 + 4, cy - rho * k * 0.72 - 4, { c: 'accent' });
}

// ------------------------------------------------- the distance of two runs
export function drawEcho(cv, d) {
  const { ctx, W, H, P } = fit(cv, 220);
  const L = 46, R = W - 10, top = 14, bot = H - 26, T = d.length - 1, lo = -16, hi = 2;
  const X = s => L + (R - L) * s / T, Y = v => bot - (bot - top) * (clamp(Math.log10(Math.max(v, 1e-300)), lo, hi) - lo) / (hi - lo);
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  for (let e = lo; e <= hi; e += 2) { ctx.beginPath(); ctx.moveTo(L, Y(10 ** e) + 0.5); ctx.lineTo(R, Y(10 ** e) + 0.5); ctx.stroke(); text(ctx, P, pow10(e), L - 5, Y(10 ** e), { align: 'right', base: 'middle', size: 10 }); }
  for (let s = 0; s <= T; s += 50) text(ctx, P, String(s), X(s), bot + 14, { align: 'center', size: 10 });
  text(ctx, P, tx('step t', 'passo t'), R, bot + 24, { align: 'right', size: 10 });
  const pts = []; for (let s = 0; s <= T; s++) pts.push([X(s), Y(d[s])]);
  line(ctx, pts, col(P.accent), 2);
  text(ctx, P, '‖x(t) − x′(t)‖', L + 6, top + 10, { c: 'accent' });
}

// ----------------------------------------------------------- the readout weights
export function drawWeights(cv, w) {
  const { ctx, W, H, P } = fit(cv, 170);
  const L = 46, R = W - 10, top = 12, bot = H - 22, M = w.length, mid = (top + bot) / 2;
  let m = 0; for (const v of w) m = Math.max(m, Math.abs(v));
  m = m || 1;
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, mid + 0.5); ctx.lineTo(R, mid + 0.5); ctx.stroke();
  text(ctx, P, fmt(m), L - 5, top + 4, { align: 'right', base: 'middle', size: 10 });
  text(ctx, P, fmt(-m), L - 5, bot - 4, { align: 'right', base: 'middle', size: 10 });
  const bw = (R - L) / M;
  for (let i = 0; i < M; i++) {
    const h = (bot - top) / 2 * w[i] / m;
    ctx.fillStyle = col(i === 0 ? P['ink-soft'] : w[i] >= 0 ? P.accent : P.gold);
    ctx.fillRect(L + i * bw + (bw > 3 ? 0.5 : 0), Math.min(mid, mid - h), Math.max(0.8, bw - (bw > 3 ? 1 : 0)), Math.abs(h) || 0.5);
  }
  text(ctx, P, tx('bias', 'bias'), L, bot + 14, { size: 10 });
  text(ctx, P, tx(`units 1 to ${M - 1}`, `unità da 1 a ${M - 1}`), R, bot + 14, { align: 'right', size: 10 });
}

// --------------------------------------------------------- the memory capacity
export function drawMC(cv, mc) {
  const { ctx, W, H, P } = fit(cv, 170);
  const L = 36, R = W - 10, top = 12, bot = H - 24, K = mc.length - 1;
  const X = k => L + (R - L) * (k - 0.5) / K, Y = v => bot - (bot - top) * v;
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  for (const v of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(L, Y(v) + 0.5); ctx.lineTo(R, Y(v) + 0.5); ctx.stroke(); text(ctx, P, String(v), L - 5, Y(v), { align: 'right', base: 'middle', size: 10 }); }
  const bw = (R - L) / K;
  ctx.fillStyle = col(P.accent);
  for (let k = 1; k <= K; k++) ctx.fillRect(X(k) - bw / 2 + (bw > 3 ? 0.5 : 0), Y(mc[k]), Math.max(0.8, bw - (bw > 3 ? 1 : 0)), bot - Y(mc[k]));
  for (let k = 0; k <= K; k += K > 60 ? 20 : 10) if (k) text(ctx, P, String(k), X(k), bot + 13, { align: 'center', size: 10 });
  text(ctx, P, tx('delay k', 'ritardo k'), R, bot + 23, { align: 'right', size: 10 });
}

// ---------------------------------------------------------------- the comparison
// o = { esn, idnn, rnn: test MSE now (or NaN), lab: { esn, idnn, rnn } or null }
export function drawCompare(cv, o) {
  const { ctx, W, H, P } = fit(cv, 210);
  const names = [['esn', 'ESN'], ['idnn', 'IDNN'], ['rnn', 'RNN']], L = 50, R = W - 12, top = 14, bot = H - 28;
  const vals = [];
  for (const [k] of names) { if (isFinite(o[k]) && o[k] > 0) vals.push(o[k]); if (o.lab && o.lab[k]) vals.push(o.lab[k]); }
  let lo = Math.floor(Math.log10(Math.min(...vals, 1e-3))) , hi = Math.ceil(Math.log10(Math.max(...vals, 1e-2)));
  if (hi - lo < 2) lo = hi - 2;
  const Y = v => bot - (bot - top) * (Math.log10(v) - lo) / (hi - lo);
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  for (let e = lo; e <= hi; e++) { ctx.beginPath(); ctx.moveTo(L, Y(10 ** e) + 0.5); ctx.lineTo(R, Y(10 ** e) + 0.5); ctx.stroke(); text(ctx, P, pow10(e), L - 5, Y(10 ** e), { align: 'right', base: 'middle', size: 10 }); }
  const slot = (R - L) / 3, bw = Math.min(46, slot * 0.36);
  names.forEach(([k, s], q) => {
    const cx = L + slot * (q + 0.5), c = P[MODEL[k]];
    if (isFinite(o[k]) && o[k] > 0) {
      ctx.fillStyle = col(c, 0.85); ctx.fillRect(cx - bw - 2, Y(o[k]), bw, bot - Y(o[k]));
      text(ctx, P, fmt(o[k]), cx - bw / 2 - 2, Y(o[k]) - 4, { align: 'center', size: 10, c: 'ink' });
    } else text(ctx, P, tx('not trained', 'non addestrata'), cx - bw / 2 - 2, bot - 14, { align: 'center', size: 9 });
    if (o.lab && o.lab[k]) {
      ctx.strokeStyle = col(c); ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.strokeRect(cx + 2.5, Y(o.lab[k]), bw - 1, bot - Y(o.lab[k])); ctx.setLineDash([]);
      text(ctx, P, fmt(o.lab[k]), cx + 2 + bw / 2, Y(o.lab[k]) - 4, { align: 'center', size: 10 });
    }
    text(ctx, P, s, cx, bot + 14, { align: 'center', c: 'ink' });
  });
  text(ctx, P, tx('test MSE: filled here, dashed in the lab', 'MSE di test: piena qui, tratteggiata nel laboratorio'), R, bot + 26, { align: 'right', size: 10 });
}
// the test MSE of the two networks along the epochs, and that of the ESN
export function drawCurves(cv, o) {
  const { ctx, W, H, P } = fit(cv, 210);
  const L = 50, R = W - 12, top = 14, bot = H - 28, E = Math.max(10, o.idnn.length, o.rnn.length);
  const vals = [...o.idnn, ...o.rnn, o.esn].filter(v => isFinite(v) && v > 0);
  let lo = Math.floor(Math.log10(Math.min(...vals, 1e-3))), hi = Math.ceil(Math.log10(Math.max(...vals, 1e-2)));
  if (hi - lo < 2) lo = hi - 2;
  const X = e => L + (R - L) * e / E, Y = v => bot - (bot - top) * (clamp(Math.log10(v), lo, hi) - lo) / (hi - lo);
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  for (let e = lo; e <= hi; e++) { ctx.beginPath(); ctx.moveTo(L, Y(10 ** e) + 0.5); ctx.lineTo(R, Y(10 ** e) + 0.5); ctx.stroke(); text(ctx, P, pow10(e), L - 5, Y(10 ** e), { align: 'right', base: 'middle', size: 10 }); }
  const step = E > 100 ? 50 : E > 40 ? 20 : 5;
  for (let e = 0; e <= E; e += step) text(ctx, P, String(e), X(e), bot + 14, { align: 'center', size: 10 });
  text(ctx, P, tx('epoch', 'epoca'), R, bot + 26, { align: 'right', size: 10 });
  if (isFinite(o.esn)) line(ctx, [[L, Y(o.esn)], [R, Y(o.esn)]], col(P[MODEL.esn]), 1.5, [5, 4]);
  for (const k of ['idnn', 'rnn']) line(ctx, o[k].map((v, e) => [X(e + 1), Y(v)]), col(P[MODEL[k]]), 2);
  let ly = top + 6;
  for (const [k, s] of [['esn', tx('ESN (closed form)', 'ESN (forma chiusa)')], ['idnn', 'IDNN'], ['rnn', 'RNN (BPTT)']]) {
    ctx.fillStyle = col(P[MODEL[k]]); ctx.fillRect(R - 128, ly - 2, 14, 4); text(ctx, P, s, R - 110, ly, { base: 'middle', c: 'ink', size: 10 }); ly += 14;
  }
}
