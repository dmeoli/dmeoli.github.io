// A printable solid for the shell of Raup's model: the wall between the
// aperture and the same aperture narrowed by the thickness, swept along the
// helico-spiral, as a closed triangle mesh in millimetres (the marching
// tetrahedra and the writers of the files are in src/print).
//
// The surface of the scene is not used: its whorls run through one another
// (in the nautilus each whorl holds the one before), so offsetting it would
// give a mesh that crosses itself. Each aperture lies in a plane through the
// coiling axis, hence the section of the solid by the half-plane at azimuth
// psi is exactly the union of the walls of the apertures at the angles
// theta = -psi + 2 pi m; this gives an implicit function of every point,
// negative inside the wall, whose zero set is extracted by marching
// tetrahedra on a regular grid. The result is closed, every edge is shared by
// two triangles and nothing crosses, whatever the numbers; near the apex,
// where the aperture is thinner than the wall, the whorl is solid, and the
// part smaller than a cell vanishes.

import { isosurface, dropCrumbs, fit } from './print/index.js';

const TAU = 2 * Math.PI;

// approximate signed distance from an ellipse of semi-axes A (radial), B
// (axial), and from the drop, an ellipse whose radial half-width is narrowed by
// (1 + sin phi) / 2 to a point at its lower end
function sdEllipse(u, v, A, B) {
  const p = u / A, q = v / B, rho = Math.hypot(p, q);
  if (rho < 1e-9) return -Math.min(A, B);
  const gr = Math.hypot(u / (A * A), v / (B * B)) / rho;
  return (rho - 1) / gr;
}
// the drop has a cusp at its lower end, where no offset of the same shape
// keeps the wall thick: its distance is measured from a polyline of its right
// half (it is symmetric in u), and its cavity is the set of points deeper than
// the thickness, so that the wall is solid where the drop is thinner than it
const DROP = (() => {
  const k = 64, a = [];
  for (let i = 0; i <= k; i++) {
    const ph = -Math.PI / 2 + Math.PI * i / k;
    a.push([(1 + Math.sin(ph)) / 2 * Math.cos(ph), Math.sin(ph)]);
  }
  return a;
})();
function sdDrop(u, v, A, B) {
  const x = Math.abs(u) / A, y = v / B, sy = B / A;
  // distance in units of A, the axial coordinate stretched back by B / A
  let d2 = Infinity;
  for (let i = 0; i < DROP.length - 1; i++) {
    const px = DROP[i][0], py = DROP[i][1] * sy, qx = DROP[i + 1][0], qy = DROP[i + 1][1] * sy;
    const ex = qx - px, ey = qy - py, wx = x - px, wy = y * sy - py;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const dx = wx - t * ex, dy = wy - t * ey, dd = dx * dx + dy * dy;
    if (dd < d2) d2 = dd;
  }
  const s = Math.max(-1, Math.min(1, y)), inside = Math.abs(y) < 1 && x < (1 + s) / 2 * Math.sqrt(1 - s * s);
  return (inside ? -A : A) * Math.sqrt(d2);
}

// the implicit function of the wall, in model units (aperture of unit radial
// half-axis at theta = 0, apex n revolutions before), clamped at +-cap
export function wallField({ W, D, T, S, n, drop = false }, thick, cap) {
  const lw = Math.log(W) / TAU, R0 = (1 + D) / (1 - D), tmin = -TAU * n;
  return (x, y, z) => {
    const r = Math.hypot(x, y), th0 = -Math.atan2(y, x);
    const m0 = Math.ceil((tmin - Math.PI - th0) / TAU), m1 = Math.floor((Math.PI - th0) / TAU);
    let f = cap, th = th0 + TAU * m0, g = Math.exp(lw * th);
    for (let m = m0; m <= m1; m++, th += TAU, g *= W) {
      const A = g, B = S * g, u = r - R0 * g, v = z + T * R0 * g;
      if (Math.abs(u) - A > f || Math.abs(v) - B > f) continue;
      let w;
      if (drop) { const d = sdDrop(u, v, A, B); w = Math.max(d, -d - thick); }
      else {
        w = sdEllipse(u, v, A, B);
        const Ai = A - thick, Bi = B - thick;
        if (Ai > 0 && Bi > 0) w = Math.max(w, -sdEllipse(u, v, Ai, Bi));
      }
      // beyond the last aperture or before the apex, the distance from the
      // half-plane that ends the sweep
      const dl = th > 0 ? th : th < tmin ? tmin - th : 0;
      if (dl > 0) w = Math.max(w, dl < Math.PI / 2 ? r * Math.sin(dl) : r);
      if (w < f) f = w;
    }
    return Math.max(-cap, f);
  };
}

/* ---------------------------------------------------- the printable solid -- */

// the solid of the shell `p` ({W, D, T, S, n, drop}) for a print of largest
// dimension `size` mm, wall `thick` mm, with a stand when `base`; `fine`
// halves the cell. The shell lies on its aperture when all of it is on one
// side of the aperture's plane (a bivalve valve), else with the coiling axis
// upright, apex up.
export function printMesh(p, { size = 80, thick = 1.6, base = true, fine = false } = {}, progress) {
  // samples of the outer surface, to place and scale the solid
  const lw = Math.log(p.W) / TAU, R0 = (1 + p.D) / (1 - p.D), nT = 600, nP = 48, pts = [];
  for (let i = 0; i <= nT; i++) {
    const th = -TAU * p.n * (1 - i / nT), g = Math.exp(lw * th), c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < nP; j++) {
      const ph = TAU * j / nP, w = p.drop ? (1 + Math.sin(ph)) / 2 : 1, r = R0 * g + g * w * Math.cos(ph);
      pts.push([r * c, -r * s, -p.T * R0 * g + g * p.S * Math.sin(ph)]);
    }
  }
  let ymin = Infinity, ymax = -Infinity;
  for (const q of pts) { ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]); }
  const onLip = -ymin < 0.06 * (ymax - ymin);
  // model -> upright frame: on the lip, (x, y, z) -> (x, -z, y)
  const rot = onLip ? q => [q[0], -q[2], Math.max(0, q[1])] : q => q;
  const unrot = onLip ? (X, Y, Z) => [X, Z, -Y] : (X, Y, Z) => [X, Y, Z];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const up = pts.map(rot);
  for (const q of up) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); }
  const s = size / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h = Math.min(thick / (fine ? 2.6 : 1.8), size / (fine ? 190 : 120)), cap = 2 * h;
  const wf = wallField(p, thick / s, cap / s);
  // the stand: a disc under the part of the shell that is lower than its
  // thickness, the shell sunk into it
  let disc = null;
  if (base && !onLip) {
    const c = Math.min(4, Math.max(1.2, 0.03 * size)), low = up.filter(q => (q[2] - lo[2]) * s < c);
    let mx = 0, my = 0;
    for (const q of low) { mx += (q[0] - lo[0]) * s / low.length; my += (q[1] - lo[1]) * s / low.length; }
    let R = 0;
    for (const q of low) R = Math.max(R, Math.hypot((q[0] - lo[0]) * s - mx, (q[1] - lo[1]) * s - my));
    disc = { x: mx, y: my, c, R: Math.max(R + 1.5, 0.12 * size) };
  }
  const f = (X, Y, Z) => {
    const q = unrot(X / s + lo[0], Y / s + lo[1], Z / s + lo[2]);
    let v = s * wf(q[0], q[1], q[2]);
    if (onLip) v = Math.max(v, -s * q[1]);
    if (disc) v = Math.min(v, Math.max(-Z, Z - disc.c, Math.hypot(X - disc.x, Y - disc.y) - disc.R));
    return v;
  };
  const b0 = [0, 0, 0], b1 = [(hi[0] - lo[0]) * s, (hi[1] - lo[1]) * s, (hi[2] - lo[2]) * s];
  if (disc) {
    b0[0] = Math.min(b0[0], disc.x - disc.R); b0[1] = Math.min(b0[1], disc.y - disc.R);
    b1[0] = Math.max(b1[0], disc.x + disc.R); b1[1] = Math.max(b1[1], disc.y + disc.R);
  }
  const pad = 2 * h, n = [0, 1, 2].map(a => Math.ceil((b1[a] - b0[a] + 2 * pad) / h));
  const mesh = dropCrumbs(isosurface(f, b0[0] - pad, b0[1] - pad, b0[2] - pad, h, n[0], n[1], n[2], progress));
  // exactly `size` mm along the largest side, from the origin
  fit(mesh, size);
  return { ...mesh, cell: h, onLip, disc: !!disc };
}

// the name of the files: the numbers of the shell and of the print
export function fileName(p, o) {
  const r = x => +(+x).toPrecision(4);
  return `shell_W${r(p.W)}_D${r(p.D)}_T${r(p.T)}_S${r(p.S)}_n${r(p.n)}${p.drop ? '_drop' : ''}_${r(o.size)}mm_t${r(o.thick)}${o.base ? '_base' : ''}${o.fine ? '_fine' : ''}`;
}
