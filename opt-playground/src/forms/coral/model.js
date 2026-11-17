// The mathematics of the scene Coral and Turing, without the DOM, so that the
// simulation worker (sim.js), the download panel (in its worker) and the test
// page share it:
//   (a) diffusion-limited aggregation in 3D (Witten and Sander 1981), off
//       lattice: walkers of unit diameter released above a seed on the ground
//       stick to the cluster on contact, and every particle remembers the one
//       it stuck to, so the cluster is a tree whose branches get thicker
//       towards the root;
//   (b) the reaction-diffusion of Gray and Scott (Pearson 1993) on the surface
//       of a vase of revolution, whose pattern raises the outer wall.
// solid(o, progress) is the printable mesh, in millimetres.

import { implicitSolid, onBed, outwards } from '../../print/index.js';

// a small seeded generator (mulberry32), the same numbers in every browser
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================================================= (a) aggregation == */

export const DLA_DEFAULT = { n: 3000, stick: 1, drift: 0.05, up: 0.9, seed: 7 };

// the grid of distances: G cells a side, the seed in the middle of the
// bottom; distances capped at CAP
const G = 200, CAP = 12;

// integer cell key of a point for a grid of side c
const key = (x, y, z, c) => ((Math.floor(x / c) + 2048) * 4096 + (Math.floor(y / c) + 2048)) * 4096 + (Math.floor(z / c) + 2048);

export class DLA {
  // stick: probability of sticking at a contact; drift: the downward pull of
  // the walkers, from 0 (pure diffusion) to about 0.5 (almost a rain)
  // up: how much the sticking prefers contacts on the top of a particle, from
  // 0 (any side alike) to 1 (only from above), which makes branches rise
  constructor({ stick = 1, drift = 0.05, up = 0.9, seed = 7 } = {}) {
    this.stick = stick; this.drift = drift; this.up = up; this.rand = rng(seed);
    this.P = new Float32Array(3 * 1024); this.parent = new Int32Array(1024); this.n = 0;
    this.fine = new Map();
    // the distance, in cells of side 1, from each cell to the nearest cell
    // holding a particle (the largest of the three index differences, capped
    // at CAP): a walker at distance g can move by g - 2 without touching
    this.dist = new Uint8Array(G * G * G).fill(CAP);
    this.rmax = 1; this.zmax = 0.5; this.rc = 1; this.walks = 0;
    this.add(0, 0, 0.5, -1);
  }
  add(x, y, z, p) {
    if (3 * this.n + 3 > this.P.length) {
      const P = new Float32Array(this.P.length * 2); P.set(this.P); this.P = P;
      const q = new Int32Array(this.parent.length * 2); q.set(this.parent); this.parent = q;
    }
    const i = this.n++;
    this.P[3 * i] = x; this.P[3 * i + 1] = y; this.P[3 * i + 2] = z; this.parent[i] = p;
    const k = key(x, y, z, 1);
    let b = this.fine.get(k); if (!b) this.fine.set(k, b = []); b.push(i);
    const ci = Math.floor(x) + G / 2, cj = Math.floor(y) + G / 2, ck = Math.floor(z) + 2, D = this.dist;
    for (let a = -CAP; a <= CAP; a++) {
      const ii = ci + a; if (ii < 0 || ii >= G) continue;
      for (let b = -CAP; b <= CAP; b++) {
        const jj = cj + b; if (jj < 0 || jj >= G) continue;
        const ab = Math.max(Math.abs(a), Math.abs(b));
        for (let c = -CAP; c <= CAP; c++) {
          const kk = ck + c; if (kk < 0 || kk >= G) continue;
          const o = (kk * G + jj) * G + ii, g = Math.max(ab, Math.abs(c));
          if (g < D[o]) D[o] = g;
        }
      }
    }
    this.rmax = Math.max(this.rmax, Math.hypot(x, y)); this.zmax = Math.max(this.zmax, z);
    this.rc = Math.max(this.rc, Math.hypot(x, y, z - 0.5) + 0.5);
  }
  // the cell distance of a point to the cluster (CAP outside the grid)
  gap(x, y, z) {
    const i = Math.floor(x) + G / 2, j = Math.floor(y) + G / 2, k = Math.floor(z) + 2;
    if (i < 0 || j < 0 || k < 0 || i >= G || j >= G || k >= G) return CAP;
    return this.dist[(k * G + j) * G + i];
  }
  // the nearest particle closer than 1 to the point, or -1
  touch(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), P = this.P;
    let best = -1, bd = 1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      const B = this.fine.get(((i + a + 2048) * 4096 + (j + b + 2048)) * 4096 + (k + d + 2048));
      if (!B) continue;
      for (const q of B) {
        const dd = Math.hypot(x - P[3 * q], y - P[3 * q + 1], z - P[3 * q + 2]);
        if (dd < bd) { bd = dd; best = q; }
      }
    }
    return best;
  }
  // one walker, released on a hemisphere around the cluster, until it sticks
  // (true) or is lost
  walk() {
    const R = this.rand, rc = this.rc, Rl = rc + 5, Rk = 2 * Rl + 12;
    // released from the upper part of the hemisphere (at least 24 degrees
    // above the ground), so that the coral rises instead of creeping
    const u0 = 0.4 + 0.6 * R(), a = 2 * Math.PI * R(), w0 = Math.sqrt(1 - u0 * u0);
    let x = Rl * w0 * Math.cos(a), y = Rl * w0 * Math.sin(a), z = 0.5 + Rl * u0;
    this.walks++;
    for (let s = 0; s < 40000; s++) {
      // a direction uniform on the sphere, pulled down by the drift
      const u = 2 * R() - 1, ph = 2 * Math.PI * R(), w = Math.sqrt(1 - u * u);
      let dx = w * Math.cos(ph), dy = w * Math.sin(ph), dz = u - this.drift * 2;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      // far from the cluster the steps are long, near it short
      const far = Math.hypot(x, y, z - 0.5) - rc;
      let step = 0.5;
      const g = this.gap(x, y, z);
      if (far > CAP) step = far - 2;
      else if (g >= 3) step = g - 2;
      const nx = x + step * dx, ny = y + step * dy, nz = z + step * dz;
      if (step === 0.5) {
        const q = this.touch(nx, ny, nz);
        if (q >= 0) {
          const P = this.P, ex = nx - P[3 * q], ey = ny - P[3 * q + 1], ez = nz - P[3 * q + 2], el = Math.hypot(ex, ey, ez) || 1;
          if (R() < this.stick * (1 - this.up + this.up * Math.max(0, ez / el))) {
            // laid on the contact sphere of the particle it touched
            const pz = P[3 * q + 2] + ez / el;
            if (pz < 0.5) return false;
            this.add(P[3 * q] + ex / el, P[3 * q + 1] + ey / el, pz, q);
            return true;
          }
          continue;
        }
      }
      x = nx; y = ny; z = nz;
      // lost: on the ground away from the cluster, too far aside or too high
      if (z < 0.5 || far > Rk - rc) return false;
    }
    return false;
  }
  // grow until there are n particles or `budget` walkers have been spent
  grow(n, budget = Infinity) {
    let w = 0;
    while (this.n < n && w++ < budget) this.walk();
    return this.n;
  }
  // the plain data of the tree, for the view and for the print
  data() {
    return { P: this.P.slice(0, 3 * this.n), parent: this.parent.slice(0, this.n), n: this.n };
  }
}

// the number of particles carried by each one (itself and all that stuck on
// it, directly or not): the children always come after their parent
export function loads({ parent, n }) {
  const c = new Float32Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) c[parent[i]] += c[i];
  return c;
}

// the radius of a branch, in particle diameters, from the load it carries
export const branchR = load => Math.min(2.4, 0.5 * Math.pow(load, 0.18));

// the dimension D of mass against radius, N(r) ~ r^D, fitted between r = 3
// and 0.6 of the largest distance from the seed; also the points of the plot
export function massRadius({ P, n }) {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2] - 0.5);
  d.sort();
  const rmax = d[n - 1] || 1, pts = [];
  for (let k = 0; k <= 24; k++) {
    const r = 1 * Math.pow(Math.max(rmax, 2), k / 24);
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (d[m] <= r) lo = m + 1; else hi = m; }
    pts.push([r, lo]);
  }
  const fit = pts.filter(([r]) => r >= 3 && r <= 0.6 * rmax);
  let D = NaN;
  if (fit.length >= 3) {
    const X = fit.map(p => Math.log(p[0])), Y = fit.map(p => Math.log(p[1]));
    const mx = X.reduce((a, b) => a + b) / X.length, my = Y.reduce((a, b) => a + b) / Y.length;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < X.length; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
    D = sxy / sxx;
  }
  return { pts, D, rmax };
}

// the coral as one solid: every particle joined to its parent by a cone with
// rounded ends whose radius follows the load, fused by marching tetrahedra
// on a field rasterized branch by branch; with a base, a disc under the root
// into which the lowest particles sink
export function coralSolid(data, { size = 80, base = true, baseThick = 2.4, twig = 1 } = {}, progress) {
  const { P, parent, n } = data, L = loads(data);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = 0;
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) R[i] = branchR(L[i]);
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, P[3 * i] - R[i]); x1 = Math.max(x1, P[3 * i] + R[i]);
    y0 = Math.min(y0, P[3 * i + 1] - R[i]); y1 = Math.max(y1, P[3 * i + 1] + R[i]);
    z1 = Math.max(z1, P[3 * i + 2] + R[i]);
  }
  // millimetres per particle diameter: the largest side of the coral is `size`
  const zb = base ? baseThick : 0;
  const s = (size - zb) / Math.max(x1 - x0, y1 - y0, z1);
  const sx = s, rmin = twig / 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const Q = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    Q[3 * i] = (P[3 * i] - cx) * sx; Q[3 * i + 1] = (P[3 * i + 1] - cy) * sx; Q[3 * i + 2] = zb + (P[3 * i + 2] - 0.5) * sx;
    R[i] = Math.max(rmin, R[i] * sx);
  }
  // the lattice of implicitSolid: origin box minus 2 cells, cells of side h
  const half = Math.max(x1 - x0, y1 - y0) * sx / 2;
  const bR = base ? Math.min(half * 0.5 + 4, half) : 0;
  const X0 = -Math.max(half, bR) - 1, Y0 = X0, Z0 = base ? -0.5 : -R[0] - 1, X1 = -X0, Y1 = -Y0, Z1 = zb + z1 * sx + 1;
  // cells of about size / 200, not much coarser than the thinnest twig
  const h = Math.max(0.25, Math.min(0.7, size / 170, rmin * 1.1));
  const pad = 2 * h, ox = X0 - pad, oy = Y0 - pad, oz = Z0 - pad;
  const NX = Math.ceil((X1 - X0 + 2 * pad) / h) + 1, NY = Math.ceil((Y1 - Y0 + 2 * pad) / h) + 1, NZ = Math.ceil((Z1 - Z0 + 2 * pad) / h) + 1;
  const far = 3 * h, F = new Float32Array(NX * NY * NZ).fill(far);
  const put = (i, j, k, v) => { const o = (k * NY + j) * NX + i; if (v < F[o]) F[o] = v; };
  // each branch: from the particle (radius ra) to its parent (radius rb)
  for (let i = 0; i < n; i++) {
    const p = parent[i] < 0 ? i : parent[i];
    const ax = Q[3 * i], ay = Q[3 * i + 1], az = Q[3 * i + 2], bx = Q[3 * p], by = Q[3 * p + 1], bz = Q[3 * p + 2];
    const ra = R[i], rb = R[p], m = Math.max(ra, rb) + 2 * h;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - ox) / h)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + m - ox) / h));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - m - oy) / h)), j1 = Math.min(NY - 1, Math.ceil((Math.max(ay, by) + m - oy) / h));
    const k0 = Math.max(0, Math.floor((Math.min(az, bz) - m - oz) / h)), k1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + m - oz) / h));
    const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez || 1;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const wx = ox + ii * h - ax, wy = oy + j * h - ay, wz = oz + k * h - az;
      const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / ee));
      put(ii, j, k, Math.hypot(wx - t * ex, wy - t * ey, wz - t * ez) - (ra + t * (rb - ra)));
    }
    if (progress && (i & 1023) === 0) progress(0.4 * i / n);
  }
  // the base: a disc with a rounded rim, the root sunk into it
  if (base) {
    for (let k = 0; k < NZ; k++) {
      const z = oz + k * h;
      for (let j = 0; j < NY; j++) for (let ii = 0; ii < NX; ii++) {
        const x = ox + ii * h, y = oy + j * h, rr = 0.8;
        const dx = Math.hypot(x, y) - (bR - rr), dz = Math.abs(z - baseThick / 2) - (baseThick / 2 - rr);
        put(ii, j, k, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - rr);
      }
    }
  }
  const f = (x, y, z) => {
    const i = Math.round((x - ox) / h), j = Math.round((y - oy) / h), k = Math.round((z - oz) / h);
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return far;
    return F[(k * NY + j) * NX + i];
  };
  const m = implicitSolid(f, [[X0, Y0, Z0], [X1, Y1, Z1]], h, { crumbs: 0.02, progress: progress && (v => progress(0.4 + 0.6 * v)) });
  // without base the lowest point of the coral goes on the bed
  return base ? m : onBed(m);
}

/* ===================================================== (b) Gray-Scott ==== */

// the presets of (F, k), with u and v diffusing as 0.16 and 0.08 per step on
// a grid of unit spacing (the classes of Pearson 1993 for those values)
export const GS_PRESETS = {
  spots: { F: 0.035, k: 0.065, en: 'spots', it: 'macchie' },
  labyrinth: { F: 0.029, k: 0.057, en: 'labyrinth', it: 'labirinto' },
  fingerprint: { F: 0.0545, k: 0.062, en: 'fingerprint', it: 'impronta' },
  stripes: { F: 0.022, k: 0.051, en: 'stripes and waves', it: 'strisce e onde' },
  holes: { F: 0.039, k: 0.058, en: 'holes', it: 'buchi' },
};
export const GS_DEFAULT = { preset: 'labyrinth', F: 0.029, k: 0.057, steps: 9000, seed: 7 };
export const DU = 0.16, DV = 0.08;

// the vase: radius rho(z) of the outer wall, in units of the simulation (the
// pattern has a wavelength of about 10), z from 0 to H; a round belly, a
// waist and a flared lip
export const VASE = { H: 150, NT: 150 };
export const vaseRho = z => {
  const s = z / VASE.H;
  return 24 + 12 * Math.sin(Math.PI * Math.min(1, s / 0.72)) * (1 - 0.15 * s) - 3.5 * Math.exp(-((s - 0.84) ** 2) / 0.006) + 7 * Math.max(0, s - 0.84) ** 2 / 0.0256 - 6 * Math.exp(-s / 0.05);
};

// the outer profile sampled at unit arc length: points (rho, z), the normal
// (nr, nz) outwards, rho at the half steps
export function profile() {
  const fine = [], m = 4000;
  for (let i = 0; i <= m; i++) { const z = VASE.H * i / m; fine.push([vaseRho(z), z]); }
  const len = [0];
  for (let i = 1; i <= m; i++) len.push(len[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const L = len[m], NS = Math.round(L) + 1, rho = [], z = [], nr = [], nz = [];
  let j = 0;
  for (let i = 0; i < NS; i++) {
    const s = L * i / (NS - 1);
    while (j < m - 1 && len[j + 1] < s) j++;
    const t = (s - len[j]) / (len[j + 1] - len[j] || 1);
    rho.push(fine[j][0] + t * (fine[j + 1][0] - fine[j][0])); z.push(fine[j][1] + t * (fine[j + 1][1] - fine[j][1]));
    const dr = fine[j + 1][0] - fine[j][0], dz = fine[j + 1][1] - fine[j][1], l = Math.hypot(dr, dz);
    nr.push(dz / l); nz.push(-dr / l);
  }
  return { NS, ds: L / (NS - 1), rho, z, nr, nz };
}

export class GrayScott {
  constructor({ F = 0.029, k = 0.057, seed = 7 } = {}) {
    const pr = this.pr = profile(), NT = this.NT = VASE.NT, NS = this.NS = pr.NS;
    this.F = F; this.k = k; this.t = 0;
    this.u = new Float32Array(NT * NS).fill(1); this.v = new Float32Array(NT * NS);
    this.u2 = new Float32Array(NT * NS); this.v2 = new Float32Array(NT * NS);
    // the weights of the Laplace-Beltrami operator on the surface of revolution
    const dth = 2 * Math.PI / NT, ds = pr.ds;
    this.ws = new Float32Array(NS); this.wn = new Float32Array(NS); this.wt = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      const r = pr.rho[i], rm = i > 0 ? (r + pr.rho[i - 1]) / 2 : 0, rp = i < NS - 1 ? (r + pr.rho[i + 1]) / 2 : 0;
      this.ws[i] = rm / (r * ds * ds); this.wn[i] = rp / (r * ds * ds); this.wt[i] = 1 / (r * r * dth * dth);
    }
    // seeds: small patches of v scattered on the wall
    const R = rng(seed), nseed = Math.round(NT * NS / 900);
    for (let q = 0; q < nseed; q++) {
      const i0 = 2 + Math.floor(R() * (NS - 8)), j0 = Math.floor(R() * NT);
      for (let i = i0; i < i0 + 4; i++) for (let j = j0; j < j0 + 4; j++) {
        const o = i * NT + (j % NT); this.u[o] = 0.5; this.v[o] = 0.25 + 0.05 * R();
      }
    }
  }
  // explicit Euler steps of unit length, no flux through the bottom and the lip
  step(n = 1) {
    const { NT, NS, ws, wn, wt, F, k } = this, Fk = F + k;
    for (let s = 0; s < n; s++) {
      const u = this.u, v = this.v, U = this.u2, V = this.v2;
      for (let i = 0; i < NS; i++) {
        const a = ws[i], b = wn[i], c = wt[i], row = i * NT, dn = i > 0 ? -NT : 0, up = i < NS - 1 ? NT : 0;
        for (let j = 0; j < NT; j++) {
          const o = row + j, l = row + (j === 0 ? NT - 1 : j - 1), r = row + (j === NT - 1 ? 0 : j + 1);
          const uo = u[o], vo = v[o];
          const lu = a * (u[o + dn] - uo) + b * (u[o + up] - uo) + c * (u[l] + u[r] - 2 * uo);
          const lv = a * (v[o + dn] - vo) + b * (v[o + up] - vo) + c * (v[l] + v[r] - 2 * vo);
          const uvv = uo * vo * vo;
          U[o] = uo + DU * lu - uvv + F * (1 - uo);
          // flushed to zero before it becomes subnormal, which is slow
          const vn = vo + DV * lv + uvv - Fk * vo;
          V[o] = vn > 1e-9 ? vn : 0;
        }
      }
      this.u = U; this.v = V; this.u2 = u; this.v2 = v;
    }
    this.t += n;
  }
  data() { return { v: this.v.slice(), NT: this.NT, NS: this.NS, t: this.t }; }
}

// v made a relief height in [0, 1]: lightly smoothed, stretched between its
// low and high levels, and faded out near the foot and the lip
export function relief({ v, NT, NS }) {
  const h = new Float32Array(NT * NS);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const o = i * NT + j, l = i * NT + (j + NT - 1) % NT, r = i * NT + (j + 1) % NT;
    const d = i > 0 ? o - NT : o, u = i < NS - 1 ? o + NT : o;
    h[o] = 0.4 * v[o] + 0.15 * (v[l] + v[r] + v[d] + v[u]);
  }
  for (let o = 0; o < h.length; o++) { lo = Math.min(lo, h[o]); hi = Math.max(hi, h[o]); }
  const span = Math.max(0.05, hi - lo);
  for (let i = 0; i < NS; i++) {
    const fade = Math.min(1, i / 6, (NS - 1 - i) / 5);
    const w = fade <= 0 ? 0 : fade * fade * (3 - 2 * fade);
    for (let j = 0; j < NT; j++) {
      const o = i * NT + j, x = Math.max(0, Math.min(1, (h[o] - lo) / span));
      h[o] = w * x * x * (3 - 2 * x);
    }
  }
  return h;
}

// the vase as one closed mesh of revolution, in units of the simulation:
// the meridian runs from the centre of the foot out along the bottom, up the
// outer wall (raised by amp times the relief along its normal), over a round
// lip, down the inner wall (thickness `wall`) and in to the centre of the
// floor (thickness `floor`); `up` samples the field that many times finer.
// Returns { pos, idx, val } (val: the relief at each vertex, for colours)
export function vaseMesh(data, { amp = 2.2, wall = 2.6, floor = 3.2, up = 1 } = {}) {
  const pr = profile(), { NT, NS } = data, H = relief(data);
  const nt = NT * up, ns = (NS - 1) * up + 1;
  // the relief at fractional (s, theta), bilinear, periodic in theta
  const at = (si, tj) => {
    const i0 = Math.min(NS - 2, Math.floor(si)), fi = si - i0, j0 = Math.floor(tj), fj = tj - j0;
    const a = j0 % NT, b = (j0 + 1) % NT;
    return (1 - fi) * ((1 - fj) * H[i0 * NT + a] + fj * H[i0 * NT + b]) + fi * ((1 - fj) * H[(i0 + 1) * NT + a] + fj * H[(i0 + 1) * NT + b]);
  };
  const lerp = (arr, si) => { const i0 = Math.min(NS - 2, Math.floor(si)), f = si - i0; return arr[i0] + f * (arr[i0 + 1] - arr[i0]); };
  // the rings of the meridian: [rho, z, normal r, normal z, relief?]
  const rings = [];
  const R0 = pr.rho[0], nb = 6;
  for (let q = 1; q < nb; q++) rings.push({ r: R0 * q / nb, z: 0 });
  for (let i = 0; i < ns; i++) {
    const si = i / up;
    rings.push({ r: lerp(pr.rho, si), z: lerp(pr.z, si), nr: lerp(pr.nr, si), nz: lerp(pr.nz, si), si });
  }
  // the lip: a half circle from the outer to the inner wall
  const top = rings[rings.length - 1], tr = wall / 2;
  const cr = top.r - tr * top.nr, cz = top.z - tr * top.nz;
  for (let q = 1; q < 8; q++) {
    const a = Math.PI * q / 8, c = Math.cos(a), s = Math.sin(a);
    // from the outer normal, turning over the top towards the inside
    const tx = -top.nz, tz = top.nr;
    rings.push({ r: cr + tr * (c * top.nr + s * tx), z: cz + tr * (c * top.nz + s * tz) });
  }
  // the inner wall, the outer one moved in by the thickness, down to the floor
  const inner = [];
  for (let i = ns - 1; i >= 0; i--) {
    const si = i / up, r = lerp(pr.rho, si) - wall * lerp(pr.nr, si), z = lerp(pr.z, si) - wall * lerp(pr.nz, si);
    if (z < floor) break;
    inner.push({ r, z });
  }
  // finish at the floor: the radius of the inner wall at z = floor
  const last = inner[inner.length - 1];
  let rf = last.r;
  for (let i = 0; i < ns; i++) { const si = i / up, z = lerp(pr.z, si) - wall * lerp(pr.nz, si); if (z >= floor) { rf = lerp(pr.rho, si) - wall * lerp(pr.nr, si); break; } }
  rings.push(...inner, { r: rf, z: floor });
  for (let q = nb - 1; q >= 1; q--) rings.push({ r: rf * q / nb, z: floor });
  // vertices: the two poles, then the rings
  const nR = rings.length, pos = new Float32Array(3 * (2 + nR * nt)), val = new Float32Array(2 + nR * nt);
  pos.set([0, 0, 0], 0); pos.set([0, 0, floor], 3);
  for (let a = 0; a < nR; a++) {
    const g = rings[a];
    for (let j = 0; j < nt; j++) {
      const th = 2 * Math.PI * j / nt, o = 2 + a * nt + j;
      let r = g.r, z = g.z;
      if (g.si !== undefined) { const hv = at(g.si, j / up); r += amp * hv * g.nr; z += amp * hv * g.nz; val[o] = hv; }
      pos[3 * o] = r * Math.cos(th); pos[3 * o + 1] = r * Math.sin(th); pos[3 * o + 2] = z;
    }
  }
  const idx = new Uint32Array(3 * (2 * nt + 2 * nt * (nR - 1)));
  let p = 0;
  const V = (a, j) => 2 + a * nt + (j % nt);
  for (let j = 0; j < nt; j++) { idx[p++] = 0; idx[p++] = V(0, j + 1); idx[p++] = V(0, j); }
  for (let a = 0; a < nR - 1; a++) for (let j = 0; j < nt; j++) {
    idx[p++] = V(a, j); idx[p++] = V(a, j + 1); idx[p++] = V(a + 1, j + 1);
    idx[p++] = V(a, j); idx[p++] = V(a + 1, j + 1); idx[p++] = V(a + 1, j);
  }
  for (let j = 0; j < nt; j++) { idx[p++] = 1; idx[p++] = V(nR - 1, j); idx[p++] = V(nR - 1, j + 1); }
  return outwards({ pos, idx, val });
}

// the vase in millimetres: height `size`, relief and walls in mm
export function vaseSolid(data, { size = 90, relief: rel = 1.4, wall = 1.8, floor = 2 } = {}, progress) {
  const k = size / (VASE.H + 0.5);
  const m = vaseMesh(data, { amp: rel / k, wall: wall / k, floor: floor / k, up: 2 });
  if (progress) progress(0.9);
  const P = m.pos;
  for (let i = 0; i < P.length; i++) P[i] *= k;
  delete m.val;
  return m;
}

/* ========================================================== the print ==== */

// o: { mode: 'coral' | 'turing', the numbers of the mode, data (what the
// page has grown so far; grown here from the numbers when missing), size and
// the fields of the panel }
export function solid(o = {}, progress) {
  if ((o.mode || 'coral') === 'coral') {
    let data = o.data;
    if (!data) { const d = new DLA({ ...DLA_DEFAULT, ...o }); d.grow(o.n || DLA_DEFAULT.n); data = d.data(); }
    return coralSolid(data, o, progress);
  }
  let data = o.data;
  if (!data) {
    const g = new GrayScott({ ...GS_DEFAULT, ...o });
    const N = o.steps || GS_DEFAULT.steps;
    for (let s = 0; s < N; s += 500) { g.step(Math.min(500, N - s)); if (progress) progress(0.8 * s / N); }
    data = g.data();
  }
  return vaseSolid(data, o, progress);
}

export const fileName = o => (o.mode === 'turing'
  ? `turing_vase_${o.preset || 'custom'}_F${o.F}_k${o.k}_${o.size}mm`
  : `dla_coral_${o.n}_up${o.up}_s${o.seed}_${o.size}mm${o.base ? '_base' : ''}`);
