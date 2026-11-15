// The drawings of scene K on canvases: the example with its attention lines,
// the attention matrices, the inside of one head, and the training curves.
// The colours are the tokens of style.css, read at every draw so that both
// themes work.

import { SEP } from './attention-tasks.js';
import { t } from './i18n.js';

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, c, t) => `rgb(${a.map((v, i) => Math.round(v + Math.max(0, Math.min(1, t)) * (c[i] - v))).join(',')})`;
export const palette = () => {
  const p = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) p[k] = css('--' + k);
  p.rgb = k => hex(p[k]);
  return p;
};
const FONT = '11px IBM Plex Mono, monospace', FONT2 = '500 14px IBM Plex Mono, monospace';
export const label = t => (t === SEP ? '|' : String(t));

// ------------------------------------------------------- the example row
export function exampleLayout(cv, n) {
  const W = cv.width, w = Math.min(46, (W - 16) / n), x0 = (W - w * n) / 2;
  return { w, x: i => x0 + w * (i + 0.5), yTop: 34, yBot: cv.height - 34, hit: px => Math.floor((px - x0) / w) };
}

// g: the generated example ({ tokens, C, preds, prompt }), sel: { layer, head, query }
export function drawExample(cv, g, sel, pal) {
  const ctx = cv.getContext('2d'), n = g.tokens.length, Lo = exampleLayout(cv, n);
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  const A = g.C.L[sel.layer].A[sel.head], acc = pal.rgb('accent'), bg = pal.rgb('ground');
  // the lines from every prediction to the tokens it reads, the selected one strong
  for (const pr of g.preds) {
    const on = pr.pos === sel.query, i = pr.pos;
    for (let j = 0; j < n; j++) {
      const a = A[i * n + j]; if (a < 0.02) continue;
      ctx.strokeStyle = on ? pal.accent : mix(bg, acc, 0.5);
      ctx.globalAlpha = on ? 0.15 + 0.85 * a : 0.25 * a;
      ctx.lineWidth = on ? 1 + 7 * a : 1 + 2 * a;
      const xa = Lo.x(i), xb = Lo.x(j), ya = Lo.yBot - 16, yb = Lo.yTop + 16;
      ctx.beginPath(); ctx.moveTo(xa, ya);
      ctx.bezierCurveTo(xa, (ya + yb) / 2, xb, (ya + yb) / 2, xb, yb); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // the tokens read, and the predictions under the positions that make them
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const qrow = A.subarray(sel.query * n, sel.query * n + n);
  for (let j = 0; j < n; j++) {
    const x = Lo.x(j), fed = j >= g.prompt && g.preds.length > 1;
    ctx.fillStyle = mix(bg, acc, 0.85 * qrow[j]);
    roundRect(ctx, x - Lo.w / 2 + 3, Lo.yTop - 14, Lo.w - 6, 28, 5); ctx.fill();
    ctx.strokeStyle = pal.rule; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = FONT2; ctx.fillStyle = qrow[j] > 0.5 ? pal.ground : fed ? pal['ink-soft'] : pal.ink;
    ctx.fillText(label(g.tokens[j]), x, Lo.yTop);
    ctx.font = FONT; ctx.fillStyle = pal['ink-soft']; ctx.fillText(j, x, Lo.yTop - 22);
  }
  for (const pr of g.preds) {
    const x = Lo.x(pr.pos), on = pr.pos === sel.query, ok = pr.token === pr.target;
    ctx.fillStyle = on ? pal.panel : pal.ground;
    roundRect(ctx, x - Lo.w / 2 + 3, Lo.yBot - 14, Lo.w - 6, 28, 5); ctx.fill();
    ctx.strokeStyle = on ? pal.accent : ok ? pal.rule : pal.gold; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
    ctx.font = FONT2; ctx.fillStyle = ok ? pal.ink : pal.gold; ctx.fillText(label(pr.token), x, Lo.yBot);
    ctx.font = FONT; ctx.fillStyle = pal['ink-soft']; ctx.fillText(`${Math.round(100 * pr.p)}%`, x, Lo.yBot + 22);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ----------------------------------------------------- attention matrices
// P > 0: the first P tokens see each other in both directions
function heat(ctx, A, n, P, x0, y0, s, pal, sel) {
  const bg = pal.rgb('ground'), acc = pal.rgb('accent');
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ok = j <= i || (P > 0 && i < P && j < P);
    ctx.fillStyle = ok ? mix(bg, acc, A[i * n + j] ** 0.7) : pal.panel;
    ctx.fillRect(x0 + j * s, y0 + i * s, Math.max(1, s - 1), Math.max(1, s - 1));
  }
  ctx.strokeStyle = pal.rule; ctx.lineWidth = 1; ctx.strokeRect(x0 - 0.5, y0 - 0.5, n * s, n * s);
  if (sel !== undefined) { ctx.strokeStyle = pal.gold; ctx.lineWidth = 2; ctx.strokeRect(x0 - 1, y0 + sel * s - 1, n * s + 1, s + 1); }
}

export function bigLayout(cv, n) {
  const m = 40, s = Math.floor((cv.width - m - 4) / n);
  return { m, s, row: py => Math.floor((py - m) / s), col: px => Math.floor((px - m) / s) };
}
export function drawBig(cv, g, sel, P, pal) {
  const ctx = cv.getContext('2d'), n = g.tokens.length, { m, s } = bigLayout(cv, n), A = g.C.L[sel.layer].A[sel.head];
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  heat(ctx, A, n, P, m, m, s, pal, sel.query);
  ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const target = new Set(g.preds.map(p => p.pos));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === sel.query ? pal.gold : target.has(i) ? pal.accent : pal['ink-soft'];
    ctx.fillText(label(g.tokens[i]), m - 10, m + (i + 0.5) * s);
    ctx.fillStyle = pal['ink-soft']; ctx.fillText(label(g.tokens[i]), m + (i + 0.5) * s, m - 10);
  }
  ctx.textAlign = 'left'; ctx.fillText(t('keys →', 'chiavi →'), m, 10);
  ctx.save(); ctx.translate(10, m); ctx.rotate(Math.PI / 2); ctx.fillText(t('queries →', 'query →'), 0, 0); ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = pal.accent; ctx.textAlign = 'right'; ctx.fillText(t(`layer ${sel.layer + 1}, head ${sel.head + 1}`, `strato ${sel.layer + 1}, testa ${sel.head + 1}`), cv.width - 4, 14); ctx.textAlign = 'left';
}

export function thumbsLayout(cv, L, H) {
  const gap = 12, top = 16, s = Math.min(100, Math.floor((cv.width - gap * (H - 1)) / H));
  return { s, gap, top, height: L * (s + top + gap), hit: (px, py) => {
    const h = Math.floor(px / (s + gap)), l = Math.floor(py / (s + top + gap));
    return h >= 0 && h < H && l >= 0 && l < L ? { layer: l, head: h } : null;
  } };
}
export function drawThumbs(cv, g, sel, P, pal) {
  const L = g.C.L.length, H = g.C.L[0].A.length, n = g.tokens.length, Lo = thumbsLayout(cv, L, H), ctx = cv.getContext('2d');
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = FONT;
  for (let l = 0; l < L; l++) for (let h = 0; h < H; h++) {
    const x = h * (Lo.s + Lo.gap), y = l * (Lo.s + Lo.top + Lo.gap), on = l === sel.layer && h === sel.head, c = Lo.s / n;
    ctx.fillStyle = on ? pal.accent : pal['ink-soft']; ctx.fillText(t(`L${l + 1} H${h + 1}`, `S${l + 1} T${h + 1}`), x, y + 11);
    heat(ctx, g.C.L[l].A[h], n, P, x, y + Lo.top, c, pal);
    if (on) { ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y + Lo.top - 2, n * c + 3, n * c + 3); }
  }
}

// ------------------------------------------------- inside the selected head
const QKV = { head: 22, row: 17, lab: 34 };
export function qkvLayout(cv, dk) {
  const W = cv.width, cw = Math.max(2, Math.min(9, Math.floor((W - t(QKV.lab, QKV.lab + 12) - 2 * 96 - 40) / (2 * dk)))), sw = cw * dk;
  const xk = t(QKV.lab, QKV.lab + 12), xv = xk + sw + 14, xs = xv + sw + 14, bw = Math.floor((W - xs - 14) / 2), xa = xs + bw + 14;
  return { cw, sw, xk, xv, xs, xa, bw, part: px => (px < xk ? null : px < xv - 7 ? 'k' : px < xs - 7 ? 'v' : px < xa - 7 ? 's' : 'a') };
}
export const qkvHeight = n => QKV.head + QKV.row + 8 + n * QKV.row + 8 + QKV.row + 4;
// which part of the formula the pointer is on: the row of q, a key row or the output
export function qkvPart(cv, dk, n, px, py) {
  const Lo = qkvLayout(cv, dk), yq = QKV.head, yk = yq + QKV.row + 8, yo = yk + n * QKV.row + 8;
  if (py < yq) return null;
  if (py < yq + QKV.row) return px >= Lo.xk && px < Lo.xk + Lo.sw ? 'q' : null;
  if (py >= yo) return 'o';
  return Lo.part(px);
}
export function drawQKV(cv, g, sel, M, P, lit, pal) {
  const n = g.tokens.length, { d, heads } = M.cfg, dk = d / heads, o = sel.head * dk, c = g.C.L[sel.layer], i = sel.query;
  const Lo = qkvLayout(cv, dk), ctx = cv.getContext('2d'), bg = pal.rgb('ground'), acc = pal.rgb('accent'), gold = pal.rgb('gold');
  ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  const vec = (X, t) => Array.from(X.subarray(t * d + o, t * d + o + dk));
  let mx = 1e-9;
  for (let t = 0; t < n; t++) for (const X of [c.Q, c.K, c.V]) for (const v of vec(X, t)) mx = Math.max(mx, Math.abs(v));
  const strip = (v, x, y) => v.forEach((u, e) => { ctx.fillStyle = mix(bg, u > 0 ? acc : gold, Math.abs(u) / mx); ctx.fillRect(x + e * Lo.cw, y, Lo.cw - (Lo.cw > 3 ? 1 : 0), QKV.row - 4); });
  const head = (s, x, part) => { ctx.fillStyle = lit === part || (lit === 'o' && part) ? pal.accent : pal['ink-soft']; ctx.fillText(s, x, 12); };
  ctx.font = FONT;
  head(t('key', 'chiave'), 0, null); head('k_j', Lo.xk, 'k'); head('v_j', Lo.xv, 'v'); head(t('score', 'punteggio'), Lo.xs, 's'); head('softmax', Lo.xa, 'a');
  let y = QKV.head;
  ctx.fillStyle = lit === 'q' ? pal.accent : pal.ink; ctx.fillText(`q ${label(g.tokens[i])}`, 0, y + 10);
  strip(vec(c.Q, i), Lo.xk, y);
  y += QKV.row + 8;
  const S = c.S[sel.head], A = c.A[sel.head];
  let smax = 1e-9;
  for (let j = 0; j < n; j++) if (!Number.isNaN(S[i * n + j])) smax = Math.max(smax, Math.abs(S[i * n + j]));
  for (let j = 0; j < n; j++, y += QKV.row) {
    const s = S[i * n + j];
    ctx.fillStyle = pal['ink-soft']; ctx.fillText(`${j} ${label(g.tokens[j])}`, 0, y + 10);
    if (Number.isNaN(s)) { ctx.fillText(t('masked', 'mascherata'), Lo.xk, y + 10); continue; }
    strip(vec(c.K, j), Lo.xk, y); strip(vec(c.V, j), Lo.xv, y);
    // the score, signed, about the middle of its column; the weight from the left
    const mid = Lo.xs + Lo.bw / 2, w = s / smax * Lo.bw / 2;
    ctx.fillStyle = s > 0 ? pal.accent : pal.gold; ctx.fillRect(Math.min(mid, mid + w), y, Math.abs(w), QKV.row - 4);
    ctx.fillStyle = pal.rule; ctx.fillRect(mid, y - 1, 1, QKV.row - 2);
    ctx.fillStyle = pal.accent; ctx.fillRect(Lo.xa, y, A[i * n + j] * (Lo.bw - 30), QKV.row - 4);
    ctx.fillStyle = pal['ink-soft']; ctx.fillText(A[i * n + j].toFixed(2), Lo.xa + A[i * n + j] * (Lo.bw - 30) + 3, y + 10);
  }
  y += 8;
  ctx.fillStyle = lit === 'o' ? pal.accent : pal.ink; ctx.fillText(t('out', 'uscita'), 0, y + 10);
  strip(vec(c.O, i), Lo.xv, y);
}

// ------------------------------------------------------------------ curves
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
  const line = (f, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    hist.forEach((h, k) => (k ? ctx.lineTo(X(h.step), f(h)) : ctx.moveTo(X(h.step), f(h)))); ctx.stroke();
  };
  if (hist.length) { line(h => Yl(h.loss), pal.gold); line(h => Ya(h.acc), pal.accent); }
}
