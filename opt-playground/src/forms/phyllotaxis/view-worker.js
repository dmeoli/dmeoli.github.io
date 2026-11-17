// The work of the view of phyllotaxis off the main thread: the mesh of the
// form at the resolution of the screen, the links of Vogel's disc, and once
// the curve of packing against the divergence angle.

import { form, vogel, links, families, packingCurve } from './model.js';

onmessage = ({ data }) => {
  if (data.curve) {
    const { a0, a1, steps } = data.curve, q = packingCurve(a0, a1, steps);
    postMessage({ curve: { a0, a1, steps, q } }, [q.buffer]);
    return;
  }
  const o = data.o, m = form(o, data.res || [300, 200], 40);
  // Vogel's disc of the same florets, its links and its families inside and
  // at the rim
  const V = vogel(m.N, o.alpha), L = Int32Array.from(links(V, m.N));
  const s = Math.sqrt(2 * Math.PI / Math.sqrt(3));
  const inner = families(V, m.N, s, Math.round(0.2 * m.N), Math.round(0.3 * m.N));
  const outer = families(V, m.N, s, Math.round(0.85 * m.N), m.N);
  postMessage({ id: data.id, pos: m.pos, idx: m.idx, cell: m.cell, groove: m.groove, N: m.N, fam: m.fam, petals: m.petals,
    V: Float32Array.from(V), L, inner, outer }, [m.pos.buffer, m.idx.buffer, m.cell.buffer, m.groove.buffer]);
};
