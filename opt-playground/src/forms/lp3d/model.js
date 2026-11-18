// The LP in three variables of lp3d.html as a solid to print: the polytope of
// max c.x, A x <= b, x >= 0 in the coordinates of the scene (lp3-core.js and
// the scaling of lp3d.js), with the path of the method as a tube: the
// vertices of the simplex along the edges, or the central path of the
// barrier method through the inside, which shows in the frame of struts.
// layout() reads the instance (it needs the page, lp3-core speaking the
// language of the page); solid() takes its plain numbers, without the DOM,
// so that the download panel runs it in a worker.

import { implicitSolid, onBed } from '../../print/index.js';
import { instances, randomInstance, geometry, simplex, barrier, cons } from '../../lp3-core.js';


// o: { inst, seed, mode: 'simplex' | 'ipm', rule } -> the polytope in the
// scaled coordinates u (each axis to [0, 1] when the extents differ by more
// than 3 times, one common scale otherwise, as the scene draws it), its
// edges and rows, and the path
export function layout({ inst = 'klee', seed = 7, mode = 'simplex', rule = 'dantzig' } = {}) {
  const P = instances[inst] && instances[inst].random ? randomInstance(seed, 5) : instances[inst] || instances.klee;
  const Geo = geometry(P), { G, h } = cons(P);
  const ext = [0, 1, 2].map(j => Math.max(1e-9, ...Geo.V.map(v => v.x[j])));
  const sc = Math.max(...ext) / Math.min(...ext) > 3 ? ext : ext.map(() => Math.max(...ext));
  const D = x => x.map((v, j) => v / sc[j]);
  let path;
  if (mode === 'ipm') {
    // the dense points of the central path, one every 1/60 of its length
    const pts = barrier(P, { tol: 1e-6 }).dense.map(p => D(p.x));
    const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);
    path = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      if (acc >= len / 60 || i === pts.length - 1) { path.push(pts[i]); acc = 0; }
    }
  } else {
    path = [];
    for (const s of simplex(P, rule)) { const u = D(s.x); if (!path.length || Math.hypot(...u.map((v, d) => v - path.at(-1)[d])) > 1e-9) path.push(u); }
  }
  // the rows g.x <= h in u: (g_j sc_j) u_j <= h, normalized
  const rows = G.map((g, k) => { const gs = g.map((v, d) => v * sc[d]), n = Math.hypot(...gs); return [gs[0] / n, gs[1] / n, gs[2] / n, h[k] / n]; });
  return { V: Geo.V.map(v => D(v.x)), edges: Geo.edges, rows, path, mode };
}

// distance from p to the segment of six numbers in S at k
function segDist(S, k, x, y, z) {
  const ax = S[k], ay = S[k + 1], az = S[k + 2], ex = S[k + 3] - ax, ey = S[k + 4] - ay, ez = S[k + 5] - az;
  const wx = x - ax, wy = y - ay, wz = z - az;
  const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / (ex * ex + ey * ey + ez * ez || 1)));
  const qx = wx - t * ex, qy = wy - t * ey, qz = wz - t * ez;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

// L: the layout; o: { size (mm, the side of the box of the scaled polytope),
// style: 'solid' | 'struts', tube (radius of the path, mm), base, baseThick,
// cells (across the size) }. In the solid, the edges are engraved and the
// path of the simplex is raised on them; in the frame, the edges are struts
// and the path, on the edges or inside, a thicker tube; the optimum is a ball.
export function solid(L, o = {}, progress) {
  const { size = 80, style = L.mode === 'ipm' ? 'struts' : 'solid', tube = 1.6, base = false, baseThick = 2, cells = 120 } = o;
  const mm = u => u.map(v => v * size);
  const seg = list => { const S = new Float64Array(6 * list.length); list.forEach(([a, b], k) => S.set([...mm(a), ...mm(b)], 6 * k)); return S; };
  const Se = seg(L.edges.map(([i, j]) => [L.V[i], L.V[j]]));
  const Sp = seg(L.path.slice(1).map((p, i) => [L.path[i], p]));
  const rows = L.rows.map(r => [r[0], r[1], r[2], r[3] * size]);
  const VP = Float64Array.from(L.V.flatMap(mm));
  const rs = Math.max(0.8, tube * 0.6), groove = Math.max(0.5, tube * 0.45), ro = tube * 1.9, rv = 1.5 * rs;
  const start = mm(L.path[0]), opt = mm(L.path.at(-1));
  const zcut = style === 'struts' ? -0.4 * rs : 0;
  const ball = (q, r, x, y, z) => Math.sqrt((x - q[0]) ** 2 + (y - q[1]) ** 2 + (z - q[2]) ** 2) - r;
  const reach = Math.max(ro, tube, rv) + 0.5;
  const f = (x, y, z) => {
    let F, Fp = -Infinity;
    for (const r of rows) Fp = Math.max(Fp, r[0] * x + r[1] * y + r[2] * z - r[3]);
    if (style === 'struts') {
      F = Infinity;
      for (let k = 0; k < Se.length; k += 6) F = Math.min(F, segDist(Se, k, x, y, z) - rs);
      for (let k = 0; k < VP.length; k += 3) F = Math.min(F, ball([VP[k], VP[k + 1], VP[k + 2]], rv, x, y, z));
    } else {
      if (Fp < -reach) return Math.max(Fp, zcut - z);
      if (Fp > reach && !base) return Fp;
      let g = Infinity;
      for (let k = 0; k < Se.length; k += 6) g = Math.min(g, segDist(Se, k, x, y, z) - groove);
      F = Math.max(Fp, -g);
    }
    for (let k = 0; k < Sp.length; k += 6) F = Math.min(F, segDist(Sp, k, x, y, z) - tube);
    F = Math.min(F, ball(opt, ro, x, y, z), ball(start, 1.35 * tube, x, y, z));
    F = Math.max(F, zcut - z);
    if (base) F = Math.min(F, Math.max(-baseThick + zcut - z, z - zcut - 0.01, x - size - 6, -6 - x, y - size - 6, -6 - y));
    return F;
  };
  const top = [0, 1, 2].map(d => Math.max(...L.V.map(v => v[d])) * size);
  const pad = ro + 2;
  const lo = [-pad - (base ? 6 : 0), -pad - (base ? 6 : 0), zcut - (base ? baseThick : 0) - 0.5];
  const hi = [top[0] + pad + (base ? 6 : 0), top[1] + pad + (base ? 6 : 0), top[2] + pad];
  const m = implicitSolid(f, [lo, hi], size / cells, { progress });
  onBed(m);
  return m;
}

export const fileName = o => `lp3d_${o.inst || 'klee'}_${o.mode || 'simplex'}${o.mode === 'ipm' ? '' : '_' + (o.rule || 'dantzig')}_${o.style || (o.mode === 'ipm' ? 'struts' : 'solid')}_${o.size}mm${o.base ? '_base' : ''}`;
