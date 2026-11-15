// The drawings of scene L on canvases: the graph in a force layout, its nodes
// coloured by their state at the chosen round (the first two principal
// components, on the violet-gold scale), the messages into one node and its
// vector before and after the update, and the training curves. The colours
// are the tokens of style.css, read at every draw so that both themes work.

import { rng } from './nn.js';

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const lerp = (a, c, t) => a.map((v, i) => v + Math.max(0, Math.min(1, t)) * (c[i] - v));
const rgb = a => `rgb(${a.map(Math.round).join(',')})`;
export const palette = () => {
  const p = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) p[k] = css('--' + k);
  p.rgb = k => hex(p[k]);
  return p;
};
const FONT = '11px IBM Plex Mono, monospace', FONT2 = '500 12px IBM Plex Mono, monospace';

// ------------------------------------------------------------ projection
// the first two principal components of the states of every round, over the
// nodes of `Rs` (forward results); `prev` is the projection of the last draw,
// whose signs are kept so that the colours do not flip between frames
export function project(Rs, K, H, prev) {
  const out = [];
  for (let k = K; k >= 0; k--) {
    const rows = [];
    for (const R of Rs) for (let v = 0; v < R.g.N; v++) rows.push(R.h[k].subarray(v * H, v * H + H));
    const mean = new Float64Array(H);
    for (const x of rows) for (let j = 0; j < H; j++) mean[j] += x[j] / rows.length;
    const Cv = new Float64Array(H * H);
    for (const x of rows) for (let i = 0; i < H; i++) for (let j = 0; j < H; j++) Cv[i * H + j] += (x[i] - mean[i]) * (x[j] - mean[j]);
    const es = [];
    for (let c = 0; c < 2; c++) {
      let e = new Float64Array(H).map((_, i) => Math.sin(1 + i * (c + 2)));
      for (let it = 0; it < 60; it++) {
        const f = new Float64Array(H);
        for (let i = 0; i < H; i++) for (let j = 0; j < H; j++) f[i] += Cv[i * H + j] * e[j];
        for (const o of es) { const d = dot(f, o); for (let i = 0; i < H; i++) f[i] -= d * o[i]; }
        const n = Math.hypot(...f); if (n < 1e-12) break;
        e = f.map(x => x / n);
      }
      es.push(e);
    }
    // signs: as in the last frame, else following the round after this one
    const P = { mean, es, s: [1, 1] };
    const old = prev && prev[k] && prev[k].es[0].length === H ? prev[k] : null;
    for (let c = 0; c < 2; c++) {
      let sg;
      if (old) sg = dot(es[c], old.es[c]) < 0 ? -1 : 1;
      else if (out.length) {
        const nx = out[0];
        let cr = 0, i = 0;
        for (const R of Rs) for (let v = 0; v < R.g.N; v++, i++) cr += proj1(P, rows[i], c) * proj1(nx, R.h[k + 1].subarray(v * H, v * H + H), c);
        sg = cr < 0 ? -1 : 1;
      } else sg = 1;
      for (let i = 0; i < H; i++) es[c][i] *= sg;
    }
    for (let c = 0; c < 2; c++) { let m = 1e-9; for (const x of rows) m = Math.max(m, Math.abs(proj1(P, x, c))); P.s[c] = m; }
    out.unshift(P);
  }
  return out;
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function proj1(P, x, c) { let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - P.mean[i]) * P.es[c][i]; return s; }

// the colour of a state: the first component from violet (negative) to gold
// (positive) through a neutral middle, the second towards the ink or the ground
export function stateColor(P, x, pal) {
  const t1 = proj1(P, x, 0) / P.s[0], t2 = proj1(P, x, 1) / P.s[1];
  const mid = lerp(pal.rgb('ground'), pal.rgb('ink-soft'), 0.35);
  let c = t1 < 0 ? lerp(mid, pal.rgb('accent'), -t1 * 1.15) : lerp(mid, pal.rgb('gold'), t1 * 1.15);
  c = t2 > 0 ? lerp(c, pal.rgb('ink'), 0.3 * t2) : lerp(c, pal.rgb('ground'), -0.3 * t2);
  return c;
}
const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

// ------------------------------------------------------------ layout
// a force layout: the nodes repel, the edges pull; the nodes of `side` 1 are
// pulled to the right half and those of side 0 to the left half when present
export function createLayout(g, W, H, seed) {
  const r = rng(seed * 31 + 5), N = g.N, sided = g.nodes && g.nodes.some(n => n.side === 1);
  const cx = v => (sided ? (g.nodes[v].side ? 0.75 : 0.25) * W : W / 2);
  const L = {
    x: Float64Array.from({ length: N }, (_, v) => cx(v) + (r() - 0.5) * W * (sided ? 0.3 : 0.6)),
    y: Float64Array.from({ length: N }, () => H / 2 + (r() - 0.5) * H * 0.6),
    vx: new Float64Array(N), vy: new Float64Array(N), pin: -1, alpha: 1, W, H,
  };
  const len = Math.min(W, H) / Math.sqrt(N) * (sided ? 0.6 : 0.95), rep = len * len * 0.9;
  L.tick = () => {
    if (g.at) { L.alpha = Math.max(0.02, L.alpha * 0.9); return; }   // only the dragged node moves
    const { x, y, vx, vy } = L, a = L.alpha;
    for (let u = 0; u < N; u++) for (let v = u + 1; v < N; v++) {
      if (sided && g.nodes[u].side !== g.nodes[v].side) continue;
      let dx = x[v] - x[u], dy = y[v] - y[u], d2 = dx * dx + dy * dy + 1;
      const f = rep / d2 * a, d = Math.sqrt(d2);
      dx /= d; dy /= d;
      vx[u] -= f * dx; vy[u] -= f * dy; vx[v] += f * dx; vy[v] += f * dy;
    }
    for (const [u, v] of g.edges) {
      const dx = x[v] - x[u], dy = y[v] - y[u], d = Math.hypot(dx, dy) + 1e-9, f = 0.08 * (d - len) * a;
      vx[u] += f * dx / d; vy[u] += f * dy / d; vx[v] -= f * dx / d; vy[v] -= f * dy / d;
    }
    for (let v = 0; v < N; v++) {
      vx[v] += (cx(v) - x[v]) * 0.012 * a; vy[v] += (H / 2 - y[v]) * 0.012 * a;
      if (v === L.pin) { vx[v] = vy[v] = 0; continue; }
      x[v] += (vx[v] *= 0.55); y[v] += (vy[v] *= 0.55);
      x[v] = Math.max(16, Math.min(W - 16, x[v])); y[v] = Math.max(16, Math.min(H - 30, y[v]));
    }
    L.alpha = Math.max(0.02, L.alpha * 0.985);
  };
  // given positions are kept, the others found by the forces
  if (g.at) g.at.forEach(([fx, fy, dx, dy], v) => { L.x[v] = (fx + dx) * W; L.y[v] = fy * H + dy * W; });
  else for (let i = 0; i < 300; i++) L.tick();
  L.alpha = 0.02;
  L.hit = (px, py, rad) => {
    let best = -1, bd = (rad + 6) ** 2;
    for (let v = 0; v < N; v++) { const d = (L.x[v] - px) ** 2 + (L.y[v] - py) ** 2; if (d < bd) { bd = d; best = v; } }
    return best;
  };
  return L;
}

export const nodeRadius = g => (g.N > 30 ? 9 : 12);

// ------------------------------------------------------------ the graph
// o: { g, L, P (projection of the round), R (forward), k (round), hover (node
// or -1), contrib (Map u -> share of the messages into the hovered node),
// wrong (Set of wrongly predicted nodes), notes ([{x, text}] under the drawing) }
export function drawGraph(cv, o, pal) {
  const ctx = cv.getContext('2d'), { g, L, P, R, k, hover, contrib, wrong } = o, Hd = R.h[0].length / g.N;
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  const rad = nodeRadius(g);
  // the edges, lit by their share of the messages into the hovered node
  for (const [u, v] of g.edges) {
    const on = hover >= 0 && (u === hover || v === hover), s = on ? contrib.get(u === hover ? v : u) || 0 : 0;
    ctx.strokeStyle = on ? pal.accent : pal.rule;
    ctx.globalAlpha = on ? 0.25 + 0.75 * Math.min(1, 2.5 * s) : hover >= 0 ? 0.6 : 1;
    ctx.lineWidth = on ? 1.5 + 9 * s : 1.3;
    ctx.beginPath(); ctx.moveTo(L.x[u], L.y[u]); ctx.lineTo(L.x[v], L.y[v]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = 0; v < g.N; v++) {
    const nd = g.nodes[v], x = L.x[v], y = L.y[v], c = stateColor(P, R.h[k].subarray(v * Hd, v * Hd + Hd), pal);
    ctx.fillStyle = rgb(c);
    ctx.beginPath();
    if (nd.kind === 'clause') roundRect(ctx, x - rad, y - rad, 2 * rad, 2 * rad, 3); else ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = nd.labelled || v === hover ? pal.ink : pal.ground;
    ctx.lineWidth = nd.labelled ? 2.5 : v === hover ? 2.5 : 1.5; ctx.stroke();
    if (wrong.has(v)) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (nd.kind === 'clause') roundRect(ctx, x - rad - 4, y - rad - 4, 2 * rad + 8, 2 * rad + 8, 5); else ctx.arc(x, y, rad + 4.5, 0, 2 * Math.PI);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (nd.text) {
      ctx.font = nd.kind === 'node' ? FONT2 : FONT;
      ctx.fillStyle = lum(c) > 0.5 ? '#2e2040' : '#f6effc';
      ctx.fillText(nd.text, x, y + 0.5);
    }
    // the value of the hidden assignment, written on the positive literals only
    if (nd.kind === 'lit' && nd.pos) { ctx.font = FONT; ctx.fillStyle = pal['ink-soft']; ctx.fillText(nd.value ? 'true' : 'false', x, y + rad + 9); }
    if (nd.kind === 'clause' && nd.y === 0) { ctx.font = FONT; ctx.fillStyle = pal['ink-soft']; ctx.fillText('false', x, y + rad + 9); }
  }
  ctx.font = '13px IBM Plex Mono, monospace'; ctx.fillStyle = pal.ink;
  for (const n of o.notes || []) ctx.fillText(n.text, n.x, cv.height - 12);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ------------------------------------------------------------ the update
// rows: [{ name, vec, part, scale? }], drawn as strips of bars (violet up for
// positive, gold down for negative); the row of the part `lit` is framed
export const STRIP = { top: 6, row: 34, left: 150 };
export const stripsHeight = n => STRIP.top + n * STRIP.row + 4;
export function stripRow(py) { return Math.floor((py - STRIP.top) / STRIP.row); }
export function drawStrips(cv, rows, lit, pal) {
  const ctx = cv.getContext('2d'), W = cv.width;
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, W, cv.height);
  ctx.font = FONT; ctx.textBaseline = 'middle';
  if (!rows.length) {
    ctx.fillStyle = pal['ink-soft']; ctx.textAlign = 'center';
    ctx.fillText('hover a node of the graph (or tap it)', W / 2, cv.height / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; return;
  }
  rows.forEach((rw, i) => {
    const y0 = STRIP.top + i * STRIP.row, mid = y0 + STRIP.row / 2, n = rw.vec.length, bw = (W - STRIP.left - 8) / n, amp = STRIP.row / 2 - 4;
    const s = rw.scale || Math.max(1, ...Array.from(rw.vec, Math.abs));
    if (lit && rw.part === lit) { ctx.fillStyle = pal.panel; ctx.fillRect(0, y0 + 1, W, STRIP.row - 2); }
    ctx.fillStyle = rw.part === 'o' || rw.part === 'h' ? pal.ink : pal['ink-soft'];
    ctx.textAlign = 'left'; ctx.fillText(rw.name, 6, mid);
    ctx.strokeStyle = pal.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(STRIP.left, mid + 0.5); ctx.lineTo(W - 8, mid + 0.5); ctx.stroke();
    for (let j = 0; j < n; j++) {
      const v = rw.vec[j] / s, h = Math.max(1, Math.abs(v) * amp);
      ctx.fillStyle = v >= 0 ? pal.accent : pal.gold;
      ctx.fillRect(STRIP.left + j * bw + 1, v >= 0 ? mid - h : mid + 1, Math.max(1, bw - 2), h);
    }
  });
  ctx.textBaseline = 'alphabetic';
}

// ------------------------------------------------------------ the curves
// accuracy (violet, and accent-2 dashed for a second one) and loss (gold, log scale)
export function drawCurves(cv, hist, pal) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, l = 40, r = 44, t = 12, b = 26;
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, W, H);
  const smax = Math.max(100, hist.length ? hist.at(-1).step : 0);
  const X = s => l + s / smax * (W - l - r), Ya = a => t + (1 - a) * (H - t - b);
  const lmin = -3, lmax = 1, Yl = v => t + (lmax - Math.max(lmin, Math.min(lmax, Math.log10(v)))) / (lmax - lmin) * (H - t - b);
  ctx.font = FONT; ctx.strokeStyle = pal.rule; ctx.lineWidth = 1;
  for (const a of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.beginPath(); ctx.moveTo(l, Ya(a)); ctx.lineTo(W - r, Ya(a)); ctx.stroke();
    ctx.fillStyle = pal.accent; ctx.textAlign = 'right'; ctx.fillText(`${a * 100}%`, l - 4, Ya(a) + 4);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = pal.gold;
  for (let e = lmin; e <= lmax; e++) ctx.fillText(e ? `1e${e}` : '1', W - r + 4, Yl(10 ** e) + 4);
  ctx.fillStyle = pal['ink-soft']; ctx.textAlign = 'center';
  for (let k = 0; k <= 4; k++) ctx.fillText(Math.round(smax * k / 4), X(smax * k / 4), H - 8);
  ctx.textAlign = 'left';
  const line = (f, col, dash) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash || []); ctx.beginPath();
    hist.forEach((h, k) => (k ? ctx.lineTo(X(h.step), f(h)) : ctx.moveTo(X(h.step), f(h)))); ctx.stroke();
    ctx.setLineDash([]);
  };
  if (!hist.length) return;
  line(h => Yl(h.loss), pal.gold);
  if (hist[0].acc2 !== undefined) line(h => Ya(h.acc2), pal['accent-2'], [5, 4]);
  line(h => Ya(h.acc), pal.accent);
}
