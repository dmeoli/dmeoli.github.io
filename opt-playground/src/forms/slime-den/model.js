// Slime den: the transport network of the slime mould Physarum polycephalum
// as grown by the agents of Jones (2010), each of which senses the trail
// ahead of it, turns towards the strongest and deposits more, here between
// sources of food that are crystals; the network is raised as a relief at
// least 1.5 mm wide, and slimes made of metaballs (Blinn 1982) sit on it.

import { implicitSolid } from '../../print/index.js';
import { rng } from '../fantasy/util.js';

export const GRID = 200;

// the food sites, in the unit disc
export function foods(seed, count) {
  const r = rng(seed * 53 + 11), F = [];
  for (let tries = 0; F.length < count && tries < 5000; tries++) {
    const a = r() * 2 * Math.PI, d = 0.78 * Math.sqrt(r()), p = [d * Math.cos(a), d * Math.sin(a)];
    if (F.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.42)) F.push(p);
  }
  return F;
}

// the model of Jones: agents on a grid of GRID x GRID cells over the disc,
// with sensor angle SA, rotation angle RA and sensor offset SO (cells); each
// step, every agent compares the trail at its three sensors, turns, moves one
// cell and deposits; the trail diffuses by a 3 x 3 mean and decays; the food
// sites deposit too, so that the network forms between them
export class Physarum {
  constructor({ seed = 1, food = 5, agents = 4000, SA = 22.5, RA = 45, SO = 9 }) {
    this.n = GRID; this.r = rng(seed * 7 + 3);
    this.T = new Float32Array(this.n * this.n); this.B = new Float32Array(this.n * this.n);
    this.inside = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.inside[j * this.n + i] = Math.hypot((i + 0.5) / this.n * 2 - 1, (j + 0.5) / this.n * 2 - 1) < 0.97 ? 1 : 0;
    this.F = foods(seed, food).map(([x, y]) => [(x + 1) / 2 * this.n, (y + 1) / 2 * this.n]);
    this.SA = SA * Math.PI / 180; this.RA = RA * Math.PI / 180; this.SO = SO;
    this.A = new Float32Array(3 * agents);
    // most agents start around the food sites, the others anywhere
    for (let k = 0; k < agents; k++) {
      let x, y;
      do {
        if (this.r() < 0.7) { const [fx, fy] = this.F[k % this.F.length], a = this.r() * 2 * Math.PI, d = 12 * this.r(); x = fx + d * Math.cos(a); y = fy + d * Math.sin(a); }
        else { x = this.r() * this.n; y = this.r() * this.n; }
      } while (!this.ok(x, y));
      this.A[3 * k] = x; this.A[3 * k + 1] = y; this.A[3 * k + 2] = this.r() * 2 * Math.PI;
    }
    this.steps = 0;
  }
  ok(x, y) { const i = x | 0, j = y | 0; return i >= 0 && j >= 0 && i < this.n && j < this.n && this.inside[j * this.n + i] === 1; }
  at(x, y) { return this.ok(x, y) ? this.T[(y | 0) * this.n + (x | 0)] : -1; }
  step() {
    const { A, T, n, SA, RA, SO, r } = this;
    for (let k = 0; k < A.length; k += 3) {
      let x = A[k], y = A[k + 1], h = A[k + 2];
      const f = this.at(x + SO * Math.cos(h), y + SO * Math.sin(h));
      const fl = this.at(x + SO * Math.cos(h + SA), y + SO * Math.sin(h + SA));
      const fr = this.at(x + SO * Math.cos(h - SA), y + SO * Math.sin(h - SA));
      if (f > fl && f > fr) { /* straight on */ } else if (f < fl && f < fr) h += (r() < 0.5 ? 1 : -1) * RA;
      else if (fl < fr) h -= RA; else if (fr < fl) h += RA;
      const nx = x + Math.cos(h), ny = y + Math.sin(h);
      if (this.ok(nx, ny)) { x = nx; y = ny; T[(y | 0) * n + (x | 0)] += 5; } else h = r() * 2 * Math.PI;
      A[k] = x; A[k + 1] = y; A[k + 2] = h;
    }
    for (const [fx, fy] of this.F) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const q = ((fy | 0) + j) * n + (fx | 0) + i;
      if (this.inside[q]) T[q] += 60;
    }
    // diffusion (mean of 3 x 3) and decay
    const B = this.B;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n || !this.inside[jj * n + ii]) continue;
        s += T[jj * n + ii]; c++;
      }
      B[j * n + i] = this.inside[j * n + i] ? 0.9 * s / (c || 1) : 0;
    }
    this.T = B; this.B = T;
    this.steps++;
  }
}

// the network as a mask: the cells whose trail is in the top `share` of the
// disc, kept only in the regions that touch a food site
export function network(P, share = 0.14) {
  const n = P.n, vals = [];
  for (let q = 0; q < n * n; q++) if (P.inside[q]) vals.push(P.T[q]);
  vals.sort((a, b) => b - a);
  const th = vals[Math.floor(share * vals.length)] || 0, M = new Uint8Array(n * n);
  for (let q = 0; q < n * n; q++) M[q] = P.inside[q] && P.T[q] > th ? 1 : 0;
  const keep = new Uint8Array(n * n), st = [];
  for (const [fx, fy] of P.F) { const q = (fy | 0) * n + (fx | 0); if (M[q] && !keep[q]) { keep[q] = 1; st.push(q); } }
  while (st.length) {
    const q = st.pop(), i = q % n, j = (q / n) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b, p = jj * n + ii;
      if (ii >= 0 && jj >= 0 && ii < n && jj < n && M[p] && !keep[p]) { keep[p] = 1; st.push(p); }
    }
  }
  return keep;
}

// the distance (in cells) from each cell to the mask, by two chamfer passes
function distance(M, n) {
  const D = new Float32Array(n * n);
  for (let q = 0; q < n * n; q++) D[q] = M[q] ? 0 : 1e9;
  const s2 = Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = j * n + i;
    if (i > 0) D[q] = Math.min(D[q], D[q - 1] + 1);
    if (j > 0) { D[q] = Math.min(D[q], D[q - n] + 1); if (i > 0) D[q] = Math.min(D[q], D[q - n - 1] + s2); if (i < n - 1) D[q] = Math.min(D[q], D[q - n + 1] + s2); }
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const q = j * n + i;
    if (i < n - 1) D[q] = Math.min(D[q], D[q + 1] + 1);
    if (j < n - 1) { D[q] = Math.min(D[q], D[q + n] + 1); if (i < n - 1) D[q] = Math.min(D[q], D[q + n + 1] + s2); if (i > 0) D[q] = Math.min(D[q], D[q + n - 1] + s2); }
  }
  return D;
}

// the den after `steps` steps of the model
export function den(o) {
  const P = new Physarum({ seed: o.seed, food: o.food, SA: o.SA, RA: o.RA, SO: o.SO, agents: o.agents || 4000 });
  for (let k = 0; k < (o.steps ?? 400); k++) P.step();
  return { P, M: network(P, o.share ?? 0.14) };
}

// o: seed, food, slimes, SA, RA, SO, steps, size (diameter, mm), base,
// ridge (height of the network, mm), res
export function solid(o, progress) {
  const { P, M } = den(o), n = P.n, size = o.size || 100, R = size / 2, cell = size / n;
  if (progress) progress(0.25);
  const base = o.base ?? 2, ridge = o.ridge ?? 1.6, D = distance(M, n);
  // the ridge: the mask grown by rw mm, its top flat and its sides sloping
  // over another rw, so that it is at least 1.5 mm wide at the plate
  const rw = Math.max(0.75, 1.2 * cell);
  const hnet = (x, y) => {
    const fx = (x + R) / cell - 0.5, fy = (y + R) / cell - 0.5, i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j));
    const d = ((D[j * n + i] * (1 - tx) + D[j * n + i + 1] * tx) * (1 - ty) + (D[(j + 1) * n + i] * (1 - tx) + D[(j + 1) * n + i + 1] * tx) * ty) * cell;
    return base + ridge * Math.max(0, Math.min(1, (2 * rw - d) / rw));
  };
  const r = rng(o.seed * 131 + 17);
  // the crystals: at each food site one large and two small hexagonal
  // prisms with pointed tips, leaning a little
  const crystals = [];
  for (const [fx, fy] of P.F) {
    const cx = fx * cell - R, cy = fy * cell - R;
    for (let k = 0; k < 3; k++) {
      const big = k === 0, a = r() * 2 * Math.PI, off = big ? 0 : 0.045 * size, rc = (big ? 0.035 : 0.022) * size * r.range(0.85, 1.15);
      const lean = big ? r.range(0, 0.12) : r.range(0.2, 0.38), la = a;
      crystals.push({ x: cx + off * Math.cos(a), y: cy + off * Math.sin(a), rc, hc: rc * (big ? 5.5 : 3.8) * r.range(0.85, 1.1), spin: r() * Math.PI, lean, la });
    }
  }
  const HEX = [0, 1, 2, 3, 4, 5].map(k => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
  const crystal = (c, x, y, z) => {
    // into the frame of the crystal: undo the lean about the axis at angle la
    let px = x - c.x, py = y - c.y, pz = z;
    const ux = -Math.sin(c.la), uy = Math.cos(c.la), cs = Math.cos(-c.lean), sn = Math.sin(-c.lean);
    const k = ux * px + uy * py, wx = uy * pz, wy = -ux * pz, wz = ux * py - uy * px;
    const qx = px * cs + wx * sn + ux * k * (1 - cs), qy = py * cs + wy * sn + uy * k * (1 - cs), qz = pz * cs + wz * sn;
    const ca = Math.cos(c.spin), sa = Math.sin(c.spin), lx = ca * qx + sa * qy, ly = -sa * qx + ca * qy;
    let v = -qz - 1;
    for (const [hx, hy] of HEX) {
      const t = hx * lx + hy * ly;
      v = Math.max(v, t - c.rc, (qz - c.hc + 1.6 * t) / 1.887);
    }
    return v;
  };
  // the slimes: three to five Gaussian blobs each, flattened, on the network
  const cand = [];
  for (let q = 0; q < n * n; q++) if (M[q]) cand.push(q);
  const slimes = [];
  for (let s = 0; s < (o.slimes ?? 4) && cand.length; s++) {
    let q = null;
    for (let t = 0; t < 200; t++) {
      const c = cand[r.int(cand.length)], x = (c % n + 0.5) * cell - R, y = (((c / n) | 0) + 0.5) * cell - R;
      if (Math.hypot(x, y) < R - 0.12 * size && crystals.every(k => Math.hypot(k.x - x, k.y - y) > 0.1 * size) && slimes.every(b => Math.hypot(b.x - x, b.y - y) > 0.12 * size)) { q = [x, y]; break; }
    }
    if (!q) continue;
    const sz = 0.05 * size * r.range(0.8, 1.2), dir = r() * 2 * Math.PI, balls = [];
    const nb = 3 + r.int(3);
    for (let b = 0; b < nb; b++) {
      const t = b / (nb - 1) - 0.5;
      balls.push([q[0] + t * sz * 1.6 * Math.cos(dir) + r.range(-0.3, 0.3) * sz, q[1] + t * sz * 1.6 * Math.sin(dir) + r.range(-0.3, 0.3) * sz, base, sz * (b === 0 ? 1.15 : r.range(0.7, 1))]);
    }
    // two eyes on the largest blob, facing outwards along dir
    const [ex, ey, , es] = balls[0], ed = [Math.cos(dir), Math.sin(dir)];
    const eyes = [-1, 1].map(sg => [ex - ed[0] * es * 0.55 + sg * -ed[1] * es * 0.35, ey - ed[1] * es * 0.55 + sg * ed[0] * es * 0.35, base + es * 0.85, es * 0.22]);
    slimes.push({ x: q[0], y: q[1], balls, eyes, reach: sz * 3.5 });
  }
  const slime = (s, x, y, z) => {
    let F = 0;
    for (const [bx, by, bz, bs] of s.balls) F += Math.exp(-(((x - bx) ** 2 + (y - by) ** 2) / (bs * bs) + ((z - bz) / (0.85 * bs)) ** 2));
    // the iso level 0.45; the field is scaled to about a distance
    let v = (0.45 - F) * s.balls[0][3];
    for (const [qx, qy, qz, qs] of s.eyes) v = Math.min(v, Math.hypot(x - qx, y - qy, z - qz) - qs);
    return v;
  };
  const f = (x, y, z) => {
    const rr = Math.hypot(x, y);
    let v = Math.max(z - hnet(x, y), -z, rr - R);
    for (const c of crystals) if (Math.abs(x - c.x) < c.hc && Math.abs(y - c.y) < c.hc) v = Math.min(v, crystal(c, x, y, z));
    for (const s of slimes) if (Math.abs(x - s.x) < s.reach && Math.abs(y - s.y) < s.reach) v = Math.min(v, Math.max(slime(s, x, y, z), -z));
    return v;
  };
  const top = Math.max(base + ridge, ...crystals.map(c => c.hc + c.rc * 2), ...slimes.map(s => base + 2 * s.balls[0][3])) + 1;
  const h = size / (o.res === 'fine' ? 320 : o.res === 'draft' ? 220 : 130);
  const m = implicitSolid(f, [[-R, -R, 0], [R, R, top]], h, { crumbs: 0.02, progress: p => progress && progress(0.25 + 0.75 * p) });
  return m;
}

export const fileName = o => `slime_den_s${o.seed}_f${o.food}_${o.size}mm`;
