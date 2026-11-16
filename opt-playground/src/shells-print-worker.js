// Builds the printable solid off the main thread and writes the files asked
// for: 'stl', '3mf' or 'zip' (both in one archive).

import { printMesh, stl, pack3mf, zip, fileName } from './shells-print.js';

onmessage = async ({ data: { p, o, what } }) => {
  try {
    const m = printMesh(p, o, f => postMessage({ progress: f }));
    const name = fileName(p, o), out = {};
    if (what !== '3mf') out.stl = stl(m);
    if (what !== 'stl') out.tmf = await pack3mf(m, 'shell');
    let file, bytes;
    if (what === 'stl') { file = name + '.stl'; bytes = out.stl; }
    else if (what === '3mf') { file = name + '.3mf'; bytes = out.tmf; }
    else { file = name + '.zip'; bytes = await zip([{ name: name + '.stl', data: out.stl }, { name: name + '.3mf', data: out.tmf }]); }
    postMessage({ done: true, file, bytes, tris: m.idx.length / 3, dims: m.dims, onLip: m.onLip }, [bytes.buffer]);
  } catch (e) {
    postMessage({ error: String(e && e.message || e) });
  }
};
