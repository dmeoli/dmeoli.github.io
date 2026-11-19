// Scene V: Hebbian learning, after the laboratory LAB2_1 of the course of
// Computational Neuroscience (github.com/dmeoli/ComputationalNeuroscience),
// with its data and parameters, D. O. Hebb (1949), E. Oja (1982), E. L.
// Bienenstock, L. N. Cooper and P. W. Munro (1982) and P. Dayan and L. F.
// Abbott, Theoretical Neuroscience, chapter 8. A linear neuron v = w . u sees
// the points of a cloud one at a time and moves w by one of five rules; a
// second rule can race on the same stream of points. The plane of the data,
// the curves over the epochs and the averaged dynamics on the plane of w.

import { t as tx, onLang, onTheme } from './i18n.js';
import { setTex } from './tex.js';
import {
  dataset, RULES, ORDER, makeRun, apply, meanField, objective, angle, norm, initialW, stream,
} from './hebbian-model.js';

const $ = id => document.getElementById(id);
const S = { rule: 'hebb', race: '', leta: Math.log10(RULES.hebb.eta), alpha: 1, cloud: 'lab', center: 0, speed: 'e1', seed: 1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
if (!ORDER.includes(S.rule)) S.rule = 'hebb';
if (S.race && !ORDER.includes(S.race)) S.race = '';
if (!['lab', 'gauss', 'rotated', 'clusters'].includes(S.cloud)) S.cloud = 'lab';
if (!['1', '10', 'e1', 'e10'].includes(S.speed)) S.speed = 'e1';
if (![1, 0.001].includes(S.alpha)) S.alpha = 1;
S.leta = Math.max(-5, Math.min(-2, S.leta || -3.4)); S.seed = Math.max(1, Math.round(S.seed) || 1);
const eta = () => 10 ** S.leta;

const NAMES = {
  hebb: ['Hebb', 'Hebb'], oja: ['Oja', 'Oja'], sub: ['subtractive normalization', 'normalizzazione sottrattiva'],
  bcm: ['BCM', 'BCM'], cov: ['covariance', 'covarianza'],
};
const name = r => tx(...NAMES[r]);
const LIMIT = 1e200;

// ------------------------------------------------------------------ state
let D, A, B, src, hist, trail, timer = null, last = null, done = false, epochNorm;
function data() { D = dataset(S.cloud, !!S.center); }
function reset() {
  stop();
  const w0 = initialW(S.seed);
  A = makeRun(S.rule, w0, { eta: eta(), alpha: S.alpha, mean: D.mean });
  B = S.race ? makeRun(S.race, w0, { eta: RULES[S.race].eta, alpha: S.alpha, mean: D.mean }) : null;
  src = stream(D.n, S.seed);
  hist = []; trail = [[...w0]]; last = null; done = false; epochNorm = [norm(w0), norm(w0)];
  record();
  save(); draw();
}
const epochs = () => Math.max(RULES[S.rule].epochs, S.race ? RULES[S.race].epochs : 0);
const v2 = w => { let s = 0; for (const u of D.pts) { const v = w[0] * u[0] + w[1] * u[1]; s += v * v; } return s / D.n; };
function snap(R) { return R && { n: norm(R.w), ang: angle(R.w, D.eigQ.e1), th: R.rule === 'bcm' ? R.theta : null, v2: R.rule === 'bcm' ? v2(R.w) : null }; }
function record() { hist.push({ x: src.t / D.n, a: snap(A), b: snap(B) }); }

// one point for both runs
function step1() {
  const k = src.next(), u = D.pts[k];
  apply(A, u); if (B) apply(B, u);
  const t = src.t;
  last = { k, u, t };
  if (t % Math.max(1, Math.floor(D.n / 25)) === 0 || t % D.n === 0) record();
  trail.push([A.w[0], A.w[1], B ? B.w[0] : 0, B ? B.w[1] : 0]);
  if (trail.length > 3000) trail.splice(0, trail.length - 3000);
  if (t % D.n === 0) epochNorm = [epochNorm[1], norm(A.w)];
  if (!(norm(A.w) < LIMIT) || (B && !(norm(B.w) < LIMIT))) { done = 'diverged'; record(); }
  else if (t >= epochs() * D.n) done = 'epochs';
}
function advance() {
  const k = S.speed === '1' ? 1 : S.speed === '10' ? 10 : S.speed === 'e1' ? D.n : 10 * D.n;
  for (let j = 0; j < k && !done; j++) step1();
}

// ------------------------------------------------------------------ drawing
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
const MONO = "'IBM Plex Mono', monospace";
function fit(cv, h, wMax = Infinity) {
  const w = Math.min(wMax, Math.max(220, Math.round(cv.parentNode.clientWidth || 400)));
  const H = typeof h === 'function' ? h(w) : h, d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(w * d); cv.height = Math.round(H * d); }
  cv.style.width = w + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, H);
  return { ctx, W: w, H, P: palette() };
}
const fmt = x => {
  if (!isFinite(x)) return '∞';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e4 || a < 1e-3)) { const e = Math.floor(Math.log10(a)); return `${(x / 10 ** e).toFixed(2)}e${e}`; }
  return a >= 100 ? x.toFixed(1) : x.toFixed(3);
};
function arrow(ctx, x0, y0, x1, y1, color, width, head = 8, open = false) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath(); open ? ctx.stroke() : ctx.fill();
}
const niceUp = x => { const e = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= x) return m * e; return 10 * e; };

// the plane of the data, with w and its trail
function drawPlane() {
  const { ctx, W, P } = fit($('plane'), w => w, 460);
  let m = 0; for (const [x, y] of D.pts) m = Math.max(m, Math.abs(x), Math.abs(y));
  const R = Math.max(1.2, Math.ceil(1.15 * m * 2) / 2), s = W / (2 * R), X = x => W / 2 + x * s, Y = y => W / 2 - y * s;
  ctx.fillStyle = col(P.panel); ctx.fillRect(0, 0, W, W);
  // grid and axes
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
  for (let g = -Math.floor(R * 2) / 2; g <= R; g += 0.5) { ctx.beginPath(); ctx.moveTo(X(g), 0); ctx.lineTo(X(g), W); ctx.moveTo(0, Y(g)); ctx.lineTo(W, Y(g)); ctx.stroke(); }
  ctx.strokeStyle = col(P['ink-soft'], 0.6);
  ctx.beginPath(); ctx.moveTo(X(-R), Y(0)); ctx.lineTo(X(R), Y(0)); ctx.moveTo(X(0), Y(-R)); ctx.lineTo(X(0), Y(R)); ctx.stroke();
  ctx.font = `11px ${MONO}`; ctx.fillStyle = col(P['ink-soft']);
  ctx.fillText(R.toFixed(1), X(R) - 24, Y(0) - 4); ctx.fillText(R.toFixed(1), X(0) + 4, 12);
  // the eigenvector lines of Q, and of C when the data are not centred
  const line = (e, dash, color, w, lab, flip = 1) => {
    ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(X(-2 * R * e[0]), Y(-2 * R * e[1])); ctx.lineTo(X(2 * R * e[0]), Y(2 * R * e[1])); ctx.stroke();
    ctx.setLineDash([]);
    if (lab) {
      const k = flip * 0.88 * R / Math.max(Math.abs(e[0]), Math.abs(e[1]));
      ctx.fillStyle = color; ctx.font = `12px ${MONO}`; ctx.textAlign = X(k * e[0]) > W / 2 ? 'right' : 'left';
      ctx.fillText(lab, X(k * e[0]) + (X(k * e[0]) > W / 2 ? -5 : 5), Y(k * e[1]) - 5); ctx.textAlign = 'left';
    }
  };
  line(D.eigQ.e2, [2, 4], col(P['ink-soft'], 0.8), 1.2, 'e₂');
  line(D.eigQ.e1, [7, 5], col(P.ink, 0.85), 1.6, 'e₁');
  if (!D.center && Math.hypot(...D.mean) > 0.02) {
    line(D.eigC.e1, [], col(P['accent-2'], 0.8), 1, 'e₁(C)', -1);
    const [mx, my] = D.mean;
    ctx.strokeStyle = col(P.ink); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(mx) - 6, Y(my) - 6); ctx.lineTo(X(mx) + 6, Y(my) + 6); ctx.moveTo(X(mx) - 6, Y(my) + 6); ctx.lineTo(X(mx) + 6, Y(my) - 6); ctx.stroke();
  }
  // the points
  ctx.fillStyle = col(P['accent-2'], 0.75);
  for (const [x, y] of D.pts) { ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, 2 * Math.PI); ctx.fill(); }
  const slow = S.speed === '1' || S.speed === '10';
  if (slow && last) {
    ctx.strokeStyle = col(P.gold, 0.9); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);   // the input u as a vector
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(last.u[0]), Y(last.u[1])); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = col(P.gold); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(last.u[0]), Y(last.u[1]), 7, 0, 2 * Math.PI); ctx.stroke();
  }
  // the Oja circle when it fits
  if ((S.rule === 'oja' || S.race === 'oja') && 1 / Math.sqrt(S.alpha) < R) {
    ctx.setLineDash([3, 4]); ctx.strokeStyle = col(P['ink-soft'], 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(0), Y(0), s / Math.sqrt(S.alpha), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }
  // w, clipped at the border, with its trail
  const clip = (x, y) => { const n = Math.hypot(x, y), r = 0.94 * R; return n > r ? [x * r / n, y * r / n, true] : [x, y, false]; };
  const runs = [[A, 0, P.accent], ...(B ? [[B, 2, P.gold]] : [])];
  for (const [R0, o, c] of runs.slice().reverse()) {
    ctx.strokeStyle = col(c, 0.45); ctx.lineWidth = 1.5; ctx.beginPath();
    trail.forEach((p, k) => { const [x, y] = clip(p[o], p[o + 1]); k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); });
    ctx.stroke();
    const [x, y, out] = clip(R0.w[0], R0.w[1]);
    ctx.fillStyle = col(c); ctx.beginPath(); ctx.arc(X(trail[0][o]), Y(trail[0][o + 1]), 3, 0, 2 * Math.PI); ctx.fill();
    arrow(ctx, X(0), Y(0), X(x), Y(y), col(c), 2.5, 10, out);
    {
      ctx.font = `11px ${MONO}`; ctx.fillStyle = col(c);
      const tx0 = X(x) + (x >= 0 ? 8 : -8), ty0 = Y(y) + (o ? 14 : -6);
      ctx.textAlign = x >= 0 ? 'left' : 'right';
      if (Math.abs(tx0 - W / 2) > W / 2 - 70) ctx.textAlign = x >= 0 ? 'right' : 'left';
      ctx.fillText(`|w| = ${fmt(norm(R0.w))}`, tx0, ty0); ctx.textAlign = 'left';
    }
    if (slow && last) {
      const d = R0.dw, dn = Math.hypot(...d);
      if (dn > 0) { const L = 0.13 * R; arrow(ctx, X(x), Y(y), X(x + L * d[0] / dn), Y(y + L * d[1] / dn), col(P.ink, 0.8), 1.3, 6); }
    }
  }
}

// the curves: log |w|, angle, theta
function drawCurves() {
  const bcm = S.rule === 'bcm' || S.race === 'bcm', panes = bcm ? 3 : 2, ph = 116, gap = 14;
  const { ctx, W, H, P } = fit($('curves'), panes * ph + (panes - 1) * gap + 22);
  const L = 50, Rr = 10, xmax = Math.max(10, niceUp(Math.max(1e-9, hist.at(-1).x)));
  const X = x => L + (W - L - Rr) * x / xmax;
  const runs = [['a', P.accent], ...(B ? [['b', P.gold]] : [])];
  const pane = (k, title, lo, hi, get, ticks, tickf, dash) => {
    const top = k * (ph + gap) + 4, Y = v => top + ph - 18 - (ph - 26) * (v - lo) / (hi - lo || 1);
    ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1;
    for (const t of ticks) { ctx.beginPath(); ctx.moveTo(L, Y(t)); ctx.lineTo(W - Rr, Y(t)); ctx.stroke(); }
    ctx.font = `10px ${MONO}`; ctx.fillStyle = col(P['ink-soft']); ctx.textAlign = 'right';
    for (const t of ticks) ctx.fillText(tickf(t), L - 5, Y(t) + 3);
    ctx.textAlign = 'left'; ctx.font = `11px ${MONO}`;
    for (const [r, c] of runs) for (const [g, dsh] of get) {
      if (!hist[0][r] || hist[0][r][g] == null) continue;
      ctx.strokeStyle = col(c, dsh ? 0.7 : 1); ctx.lineWidth = dsh ? 1.2 : 1.8; ctx.setLineDash(dsh ? [4, 3] : []);
      ctx.beginPath();
      const stride = Math.max(1, Math.floor(hist.length / (2 * W)));
      for (let i = 0; i < hist.length; i += stride) {
        const h = hist[i], v = dash(h[r][g]); const px = X(h.x), py = Math.max(top, Math.min(top + ph - 10, Y(v)));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      const h = hist.at(-1); ctx.lineTo(X(h.x), Math.max(top, Math.min(top + ph - 10, Y(dash(h[r][g])))));
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = `11px ${MONO}`; ctx.fillStyle = col(P.ground); ctx.fillRect(L + 1, top - 3, ctx.measureText(title).width + 8, 15);
    ctx.fillStyle = col(P.ink); ctx.fillText(title, L + 4, top + 8);
    return top;
  };
  // |w| on a log scale
  const lg = v => Math.log10(Math.max(1e-8, Math.min(1e300, v)));
  let lo = Infinity, hi = -Infinity;
  for (const h of hist) for (const [r] of runs) { const v = lg(h[r].n); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  lo = Math.floor(lo); hi = Math.max(lo + 1, Math.ceil(hi));
  const st = Math.max(1, Math.ceil((hi - lo) / 5)), tk = []; for (let t = lo; t <= hi; t += st) tk.push(t);
  pane(0, '|w|', lo, hi, [['n', false]], tk, t => (t === 0 ? '1' : t === 1 ? '10' : `1e${t}`), lg);
  pane(1, tx('angle to e₁ (degrees)', 'angolo con e₁ (gradi)'), 0, 90, [['ang', false]], [0, 30, 60, 90], t => `${t}`, v => v);
  if (bcm) {
    let a = Infinity, b = -Infinity;
    for (const h of hist) for (const [r] of runs) if (h[r] && h[r].th != null) for (const v of [h[r].th, h[r].v2]) { a = Math.min(a, v); b = Math.max(b, v); }
    if (b - a < 1e-6) { a -= 0.5; b += 0.5; }
    const d = (b - a) / 4, tks = [0, 1, 2, 3, 4].map(i => a + i * d);
    pane(2, tx('θ and ⟨v²⟩ (dashed)', 'θ e ⟨v²⟩ (tratteggiata)'), a, b, [['th', false], ['v2', true]], tks, t => fmt(t), v => v);
  }
  // the axis of the epochs
  ctx.font = `10px ${MONO}`; ctx.fillStyle = col(P['ink-soft']); ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) { ctx.textAlign = i === 4 ? 'right' : i ? 'center' : 'left'; ctx.fillText(`${+(xmax * i / 4).toFixed(2)}`, X(xmax * i / 4) + (i === 4 ? 2 : 0), H - 6); }
  ctx.textAlign = 'right'; ctx.fillText(tx('epochs', 'epoche'), W - Rr, H - 20); ctx.textAlign = 'left';
}

// the plane of w with the averaged dynamics of the rule chosen
function drawField() {
  const { ctx, W, P } = fit($('field'), w => w, 460);
  const R = D.wr, s = W / (2 * R), X = x => W / 2 + x * s, Y = y => W / 2 - y * s, rule = S.rule;
  const G = 56, J = new Float64Array(G * G);
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) J[i * G + j] = objective(rule, [((j + 0.5) / G * 2 - 1) * R, (1 - (i + 0.5) / G * 2) * R], D);
  const sorted = Float64Array.from(J).sort(), rank = v => { let a = 0, b = sorted.length; while (a < b) { const m = (a + b) >> 1; sorted[m] < v ? a = m + 1 : b = m; } return a / sorted.length; };
  const c = W / G;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    ctx.fillStyle = mix(P.panel, P['accent-2'], 0.62 * rank(J[i * G + j]) ** 1.3);
    ctx.fillRect(j * c, i * c, c + 0.6, c + 0.6);
  }
  ctx.strokeStyle = col(P['ink-soft'], 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), W); ctx.stroke();
  ctx.font = `11px ${MONO}`; ctx.fillStyle = col(P['ink-soft']);
  ctx.fillText('w₁', W - 22, Y(0) - 5); ctx.fillText('w₂', X(0) + 5, 13); ctx.fillText(R.toFixed(1), X(R) - 26, Y(0) + 14);
  for (const [e, dash, lab] of [[D.eigQ.e1, [7, 5], 'e₁'], [D.eigQ.e2, [2, 4], 'e₂']]) {
    ctx.setLineDash(dash); ctx.strokeStyle = col(P.ink, 0.7); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(-2 * R * e[0]), Y(-2 * R * e[1])); ctx.lineTo(X(2 * R * e[0]), Y(2 * R * e[1])); ctx.stroke(); ctx.setLineDash([]);
    const k = 0.86 * R / Math.max(Math.abs(e[0]), Math.abs(e[1]));
    ctx.fillStyle = col(P.ink); ctx.fillText(lab, X(k * e[0]) + 5, Y(k * e[1]) - 5);
  }
  if (rule === 'oja' && 1 / Math.sqrt(S.alpha) < 1.45 * R) {
    ctx.strokeStyle = col(P.ink, 0.8); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(X(0), Y(0), s / Math.sqrt(S.alpha), 0, 2 * Math.PI); ctx.stroke();
  }
  if (rule === 'sub') {   // the line n . w = n . w0, where the run stays
    const c0 = A.w[0] + A.w[1];
    ctx.strokeStyle = col(P.ink, 0.8); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(-3 * R), Y(c0 + 3 * R)); ctx.lineTo(X(3 * R), Y(c0 - 3 * R)); ctx.stroke();
  }
  // the arrows of the averaged update
  const K = 13, F = [];
  let fm = 0;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const w = [((j + 0.5) / K * 2 - 1) * R, (1 - (i + 0.5) / K * 2) * R], f = meanField(rule, w, D, S.alpha), n = Math.hypot(...f);
    F.push([w, f, n]); fm = Math.max(fm, n);
  }
  const cell = W / K;
  for (const [w, f, n] of F) {
    if (n < 1e-12) continue;
    const L = 0.42 * cell * (0.25 + 0.75 * (n / fm) ** 0.5), x0 = X(w[0]), y0 = Y(w[1]);
    const dx = L * f[0] / n, dy = -L * f[1] / n;
    arrow(ctx, x0 - dx / 2, y0 - dy / 2, x0 + dx / 2, y0 + dy / 2, col(P['ink-soft'], 0.85), 1.1, 5);
  }
  // the path of the run of the rule chosen
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.clip();
  ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2; ctx.beginPath();
  trail.forEach((p, k) => (k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
  ctx.stroke();
  ctx.fillStyle = col(P.accent);
  ctx.beginPath(); ctx.arc(X(trail[0][0]), Y(trail[0][1]), 3, 0, 2 * Math.PI); ctx.fill();
  if (norm(A.w) < 1.5 * R) {
    ctx.fillStyle = col(P.gold); ctx.strokeStyle = col(P.ground); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(A.w[0]), Y(A.w[1]), 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// the matrices beside the field
const f3 = x => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3));
function drawTex() {
  const [a, b, c] = D.Q, E = D.eigQ, mat = (p, q, r) => `\\begin{pmatrix} ${f3(p)} & ${f3(q)} \\\\ ${f3(q)} & ${f3(r)} \\end{pmatrix}`;
  const vec = e => `(${f3(e[0])}, ${f3(e[1])})`;
  setTex($('qtex'), `\\(Q = \\langle u u^\\top \\rangle = ${mat(a, b, c)}\\), \\(\\lambda_1 = ${f3(E.l1)}\\), \\(\\lambda_2 = ${f3(E.l2)}\\), \\(e_1 = ${vec(E.e1)}\\)`);
  const C = D.C, F = D.eigC;
  setTex($('ctex'), D.center
    ? tx('\\(\\langle u \\rangle = 0\\): the data are centered and \\(C = Q\\)', '\\(\\langle u \\rangle = 0\\): i dati sono centrati e \\(C = Q\\)')
    : `\\(\\langle u \\rangle = ${vec(D.mean)}\\), \\(C = Q - \\langle u \\rangle \\langle u \\rangle^\\top = ${mat(...C)}\\), \\(e_1(C) = ${vec(F.e1)}\\)`);
}

function draw() {
  drawPlane(); drawCurves(); drawField();
  const t = src.t;
  $('count').textContent = t % D.n === 0 ? `${t / D.n}` : (t / D.n).toFixed(2);
  $('etav').textContent = eta().toExponential(1);
  $('alpha').disabled = !(S.rule === 'oja' || S.race === 'oja');
  for (const e of document.querySelectorAll('[data-rule]')) {
    const r = e.dataset.rule; e.hidden = !(r === S.rule || r === S.race);
    e.classList.toggle('a', r === S.rule && !!S.race); e.classList.toggle('b', r === S.race && r !== S.rule);
  }
  for (const e of document.querySelectorAll('[data-mean]')) e.hidden = e.dataset.mean !== S.rule;
  $('keyb').hidden = !S.race;
  const live = (R, tag) => R ? `${tag}v = ${fmt(R.v)}, |w| = ${fmt(norm(R.w))}, ${tx('angle', 'angolo')} ${angle(R.w, D.eigQ.e1).toFixed(2)}°${R.rule === 'bcm' ? `, θ = ${fmt(R.theta)}` : ''}` : '';
  $('liveA').textContent = live(A, B ? `${name(A.rule)}: ` : '');
  $('liveB').textContent = live(B, B ? `${name(B.rule)}: ` : '');
  report();
}

// ------------------------------------------------------------------ the report
function report() {
  const nA = norm(A.w), aA = angle(A.w, D.eigQ.e1), ep = src.t / D.n, E = D.eigQ;
  const unit = { 1: tx('one point', 'un punto'), 10: tx('10 points', '10 punti'), e1: tx('one epoch', "un'epoca"), e10: tx('10 epochs', '10 epoche') }[S.speed];
  const vs = B ? tx(`, against ${name(B.rule)} in gold (η = ${RULES[B.rule].eta}, from the same w₀ and on the same points)`, `, contro ${name(B.rule)} in oro (η = ${RULES[B.rule].eta}, dallo stesso w₀ e sugli stessi punti)`) : '';
  let s;
  if (!src.t) {
    s = tx(`${name(A.rule)} with η = ${fmt(eta())}${vs}: w₀ = (${f3(A.w[0])}, ${f3(A.w[1])}) is at ${aA.toFixed(1)}° from the line of e₁ = (${f3(E.e1[0])}, ${f3(E.e1[1])}), with λ₁ = ${f3(E.l1)} and λ₂ = ${f3(E.l2)}. Step presents ${unit}, Play keeps going up to the ${epochs()} epochs of the lab.`,
      `${name(A.rule)} con η = ${fmt(eta())}${vs}: w₀ = (${f3(A.w[0])}, ${f3(A.w[1])}) sta a ${aA.toFixed(1)}° dalla retta di e₁ = (${f3(E.e1[0])}, ${f3(E.e1[1])}), con λ₁ = ${f3(E.l1)} e λ₂ = ${f3(E.l2)}. Passo presenta ${unit}, Avvia prosegue fino alle ${epochs()} epoche del laboratorio.`);
  } else if (done === 'diverged') {
    s = tx(`At epoch ${ep.toFixed(2)} a norm has passed 1e200 and the run stops: the ascent has no maximum, and the angle of ${name(A.rule)} to e₁ is ${aA.toFixed(3)}°.`,
      `All'epoca ${ep.toFixed(2)} una norma ha superato 1e200 e l'esecuzione si ferma: la salita non ha un massimo, e l'angolo di ${name(A.rule)} con e₁ è ${aA.toFixed(3)}°.`);
  } else if ((S.speed === '1' || S.speed === '10') && last) {
    const u = last.u;
    s = tx(`Point ${last.k + 1} of the cloud, u = (${f3(u[0])}, ${f3(u[1])}): the output is v = w·u = ${fmt(A.v)} and the update Δw = (${fmt(A.dw[0])}, ${fmt(A.dw[1])})${A.rule === 'bcm' ? `, with θ = ${fmt(A.theta)} (Δw is along u when v > θ, against it when 0 < v < θ)` : ''}.`,
      `Punto ${last.k + 1} della nuvola, u = (${f3(u[0])}, ${f3(u[1])}): l'uscita è v = w·u = ${fmt(A.v)} e l'aggiornamento Δw = (${fmt(A.dw[0])}, ${fmt(A.dw[1])})${A.rule === 'bcm' ? `, con θ = ${fmt(A.theta)} (Δw è nel verso di u quando v > θ, opposto quando 0 < v < θ)` : ''}.`);
  } else {
    const head = tx(`After ${+ep.toFixed(2)} epochs |w| = ${fmt(nA)} and w is at ${aA.toFixed(3)}° from the line of e₁`, `Dopo ${+ep.toFixed(2)} epoche |w| = ${fmt(nA)} e w sta a ${aA.toFixed(3)}° dalla retta di e₁`);
    const g = epochNorm[0] > 0 ? epochNorm[1] / epochNorm[0] : 1, pred = Math.exp(A.eta * E.l1 * D.n);
    const what = {
      hebb: tx(`; in the last epoch |w| grew by a factor ${g.toFixed(4)}, against exp(η λ₁ n) = ${pred.toFixed(4)} of the averaged dynamics`, `; nell'ultima epoca |w| è cresciuta di un fattore ${g.toFixed(4)}, contro exp(η λ₁ n) = ${pred.toFixed(4)} della dinamica media`),
      oja: tx(`; the norm tends to 1/√α = ${(1 / Math.sqrt(S.alpha)).toFixed(2)}`, `; la norma tende a 1/√α = ${(1 / Math.sqrt(S.alpha)).toFixed(2)}`),
      sub: tx(`; the sum of the weights n·w = ${fmt(A.w[0] + A.w[1])} has not moved from its initial value, while the component orthogonal to n grows`, `; la somma dei pesi n·w = ${fmt(A.w[0] + A.w[1])} non si è mossa dal suo valore iniziale, mentre cresce la componente ortogonale a n`),
      bcm: (() => { const vv = D.pts.map(u => A.w[0] * u[0] + A.w[1] * u[1]); return tx(`; θ = ${fmt(A.theta)} follows ⟨v²⟩ = ${fmt(v2(A.w))}, and the outputs on the cloud go from ${fmt(Math.min(...vv))} to ${fmt(Math.max(...vv))}`, `; θ = ${fmt(A.theta)} segue ⟨v²⟩ = ${fmt(v2(A.w))}, e le uscite sulla nuvola vanno da ${fmt(Math.min(...vv))} a ${fmt(Math.max(...vv))}`); })(),
      cov: D.center ? tx('; on centered data the rule is Hebb\'s', '; su dati centrati la regola è quella di Hebb')
        : tx(`; the rule follows e₁ of C, at ${angle(A.w, D.eigC.e1).toFixed(2)}°, not that of Q`, `; la regola segue e₁ di C, a ${angle(A.w, D.eigC.e1).toFixed(2)}°, non quello di Q`),
    }[A.rule];
    const rb = B ? tx(`; ${name(B.rule)}: |w| = ${fmt(norm(B.w))}, ${angle(B.w, E.e1).toFixed(3)}°`, `; ${name(B.rule)}: |w| = ${fmt(norm(B.w))}, ${angle(B.w, E.e1).toFixed(3)}°`) : '';
    s = head + what + rb + (done === 'epochs' ? tx(`, at the end of the ${epochs()} epochs of the lab.`, `, alla fine delle ${epochs()} epoche del laboratorio.`) : '.');
  }
  $('rep').textContent = s;
}

// ------------------------------------------------------------------ controls
function stop() { cancelAnimationFrame(timer); timer = null; $('play').textContent = tx('Play', 'Avvia'); }
function play() {
  if (timer) return stop();
  if (done) reset();
  $('play').textContent = tx('Pause', 'Pausa');
  let t0 = 0;
  const loop = now => {
    // one or ten points at a time stay on the screen for 0.8 s, so that the
    // ringed point and the update can be read; epochs go one per frame
    const slow = S.speed === '1' || S.speed === '10';
    if (!slow || now - t0 >= 800) { advance(); draw(); t0 = now; }
    if (done) return stop();
    timer = requestAnimationFrame(loop);
  };
  timer = requestAnimationFrame(loop);
}
function save() { history.replaceState(null, '', '#' + new URLSearchParams({ rule: S.rule, race: S.race, leta: S.leta.toFixed(2), alpha: S.alpha, cloud: S.cloud, center: S.center, speed: S.speed, seed: S.seed })); }

const OPTS = {
  rule: Object.fromEntries(ORDER.map(r => [r, NAMES[r]])),
  race: { '': ['none', 'nessuna'], ...Object.fromEntries(ORDER.map(r => [r, NAMES[r]])) },
  alpha: { 1: ['1 (Oja 1982)', '1 (Oja 1982)'], 0.001: ['0.001 (lab)', '0.001 (laboratorio)'] },
  cloud: { lab: ['lab data', 'dati del laboratorio'], gauss: ['elongated Gaussian', 'gaussiana allungata'], rotated: ['rotated, off the origin', "ruotata, lontana dall'origine"], clusters: ['two clusters', 'due gruppi'] },
  speed: { 1: ['1 point', '1 punto'], 10: ['10 points', '10 punti'], e1: ['1 epoch', '1 epoca'], e10: ['10 epochs', '10 epoche'] },
};
function words() {
  document.title = tx('Hebbian Learning', 'Apprendimento hebbiano');
  for (const [id, o] of Object.entries(OPTS)) for (const op of $(id).options) op.textContent = tx(...o[op.value]);
  $('reset').textContent = tx('Reset', 'Ricomincia'); $('step').textContent = tx('Step', 'Passo');
  $('play').textContent = timer ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
  $('neww').textContent = tx('New w₀', 'Nuovo w₀');
}

$('rule').value = S.rule; $('race').value = S.race; $('leta').value = S.leta; $('alpha').value = String(S.alpha);
$('cloud').value = S.cloud; $('center').checked = !!S.center; $('speed').value = S.speed;
$('rule').onchange = e => { S.rule = e.target.value; S.leta = Math.log10(RULES[S.rule].eta); $('leta').value = S.leta; reset(); };
$('race').onchange = e => { S.race = e.target.value; reset(); };
$('leta').oninput = e => { S.leta = +e.target.value; $('etav').textContent = eta().toExponential(1); };
$('leta').onchange = () => reset();
$('alpha').onchange = e => { S.alpha = +e.target.value; reset(); };
$('cloud').onchange = e => { S.cloud = e.target.value; data(); drawTex(); reset(); };
$('center').onchange = e => { S.center = e.target.checked ? 1 : 0; data(); drawTex(); reset(); };
$('speed').onchange = e => { S.speed = e.target.value; save(); draw(); };
$('neww').onclick = () => { S.seed++; reset(); };
$('reset').onclick = reset;
$('step').onclick = () => { stop(); if (done) reset(); else { advance(); draw(); } };
$('play').onclick = play;
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); $('step').onclick(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 100); });
onTheme(() => { if (A) draw(); });
onLang(() => { words(); drawTex(); if (A) draw(); });

data(); words(); drawTex(); reset();
// for the checks: the state of the scene
window.hebbian = { S, get D() { return D; }, get A() { return A; }, get B() { return B; }, get hist() { return hist; }, get done() { return done; }, advance, reset, draw };
