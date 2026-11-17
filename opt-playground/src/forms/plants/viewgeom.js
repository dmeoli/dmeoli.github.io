// The geometry of the view (the worker of view.js builds it, so that the page
// stays responsive while a large word is derived, and the page builds the
// first one itself): the branches as
// truncated cones in millimetres at the printed size of 80 mm, as in
// model.js, and the leaves, the polygons of the rules or, for the plants
// without them, a small blade at every tip.

import { plant, extent, overhang } from './model.js';
import { radii } from './lsystem.js';

export function build(o) {
  const p = plant(o);
  const { segs, polys } = p, size = 80;
  if (!segs.length) return { empty: true, lengths: p.lengths, modules: p.modules, truncated: p.truncated };
  const tip = Math.max(0.6, o.tip);
  radii(segs, tip, o.exp);
  const [mn, mx] = extent(segs);
  const dz = mx[2] - Math.min(0, mn[2]), dxy = Math.max(mx[0] - mn[0], mx[1] - mn[1]);
  const k = Math.min((size - 2.4 - tip) / Math.max(dz, 1e-9), (size - 2 * tip) / Math.max(dxy, 1e-9));
  const P = [], N = [], I = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const leafTips = [];
  for (const s of segs) {
    const a = s.a.map(x => x * k), b = s.b.map(x => x * k), d = sub(b, a), len = Math.hypot(...d);
    if (len < 1e-9) continue;
    const h = d.map(x => x / len), pick = Math.abs(h[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = nrm(crs(h, pick)), v = crs(h, u);
    const S = s.r0 > 2.5 ? 16 : s.r0 > 1.2 ? 10 : 7, o0 = P.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const c = ring ? b : a, r = ring ? s.r1 : s.r0;
      for (let j = 0; j < S; j++) {
        const t = 2 * Math.PI * j / S, cx = Math.cos(t), sx = Math.sin(t);
        const n = [u[0] * cx + v[0] * sx, u[1] * cx + v[1] * sx, u[2] * cx + v[2] * sx];
        P.push(c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]); N.push(...n);
      }
    }
    for (let j = 0; j < S; j++) {
      const j1 = (j + 1) % S;
      I.push(o0 + j, o0 + j1, o0 + S + j1, o0 + j, o0 + S + j1, o0 + S + j);
    }
    // a joint at the start (a fan towards -h) hides the seams of the forks
    const oc = P.length / 3;
    P.push(a[0] - h[0] * s.r0 * 0.6, a[1] - h[1] * s.r0 * 0.6, a[2] - h[2] * s.r0 * 0.6); N.push(-h[0], -h[1], -h[2]);
    for (let j = 0; j < S; j++) I.push(oc, o0 + (j + 1) % S, o0 + j);
    if (s.tip) {
      const ot = P.length / 3;
      P.push(b[0] + h[0] * s.r1, b[1] + h[1] * s.r1, b[2] + h[2] * s.r1); N.push(...h);
      for (let j = 0; j < S; j++) I.push(ot, o0 + S + j, o0 + S + (j + 1) % S);
      leafTips.push([b, h, u]);
    }
  }
  // the leaves: the polygons of the rules, else a blade at each tip
  const LP = [], LI = [];
  if (polys.length) {
    for (const poly of polys) {
      const o0 = LP.length / 3;
      for (const q of poly) LP.push(q[0] * k, q[1] * k, q[2] * k);
      for (let j = 1; j < poly.length - 1; j++) LI.push(o0, o0 + j, o0 + j + 1);
    }
  } else {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const L = 3.2;
    for (const [b, h, u0] of leafTips) {
      // two blades, turned a little around the twig
      for (let q = 0; q < 2; q++) {
        const t = rnd() * Math.PI, c = Math.cos(t), sn = Math.sin(t), w = crs(h, u0);
        const u = [u0[0] * c + w[0] * sn, u0[1] * c + w[1] * sn, u0[2] * c + w[2] * sn];
        const dir = nrm(h.map((x, i) => x + (q ? 0.8 : -0.8) * u[i] + 0.3 * crs(h, u)[i]));
        const side = nrm(crs(dir, u));
        const o0 = LP.length / 3, m = (s, wv) => b.map((x, i) => x + dir[i] * L * s + side[i] * wv);
        for (const pt of [b, m(0.45, L * 0.28), m(1, 0), m(0.45, -L * 0.28)]) LP.push(...pt);
        LI.push(o0, o0 + 1, o0 + 2, o0, o0 + 2, o0 + 3);
      }
    }
  }
  const oh = overhang(segs);
  let tips = 0;
  for (const s of segs) if (s.tip) tips++;
  return {
    pos: Float32Array.from(P), nrm: Float32Array.from(N), idx: Uint32Array.from(I),
    lpos: Float32Array.from(LP), lidx: Uint32Array.from(LI),
    lengths: p.lengths, modules: p.modules, truncated: p.truncated,
    segs: segs.length, tips, trunk: segs[0].r0, tip, steep: oh.steep, ownLeaves: polys.length > 0,
  };
}
