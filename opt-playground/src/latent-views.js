// Scene N: the drawings. The latent plane and the grid of decoded images share
// one frame (the same square of the plane, the same ticks), so that a region
// of the codes and what the decoder makes of it sit at the same place.

import { N } from './convnet.js';
import { t } from './i18n.js';

// ------------------------------------------------------------------ colours
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = css('--' + k);
  P.G = hex(P.ground); P.I = hex(P.ink);
  const dark = P.G.reduce((s, v) => s + v, 0) < 3 * 128;
  // ten classes from indigo through violet and rose to gold, the lightness
  // alternating so that neighbouring hues stay apart; darker on the light ground
  const hues = [248, 272, 292, 312, 330, 348, 8, 26, 42, 58];
  P.cls = hues.map((h, k) => dark ? `hsl(${h} ${k % 2 ? 80 : 70}% ${k % 2 ? 76 : 60}%)` : `hsl(${h} ${k % 2 ? 70 : 62}% ${k % 2 ? 50 : 34}%)`);
  P.dark = dark;
  return P;
}

// ------------------------------------------------------------------ the frame
export const FR = { x0: 40, y0: 10, side: 470 };
export const toPx = (v, z) => [FR.x0 + (z[0] - v.cx + v.R) / (2 * v.R) * FR.side, FR.y0 + (v.cy + v.R - z[1]) / (2 * v.R) * FR.side];
export const toZ = (v, px, py) => [v.cx - v.R + (px - FR.x0) / FR.side * 2 * v.R, v.cy + v.R - (py - FR.y0) / FR.side * 2 * v.R];

function nice(x) {
  const e = 10 ** Math.floor(Math.log10(x)), f = x / e;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
}
function axes(ctx, v, P) {
  const { x0, y0, side } = FR, st = nice(2 * v.R / 5);
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P['ink-soft']; ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
  const fmt = t => Math.abs(t) < 1e-9 ? '0' : st < 1 ? t.toFixed(Math.min(3, -Math.floor(Math.log10(st)))) : String(Math.round(t));
  ctx.textAlign = 'center';
  for (let t = Math.ceil((v.cx - v.R) / st) * st; t <= v.cx + v.R; t += st) {
    const [px] = toPx(v, [t, 0]);
    ctx.beginPath(); ctx.moveTo(px, y0 + side); ctx.lineTo(px, y0 + side + 4); ctx.stroke();
    ctx.fillText(fmt(t), px, y0 + side + 16);
  }
  ctx.textAlign = 'end';
  for (let t = Math.ceil((v.cy - v.R) / st) * st; t <= v.cy + v.R; t += st) {
    const [, py] = toPx(v, [0, t]);
    ctx.beginPath(); ctx.moveTo(x0 - 4, py); ctx.lineTo(x0, py); ctx.stroke();
    ctx.fillText(fmt(t), x0 - 6, py + 4);
  }
  ctx.textAlign = 'start'; ctx.fillText('z₁ →', x0 + side - 30, y0 + side + 28);
  ctx.save(); ctx.translate(10, y0 + 34); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'end'; ctx.fillText('z₂ →', 0, 0); ctx.restore();
  ctx.strokeStyle = P.rule; ctx.strokeRect(x0 + 0.5, y0 + 0.5, side - 1, side - 1);
}

// the marks shared by the two views: the path of the interpolation, the code of
// the drawn digit (a diamond) and the probe (a ring with a cross)
function marks(ctx, st, P) {
  const v = st.view;
  ctx.save(); ctx.beginPath(); ctx.rect(FR.x0, FR.y0, FR.side, FR.side); ctx.clip();
  if (st.path) {
    const a = toPx(v, st.path[0]), b = toPx(v, st.path[1]);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
    for (let t = 0; t <= st.steps; t++) {
      const p = toPx(v, [st.path[0][0] + t / st.steps * (st.path[1][0] - st.path[0][0]), st.path[0][1] + t / st.steps * (st.path[1][1] - st.path[0][1])]);
      ctx.fillStyle = t === 0 || t === st.steps ? P.accent : P.ground; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
  }
  if (st.drawn) {
    const [px, py] = toPx(v, st.drawn), r = 8;
    ctx.fillStyle = P.gold; ctx.strokeStyle = P.ground; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const [qx, qy] = toPx(v, st.probe);
  ctx.strokeStyle = P.ground; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(qx, qy, 10, 0, 2 * Math.PI); ctx.stroke();
  ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(qx, qy, 10, 0, 2 * Math.PI); ctx.moveTo(qx - 15, qy); ctx.lineTo(qx - 5, qy); ctx.moveTo(qx + 5, qy); ctx.lineTo(qx + 15, qy);
  ctx.moveTo(qx, qy - 15); ctx.lineTo(qx, qy - 5); ctx.moveTo(qx, qy + 5); ctx.lineTo(qx, qy + 15); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ the latent plane
export function drawPlane(cv, st, P) {
  const ctx = cv.getContext('2d'), v = st.view;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = P.panel; ctx.fillRect(FR.x0, FR.y0, FR.side, FR.side);
  // the prior N(0, I) of the VAE, as its circles of radius 1 and 2
  if (st.vae) {
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    const o = toPx(v, [0, 0]), u = FR.side / (2 * v.R);
    for (const r of [1, 2]) { ctx.beginPath(); ctx.arc(o[0], o[1], r * u, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  axes(ctx, v, P);
  ctx.save(); ctx.beginPath(); ctx.rect(FR.x0, FR.y0, FR.side, FR.side); ctx.clip();
  const { codes, Y } = st;
  if (codes) {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < codes.length; i++) {
      if (!codes[i]) continue;
      const [px, py] = toPx(v, codes[i]);
      ctx.fillStyle = P.cls[Y[i]]; ctx.beginPath(); ctx.arc(px, py, 3, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the label of every class at the median of its codes
    ctx.font = '500 15px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (let c = 0; c < 10; c++) {
      const xs = [], ys = [];
      for (let i = 0; i < codes.length; i++) if (codes[i] && Y[i] === c) { xs.push(codes[i][0]); ys.push(codes[i][1]); }
      if (!xs.length) continue;
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const [px, py] = toPx(v, [xs[xs.length >> 1], ys[ys.length >> 1]]);
      ctx.strokeStyle = P.ground; ctx.lineWidth = 4; ctx.strokeText(c, px, py + 5);
      ctx.fillStyle = P.cls[c]; ctx.fillText(c, px, py + 5);
    }
    ctx.textAlign = 'start';
    for (const k of st.sel) {
      if (!codes[k]) continue;
      const [px, py] = toPx(v, codes[k]);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI); ctx.stroke();
    }
  }
  ctx.restore();
  marks(ctx, st, P);
}

// ------------------------------------------------------------------ images
// paints a grid of intensities into an ImageData at (x0, y0), from ground to ink
function put(img, y, x0, y0, P, s = N) {
  const W = img.width, d = img.data, { G, I } = P;
  for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
    const t = Math.max(0, Math.min(1, y[i * s + j])), o = 4 * ((y0 + i) * W + x0 + j);
    d[o] = G[0] + t * (I[0] - G[0]); d[o + 1] = G[1] + t * (I[1] - G[1]); d[o + 2] = G[2] + t * (I[2] - G[2]); d[o + 3] = 255;
  }
}
const off = document.createElement('canvas');
function blit(ctx, img, x, y, w, h) {
  off.width = img.width; off.height = img.height;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(off, x, y, w, h);
}

// the grid of decoded images, cell (i, j) at the centre of its square of the plane
export function drawGrid(cv, st, P) {
  const ctx = cv.getContext('2d'), G = st.G, v = st.view;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  axes(ctx, v, P);
  if (st.grid) {
    const img = new ImageData(G * N, G * N);
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) put(img, st.grid[i * G + j], j * N, i * N, P);
    blit(ctx, img, FR.x0, FR.y0, FR.side, FR.side);
    ctx.strokeStyle = P.ground; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 1; k < G; k++) {
      const t = FR.x0 + k * FR.side / G, u = FR.y0 + k * FR.side / G;
      ctx.moveTo(t, FR.y0); ctx.lineTo(t, FR.y0 + FR.side); ctx.moveTo(FR.x0, u); ctx.lineTo(FR.x0 + FR.side, u);
    }
    ctx.stroke();
  }
  marks(ctx, st, P);
}

// one image, large
export function drawImage(cv, y, P) {
  const ctx = cv.getContext('2d'), img = new ImageData(N, N);
  put(img, y, 0, 0, P);
  blit(ctx, img, 0, 0, cv.width, cv.height);
}

// the interpolation: the two digits at the ends, the decoded path between them
export function drawStrip(cv, st, P) {
  const ctx = cv.getContext('2d'), n = st.strip ? st.strip.length : st.steps + 3, gap = 4;
  const c = Math.floor((cv.width - (n - 1) * gap) / n);
  if (cv.height !== c + 18) cv.height = c + 18;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, cv.width, cv.height);
  const x0 = Math.floor((cv.width - n * c - (n - 1) * gap) / 2);
  if (!st.strip) {
    for (let k = 0; k < n; k++) { ctx.fillStyle = P.panel; ctx.fillRect(x0 + k * (c + gap), 0, c, c); }
    return;
  }
  for (let k = 0; k < n; k++) {
    const one = new ImageData(N, N);
    put(one, st.strip[k], 0, 0, P);
    blit(ctx, one, x0 + k * (c + gap), 0, c, c);
  }
  ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
  for (const k of [0, n - 1]) ctx.strokeRect(x0 + k * (c + gap) + 1, 1, c - 2, c - 2);
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P['ink-soft']; ctx.textAlign = 'center';
  ctx.fillText('A', x0 + c / 2, c + 14); ctx.fillText('B', x0 + (n - 1) * (c + gap) + c / 2, c + 14);
  ctx.textAlign = 'start';
}

// ------------------------------------------------------------------ the curves
// the reconstruction term and the KL term per digit, against the steps, on a
// log scale; the hovered one (lit) is drawn thicker and the other fainter
export const CF = { x0: 52, y0: 12, r: 12, b: 30 };
export function drawCurves(cv, hist, vae, lit, P) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, { x0, y0, r, b } = CF, w = W - x0 - r, h = H - y0 - b;
  ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillStyle = P['ink-soft'];
  if (hist.length < 2) { ctx.fillText(t('press Play or Step to train', 'premere Avvia o Passo per addestrare'), x0 + 12, y0 + 22); return null; }
  const vals = []; for (const p of hist) { vals.push(p.rec); if (vae && p.kl > 0) vals.push(p.kl); }
  let lo = Math.log10(Math.max(1e-3, Math.min(...vals))), hi = Math.log10(Math.max(...vals));
  lo = Math.floor(lo * 2) / 2; hi = Math.ceil(hi * 2) / 2; if (hi - lo < 1) hi = lo + 1;
  const smax = hist[hist.length - 1].step, X = s => x0 + s / smax * w, Yv = u => y0 + (hi - Math.log10(Math.max(u, 1e-3))) / (hi - lo) * h;
  ctx.textAlign = 'end';
  for (let e = Math.ceil(lo); e <= hi; e++) for (const m of [1, 2, 5]) {
    const u = m * 10 ** e, lu = Math.log10(u); if (lu < lo || lu > hi) continue;
    const py = Yv(u);
    ctx.strokeStyle = P.rule; ctx.globalAlpha = m === 1 ? 1 : 0.5; ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + w, py); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(u >= 1 ? String(u) : u.toString(), x0 - 6, py + 4);
  }
  ctx.textAlign = 'center';
  const st = nice(smax / 6);
  for (let s = 0; s <= smax; s += st) ctx.fillText(String(s), X(s), y0 + h + 16);
  ctx.textAlign = 'end'; ctx.fillText(t('steps of Adam', 'passi di Adam'), x0 + w, y0 + h + 28); ctx.textAlign = 'start';
  const line = (key, color, name) => {
    const on = !lit || lit === key;
    ctx.strokeStyle = color; ctx.lineWidth = lit === key ? 3.5 : 2; ctx.globalAlpha = on ? 1 : 0.3; ctx.beginPath();
    hist.forEach((p, i) => { const q = [X(p.step), Yv(p[key])]; i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
    ctx.stroke();
    const last = hist[hist.length - 1];
    ctx.fillStyle = color; ctx.fillText(`${name} ${last[key].toFixed(key === 'kl' ? 2 : 1)}`, Math.min(X(last.step) - 150, x0 + w - 150), Math.max(y0 + 14, Yv(last[key]) - 8));
    ctx.globalAlpha = 1;
  };
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, w + r, H); ctx.clip();
  line('rec', P.accent, t('reconstruction', 'ricostruzione'));
  if (vae) line('kl', P.gold, 'KL');
  ctx.restore();
  return { Yv, X };
}
