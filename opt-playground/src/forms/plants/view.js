// The worker of the view: the geometry of viewgeom.js off the main thread.

import { build } from './viewgeom.js';

onmessage = ({ data }) => {
  try {
    const r = build(data.o);
    const tr = r.pos ? [r.pos.buffer, r.nrm.buffer, r.idx.buffer, r.lpos.buffer, r.lidx.buffer] : [];
    postMessage({ id: data.id, ...r }, tr);
  } catch (e) {
    postMessage({ id: data.id, error: String(e && e.message || e) });
  }
};
