// A leg of a steampunk automaton, after Coros, Thomaszewski et al.,
// "Computational Design of Mechanical Characters" (SIGGRAPH 2013): a crank
// turning about O_A drives a four-bar linkage (crank O_A A, coupler A B,
// rocker O_B B), and a point P fixed on the coupler, the foot, traces a
// closed curve; the seven dimensions of the linkage are chosen by
// Nelder-Mead so that this curve follows a target curve, with penalties for
// the positions where the linkage cannot close and for the collisions of
// the links with the pins of the other layers. The printed parts are flat
// plates in four layers, joined by pins with stated clearances. All lengths
// are in mm, for a frame of about 120 mm.

import { implicitSolid, merge, transform, onBed, bounds } from '../../print/index.js';

// the layers and the hardware, mm
export const HW = { t: 3, gap: 0.4, w: 8, pin: 1.5, axle: 2.5, spacer: 3.5, head: 3.2, headT: 1.2 };

/* ---------------------------------------------------------- kinematics -- */

// p = [r1, r2, r3, gx, gy, u, v]: crank, coupler and rocker lengths, the
// pivot O_B = (gx, gy) (O_A at the origin), and the foot P = A + u e + v n
// in the frame of the coupler (e along A B, n its normal). Returns
// { A, B, P } at crank angle th, or null where the circles of radius r2
// about A and r3 about O_B do not meet (the linkage cannot close).
export function pose(p, th) {
  const [r1, r2, r3, gx, gy, u, v] = p;
  const A = [r1 * Math.cos(th), r1 * Math.sin(th)];
  const dx = gx - A[0], dy = gy - A[1], d = Math.hypot(dx, dy);
  if (d > r2 + r3 || d < Math.abs(r2 - r3) || d < 1e-9) return null;
  const a = (r2 * r2 - r3 * r3 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r2 * r2 - a * a));
  // the branch with B to the left of A -> O_B, kept for the whole turn
  const B = [A[0] + (a * dx - h * dy) / d, A[1] + (a * dy + h * dx) / d];
  const e = [(B[0] - A[0]) / r2, (B[1] - A[1]) / r2], n = [-e[1], e[0]];
  return { A, B, P: [A[0] + u * e[0] + v * n[0], A[1] + u * e[1] + v * n[1]] };
}

// how far the linkage is from closing at th (0 where it closes)
function gapAt(p, th) {
  const [r1, r2, r3, gx, gy] = p, d = Math.hypot(gx - r1 * Math.cos(th), gy - r1 * Math.sin(th));
  return Math.max(0, d - r2 - r3, Math.abs(r2 - r3) - d);
}

const segDist = (q, a, b) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], l = ex * ex + ey * ey;
  const s = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / l)) : 0;
  return Math.hypot(q[0] - a[0] - s * ex, q[1] - a[1] - s * ey);
};

/* ------------------------------------------------------- target curves -- */

const ring = (n, f) => Array.from({ length: n }, (_, k) => f(2 * Math.PI * k / n));
export const CURVES = {
  // the foot on the ground for half the turn, lifted along an arc for the other half
  step: ring(64, s => (s < Math.PI ? [40 + 26 * Math.cos(s), -48 + 14 * Math.sin(s)] : [40 + 26 * Math.cos(s), -48 + 1.5 * Math.sin(s)])),
  ellipse: ring(64, s => [40 + 24 * Math.cos(s), -50 + 10 * Math.sin(s)]),
  drop: ring(64, s => [40 + 20 * Math.cos(s) * (0.6 + 0.4 * Math.sin(s)), -50 + 14 * Math.sin(s)]),
  eight: ring(64, s => [40 + 22 * Math.sin(s), -50 + 9 * Math.sin(2 * s)]),
};
// a drawn curve kept in the address: "x,y;x,y;..." in whole mm
export const parseCurve = s => (s || '').split(';').map(q => q.split(',').map(Number)).filter(q => q.length === 2 && q.every(Number.isFinite));
export const curveString = pts => pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(';');

// the closed polyline resampled at n points evenly spaced along its length
export function resample(pts, n = 64) {
  const m = pts.length, L = [0];
  for (let i = 1; i <= m; i++) L.push(L[i - 1] + Math.hypot(pts[i % m][0] - pts[i - 1][0], pts[i % m][1] - pts[i - 1][1]));
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = L[m] * k / n;
    while (L[j + 1] < s) j++;
    const f = (s - L[j]) / (L[j + 1] - L[j] || 1), a = pts[j], b = pts[(j + 1) % m];
    out.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
  }
  return out;
}

export function targetOf(o) {
  const d = o.curve === 'draw' ? parseCurve(o.drawn) : null;
  return resample(d && d.length >= 4 ? d : CURVES[o.curve] || CURVES.step);
}

/* ---------------------------------------------------------- objective -- */

const K = 72;
// the mean squared distance from the foot curve to the target and back
// (chamfer), in mm^2, plus penalties: where the linkage does not close, the
// crank (layer 1) and the coupler (layer 2) reaching the spacer around the
// pin of O_B, the rocker (layer 3) reaching the head of the pin at A, and
// links shorter than 12 or longer than 100 mm, O_B farther than 75 mm from O_A. Returns { cost, fit, pen, curve }
export function cost(p, T) {
  const { w, spacer, head } = HW;
  let pen = 0;
  for (const r of p.slice(0, 3)) pen += (Math.max(0, 12 - r) ** 2 + Math.max(0, r - 100) ** 2) * 10;
  pen += Math.max(0, Math.hypot(p[3], p[4]) - 75) ** 2 * 10 + Math.max(0, Math.hypot(p[5], p[6]) - 110) ** 2 * 10;
  pen += Math.max(0, p[0] + w / 2 + spacer + 1 - Math.hypot(p[3], p[4])) ** 2 * 10;
  const C = [];
  let open = 0;
  for (let k = 0; k < K; k++) {
    const th = 2 * Math.PI * k / K, q = pose(p, th);
    if (!q) { open += gapAt(p, th) + 1; continue; }
    C.push(q.P);
    const O = [p[3], p[4]];
    const dc = Math.min(segDist(O, q.A, q.B), segDist(O, q.A, q.P), segDist(O, q.B, q.P));
    pen += Math.max(0, w / 2 + spacer + 1 - dc) ** 2;
    pen += Math.max(0, w / 2 + head + 1 - segDist(q.A, O, q.B)) ** 2;
  }
  if (open) return { cost: 1e4 + 1e3 * open + pen, fit: Infinity, pen, curve: C };
  let a = 0, b = 0;
  for (const c of C) { let m = Infinity; for (const t of T) m = Math.min(m, (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2); a += m; }
  for (const t of T) { let m = Infinity; for (const c of C) m = Math.min(m, (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2); b += m; }
  const fit = a / C.length + b / T.length;
  return { cost: fit + pen, fit, pen, curve: C };
}

/* -------------------------------------------------------- Nelder-Mead -- */

// a minimiser that can be run a few iterations at a time: nm.step(n)
// performs n iterations of Nelder and Mead (1965), with reflection 1,
// expansion 2, contraction 1/2 and shrink 1/2; nm.best is [x, f]
export function nelderMead(f, x0, scale) {
  const n = x0.length;
  let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += scale[i]; S.push(x); }
  let F = S.map(f), evals = n + 1;
  const comb = (a, x, b, y) => x.map((v, i) => a * v + b * y[i]);
  const nm = {
    get best() { let k = 0; for (let i = 1; i <= n; i++) if (F[i] < F[k]) k = i; return [S[k], F[k]]; },
    get evals() { return evals; },
    // the relative spread of the values on the simplex
    get spread() { const lo = Math.min(...F), hi = Math.max(...F); return (hi - lo) / (Math.abs(lo) + 1e-9); },
    step(iters = 1) {
      for (let it = 0; it < iters; it++) {
        const ord = [...S.keys()].sort((i, j) => F[i] - F[j]);
        S = ord.map(i => S[i]); F = ord.map(i => F[i]);
        const c = Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
        const xr = comb(2, c, -1, S[n]), fr = f(xr); evals++;
        if (fr < F[0]) {
          const xe = comb(3, c, -2, S[n]), fe = f(xe); evals++;
          if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; }
        } else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
        else {
          const out = fr < F[n], xc = out ? comb(0.5, c, 0.5, xr) : comb(0.5, c, 0.5, S[n]), fc = f(xc); evals++;
          if (fc < (out ? fr : F[n])) { S[n] = xc; F[n] = fc; }
          else for (let i = 1; i <= n; i++) { S[i] = comb(0.5, S[0], 0.5, S[i]); F[i] = f(S[i]); evals++; }
        }
      }
      return nm;
    },
  };
  return nm;
}

// the starting linkages of the restarts: a crank-rocker that closes in every
// position (Grashof: the crank is the shortest link and s + l <= p + q), its
// foot placed near the centre of the target
export function starts(T, count, seed) {
  let a = (seed >>> 0) || 1;
  const R = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const cx = T.reduce((s, q) => s + q[0], 0) / T.length, cy = T.reduce((s, q) => s + q[1], 0) / T.length;
  const out = [];
  for (let k = 0; k < count; k++) {
    const r1 = 12 + 10 * R(), ang = -Math.PI / 2 + (R() - 0.5) * 1.6, g = 45 + 25 * R();
    const gx = g * Math.cos(ang + 1.2), gy = g * Math.sin(ang + 1.2);
    const r2 = g * (0.8 + 0.4 * R()), r3 = Math.max(g + r1 - r2 + 6, g * (0.5 + 0.4 * R()));
    const p = [r1, r2, r3, gx, gy, 0, 0];
    // u, v of the coupler that put the foot at the centre of the target at th = 0
    const q = pose(p, 0);
    if (q) {
      const e = [(q.B[0] - q.A[0]) / r2, (q.B[1] - q.A[1]) / r2], d = [cx - q.A[0], cy - q.A[1]];
      p[5] = d[0] * e[0] + d[1] * e[1]; p[6] = -d[0] * e[1] + d[1] * e[0];
    }
    out.push(p);
  }
  return out;
}

export const DEFAULT = [17.7, 70.4, 54.2, 74.4, -9.4, 8.7, -59.3];

/* ------------------------------------------------------------ the parts -- */

const cap = (q, a, b, r) => segDist(q, a, b) - r;
const circ = (q, c, r) => Math.hypot(q[0] - c[0], q[1] - c[1]) - r;

// a plate of thickness t from the 2D distance g(x, y), its bottom at z = 0
const plate = (g, t) => (x, y, z) => Math.max(g([x, y]), Math.abs(z - t / 2) - t / 2);

// the parts as closed meshes in mm, laid flat on the bed side by side:
// { name, mesh } in printing order; the linkage p is scaled by k = size / 120
// (the pins and the plates keep their sizes)
export function parts(o, h) {
  const { t, gap, w, pin, axle, spacer, head, headT } = HW;
  const c = o.clearance ?? 0.25, k = (o.size || 120) / 120, p = (o.p || DEFAULT).map(v => v * k);
  const [r1, r2, r3, gx, gy, u, v] = p;
  const OA = [0, 0], OB = [gx, gy], A = [r1, 0];
  const q0 = pose(p, 0) || { A, B: [gx, gy + r3], P: [0, -40] };
  // the coupler in its own frame: A at the origin, B on the x axis
  const cA = [0, 0], cB = [r2, 0], cP = [u, v];
  const fr = (lo, hi) => [[lo[0] - 3, lo[1] - 3, -1], [hi[0] + 3, hi[1] + 3, hi[2] + 1]];
  const out = [];
  const add = (name, f, lo, hi) => out.push({ name, mesh: implicitSolid(f, fr(lo, hi), h, { crumbs: 0.2 }) });
  /* the frame: a plate around O_A and O_B with two holes to mount it, the
     axle hole free, the pin of O_B a press fit */
  const R0 = w * 1.6, mount = [[-R0 * 0.2, R0 * 1.2], [gx * 0.5, gy + R0 * 1.4]];
  const gFrame = q => Math.max(Math.min(cap(q, OA, OB, R0), cap(q, mount[0], mount[1], 6), cap(q, OA, mount[0], 6), cap(q, OB, mount[1], 6)),
    -circ(q, OA, axle + c), -circ(q, OB, pin), -circ(q, mount[0], 2), -circ(q, mount[1], 2));
  const fb = [[Math.min(0, gx, ...mount.map(m => m[0])) - R0, Math.min(0, gy, ...mount.map(m => m[1])) - R0, 0], [Math.max(0, gx, ...mount.map(m => m[0])) + R0, Math.max(0, gy, ...mount.map(m => m[1])) + R0, t]];
  add('frame', plate(gFrame, t), ...fb);
  /* the crank: a bar O_A A, a press-fit hole at A, and its axle, which runs
     back through the frame and the handle */
  const ax = gap + t + gap + t;
  const gCrank = q => Math.max(cap(q, [0, 0], [r1, 0], w / 2), -circ(q, [r1, 0], pin));
  const fCrank = (x, y, z) => Math.min(plate(gCrank, t)(x, y, z), Math.max(Math.hypot(x, y) - axle, Math.abs(z - (t + ax) / 2) - (t + ax) / 2));
  add('crank', fCrank, [-w, -w, 0], [r1 + w, w, t + ax]);
  /* the handle: a bar with a press-fit hole for the axle and a knob */
  const hl = 22 * Math.max(1, k);
  const gHandle = q => Math.max(cap(q, [0, 0], [hl, 0], w / 2), -circ(q, [0, 0], axle));
  const fHandle = (x, y, z) => Math.min(plate(gHandle, t)(x, y, z), Math.max(Math.hypot(x - hl, y) - 3, Math.abs(z - 7) - 7));
  add('handle', fHandle, [-w, -w, 0], [hl + w, w, 14]);
  /* the coupler: three bars A B, A P, B P, a free hole at A, a press-fit
     hole at B, and a boot at the foot P */
  const gCoupler = q => Math.max(Math.min(cap(q, cA, cB, w / 2), cap(q, cA, cP, w / 2), cap(q, cB, cP, w / 2), circ(q, cP, w * 0.9)),
    -circ(q, cA, pin + c), -circ(q, cB, pin));
  const cl = [Math.min(0, u) - w, Math.min(0, v) - w, 0], ch = [Math.max(r2, u) + w, Math.max(0, v) + w, t];
  add('coupler', plate(gCoupler, t), cl, ch);
  /* the rocker: a bar O_B B with free holes at both ends */
  const gRocker = q => Math.max(cap(q, [0, 0], [r3, 0], w / 2), -circ(q, [0, 0], pin + c), -circ(q, [r3, 0], pin + c));
  add('rocker', plate(gRocker, t), [-w, -w, 0], [r3 + w, w, t]);
  /* the spacer that holds the rocker up to layer 3 on the pin of O_B */
  const sh = 2 * t + 2 * gap;
  add('spacer', (x, y, z) => Math.max(Math.hypot(x, y) - spacer, pin + c - Math.hypot(x, y), Math.abs(z - sh / 2) - sh / 2), [-spacer, -spacer, 0], [spacer, spacer, sh]);
  /* the pins, standing on their heads: A (crank and coupler), B (coupler
     and rocker), O_B (frame to rocker) */
  const pinOf = len => (x, y, z) => Math.min(Math.max(Math.hypot(x, y) - head, Math.abs(z - headT / 2) - headT / 2),
    Math.max(Math.hypot(x, y) - pin, Math.abs(z - (headT + len) / 2) - (headT + len) / 2));
  for (const [name, len] of [['pin A', 2 * t + gap], ['pin B', 2 * t + gap], ['pin OB', 4 * t + 3 * gap]]) add(name, pinOf(len), [-head, -head, 0], [head, head, headT + len]);
  return { parts: out, pose: q0 };
}

// the printed plate: every part on the bed, in rows, 5 mm apart
export function solid(o, progress) {
  const h = o.res === 'fine' ? 0.25 : o.res === 'preview' ? 0.6 : 0.4;
  const { parts: P } = parts(o, h);
  let x = 0, y = 0, row = 0;
  const width = 170 * (o.size || 120) / 120;
  P.forEach(({ mesh: m }, i) => {
    onBed(m);
    const [lo, hi] = bounds(m), wx = hi[0] - lo[0], wy = hi[1] - lo[1];
    if (x > 0 && x + wx > width) { x = 0; y += row + 5; row = 0; }
    transform(m, ([a, b, c]) => [a - lo[0] + x, b - lo[1] + y, c]);
    x += wx + 5; row = Math.max(row, wy);
    if (progress) progress((i + 1) / P.length);
  });
  const m = onBed(merge(...P.map(q => q.mesh)));
  m.count = P.length;
  return m;
}

export const fileName = o => `automaton_leg_${o.curve}_${o.size}mm_c${o.clearance}`;
