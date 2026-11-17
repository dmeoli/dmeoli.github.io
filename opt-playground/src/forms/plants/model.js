// The model of the plants: an L-system derived and drawn by the turtle of
// lsystem.js, with the radii of Leonardo, and solid(o, progress), the
// printable mesh in millimetres: the branches as round cones joined with a
// small fillet into one implicit function, traced by marching tetrahedra
// (src/print), standing on a disc or lying flat. It never touches the DOM, so
// that the download panel runs it in a worker.

import { parse, derive, turtle, radii } from './lsystem.js';
import { presets } from './presets.js';
import { implicitSolid } from '../../print/index.js';

export { presets };

// o: { text (the rules), n, delta, tropism, seed }; the plant in model units
export function plant(o) {
  const sys = parse(o.text, o.delta);
  const d = derive(sys, o.n, o.seed);
  const { segs, polys } = turtle(d.word, { delta: o.delta, tropism: o.tropism });
  return { segs, polys, lengths: d.lengths, truncated: d.truncated, modules: d.word.length };
}

// the box of the end points of the segments
export function extent(segs) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const s of segs) for (const p of [s.a, s.b]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return [mn, mx];
}

// the angle of each segment from the vertical, and the share of the length of
// the branches that leans more than lim degrees (the overhang a printer meets)
export function overhang(segs, lim = 55) {
  let tot = 0, steep = 0, worst = 0;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], dz = s.b[2] - s.a[2], l = Math.hypot(dx, dy, dz);
    if (l < 1e-12) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, dz / l))) * 180 / Math.PI;
    tot += l; if (ang > lim) steep += l; worst = Math.max(worst, ang);
  }
  return { steep: tot ? steep / tot : 0, worst };
}

// the field of a set of round cones (a, b, ra, rb): the smooth union of
// their distances, fillets of radius k, with a grid of cells listing the
// cones that can be nearer than `far`, beyond which the field is just far
function conesField(cones, k, far) {
  const n = cones.length;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let rmax = 0;
  for (const c of cones) {
    rmax = Math.max(rmax, c[6], c[7]);
    for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], c[a], c[3 + a]); mx[a] = Math.max(mx[a], c[a], c[3 + a]); }
  }
  const pad = rmax + far + k, cell = Math.max(2, far * 2);
  for (let a = 0; a < 3; a++) { mn[a] -= pad; mx[a] += pad; }
  const N = [0, 1, 2].map(a => Math.max(1, Math.ceil((mx[a] - mn[a]) / cell)));
  const lists = new Map();
  const C = new Float64Array(n * 8);
  cones.forEach((c, i) => {
    C.set(c, 8 * i);
    const r = Math.max(c[6], c[7]) + far + k, lo = [], hi = [];
    for (let a = 0; a < 3; a++) {
      lo.push(Math.max(0, Math.floor((Math.min(c[a], c[3 + a]) - r - mn[a]) / cell)));
      hi.push(Math.min(N[a] - 1, Math.floor((Math.max(c[a], c[3 + a]) + r - mn[a]) / cell)));
    }
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const key = (z * N[1] + y) * N[0] + x;
      let l = lists.get(key);
      if (!l) lists.set(key, (l = []));
      l.push(i);
    }
  });
  const grid = new Map();
  for (const [key, l] of lists) grid.set(key, Int32Array.from(l));
  return (x, y, z) => {
    const i = Math.floor((x - mn[0]) / cell), j = Math.floor((y - mn[1]) / cell), l = Math.floor((z - mn[2]) / cell);
    if (i < 0 || j < 0 || l < 0 || i >= N[0] || j >= N[1] || l >= N[2]) return far;
    const list = grid.get((l * N[1] + j) * N[0] + i);
    if (!list) return far;
    let v = far;
    for (let q = 0; q < list.length; q++) {
      const o = 8 * list[q];
      const ax = C[o], ay = C[o + 1], az = C[o + 2], ex = C[o + 3] - ax, ey = C[o + 4] - ay, ez = C[o + 5] - az;
      const wx = x - ax, wy = y - ay, wz = z - az, ee = ex * ex + ey * ey + ez * ez;
      const t = ee > 0 ? Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / ee)) : 0;
      const d = Math.hypot(wx - t * ex, wy - t * ey, wz - t * ez) - (C[o + 6] + (C[o + 7] - C[o + 6]) * t);
      // polynomial smooth minimum
      const h = Math.max(k - Math.abs(v - d), 0) / k;
      v = Math.min(v, d) - h * h * k * 0.25;
    }
    return v;
  };
}

// o: the plant (as in plant) and { size (mm: the height of the plant
// standing, or the longer side lying), tip (radius of the twigs in mm at 80
// mm), exp (the exponent of Leonardo), pose ('up' | 'flat'), base (a disc
// under the trunk), baseThick, flatThick (mm, lying flat), res ('draft' |
// 'fine') }
export function solid(o, progress) {
  const size = o.size ?? 80, pose = o.pose || 'up', base = pose === 'up' && o.base !== false;
  const { segs } = plant(o);
  if (!segs.length) throw new Error('the rules draw no branch');
  const tip = Math.max(0.6, (o.tip ?? 0.8) * size / 80);
  radii(segs, tip, o.exp ?? 2.4);
  const [mn, mx] = extent(segs);
  const bt = o.baseThick ?? 2.4, ft = o.flatThick ?? 3;
  const h0 = o.res === 'fine' ? Math.min(size / 220, tip * 0.55) : Math.min(size / 130, tip * 0.9);
  const kf = tip * 0.8, far = 3 * h0 + kf;
  if (progress) progress(0.02);
  if (pose === 'flat') {
    // the plant seen from the side (its plane, y z), as a plate of thickness ft
    const k = (size - 2 * tip) / Math.max(mx[1] - mn[1], mx[2] - mn[2], 1e-9);
    const cones = segs.map(s => [s.a[1] * k, s.a[2] * k, 0, s.b[1] * k, s.b[2] * k, 0, s.r0, s.r1]);
    const g = conesField(cones, kf, far);
    const f = (x, y, z) => Math.max(g(x, y, 0), Math.abs(z - ft / 2) - ft / 2);
    const r = segs.reduce((t, s) => Math.max(t, s.r0), 0) + kf;
    const box = [[mn[1] * k - r, mn[2] * k - r, 0], [mx[1] * k + r, mx[2] * k + r, ft]];
    const m = implicitSolid(f, box, h0, { progress });
    return Object.assign(m, { pose, tipmm: tip, overhang: 0 });
  }
  // standing: the trunk starts at the origin, the plant fills the height
  const dz = mx[2] - Math.min(0, mn[2]), dxy = Math.max(mx[0] - mn[0], mx[1] - mn[1]);
  const trunk = segs[0].r0;
  const k = Math.min((size - (base ? bt : 0) - tip) / Math.max(dz, 1e-9), (size - 2 * tip) / Math.max(dxy, 1e-9));
  const z0 = base ? bt * 0.5 : 0;
  const cones = segs.map(s => [s.a[0] * k, s.a[1] * k, s.a[2] * k + z0, s.b[0] * k, s.b[1] * k, s.b[2] * k + z0, s.r0, s.r1]);
  const g = conesField(cones, kf, far);
  // the disc: wide enough to hold the plant up, at most as wide as the size
  const Rb = Math.min(size / 2, Math.max(12, trunk * 3, 0.42 * dxy * k));
  const disc = (x, y, z) => {
    const dr = Math.hypot(x, y) - Rb, dzz = Math.abs(z - bt / 2) - bt / 2;
    return Math.hypot(Math.max(dr, 0), Math.max(dzz, 0)) + Math.min(Math.max(dr, dzz), 0);
  };
  const kb = Math.min(trunk, 3);
  const f = base
    ? (x, y, z) => {
      const a = g(x, y, z), b = disc(x, y, z), hh = Math.max(kb - Math.abs(a - b), 0) / kb;
      return Math.max(Math.min(a, b) - hh * hh * kb * 0.25, -z);
    }
    : (x, y, z) => Math.max(g(x, y, z), -z);
  const r = segs.reduce((t, s) => Math.max(t, s.r0), 0) + kf;
  const lo = [mn[0] * k - r, mn[1] * k - r, 0], hi = [mx[0] * k + r, mx[1] * k + r, mx[2] * k + z0 + r];
  if (base) { lo[0] = Math.min(lo[0], -Rb); lo[1] = Math.min(lo[1], -Rb); hi[0] = Math.max(hi[0], Rb); hi[1] = Math.max(hi[1], Rb); }
  const m = implicitSolid(f, [lo, hi], h0, { progress });
  const oh = overhang(segs);
  return Object.assign(m, { pose, tipmm: +tip.toFixed(2), steep: +(100 * oh.steep).toFixed(1), worst: Math.round(oh.worst) });
}

export const fileName = o => `lsystem_${o.preset || 'plant'}_n${o.n}_${o.size}mm${o.pose === 'flat' ? '_flat' : o.base ? '_base' : ''}`;
