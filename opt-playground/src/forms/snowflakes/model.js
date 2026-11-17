// Snow crystals after Reiter (2005), "A local cellular model for snow crystal
// growth", Chaos, Solitons & Fractals 23: a hexagonal grid of cells, each with
// an amount s of water; a cell is frozen when s >= 1, and receptive when it is
// frozen or touches a frozen cell. At each step a receptive cell keeps its
// water and receives gamma more (the vapour that the air brings), the water of
// the other cells diffuses with the rate alpha, and what diffuses into a
// receptive cell stays there. The far border holds the vapour density beta.
// Here the air may also change while the crystal grows, as it does for a
// flake that falls through layers of different humidity: a seed draws the
// history of beta and gamma, every few cells of radius, so that every seed
// grows a different flake with the six arms alike. The printable solid is
// the crystal as a plate with a ring to hang it, the older parts thicker.

import { implicitSolid } from '../../print/index.js';

const S3 = Math.sqrt(3);

export const presets = {
  weather: { alpha: 1.2, beta: 0.45, gamma: 0.002, weather: true, seed: 123 },
  dendrite: { alpha: 2.5, beta: 0.4, gamma: 0.0001, weather: false, seed: 1 },
  fern: { alpha: 2, beta: 0.5, gamma: 0.0002, weather: false, seed: 1 },
  sectored: { alpha: 2, beta: 0.35, gamma: 0.003, weather: false, seed: 1 },
  stellar: { alpha: 1, beta: 0.3, gamma: 0.01, weather: false, seed: 1 },
  plate: { alpha: 1, beta: 0.3, gamma: 0.06, weather: false, seed: 1 },
};

// a small seeded generator (mulberry32)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the history of the air: beta and gamma for each band of radius, from the
// seed; without weather the same pair throughout
export function history(o, bands = 6) {
  const H = [];
  if (!o.weather) { for (let k = 0; k < bands; k++) H.push([o.beta, o.gamma]); return H; }
  const r = rng(o.seed * 7919 + 13);
  for (let k = 0; k < bands; k++) {
    // wetter or drier layers, and now and then (more often at the centre)
    // a dry one that grows facets and plates
    if (r() < (k === 0 ? 0.6 : 0.3)) { H.push([0.3 + 0.05 * r(), 0.008 + 0.025 * r()]); continue; }
    const b = Math.min(0.95, Math.max(0.3, o.beta * (0.7 + 0.65 * r())));
    H.push([b, o.gamma * (0.1 + 1.9 * r())]);
  }
  return H;
}

/* --------------------------------------------------------- the model ---- */

// the grid: axial coordinates (q, r) with |q|, |r|, |q + r| <= R, stored in a
// square of side W = 2R + 1, index (r + R) W + (q + R); x = q + r / 2,
// y = r sqrt(3) / 2 in cells
export function grid(R) {
  const W = 2 * R + 1, inside = [], border = [];
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) {
    const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (d > R) continue;
    (d === R ? border : inside).push((r + R) * W + (q + R));
  }
  return { R, W, inside: Int32Array.from(inside), border: Int32Array.from(border) };
}

// grows the crystal; onFrame(state) every `every` steps (return false to
// stop); returns { s, age, R, W, steps, radius, frozen, hist }
export function simulate(o, onFrame, every = 40) {
  const R = Math.round(o.R || 72), G = grid(R), { W, inside, border } = G;
  const n = W * W, alpha = o.alpha, hist = history(o), bands = hist.length;
  let s = new Float32Array(n), t = new Float32Array(n);
  const fr = new Uint8Array(n), rec = new Uint8Array(n), u = new Float32Array(n), age = new Float32Array(n).fill(-1);
  let [beta, gamma] = hist[0];
  for (const i of inside) s[i] = beta;
  for (const i of border) { s[i] = beta; u[i] = beta; }
  const c = R * W + R;
  s[c] = 1; fr[c] = 1; age[c] = 0;
  const nb = [1, -1, W, -W, 1 - W, W - 1];
  const maxSteps = o.maxSteps || 40000, stopAt = 0.9 * R;
  let radius = 0, frozen = 1, step = 0, band = 0;
  const qOf = i => (i % W) - R, rOf = i => Math.floor(i / W) - R;
  for (step = 1; step <= maxSteps; step++) {
    const ha = alpha / 12;
    // u: the water free to diffuse, none on receptive cells
    for (let k = 0; k < inside.length; k++) {
      const i = inside[k];
      rec[i] = fr[i] | fr[i + 1] | fr[i - 1] | fr[i + W] | fr[i - W] | fr[i + 1 - W] | fr[i + W - 1];
      u[i] = rec[i] ? 0 : s[i];
    }
    for (let k = 0; k < inside.length; k++) {
      const i = inside[k];
      const su = u[i + 1] + u[i - 1] + u[i + W] + u[i - W] + u[i + 1 - W] + u[i + W - 1];
      t[i] = rec[i] ? s[i] + gamma + ha * su : s[i] + ha * (su - 6 * s[i]);
    }
    for (const i of border) { t[i] = beta; u[i] = beta; }
    const tmp = s; s = t; t = tmp;
    for (let k = 0; k < inside.length; k++) {
      const i = inside[k];
      if (!fr[i] && s[i] >= 1) {
        fr[i] = 1; age[i] = step; frozen++;
        const q = qOf(i), r = rOf(i), d = Math.hypot(q + r / 2, r * S3 / 2);
        if (d > radius) radius = d;
      }
    }
    // the next layer of air when the crystal reaches the next band
    const b = Math.min(bands - 1, Math.floor(radius / stopAt * bands));
    if (b !== band) {
      band = b; [beta, gamma] = hist[b];
    }
    if (radius >= stopAt) break;
    if (onFrame && step % every === 0 && onFrame({ s, age, R, W, steps: step, radius, frozen, band }) === false) break;
  }
  return { s, age, R, W, steps: Math.min(step, maxSteps), radius, frozen, hist };

}

/* ------------------------------------------------------------- solid ---- */

// exact Euclidean distance transform of a binary raster (Felzenszwalb and
// Huttenlocher): the distance of every pixel to the nearest pixel with on = 1
function edt(on, nx, ny) {
  const INF = 1e20, f = new Float64Array(Math.max(nx, ny)), d = new Float64Array(nx * ny);
  const v = new Int32Array(Math.max(nx, ny)), z = new Float64Array(Math.max(nx, ny) + 1), out = new Float64Array(Math.max(nx, ny));
  const pass = n => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let sv = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (sv <= z[k]) { k--; sv = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = sv; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = on[y * nx + x] ? 0 : INF;
    pass(ny);
    for (let y = 0; y < ny; y++) d[y * nx + x] = out[y];
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) f[x] = d[y * nx + x];
    pass(nx);
    for (let x = 0; x < nx; x++) d[y * nx + x] = Math.sqrt(out[x]);
  }
  return d;
}

// the crystal as a plate in millimetres, the arms along +-y and the ring for
// hanging at the end of the arm along +y; size is the largest side, thick
// the plate, relief the extra height of the oldest parts, ring the hole
export function plate(sim, { size = 80, thick = 2, relief = 0.8, ring = true, h } = {}, progress) {
  const { age, R, W, steps } = sim;
  // the cells in the frame of the print: a rotation by 90 degrees puts an
  // arm (the direction q) along +y
  const cells = [];
  let rc = 0, tip = 0;
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) {
    const i = (r + R) * W + (q + R);
    if (age[i] < 0) continue;
    const x = q + r / 2, y = r * S3 / 2, X = -y, Y = x;
    cells.push([X, Y, age[i]]);
    rc = Math.max(rc, Math.hypot(X, Y));
    if (Math.abs(X) < 1 && Y > tip) tip = Y;
  }
  const rOut = 3, rIn = 1.5, dil = 0.3;
  const extra = ring ? rIn + rOut + 0.4 : 0;
  // the scale: the crystal from -rc to tip plus the ring fills size
  const k = (size - extra - 2 * dil) / (rc + Math.max(tip, rc * 0.5) + 1);
  const hh = h || Math.max(0.2, Math.min(0.45, size / 270));
  const X0 = -(rc + 1) * k - 2, Y0 = X0, X1 = -X0, Y1 = (tip + 1) * k + extra + 2;
  const nx = Math.ceil((X1 - X0) / hh) + 1, ny = Math.ceil((Y1 - Y0) / hh) + 1;
  // rasters: the crystal, and its age blurred
  const on = new Uint8Array(nx * ny), A = new Float32Array(nx * ny), Wt = new Float32Array(nx * ny);
  const cellR = 0.62 * k;                        // a hexagon of side 1/sqrt3 fits within
  for (const [cx, cy, a] of cells) {
    const px = (cx * k - X0) / hh, py = (cy * k - Y0) / hh, rr = cellR / hh;
    const a01 = 1 - a / Math.max(1, steps);
    for (let y = Math.floor(py - rr - 2); y <= Math.ceil(py + rr + 2); y++) for (let x = Math.floor(px - rr - 2); x <= Math.ceil(px + rr + 2); x++) {
      if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const d = Math.hypot(x - px, y - py) * hh;
      if (d <= cellR) on[y * nx + x] = 1;
      const w = Math.exp(-((d / (1.2 * k)) ** 2));
      A[y * nx + x] += w * a01; Wt[y * nx + x] += w;
    }
  }
  for (let i = 0; i < A.length; i++) A[i] = Wt[i] > 1e-3 ? A[i] / Wt[i] : 0;
  if (progress) progress(0.1);
  const dout = edt(on, nx, ny);
  const off = new Uint8Array(nx * ny); for (let i = 0; i < off.length; i++) off[i] = on[i] ? 0 : 1;
  const din = edt(off, nx, ny);
  const D = new Float32Array(nx * ny);
  for (let i = 0; i < D.length; i++) D[i] = (on[i] ? -(din[i] - 0.5) : dout[i] - 0.5) * hh - dil;
  if (progress) progress(0.2);
  const lerp2 = (G, x, y) => {
    const fx = (x - X0) / hh, fy = (y - Y0) / hh, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return null;
    const u = fx - i, v = fy - j, o = j * nx + i;
    return (G[o] * (1 - u) + G[o + 1] * u) * (1 - v) + (G[o + nx] * (1 - u) + G[o + nx + 1] * u) * v;
  };
  const rcY = (tip + 0.5) * k + dil + rIn + 0.25;
  const f = (x, y, z) => {
    let d = lerp2(D, x, y);
    if (d === null) d = 5;
    let hgt = thick + relief * Math.pow(Math.max(0, lerp2(A, x, y) || 0), 0.8);
    if (ring) {
      const rr = Math.hypot(x, y - rcY), dr = Math.max(rr - rOut, rIn - rr);
      if (dr < d) { d = dr; hgt = thick; }
    }
    return Math.max(d, z - hgt, -z);
  };
  const m = implicitSolid(f, [[X0, Y0, 0], [X1, Y1, thick + relief]], hh,
    { progress: progress && (p => progress(0.2 + 0.8 * p)) });
  return m;
}

// the solid of the download panel: grows the crystal, then the plate
export function solid(o = {}, progress) {
  const p = { ...presets.weather, size: 80, thick: 2, relief: 0.8, ring: true, ...o };
  const sim = simulate(p, progress ? st => { progress(0.5 * Math.min(1, st.radius / (0.9 * (p.R || 72)))); } : null, 200);
  const m = plate(sim, p, progress ? f => progress(0.5 + 0.5 * f) : null);
  m.steps = sim.steps; m.cells = sim.frozen;
  return m;
}

export const fileName = o => `snowflake_${o.weather ? 'seed' + o.seed : o.preset || 'reiter'}_a${o.alpha}_b${o.beta}_g${o.gamma}_${o.size}mm`;
