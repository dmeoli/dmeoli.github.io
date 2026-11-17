// Antigravity castle, after the antigravity slopes of Sugihara (2014): a
// castle that seen from one point shows four wall walks rising from the
// corner towers to the keep, while in the solid they descend towards the
// keep, so that a ball set on a walk seems to roll uphill.
//
// The castle as it is perceived, P, is a union of simple solids (a signed
// function, units of 1/100 of the size, z up, the ground at z = 0). The real
// castle is the image of P by
//   Psi(x) = x + delta(x) u(x),   u(x) = (x - E)/|x - E|,
//   delta(x) = beta s(z) (rho_c - clamp(rho, R0, R1))/(R1 - R0),
// where E is the eye, rho the distance from the axis of the keep, R0 and R1
// the ends of the walks and s(z) = clamp(z/z_T, 0, 1), z_T the height of the
// towers: every point slides along its own ray from the eye, so the picture
// seen from E does not change, the ground stays where it is (delta = 0 at
// z = 0), the keep (delta > 0) goes away from the eye and therefore down, the
// towers come towards it and up. beta is the smallest value for which every
// walk, measured on the solid, descends towards the keep by the slope asked
// for; it is found by bisection. Psi is applied to the vertices of the mesh
// of P, which stays closed and oriented as long as Psi keeps the orientation:
// its Jacobian determinant is checked on the castle (it is 1 + d delta/ds
// along a ray times the stretch (s + delta)/s across it, so it fails when
// delta drops by more than the distance travelled along a ray).

import { implicitSolid, transform, bounds } from '../../print/index.js';

export const DEFAULTS = { az: -60, el: 45, dist: 300, slope: 4, rise: 12 };

// the castle as it is seen: dimensions in units (100 = the side of the base)
export function castle({ rise = 12 } = {}) {
  const ZT = 18, ZK = ZT + rise, R0 = 10, R1 = 33;
  return { ZT, ZK, R0, R1, rc: (ZK * R0 + ZT * R1) / (ZK + ZT), keep: 10, tower: 7, towerAt: 40, walk: 5.5, rail: 1.6, railH: 3, ball: 3 };
}

// the height of the walk at distance rho from the keep, as it is seen
export const walkZ = (c, rho) => c.ZT + (c.ZK - c.ZT) * (c.R1 - rho) / (c.R1 - c.R0);

// the eye, from the azimuth and the elevation (degrees) and the distance from
// the point (0, 0, 12), in units
export function eye({ az, el, dist }) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return [dist * Math.cos(e) * Math.cos(a), dist * Math.cos(e) * Math.sin(a), 12 + dist * Math.sin(e)];
}

const ARMS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// the map from the castle as seen to the real one
export function warp(E, c, beta) {
  return ([x, y, z]) => {
    const r = Math.min(c.R1, Math.max(c.R0, Math.hypot(x, y))), sz = Math.min(1, Math.max(0, z / c.ZT));
    const d = beta * sz * (c.rc - r) / (c.R1 - c.R0), ux = x - E[0], uy = y - E[1], uz = z - E[2], L = Math.hypot(ux, uy, uz);
    return [x + d * ux / L, y + d * uy / L, z + d * uz / L];
  };
}

// the smallest slope (degrees, positive when the walk descends towards the
// keep) over the four walks of the real castle
export function realSlope(E, c, beta, n = 40) {
  const W = warp(E, c, beta);
  let worst = Infinity;
  for (const [dx, dy] of ARMS) {
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const r = c.R0 + (c.R1 - c.R0) * i / n, q = W([dx * r, dy * r, walkZ(c, r)]);
      if (prev) worst = Math.min(worst, Math.atan2(q[2] - prev[2], Math.hypot(q[0] - prev[0], q[1] - prev[1])) * 180 / Math.PI);
      prev = q;
    }
  }
  return worst;
}

// beta for the slope asked for, by bisection (the slope grows with beta)
export function solveBeta(E, c, slope) {
  let lo = 0, hi = 4;
  while (realSlope(E, c, hi) < slope && hi < 400) hi *= 2;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (realSlope(E, c, m) < slope) lo = m; else hi = m; }
  return hi;
}

/* -------------------------------------------------- the castle as seen -- */

const box2 = (qx, qy) => Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
const boxD = (x, y, z, a, b, c0, c1) => {
  const qz = Math.max(c0 - z, z - c1), qx = Math.abs(x) - a, qy = Math.abs(y) - b;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
};
const cyl = (x, y, z, r, z0, z1) => { const dr = Math.hypot(x, y) - r, dz = Math.max(z0 - z, z - z1); return Math.hypot(Math.max(dr, 0), Math.max(dz, 0)) + Math.min(Math.max(dr, dz), 0); };

// a pointed (equilateral) arch of half width a springing at height s, in the
// plane (u, z): negative inside the opening
function arch(u, z, a, s) {
  if (z < s) return Math.max(Math.abs(u) - a, -z);
  const R = 2 * a;
  return Math.max(Math.hypot(u - a, z - s) - R, Math.hypot(u + a, z - s) - R);
}

// the engraved arrow on the base, pointing to the eye
function arrow(x, y, az) {
  const a = az * Math.PI / 180, u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a);
  const shaft = box2(Math.abs(u - 40) - 3.5, Math.abs(v) - 0.9);
  const head = Math.max(-(u - 43.5), (u - 48) + Math.abs(v) * 1.3);
  const eyeRing = Math.abs(Math.hypot(u - 33.5, v) - 2) - 0.6;
  return Math.min(shaft, head, eyeRing);
}

// the signed function of the castle as seen (units)
export function perceived(o) {
  const c = castle(o), az = o.az ?? DEFAULTS.az, T = c.towerAt;
  return (x, y, z) => {
    // base: a rounded square plate below the ground, with the arrow cut in
    let f = Math.max(box2(Math.abs(x) - 44, Math.abs(y) - 44) - 8, Math.max(-5 - z, z));
    if (z > -1.2) f = Math.max(f, -Math.max(arrow(x, y, az), -0.8 - z));
    // the keep: a square tower with merlons, a round turret and its cone
    let k = boxD(x, y, z, c.keep, c.keep, -1, c.ZK + 4);
    const kt = c.ZK + 4;
    if (z > kt - 3) {
      const inner = boxD(x, y, z, c.keep - 1.6, c.keep - 1.6, kt - 3, kt + 1);
      const along = Math.abs(x) > Math.abs(y) ? y : x;
      const notch = (Math.abs(Math.abs(along) - 4.5) < 1.3) ? -1 : 1;
      k = Math.max(k, -inner);
      if (notch < 0) k = Math.max(k, kt - 2 - z);
    }
    k = Math.min(k, cyl(x, y, z, 5, kt - 3, kt + 8));
    const rr = Math.hypot(x, y), cone = Math.max((rr - 5.6) * 0.85 + (z - (kt + 8)) * 0.53, (kt + 7.5) - z);
    k = Math.min(k, Math.max(cone, z - (kt + 22)));
    f = Math.min(f, k);
    for (const [dx, dy] of ARMS) {
      // the walk along this arm: u along it, v across
      const u = x * dx + y * dy, v = -x * dy + y * dx;
      // a corner tower with merlons and a gap facing the keep
      const tx = x - dx * T, ty = y - dy * T;
      let t = cyl(tx, ty, z, c.tower, -1, c.ZT + 3.5);
      if (z > c.ZT) {
        t = Math.max(t, -cyl(tx, ty, z, c.tower - 1.6, c.ZT, c.ZT + 5));
        const ang = Math.atan2(ty, tx), sec = ((ang / (Math.PI / 4)) % 1 + 1) % 1;
        if (Math.abs(sec - 0.5) > 0.27) t = Math.max(t, c.ZT - z);
      }
      f = Math.min(f, t);
      if (u < c.keep - 2 || u > T + 1) continue;
      const zw = walkZ(c, Math.min(Math.max(u, c.R0), c.R1));
      // the wall under the walk, with a pointed arch through it
      let w = Math.max(Math.abs(v) - c.walk, z - zw, -1 - z, c.keep - 2 - u, u - (T - 6));
      const mid = (c.R0 + c.R1) / 2;
      w = Math.max(w, -Math.max(arch(u - mid, z, 3.6, 4.5), Math.abs(v) - c.walk - 1));
      // the parapets that keep the ball on the walk
      const p = Math.max(Math.abs(Math.abs(v) - c.walk + c.rail / 2) - c.rail / 2, z - zw - c.railH, zw - 1 - z, c.keep - 1 - u, u - (T - c.tower + 0.5));
      f = Math.min(f, w, p);
    }
    return f;
  };
}

/* -------------------------------------------------------------- solid -- */

// the Jacobian determinant of Psi, smallest over points of the castle
function minDet(W, f) {
  let d = Infinity;
  const h = 1e-3;
  for (let x = -50; x <= 50; x += 5) for (let y = -50; y <= 50; y += 5) for (let z = 0; z <= 60; z += 4) {
    if (f(x, y, z) > 2) continue;
    const p = W([x, y, z]), a = W([x + h, y, z]), b = W([x, y + h, z]), cc = W([x, y, z + h]);
    const J = [0, 1, 2].map(i => [(a[i] - p[i]) / h, (b[i] - p[i]) / h, (cc[i] - p[i]) / h]);
    d = Math.min(d, J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]));
  }
  return d;
}

// the share of the surface that hangs over by more than 45 degrees (the
// bottom of the base left out)
function overhang({ pos, idx }) {
  let all = 0, over = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = 3 * idx[k], b = 3 * idx[k + 1], c = 3 * idx[k + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, A = Math.hypot(nx, ny, nz);
    all += A;
    if (nz < -0.7072 * A && Math.min(pos[a + 2], pos[b + 2], pos[c + 2]) > 0.3) over += A;
  }
  return over / all;
}

export function fileName(o) { return `antigravity_castle_az${o.az}_el${o.el}_d${o.dist}_s${o.slope}_${o.size}mm`; }

// o: az, el (degrees), dist (units), slope (degrees of real descent), rise
// (how much the walks seem to rise, units), size (mm, the side of the base),
// res ('preview', 'draft', 'fine')
export function solid(o, progress) {
  const q = { ...DEFAULTS, ...o }, c = castle(q), E = eye(q);
  const f = perceived(q);
  // the slope asked for, or less if the map would fold the castle
  let beta = solveBeta(E, c, q.slope), capped = false;
  if (minDet(warp(E, c, beta), f) < 0.05) {
    let lo = 0, hi = beta;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (minDet(warp(E, c, m), f) < 0.05) hi = m; else lo = m; }
    beta = lo; capped = true;
  }
  const W = warp(E, c, beta);
  const h = q.res === 'fine' ? 0.45 : q.res === 'draft' ? 0.75 : 1.1;
  const m = implicitSolid(f, [[-53, -53, -5], [53, 53, c.ZK + 27]], h, { progress });
  const k = (q.size || 120) / 100, map = p => { const r = W(p); return [r[0] * k, r[1] * k, (r[2] + 5) * k]; };
  transform(m, map);
  const [mn, mx] = bounds(m);
  m.dims = mx.map((v, i) => v - mn[i]);
  m.center = mn.map((v, i) => (v + mx[i]) / 2);
  m.eye = [E[0] * k, E[1] * k, (E[2] + 5) * k];
  m.target = [0, 0, 17 * k];
  m.beta = beta;
  m.slope = realSlope(E, c, beta);
  m.apparent = Math.atan2(c.ZK - c.ZT, c.R1 - c.R0) * 180 / Math.PI;
  m.det = minDet(W, f);
  m.capped = capped;
  m.overhang = overhang(m);
  // the path of the centre of a ball on each walk, from the tower to the keep
  const path = [];
  for (const [dx, dy] of ARMS) for (let i = 0; i <= 30; i++) {
    const r = c.R1 - (c.R1 - c.R0 - c.ball) * i / 30;
    path.push(...map([dx * r, dy * r, walkZ(c, r) + c.ball]));
  }
  m.path = path;
  m.ball = c.ball * k;
  return m;
}
