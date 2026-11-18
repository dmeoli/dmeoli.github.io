// The drawings of the state-space scene, on canvases sized to their box; the
// colours are the tokens of style.css, read at every drawing so that both
// themes work.

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
const col = (P, k, fade = 0) => mix(P[k], P.ground, fade);
function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
  return P;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MONO = "'IBM Plex Mono', monospace";

function fit(cv, h) {
  const w = Math.max(240, Math.round(cv.getBoundingClientRect().width || cv.parentNode.clientWidth || 600));
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const P = palette();
  ctx.fillStyle = col(P, 'panel'); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w, H: h, P };
}
function text(ctx, P, s, x, y, align = 'left', base = 'middle', c = 'ink-soft', size = 11) {
  ctx.font = `${size}px ${MONO}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = col(P, c); ctx.fillText(s, x, y);
}
function line(ctx, pts, c, w = 1, dash) {
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash || []);
  ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
}
function dot(ctx, x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
const fmt = v => (Math.abs(v) >= 100 || (Math.abs(v) < 0.01 && v !== 0)) ? v.toExponential(1) : v.toFixed(Math.abs(v) < 1 ? 2 : 1);
function ticks(a, b, n) {
  const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st, out = [];
  for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6));
  return out;
}

// a row of stems: values v[0..L-1] in the band [y0, y1] around its middle,
// x of j given; upto: only the stems j <= upto in full colour
function stems(ctx, P, X, y0, y1, v, { scale, upto = Infinity, hot = -1, c = 'accent', label, from = 0 } = {}) {
  const mid = (y0 + y1) / 2, s = scale || Math.max(1e-9, ...Array.from(v, Math.abs)), hh = (y1 - y0) / 2 - 2;
  line(ctx, [[X(-0.5), mid], [X(v.length - 0.5), mid]], col(P, 'rule'));
  for (let j = from; j < v.length; j++) {
    if (j > upto) continue;
    const y = mid - clamp(v[j] / s, -1, 1) * hh, cc = j === hot ? col(P, 'gold') : col(P, c);
    if (Math.abs(v[j]) > 1e-12 * s) { line(ctx, [[X(j), mid], [X(j), y]], cc, 1.5); dot(ctx, X(j), y, j === hot ? 3 : 2, cc); }
  }
  if (label) text(ctx, P, label, 6, y0 + 8, 'left', 'middle', 'ink-soft');
}

// ---------------------------------------------------------------- the poles
// o = { poles, dt, sel }: draws the s-plane and the unit disc; returns the
// geometry for the dragging: { toS(x, y), toZ(x, y), side(x) }
export const SRANGE = { re0: -2.5, re1: 0.4, im: 7 };
export function drawPoles(cv, { poles, D, dt, sel }) {
  const { ctx, W, P } = fit(cv, 250), H = 250;
  const half = W / 2, pad = 22;
  // the s-plane: x for Re, y for Im
  const sw = half - 2 * pad, sh = H - 2 * pad;
  const sx = re => pad + (re - SRANGE.re0) / (SRANGE.re1 - SRANGE.re0) * sw, sy = im => pad + (SRANGE.im - im) / (2 * SRANGE.im) * sh;
  ctx.fillStyle = col(P, 'ground'); ctx.fillRect(pad, pad, sw, sh);
  ctx.fillStyle = col(P, 'gold', 0.85); ctx.fillRect(sx(0), pad, sx(SRANGE.re1) - sx(0), sh);
  line(ctx, [[sx(SRANGE.re0), sy(0)], [sx(SRANGE.re1), sy(0)]], col(P, 'rule'));
  line(ctx, [[sx(0), pad], [sx(0), pad + sh]], col(P, 'ink-soft', 0.3));
  const ny = Math.PI / dt;
  if (ny < SRANGE.im) for (const s of [1, -1]) line(ctx, [[pad, sy(s * ny)], [pad + sw, sy(s * ny)]], col(P, 'accent-2', 0.2), 1, [4, 4]);
  text(ctx, P, 'Re λ', pad + sw, sy(0) - 8, 'right', 'middle');
  text(ctx, P, 'Im λ', sx(0) + 4, pad + 8, 'left', 'middle');
  for (const v of [-2, -1]) text(ctx, P, String(v), sx(v), sy(0) + 9, 'center');
  text(ctx, P, tx('continuous λ', 'λ continuo'), pad, pad - 10, 'left', 'middle', 'accent');
  // the disc
  const cx = half + half / 2, cy = H / 2, R = Math.min(half / 2 - pad, H / 2 - pad) * 0.92;
  ctx.fillStyle = col(P, 'ground'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = col(P, 'ink-soft', 0.3); ctx.lineWidth = 1; ctx.stroke();
  line(ctx, [[cx - R - 8, cy], [cx + R + 8, cy]], col(P, 'rule')); line(ctx, [[cx, cy - R - 8], [cx, cy + R + 8]], col(P, 'rule'));
  text(ctx, P, '1', cx + R + 3, cy + 9, 'left'); text(ctx, P, '0', cx + 3, cy + 9, 'left');
  text(ctx, P, tx('discrete Ā = exp(Δλ)', 'Ā discreto = exp(Δλ)'), half + pad * 0.3, pad - 10, 'left', 'middle', 'accent');
  const zx = re => cx + re * R, zy = im => cy - im * R;
  poles.forEach((p, n) => {
    const d = D[n], hot = n === sel;
    for (const s of [-1, 1]) {
      const c = s > 0 ? col(P, hot ? 'gold' : 'accent') : col(P, hot ? 'gold' : 'accent', 0.55);
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      const x = sx(p.re), y = sy(s * clamp(p.im, -SRANGE.im, SRANGE.im));
      ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
      const X = zx(d.zr), Y = zy(s * d.zi);
      ctx.beginPath(); ctx.moveTo(X - 5, Y - 5); ctx.lineTo(X + 5, Y + 5); ctx.moveTo(X + 5, Y - 5); ctx.lineTo(X - 5, Y + 5); ctx.stroke();
      if (s > 0) { text(ctx, P, `λ${n + 1}`, x + 7, y - 8, 'left', 'middle', 'ink'); }
    }
  });
  return {
    side: x => (x < half ? 's' : 'z'),
    toS: (x, y) => ({ re: SRANGE.re0 + (x - pad) / sw * (SRANGE.re1 - SRANGE.re0), im: SRANGE.im - (y - pad) / sh * 2 * SRANGE.im }),
    toZ: (x, y) => ({ re: (x - cx) / R, im: (cy - y) / R }),
    sPos: p => [sx(p.re), sy(p.im)], zPos: d => [zx(d.zr), zy(d.zi)],
  };
}

// ---------------------------------------------------------------- the kernel
export function drawKernel(cv, { K, parts }) {
  const { ctx, W, P } = fit(cv, 250), H = 250, L = K.length;
  const x0 = 30, x1 = W - 10, X = j => x0 + (j + 0.5) / L * (x1 - x0);
  const s = Math.max(1e-9, ...Array.from(K, Math.abs), ...parts.flatMap(q => Array.from(q, Math.abs)));
  for (const q of parts) if (parts.length > 1) {
    const mid = 125, hh = 105;
    line(ctx, Array.from(q, (v, j) => [X(j), mid - v / s * hh]), col(P, 'gold', 0.25), 1.2);
  }
  stems(ctx, P, X, 20, 230, K, { scale: s });
  text(ctx, P, 'j', x1, 242, 'right'); text(ctx, P, `max |K̄| = ${fmt(s)}`, x0, 12, 'left');
  for (const j of ticks(0, L - 1, 6)) text(ctx, P, String(j), X(j), 242, 'center');
}

// ---------------------------------------------------------------- the scan
// o = { u, y, states, D, k }: the input, the phasors of the pairs, the output to k
export function drawScan(cv, { u, y, states, D, k, yscale }) {
  const { ctx, W, P } = fit(cv, 300), L = u.length;
  const x0 = 44, x1 = W - 10, X = j => x0 + (j + 0.5) / L * (x1 - x0);
  stems(ctx, P, X, 6, 70, u, { upto: Infinity, hot: k, c: 'ink-soft' });
  text(ctx, P, 'u', 8, 38, 'left', 'middle', 'ink', 12);
  // the phasors, one disc per pair
  const n = D.length, r = Math.min(46, (x1 - x0) / (2 * n) - 14), cyy = 130;
  const smax = Math.max(1e-9, ...states.flatMap(st => st.map(([a, b]) => Math.hypot(a, b))));
  D.forEach((d, q) => {
    const cx = x0 + (x1 - x0) * (q + 0.5) / n;
    ctx.fillStyle = col(P, 'ground'); dot(ctx, cx, cyy, r, col(P, 'ground'), col(P, 'rule'));
    line(ctx, [[cx - r, cyy], [cx + r, cyy]], col(P, 'rule')); line(ctx, [[cx, cyy - r], [cx, cyy + r]], col(P, 'rule'));
    const pt = j => [cx + states[j][q][0] / smax * r, cyy - states[j][q][1] / smax * r];
    const trail = []; for (let j = Math.max(0, k - 12); j <= k; j++) trail.push(pt(j));
    if (trail.length > 1) line(ctx, trail, col(P, 'accent-2', 0.45), 1.2);
    const [px, py] = pt(k);
    line(ctx, [[cx, cyy], [px, py]], col(P, 'accent'), 2); dot(ctx, px, py, 3.5, col(P, 'accent'));
    text(ctx, P, `x${q + 1}`, cx - r, cyy - r - 2, 'left', 'bottom', 'ink');
    text(ctx, P, `|Ā|=${Math.hypot(d.zr, d.zi).toFixed(2)} ∠${Math.atan2(d.zi, d.zr).toFixed(2)}`, cx + r, cyy + r + 3, 'right', 'top');
  });
  stems(ctx, P, X, 200, 290, y, { upto: k, hot: k, scale: yscale });
  text(ctx, P, 'y', 8, 245, 'left', 'middle', 'ink', 12);
}

// ---------------------------------------------------------------- the convolution
export function drawConv(cv, { u, K, y, k, yscale }) {
  const { ctx, W, P } = fit(cv, 300), L = u.length;
  const x0 = 44, x1 = W - 10, X = j => x0 + (j + 0.5) / L * (x1 - x0);
  stems(ctx, P, X, 6, 70, u, { hot: k, c: 'ink-soft' });
  text(ctx, P, 'u', 8, 38, 'left', 'middle', 'ink', 12);
  // the reversed kernel under the input: at j <= k the value K_{k-j}
  const fl = new Float64Array(L), pr = new Float64Array(L);
  for (let j = 0; j <= k; j++) { fl[j] = K[k - j]; pr[j] = K[k - j] * u[j]; }
  ctx.fillStyle = col(P, 'lilac', 0.55); ctx.fillRect(X(-0.5), 78, X(k + 0.5) - X(-0.5), 54);
  stems(ctx, P, X, 78, 132, fl, { c: 'accent-2', scale: Math.max(1e-9, ...Array.from(K, Math.abs)) });
  text(ctx, P, 'K̄ₖ₋ⱼ', 4, 86, 'left', 'middle', 'ink');
  stems(ctx, P, X, 140, 194, pr, { c: 'gold' });
  text(ctx, P, '×', 8, 167, 'left', 'middle', 'ink', 12);
  // the sum, an arrow from the products to y_k
  line(ctx, [[X(k), 196], [X(k), 205]], col(P, 'gold'), 1, [2, 2]);
  stems(ctx, P, X, 200, 290, y, { upto: k, hot: k, scale: yscale });
  text(ctx, P, 'y', 8, 245, 'left', 'middle', 'ink', 12);
  text(ctx, P, 'Σ', X(k) + 4, 200, 'left', 'middle', 'gold');
}

// ---------------------------------------------------------------- HiPPO
// o = { u, k, rec }: the input (M samples on (0, 1]), the time index k (1..M), the
// reconstruction on [0, t] at G points; returns the x -> s map for the drawing
export function drawHistory(cv, { u, k, rec }) {
  const { ctx, W, P } = fit(cv, 240), H = 240, M = u.length;
  const x0 = 34, x1 = W - 10, y0 = 14, y1 = H - 24;
  const lim = Math.max(1.2, ...Array.from(u, Math.abs)) * 1.05;
  const X = s => x0 + s * (x1 - x0), Y = v => (y0 + y1) / 2 - clamp(v / lim, -1, 1) * (y1 - y0) / 2;
  ctx.fillStyle = col(P, 'ground'); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  line(ctx, [[x0, Y(0)], [x1, Y(0)]], col(P, 'rule'));
  for (const v of [-1, 1]) text(ctx, P, String(v), x0 - 4, Y(v), 'right');
  for (const s of ticks(0, 1, 5)) text(ctx, P, String(s), X(s), y1 + 10, 'center');
  const t = k / M;
  line(ctx, Array.from(u, (v, j) => [X((j + 1) / M), Y(v)]).slice(0, k), col(P, 'ink'), 1.5);
  line(ctx, Array.from(u, (v, j) => [X((j + 1) / M), Y(v)]).slice(Math.max(0, k - 1)), col(P, 'ink-soft', 0.55), 1.2, [3, 3]);
  if (rec) line(ctx, Array.from(rec, (v, g) => [X((g + 0.5) / rec.length * t), Y(v)]), col(P, 'accent'), 2.5);
  line(ctx, [[X(t), y0], [X(t), y1]], col(P, 'gold'), 1.5);
  text(ctx, P, 't', X(t) + 4, y0 + 8, 'left', 'middle', 'gold');
  text(ctx, P, 's', x1, y1 + 20, 'right');
  return { toS: x => clamp((x - x0) / (x1 - x0), 0, 1), toV: y => clamp(((y0 + y1) / 2 - y) / ((y1 - y0) / 2), -1, 1) * lim };
}

export function drawCoefs(cv, x) {
  const { ctx, W, P } = fit(cv, 190), N = x.length;
  const x0 = 34, x1 = W - 10, y0 = 12, y1 = 166, mid = (y0 + y1) / 2;
  const s = Math.max(1e-9, ...Array.from(x, Math.abs)), bw = (x1 - x0) / N;
  line(ctx, [[x0, mid], [x1, mid]], col(P, 'rule'));
  for (let n = 0; n < N; n++) {
    const h = x[n] / s * (y1 - y0) / 2;
    ctx.fillStyle = col(P, x[n] >= 0 ? 'accent' : 'gold');
    ctx.fillRect(x0 + n * bw + bw * 0.15, Math.min(mid, mid - h), bw * 0.7, Math.abs(h));
    if (N <= 16 || n % 4 === 0) text(ctx, P, String(n), x0 + (n + 0.5) * bw, y1 + 12, 'center');
  }
  text(ctx, P, fmt(s), x0 - 4, y0 + 4, 'right'); text(ctx, P, fmt(-s), x0 - 4, y1 - 4, 'right');
  text(ctx, P, 'n', x1, y1 + 12, 'right');
}

export function drawBasis(cv, { t, N }) {
  const { ctx, W, P } = fit(cv, 190);
  const x0 = 34, x1 = W - 10, y0 = 12, y1 = 166, mid = (y0 + y1) / 2, G = 160;
  const X = s => x0 + s * (x1 - x0), lim = Math.sqrt(2 * Math.min(N, 5) - 1);
  ctx.fillStyle = col(P, 'ground'); ctx.fillRect(x0, y0, X(t) - x0, y1 - y0);
  line(ctx, [[x0, mid], [x1, mid]], col(P, 'rule'));
  const C = ['accent', 'gold', 'accent-2', 'ink-soft', 'ink'];
  for (let n = 0; n < Math.min(N, 5); n++) {
    const pts = [];
    for (let g = 0; g <= G; g++) {
      const z = 2 * g / G - 1;
      let a = 1, b = z, v = n === 0 ? 1 : z;
      for (let m = 1; m < n; m++) { const c = ((2 * m + 1) * z * b - m * a) / (m + 1); a = b; b = c; v = c; }
      pts.push([X(g / G * t), mid - Math.sqrt(2 * n + 1) * v / lim * (y1 - y0) / 2]);
    }
    line(ctx, pts, col(P, C[n]), 1.6);
    text(ctx, P, `n=${n}`, x1 - 4, y0 + 8 + 13 * n, 'right', 'middle', C[n]);
  }
  line(ctx, [[X(t), y0], [X(t), y1]], col(P, 'gold'), 1.5);
  text(ctx, P, 't', X(t) + 4, y1 + 10, 'left', 'middle', 'gold');
  text(ctx, P, '0', x0, y1 + 10, 'center');
}

// ---------------------------------------------------------------- selectivity
// o = { seq, F: { sel, lti }, A: { sel, lti } }: the tokens, Delta_k of both,
// the weight of every token in the final state, the probabilities of the answers
export const TOKCOL = ['accent', 'gold', 'accent-2', 'ink-soft'];
export function drawSequence(cv, { seq, F }) {
  // narrow: the answers go under the bands, in two columns
  const narrow = (cv.getBoundingClientRect().width || 600) < 620;
  const { ctx, W, P } = fit(cv, narrow ? 400 : 300), L = seq.xs.length;
  const right = narrow ? 0 : Math.min(190, W * 0.3), x0 = narrow ? 64 : 100, x1 = W - right - (narrow ? 34 : 40), cw = (x1 - x0) / L;
  const X = j => x0 + (j + 0.5) * cw, sq = Math.min(26, cw - 4);
  // the tokens
  seq.xs.forEach((v, j) => {
    const x = X(j) - sq / 2, y = 10;
    if (v === 4) {
      ctx.strokeStyle = col(P, 'ink'); ctx.lineWidth = 1.2; ctx.strokeRect(x, y, sq, sq);
      text(ctx, P, '★', X(j), y + sq / 2 + 1, 'center', 'middle', 'ink', sq < 14 ? 9 : 15);
    } else {
      ctx.fillStyle = col(P, TOKCOL[v], j === seq.p + 1 ? 0 : 0.35); ctx.fillRect(x, y, sq, sq);
      if (sq >= 14) text(ctx, P, 'ABCD'[v], X(j), y + sq / 2 + 1, 'center', 'middle', j === seq.p + 1 ? 'ground' : 'ink', 12);
    }
    if (j === seq.p + 1) { ctx.strokeStyle = col(P, 'ink'); ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, sq + 4, sq + 4); }
  });
  text(ctx, P, tx('token', 'token'), 6, 23, 'left');
  // Delta, log scale from 1e-3 to 1e1, as bars from the bottom of each band
  const lo = -3, hi = 1;
  const rows = narrow ? [['sel', 'accent', tx('sel.', 'sel.')], ['lti', 'gold', tx('inv.', 'inv.')]]
    : [['sel', 'accent', tx('selective', 'selettivo')], ['lti', 'gold', tx('time inv.', 'tempo-inv.')]];
  const band = (y0, y1, vals, c, logs) => {
    ctx.fillStyle = col(P, 'ground'); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    vals.forEach((v, j) => {
      const f = logs ? clamp((Math.log10(Math.max(v, 1e-9)) - lo) / (hi - lo), 0, 1) : clamp(v, 0, 1);
      ctx.fillStyle = col(P, c); ctx.fillRect(X(j) - cw * 0.32, y1 - f * (y1 - y0), cw * 0.64, f * (y1 - y0));
    });
  };
  const keep = Fm => {        // |bbar_k| prod_{j>k} a_j, mean over d and n, divided by its largest
    const { D, N } = Fm, w = new Float64Array(L);
    for (let d = 0; d < D; d++) for (let q = 0; q < N; q++) {
      let pr = 1;
      for (let k = L - 1; k >= 0; k--) { const i = (k * D + d) * N + q; w[k] += Math.abs(Fm.Bb[i] * Fm.X[k * D + d]) * pr; pr *= Fm.Aa[i]; }
    }
    const m = Math.max(1e-12, ...w); return Array.from(w, v => v / m);
  };
  let y = 46;
  // Delta: one thin bar per channel
  const deltas = (y0, y1, Fm, c) => {
    ctx.fillStyle = col(P, 'ground'); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const D = Fm.D, bw = cw * 0.72 / D;
    for (let j = 0; j < L; j++) for (let d = 0; d < D; d++) {
      const f = clamp((Math.log10(Math.max(Fm.Dt[j * D + d], 1e-9)) - lo) / (hi - lo), 0, 1);
      ctx.fillStyle = col(P, c); ctx.fillRect(X(j) - cw * 0.36 + d * bw, y1 - f * (y1 - y0), bw * 0.85, f * (y1 - y0));
    }
  };
  rows.forEach(([k, c, name]) => {
    deltas(y, y + 46, F[k], c);
    text(ctx, P, 'Δ ' + name, 6, y + 23, 'left', 'middle', c);
    y += 52;
  });
  for (const yy of [46, 98]) { text(ctx, P, '10', x1 + 3, yy, 'left', 'top'); text(ctx, P, '1e-3', x1 + 3, yy + 46, 'left', 'bottom'); }
  y += 6;
  rows.forEach(([k, c, name]) => {
    band(y, y + 40, keep(F[k]), c, false);
    text(ctx, P, tx('kept', 'resta'), 6, y + 14, 'left', 'middle', c);
    text(ctx, P, name, 6, y + 28, 'left', 'middle', c);
    y += 46;
  });
  for (let j = 0, st = Math.max(L > 16 ? 4 : 2, Math.ceil(22 / cw)); j < L; j += st) text(ctx, P, String(j + 1), X(j), y + 4, "center", "top");
  // the answers
  const aw = narrow ? W / 2 - 16 : right - 10, ax0 = narrow ? 8 : W - right;
  if (!narrow) text(ctx, P, tx('answer', 'risposta'), ax0, 23, 'left', 'middle', 'ink');
  rows.forEach(([k, c, name], r) => {
    const ax = narrow ? ax0 + r * W / 2 : ax0, yy = narrow ? 300 : 52 + r * 110;
    if (narrow) name = tx('answer, ', 'risposta, ') + name;
    text(ctx, P, name, ax, yy, 'left', 'middle', c);
    for (let q = 0; q < 4; q++) {
      const by = yy + 12 + q * 20, pv = F[k].P[q], bx = ax + 18;
      text(ctx, P, 'ABCD'[q], ax + 2, by + 7, 'left', 'middle', q === seq.y ? 'ink' : 'ink-soft');
      ctx.fillStyle = col(P, 'ground'); ctx.fillRect(bx, by, aw - 58, 14);
      ctx.fillStyle = col(P, c, q === seq.y ? 0 : 0.45); ctx.fillRect(bx, by, (aw - 58) * pv, 14);
      text(ctx, P, `${(100 * pv).toFixed(0)}%`, bx + aw - 54, by + 7, 'left');
    }
  });
}

// hist = { sel: [{ epoch, loss, acc }], lti: [...] }
export function drawCurves(cv, hist, which, epoch) {
  const { ctx, W, P } = fit(cv, 220), box = [42, 18, W - 10, 186];
  const acc = which === 'acc', all = [...hist.sel, ...hist.lti];
  const ymax = acc ? 1 : Math.max(Math.log(4) * 1.2, ...all.map(q => Math.min(q.loss, 3)));
  const xmax = Math.max(50, epoch), X = e => box[0] + e / xmax * (box[2] - box[0]), Y = v => box[3] - clamp(v / ymax, 0, 1) * (box[3] - box[1]);
  ctx.fillStyle = col(P, 'ground'); ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
  for (const v of ticks(0, ymax, 4)) { line(ctx, [[box[0], Y(v)], [box[2], Y(v)]], col(P, 'rule')); text(ctx, P, acc ? `${Math.round(100 * v)}%` : String(v), box[0] - 4, Y(v), 'right'); }
  for (const v of ticks(0, xmax, 5)) text(ctx, P, String(v), X(v), box[3] + 10, 'center');
  text(ctx, P, tx('step', 'passo'), box[2], box[3] + 24 - 4, 'right');
  const ref = acc ? 0.25 : Math.log(4);
  line(ctx, [[box[0], Y(ref)], [box[2], Y(ref)]], col(P, 'ink-soft', 0.3), 1, [4, 4]);
  for (const [k, c] of [['lti', 'gold'], ['sel', 'accent']]) line(ctx, hist[k].map(q => [X(q.epoch), Y(acc ? q.acc : q.loss)]), col(P, c), 2);
  const last = k => hist[k].length ? (acc ? ` ${(100 * hist[k].at(-1).acc).toFixed(0)}%` : ` ${hist[k].at(-1).loss.toFixed(2)}`) : '';
  const lx = box[0] + 10, ly = acc ? box[1] + 14 : box[3] - 36;
  ctx.fillStyle = col(P, 'ground'); ctx.globalAlpha = 0.85; ctx.fillRect(lx - 4, ly - 9, 190, 33); ctx.globalAlpha = 1;
  [['sel', 'accent', tx('selective', 'selettivo')], ['lti', 'gold', tx('time invariant', 'tempo-invariante')]].forEach(([k, c, s], r) => {
    line(ctx, [[lx, ly + 15 * r], [lx + 16, ly + 15 * r]], col(P, c), 2);
    text(ctx, P, s + last(k), lx + 22, ly + 15 * r, 'left', 'middle', 'ink');
  });
}
