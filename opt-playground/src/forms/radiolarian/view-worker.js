// The mesh of the view, built off the main thread: a coarse one first, so
// that a change shows at once, then a finer one, unless a newer request has
// replaced this worker meanwhile (the page terminates it). It also sends the
// outer lattice for the map of the cells.

import { viewMesh, stats } from './model.js';

onmessage = ({ data: { o, steps } }) => {
  steps.forEach((h, i) => {
    const { m, sk } = viewMesh(o, h);
    const L = sk.Ls[0];
    const msg = { step: i, last: i === steps.length - 1, pos: m.pos, idx: m.idx };
    if (!i) Object.assign(msg, { lattice: { seeds: L.seeds, verts: L.verts, cells: L.cells }, stats: stats(L), inner: sk.Ls.slice(1).map(stats) });
    postMessage(msg, [m.pos.buffer, m.idx.buffer]);
  });
};
