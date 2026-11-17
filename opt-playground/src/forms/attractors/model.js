// Strange attractors as printable tubes, in millimetres: a trajectory of the
// Lorenz, Rossler or Thomas system, integrated by fourth-order Runge-Kutta
// after a transient that brings it onto the attractor, scaled to the size and
// thickened by the distance field of src/forms/mathematics/field.js, so that
// the places where the trajectory passes close to itself fuse into one
// closed solid; the base is a plate with posts up to the lowest turns.
// solid(o, progress) is what the page and the download panel call, in a
// worker.

import { onBed, capsule, union } from '../../print/index.js';
import { Field } from '../mathematics/field.js';

// each system: its field, the default parameters, the step, the transient
// and the default length (time units), the start
export const SYSTEMS = {
  lorenz: {
    f: ([x, y, z], { p1: s, p2: r, p3: b }) => [s * (y - x), x * (r - z) - y, x * y - b * z],
    par: { p1: 10, p2: 28, p3: 8 / 3 }, dt: 0.005, skip: 12, T: 12, x0: [1, 1, 1],
  },
  rossler: {
    f: ([x, y, z], { p1: a, p2: b, p3: c }) => [-y - z, x + a * y, b + z * (x - c)],
    par: { p1: 0.2, p2: 0.2, p3: 5.7 }, dt: 0.01, skip: 60, T: 80, x0: [1, 1, 0],
  },
  thomas: {
    f: ([x, y, z], { p1: b }) => [Math.sin(y) - b * x, Math.sin(z) - b * y, Math.sin(x) - b * z],
    par: { p1: 0.208186 }, dt: 0.05, skip: 200, T: 250, x0: [0.1, 0, 0],
  },
};

// the trajectory after the transient, for time T: points at least `gap`
// apart in model units (null if it diverges)
export function trajectory(name, par, T, gap = 0) {
  const S = SYSTEMS[name], f = x => S.f(x, par), dt = S.dt;
  let x = S.x0.slice();
  const step = () => {
    const k1 = f(x), a = x.map((v, i) => v + dt / 2 * k1[i]), k2 = f(a), b = x.map((v, i) => v + dt / 2 * k2[i]);
    const k3 = f(b), c = x.map((v, i) => v + dt * k3[i]), k4 = f(c);
    x = x.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  };
  for (let t = 0; t < S.skip; t += dt) step();
  const pts = [x.slice()];
  for (let t = 0; t < T; t += dt) {
    step();
    if (!x.every(v => Number.isFinite(v) && Math.abs(v) < 1e4)) return null;
    const l = pts[pts.length - 1];
    if (Math.hypot(x[0] - l[0], x[1] - l[1], x[2] - l[2]) >= gap) pts.push(x.slice());
  }
  return pts;
}

// the cell of the grid for a resolution, in mm
export function cellOf({ size = 80, tube = 1.2, res = 'draft' }) {
  const [n, k] = { preview: [90, 1.5], draft: [150, 2.2], fine: [260, 3.2] }[res] || [150, 2.2];
  return Math.max(size / n, tube / k);
}

// o: { attractor, p1, p2, p3 (its parameters), T (time after the
// transient), size (mm, the largest side of the trajectory), tube (radius,
// mm), base (a plate and posts), res }
export function solid(o = {}, progress) {
  const name = SYSTEMS[o.attractor] ? o.attractor : 'lorenz', S = SYSTEMS[name];
  const par = { ...S.par };
  for (const k of ['p1', 'p2', 'p3']) if (Number.isFinite(o[k])) par[k] = o[k];
  const { T = S.T, size = 80, tube = 1.2, base = true } = o, h = cellOf(o);
  const raw = trajectory(name, par, T);
  if (!raw || raw.length < 2) throw new Error('the trajectory diverges for these parameters');
  // scaled so that its largest side is the size, centred in x, y
  const mn = [0, 1, 2].map(a => Math.min(...raw.map(p => p[a]))), mx = [0, 1, 2].map(a => Math.max(...raw.map(p => p[a])));
  const k = (size - 2 * tube) / Math.max(1e-9, ...mx.map((v, a) => v - mn[a]));
  const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
  // above the plate by a tenth of the size, when there is one
  const lift = base ? 3 + 0.1 * size : 0;
  const pts = [];
  for (const p of raw) {
    const q = [(p[0] - c[0]) * k, (p[1] - c[1]) * k, (p[2] - c[2]) * k + lift];
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1], q[2] - l[2]) > 0.4 * h) pts.push(q);
  }
  const ax = (mx[0] - mn[0]) * k / 2, ay = (mx[1] - mn[1]) * k / 2, top = (mx[2] - mn[2]) * k + lift;
  let add, z0 = 0, plate = null;
  const posts = [];
  if (base) {
    // the posts: the lowest point, then up to two more among the points in
    // the lowest eighth of the size, each the farthest in plan from those
    // already taken, if at least a quarter of the size away
    const low = pts.reduce((a, p) => (p[2] < a[2] ? p : a));
    const cand = pts.filter(p => p[2] <= low[2] + size / 8);
    posts.push(low);
    while (posts.length < 3) {
      let best = null, bd = size / 4;
      for (const p of cand) {
        const d = Math.min(...posts.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])));
        if (d > bd) { bd = d; best = p; }
      }
      if (!best) break;
      posts.push(best);
    }
    const th = 2.4, pr = Math.max(1.6, 1.3 * tube);
    z0 = -th;
    // a plate with rounded corners round the feet of the posts, at least
    // half the size across, flat on top and bottom
    const fx = posts.map(p => p[0]), fy = posts.map(p => p[1]);
    const cx = (Math.min(...fx) + Math.max(...fx)) / 2, cy = (Math.min(...fy) + Math.max(...fy)) / 2;
    const hx = Math.max(size / 4, (Math.max(...fx) - Math.min(...fx)) / 2 + 6 + tube), hy = Math.max(size / 4, (Math.max(...fy) - Math.min(...fy)) / 2 + 6 + tube);
    const rr = 5;
    const rounded = (x, y, z) => {
      const qx = Math.abs(x - cx) - (hx - rr), qy = Math.abs(y - cy) - (hy - rr);
      const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
      return Math.max(d2, Math.abs(z + th / 2) - th / 2);
    };
    plate = [cx - hx, cy - hy, cx + hx, cy + hy];
    add = union(rounded, ...posts.map(p => capsule([p[0], p[1], -th / 2], [p[0], p[1], p[2]], pr)));
  }
  const lo = [-ax - tube, -ay - tube], hi = [ax + tube, ay + tube];
  if (plate) { lo[0] = Math.min(lo[0], plate[0]); lo[1] = Math.min(lo[1], plate[1]); hi[0] = Math.max(hi[0], plate[2]); hi[1] = Math.max(hi[1], plate[3]); }
  const fd = new Field([[lo[0], lo[1], z0 - tube], [hi[0], hi[1], top + tube]], h, tube + 2 * h);
  fd.curve(pts);
  if (progress) progress(0.3);
  const m = fd.solid(tube, { add, progress: progress && (f => progress(0.3 + 0.7 * f)) });
  m.points = pts.length; m.posts = posts.length;
  return onBed(m);
}

const num = v => String(+(+v).toFixed(3));
export const fileName = o => `${o.attractor}_${['p1', 'p2', 'p3'].filter(k => k in SYSTEMS[o.attractor].par).map(k => num(o[k] ?? SYSTEMS[o.attractor].par[k])).join('_')}_T${num(o.T)}_${o.size}mm_r${o.tube}${o.base ? '_base' : ''}`;
