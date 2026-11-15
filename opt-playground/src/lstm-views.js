// The drawings of the LSTM scene, on canvases sized to their box: the chain of
// cells unrolled over a window of steps, the heat maps step x unit, the loss
// curves and the norms of the gradient with respect to h_t. The colours are the
// tokens of style.css, read at every drawing so that both themes work.

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
function palette() {
  const P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
  return P;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a value in [-1, 1] (violet positive, gold negative) and one in [0, 1]
const signed = (P, v, base = P.ground) => mix(base, v >= 0 ? P.accent : P.gold, clamp(Math.abs(v), 0, 1));
const unsigned = (P, v, base = P.ground) => mix(base, P.accent, clamp(v, 0, 1));
const MONO = "'IBM Plex Mono', monospace";

// the canvas takes the width of its box and the given height, in CSS pixels
function fit(cv, h) {
  const w = Math.max(240, Math.round(cv.getBoundingClientRect().width || cv.parentNode.clientWidth || 600));
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const P = palette();
  ctx.fillStyle = mix(P.ground, P.ground, 0); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w, P };
}

// the values of the cell at step s (s = -1 is the initial state)
const val = (F, H, R) => ({
  c: (s, j) => s < 0 ? 0 : F.c[(s + 1) * H + j],
  h: (s, j) => s < 0 ? 0 : F.h[(s + 1) * H + j],
  a: (s, k, j) => F.a[s * R + k * H + j],
});

// ------------------------------------------------------------------ the chain
// o = { kind, F, H, seq, t, part, preds }: preds[s] = { y, p } at the steps
// with an output. Returns the regions under the mouse: { x, y, w, h, part, step }.
export function drawChain(cv, o) {
  const { kind, F, H, seq, t, part, preds } = o, T = seq.xs.length, lstm = kind === 'lstm';
  const { ctx, W, P } = fit(cv, 292);
  const V = val(F, H, lstm ? 4 * H : H), hits = [];
  const n = Math.min(T, clamp(Math.floor(W / 118), 3, 7));
  const s0 = clamp(t - Math.floor(n / 2), 0, T - n), pitch = W / n, cw = pitch * 0.8, gap = pitch - cw;
  const yTop = 36, yBot = 264, uh = Math.min(5, 32 / H);
  const cb = yTop + 10, cMid = cb + (H - 1) * uh / 2;        // the band of c
  const gy0 = 128, gy1 = 204, bus = 213;                       // the gates, the bus [h_{t-1}, x_t]
  const hb = 224, hMid = hb + (H - 1) * uh / 2;                // the band of h
  const lineOf = v => ({ col: signed(P, Math.tanh(v), P.rule), w: 0.8 + 2.2 * clamp(Math.abs(v), 0, 1.5) / 1.5 });
  function band(y0, xa, xb, f) {          // H horizontal strokes, one per unit
    for (let j = 0; j < H; j++) {
      const { col, w } = lineOf(f(j));
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(xa, y0 + j * uh); ctx.lineTo(xb, y0 + j * uh); ctx.stroke();
    }
  }
  function wire(pts) {
    ctx.strokeStyle = mix(P['ink-soft'], P.ground, 0.25); ctx.lineWidth = 1;
    ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  function node(x, y, s) {                // a pointwise operation, as in the diagrams of the post
    const r = s.length > 1 ? 15 : 7;
    ctx.fillStyle = mix(P.panel, P.panel, 0); ctx.strokeStyle = mix(P['ink-soft'], P.ground, 0.2); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x - r, y - 7, 2 * r, 14, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mix(P.ink, P.ink, 0); ctx.font = `11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y + 0.5);
  }
  function column(x, w, k, label, isSigned, p) {
    const rh = (gy1 - gy0) / H;
    ctx.fillStyle = mix(P['ink-soft'], P.ink, 0); ctx.font = `11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x + w / 2, gy0 - 5);
    for (let j = 0; j < H; j++) {
      const v = k(j), y = gy0 + j * rh;
      ctx.fillStyle = mix(P.ground, P.ground, 0); ctx.fillRect(x, y + 0.5, w, rh - 1);
      if (isSigned) {
        const m = x + w / 2;
        ctx.fillStyle = signed(P, v >= 0 ? 1 : -1); ctx.fillRect(v >= 0 ? m : m + v * w / 2, y + 0.5, Math.abs(v) * w / 2, rh - 1);
      } else { ctx.fillStyle = unsigned(P, 1); ctx.fillRect(x, y + 0.5, clamp(v, 0, 1) * w, rh - 1); }
    }
    ctx.strokeStyle = mix(P.rule, P.rule, 0); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, gy0 + 0.5, w - 1, gy1 - gy0 - 1);
    hits.push({ x: x - 3, y: gy0 - 18, w: w + 6, h: gy1 - gy0 + 18, part: p });
  }

  for (let s = s0; s < s0 + n; s++) {    // the boxes first, then what runs through them
    const x0 = (s - s0) * pitch + gap / 2, cur = s === t;
    ctx.fillStyle = mix(P.panel, P.panel, 0); ctx.strokeStyle = cur ? mix(P.accent, P.accent, 0) : mix(P.rule, P.rule, 0);
    ctx.lineWidth = cur ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(x0, yTop, cw, yBot - yTop, 8); ctx.fill(); ctx.stroke();
  }
  for (let s = s0; s < s0 + n; s++) {
    const x0 = (s - s0) * pitch + gap / 2, X = f => x0 + f * cw, cur = s === t, first = hits.length;
    ctx.globalAlpha = cur ? 1 : 0.55;
    // h_{t-1} enters at the bottom left, h_t leaves at the bottom right
    band(hb, x0 - gap / 2, X(0.06), j => V.h(s - 1, j));
    band(hb, X(0.94), x0 + cw + gap / 2, j => V.h(s, j));
    wire([[X(0.06), hMid], [X(0.06), bus], [X(lstm ? 0.92 : 0.7), bus]]);
    // x_t enters from below
    wire([[X(0.06), yBot + 4], [X(0.06), bus]]);
    ctx.font = `12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mix(P.ink, P.ink, 0); ctx.fillText(seq.sym[seq.xs[s]], X(0.06), yBot + 18);
    ctx.fillStyle = mix(P['ink-soft'], P.ink, 0); ctx.font = `10px ${MONO}`; ctx.fillText(`t=${s + 1}`, X(0.5), yBot + 18);
    if (lstm) {
      const cx = [0.12, 0.34, 0.56, 0.78], w = cw * 0.16, lab = ['f', 'i', 'c̃', 'o'], parts = ['f', 'i', 'g', 'o'];
      const mid = k => X(cx[k]) + w / 2, ig = (mid(1) + mid(2)) / 2;
      // the band of c: c_{t-1}, times f, plus i * g, then c_t
      band(cb, x0 - gap / 2, mid(0), j => V.c(s - 1, j));
      band(cb, mid(0), ig, j => V.a(s, 0, j) * V.c(s - 1, j));
      band(cb, ig, x0 + cw + gap / 2, j => V.c(s, j));
      hits.push({ x: x0 - gap / 2, y: cb - 8, w: pitch, h: (H - 1) * uh + 16, part: 'c' });
      for (let k = 0; k < 4; k++) wire([[mid(k), bus], [mid(k), gy1]]);
      wire([[mid(0), gy0 - 18], [mid(0), cMid]]);
      wire([[mid(1), gy0 - 18], [mid(1), 104], [mid(2), 104], [mid(2), gy0 - 18]]);
      wire([[ig, 104], [ig, cMid]]);
      wire([[X(0.94), cMid], [X(0.94), hMid]]);
      wire([[X(0.94), 80], [X(0.94) - 8, 80]]);
      wire([[mid(3), gy0 - 18], [mid(3), 104], [X(0.94), 104]]);
      for (let k = 0; k < 4; k++) column(X(cx[k]), w, j => V.a(s, k, j), lab[k], k === 2, parts[k]);
      node(mid(0), cMid, '×'); node(ig, cMid, '+'); node(ig, 104, '×');
      node(X(0.94) - 8, 80, 'tanh'); node(X(0.94), 104, '×');
      hits.push({ x: X(0.88), y: 70, w: cw * 0.12 + gap / 2, h: hMid - 70 + 16, part: 'h' });
    } else {
      const w = cw * 0.4;
      wire([[X(0.5), bus], [X(0.5), gy1]]);
      wire([[X(0.5), gy0 - 18], [X(0.5), 104], [X(0.94), 104], [X(0.94), hMid]]);
      column(X(0.3), w, j => V.h(s, j), 'tanh', true, 'h');
    }
    hits.push({ x: x0 - gap / 2, y: hb - 8, w: pitch, h: (H - 1) * uh + 16, part: 'h' });
    // the output read at this step
    const pr = preds[s];
    if (pr) {
      const ok = pr.p === pr.y;
      ctx.fillStyle = ok ? mix(P.accent, P.accent, 0) : mix(P.gold, P.gold, 0); ctx.font = `12px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(`ŷ=${pr.p}${ok ? '' : ` (${pr.y})`}`, X(0.94), 22);
      wire([[X(0.94), 27], [X(0.94), yTop]]);
      hits.push({ x: X(0.94) - 30, y: 6, w: 60, h: yTop - 4, part: 'y' });
    }
    for (let k = first; k < hits.length; k++) hits[k].step = s;
    ctx.globalAlpha = 1;
  }
  // the part pointed at, in every cell of the window
  if (part) {
    ctx.strokeStyle = mix(P['accent-2'], P['accent-2'], 0); ctx.lineWidth = 2;
    for (const r of hits) if (r.part === part) { ctx.beginPath(); ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 4); ctx.stroke(); }
  }
  return hits;
}

// ------------------------------------------------------------------ heat maps
const ROWS = { lstm: [['c', 'c'], ['h', 'h'], ['f', 'f'], ['i', 'i'], ['g', 'c̃'], ['o', 'o']], rnn: [['h', 'h']] };
export function drawHeat(cv, o) {
  const { kind, F, H, seq, t, part } = o, T = seq.xs.length, lstm = kind === 'lstm';
  const V = val(F, H, lstm ? 4 * H : H), rows = ROWS[kind];
  const ch = H <= 4 ? 8 : 6, sep = 10, top = 18, left = 30;
  const height = top + rows.length * (H * ch + sep) + 4;
  const { ctx, W, P } = fit(cv, height), cwid = (W - left - 4) / T, hits = [];
  ctx.font = `11px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (let s = 0; s < T; s++) {            // the inputs along the top
    ctx.fillStyle = mix(s === t ? P.accent : P['ink-soft'], P.ink, 0);
    if (cwid >= 7 || s % 5 === 0 || s === t) ctx.fillText(seq.sym[seq.xs[s]], left + (s + 0.5) * cwid, 8);
  }
  rows.forEach(([p, lab], r) => {
    const y0 = top + r * (H * ch + sep);
    ctx.fillStyle = mix(part === p ? P['accent-2'] : P['ink-soft'], P.ink, 0); ctx.textAlign = 'right';
    ctx.fillText(lab, left - 8, y0 + H * ch / 2);
    for (let s = 0; s < T; s++) for (let j = 0; j < H; j++) {
      let c;
      if (p === 'c') c = signed(P, V.c(s, j) / 2);
      else if (p === 'h') c = signed(P, V.h(s, j));
      else if (p === 'g') c = signed(P, V.a(s, 2, j));
      else c = unsigned(P, V.a(s, { f: 0, i: 1, o: 3 }[p], j));
      ctx.fillStyle = c; ctx.fillRect(left + s * cwid, y0 + j * ch, Math.ceil(cwid), ch);
    }
    ctx.strokeStyle = mix(part === p ? P['accent-2'] : P.rule, P.rule, 0); ctx.lineWidth = part === p ? 2 : 1;
    ctx.strokeRect(left + 0.5, y0 + 0.5, T * cwid - 1, H * ch - 1);
    hits.push({ x: 0, y: y0, w: W, h: H * ch, part: p });
  });
  ctx.strokeStyle = mix(P.ink, P.ink, 0); ctx.lineWidth = 1.5;
  ctx.strokeRect(left + t * cwid, top - 2, cwid, height - top - 2);
  return { hits, step: x => Math.floor((x - left) / cwid) };
}

// ------------------------------------------------------------------ the curves
function axes(ctx, P, box, xs, ys, xl, yl) {
  const [x0, y0, x1, y1] = box;
  ctx.strokeStyle = mix(P.rule, P.rule, 0); ctx.lineWidth = 1;
  ctx.fillStyle = mix(P['ink-soft'], P.ink, 0); ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [v, y, s] of ys) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(s, x0 - 4, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [v, x] of xs) ctx.fillText(String(v), x, y1 + 4);
  ctx.textAlign = 'right'; ctx.fillText(xl, x1, y1 + 16);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(yl, x0, y0 - 4);
}
function ticks(a, b, n) {
  const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st, out = [];
  for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6));
  return out;
}
function legend(ctx, P, x, y, items) {
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = 30 + Math.max(...items.map(([, s]) => ctx.measureText(s).width));
  ctx.fillStyle = mix(P.ground, P.ground, 0); ctx.globalAlpha = 0.85; ctx.fillRect(x - 4, y - 9, w, 15 * items.length + 3); ctx.globalAlpha = 1;
  items.forEach(([col, s, dash], k) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x, y + 15 * k); ctx.lineTo(x + 16, y + 15 * k); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = mix(P.ink, P.ink, 0); ctx.fillText(s, x + 22, y + 15 * k);
  });
}

// hist = { lstm: [{ epoch, loss, acc }], rnn: [...] }, chance = the loss of the uniform guess
export function drawLoss(cv, hist, chance, epoch) {
  const { ctx, W, P } = fit(cv, 230), box = [40, 24, W - 10, 196];
  const all = [...hist.lstm, ...hist.rnn], ymax = Math.max(chance * 1.15, ...all.map(q => Math.min(q.loss, 3 * chance)));
  const xmax = Math.max(20, epoch), X = e => box[0] + e / xmax * (box[2] - box[0]), Y = l => box[3] - Math.min(l, ymax) / ymax * (box[3] - box[1]);
  axes(ctx, P, box, ticks(0, xmax, 5).map(v => [v, X(v)]), ticks(0, ymax, 4).map(v => [v, Y(v), String(v)]), 'epoch', 'loss (cross-entropy on 200 test sequences)');
  ctx.strokeStyle = mix(P['ink-soft'], P.ground, 0.3); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(box[0], Y(chance)); ctx.lineTo(box[2], Y(chance)); ctx.stroke(); ctx.setLineDash([]);
  for (const [k, col] of [['rnn', P.gold], ['lstm', P.accent]]) {
    ctx.strokeStyle = mix(col, col, 0); ctx.lineWidth = 2; ctx.beginPath();
    hist[k].forEach((q, i) => i ? ctx.lineTo(X(q.epoch), Y(q.loss)) : ctx.moveTo(X(q.epoch), Y(q.loss))); ctx.stroke();
  }
  const last = k => hist[k].length ? ` ${(100 * hist[k].at(-1).acc).toFixed(0)}%` : '';
  legend(ctx, P, Math.max(box[0] + 8, box[2] - 190), box[1] + 0.35 * (box[3] - box[1]), [[mix(P.accent, P.accent, 0), 'LSTM' + last('lstm')], [mix(P.gold, P.gold, 0), 'plain RNN' + last('rnn')],
    [mix(P['ink-soft'], P.ground, 0.3), 'uniform guess, ln K', [4, 4]]]);
}

// g = { lstm: Float64Array(T), rnn: ... }: the mean of |dL/dh_t| over the test sequences
// divided by its value at the last step, so that only the decay backwards is compared
export function drawGrad(cv, g0, t) {
  const rel = a => { const e = a.at(-1) || 1; return a.map(v => v / e); };
  const g = { lstm: rel(g0.lstm), rnn: rel(g0.rnn) };
  const { ctx, W, P } = fit(cv, 230), box = [40, 24, W - 10, 196], T = g.lstm.length;
  const logs = [...g.lstm, ...g.rnn].filter(v => v > 0).map(Math.log10);
  let hi = Math.ceil(Math.max(...logs, 0)), lo = Math.floor(Math.min(...logs, hi - 2));
  lo = Math.max(lo, hi - 16);
  const X = s => box[0] + (T > 1 ? s / (T - 1) : 0.5) * (box[2] - box[0]), Y = v => box[3] - (clamp(Math.log10(Math.max(v, 1e-300)), lo, hi) - lo) / (hi - lo) * (box[3] - box[1]);
  const step = Math.max(1, Math.ceil((hi - lo) / 5)), ys = [];
  for (let e = lo; e <= hi; e += step) ys.push([e, Y(10 ** e), `1e${e}`]);
  axes(ctx, P, box, ticks(1, T, 6).filter(v => Number.isInteger(v)).map(v => [v, X(v - 1)]), ys, 'step t', '|∂L/∂h_t| / |∂L/∂h_T|');
  ctx.strokeStyle = mix(P.ink, P.ink, 0); ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(t), box[1]); ctx.lineTo(X(t), box[3]); ctx.stroke(); ctx.globalAlpha = 1;
  for (const [k, col] of [['rnn', P.gold], ['lstm', P.accent]]) {
    ctx.strokeStyle = ctx.fillStyle = mix(col, col, 0); ctx.lineWidth = 2; ctx.beginPath();
    g[k].forEach((v, s) => s ? ctx.lineTo(X(s), Y(v)) : ctx.moveTo(X(s), Y(v))); ctx.stroke();
    g[k].forEach((v, s) => { ctx.beginPath(); ctx.arc(X(s), Y(v), 2.2, 0, 2 * Math.PI); ctx.fill(); });
  }
  legend(ctx, P, box[0] + 8, box[1] + 10, [[mix(P.accent, P.accent, 0), 'LSTM'], [mix(P.gold, P.gold, 0), 'plain RNN']]);
}
