// Builds a solid off the main thread and writes its files. The message names
// a module (an absolute URL) and the function in it that returns the mesh,
// called with args and, last, a progress callback f(fraction):
//   { module, fn, args, what: 'stl' | '3mf' | 'zip', name, head, object }
// The answer is { progress } while it works, then { done, file, bytes, tris,
// info } (info: the plain fields of the mesh besides pos and idx), or { error }.

import { printFiles } from './files.js';
import { dims } from './mesh.js';

onmessage = async ({ data: { module, fn, args = [], what, name, head, object } }) => {
  try {
    const mod = await import(module);
    const m = await mod[fn](...args, f => postMessage({ progress: f }));
    const { file, bytes } = await printFiles(m, what, { name: typeof name === 'string' ? name : 'solid', head, object });
    const info = {};
    for (const [k, v] of Object.entries(m)) if (k !== 'pos' && k !== 'idx' && (typeof v !== 'object' || Array.isArray(v))) info[k] = v;
    if (!info.dims) info.dims = dims(m);
    postMessage({ done: true, file, bytes, tris: m.idx.length / 3, info }, [bytes.buffer]);
  } catch (e) {
    postMessage({ error: String(e && e.message || e) });
  }
};
