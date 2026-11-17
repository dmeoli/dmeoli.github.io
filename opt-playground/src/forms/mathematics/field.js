// A distance field on a regular grid, for the solids of the group
// Mathematics that are thick versions of surfaces and curves (a minimal
// surface given by a parametrization, a Klein bottle that crosses itself, the
// trajectory of an attractor that passes close to itself): points and
// segments are splatted into the grid, each node keeping its distance from
// the nearest one up to a cut-off, and the solid is the set within r of them,
// traced by the marching tetrahedra of src/print. Since the result is a level
// set, it is closed and oriented also where the surface crosses itself or the
// tubes overlap, which a sweep cannot give.

import { isosurface, dropCrumbs } from '../../print/index.js';

export class Field {
  // box [[x0, y0, z0], [x1, y1, z1]] in mm (padded here), cells of side h,
  // distances kept up to cut (at least r + 2 h for the solid of radius r)
  constructor([[x0, y0, z0], [x1, y1, z1]], h, cut) {
    const pad = cut + 2 * h;
    this.h = h; this.cut = cut;
    this.x0 = x0 - pad; this.y0 = y0 - pad; this.z0 = z0 - pad;
    this.nx = Math.ceil((x1 - x0 + 2 * pad) / h); this.ny = Math.ceil((y1 - y0 + 2 * pad) / h); this.nz = Math.ceil((z1 - z0 + 2 * pad) / h);
    this.NX = this.nx + 1; this.NY = this.ny + 1; this.NZ = this.nz + 1;
    if (this.NX * this.NY * this.NZ > 6e7) throw new Error('grid too fine for this size');
    this.d = new Float32Array(this.NX * this.NY * this.NZ).fill(cut);
  }

  // the distance from the point (x, y, z), in the nodes within the cut-off
  point(x, y, z) {
    const { h, cut, x0, y0, z0, NX, NY, d } = this;
    const i0 = Math.max(0, Math.ceil((x - cut - x0) / h)), i1 = Math.min(this.nx, Math.floor((x + cut - x0) / h));
    const j0 = Math.max(0, Math.ceil((y - cut - y0) / h)), j1 = Math.min(this.ny, Math.floor((y + cut - y0) / h));
    const k0 = Math.max(0, Math.ceil((z - cut - z0) / h)), k1 = Math.min(this.nz, Math.floor((z + cut - z0) / h));
    for (let k = k0; k <= k1; k++) {
      const dz = z0 + k * h - z, dz2 = dz * dz;
      for (let j = j0; j <= j1; j++) {
        const dy = y0 + j * h - y, dyz = dy * dy + dz2, row = (k * NY + j) * NX;
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * h - x, s = Math.sqrt(dx * dx + dyz);
          if (s < d[row + i]) d[row + i] = s;
        }
      }
    }
  }

  // the distance from the segment a-b
  segment(a, b) {
    const { h, cut, x0, y0, z0, NX, NY, d } = this;
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], ee = ex * ex + ey * ey + ez * ez || 1;
    const lo = q => Math.min(a[q], b[q]) - cut, hi = q => Math.max(a[q], b[q]) + cut;
    const i0 = Math.max(0, Math.ceil((lo(0) - x0) / h)), i1 = Math.min(this.nx, Math.floor((hi(0) - x0) / h));
    const j0 = Math.max(0, Math.ceil((lo(1) - y0) / h)), j1 = Math.min(this.ny, Math.floor((hi(1) - y0) / h));
    const k0 = Math.max(0, Math.ceil((lo(2) - z0) / h)), k1 = Math.min(this.nz, Math.floor((hi(2) - z0) / h));
    for (let k = k0; k <= k1; k++) {
      const wz = z0 + k * h - a[2];
      for (let j = j0; j <= j1; j++) {
        const wy = y0 + j * h - a[1], row = (k * NY + j) * NX;
        for (let i = i0; i <= i1; i++) {
          const wx = x0 + i * h - a[0];
          let t = (wx * ex + wy * ey + wz * ez) / ee;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = wx - t * ex, qy = wy - t * ey, qz = wz - t * ez, s = Math.sqrt(qx * qx + qy * qy + qz * qz);
          if (s < d[row + i]) d[row + i] = s;
        }
      }
    }
  }

  // a polyline [[x, y, z], ...], closed or not
  curve(pts, closed = false) {
    for (let i = 0; i + 1 < pts.length; i++) this.segment(pts[i], pts[i + 1]);
    if (closed && pts.length > 2) this.segment(pts[pts.length - 1], pts[0]);
  }

  // a surface p(u, v) -> [x, y, z] in mm, (u, v) in [u0, u1] x [v0, v1]: a
  // grid of nu x nv quads, each sampled again finely enough that its points
  // are less than `step` apart (by default 0.6 h), so that the sampling
  // follows the surface where the parametrization stretches it; quads with
  // no corner where keep(p) holds are skipped (keep: inside the box of the
  // grid, by default)
  surface(p, [u0, u1], [v0, v1], nu, nv, { step = 0.6 * this.h, keep, maxSub = 160 } = {}) {
    const { x0, y0, z0, h } = this, X1 = x0 + this.nx * h, Y1 = y0 + this.ny * h, Z1 = z0 + this.nz * h;
    const inBox = q => q && q[0] > x0 && q[0] < X1 && q[1] > y0 && q[1] < Y1 && q[2] > z0 && q[2] < Z1;
    const ok = keep ? q => inBox(q) && keep(q) : inBox;
    const du = (u1 - u0) / nu, dv = (v1 - v0) / nv, P = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(p(u0 + i * du, v0 + j * dv));
    const at = (i, j) => P[j * (nu + 1) + i];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), e = at(i + 1, j + 1);
      if (!a || !b || !c || !e || !(ok(a) || ok(b) || ok(c) || ok(e))) continue;
      const nU = Math.min(maxSub, Math.ceil(Math.max(len(a, b), len(c, e)) / step));
      const nV = Math.min(maxSub, Math.ceil(Math.max(len(a, c), len(b, e)) / step));
      for (let s = 0; s <= nV; s++) for (let r = 0; r <= nU; r++) {
        // corners belong to the quad below and to the left only
        if ((r === nU && i < nu - 1) || (s === nV && j < nv - 1)) continue;
        const q = (r === 0 && s === 0) ? a : p(u0 + (i + r / nU) * du, v0 + (j + s / nV) * dv);
        if (ok(q)) this.point(q[0], q[1], q[2]);
      }
    }
  }

  // the solid of the points within r: f = d - r, cut by clip (a signed
  // distance, negative inside, kept where both are negative) and joined to
  // add (another one, e.g. a base); crumbs as in implicitSolid
  solid(r, { clip, add, crumbs = 0.05, progress } = {}) {
    const { h, x0, y0, z0, NX, NY, d } = this;
    const f = (x, y, z) => {
      const i = Math.round((x - x0) / h), j = Math.round((y - y0) / h), k = Math.round((z - z0) / h);
      let v = d[(k * NY + j) * NX + i] - r;
      if (clip) v = Math.max(v, clip(x, y, z));
      if (add) v = Math.min(v, add(x, y, z));
      return v;
    };
    const m = isosurface(f, x0, y0, z0, h, this.nx, this.ny, this.nz, progress);
    return crumbs > 0 ? dropCrumbs(m, crumbs) : m;
  }
}
