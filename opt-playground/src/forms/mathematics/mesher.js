// The worker that builds the mesh shown by a page of the group Mathematics,
// so that the page keeps answering while a fine grid is traced: the message
// names a module (an absolute URL), the function in it and its arguments,
//   { id, module, fn, args }
// and the answer is { id, progress } while it works, then { id, pos, idx,
// info } (info: the plain fields of the mesh besides pos and idx), or
// { id, error }.

onmessage = async ({ data: { id, module, fn, args = [] } }) => {
  try {
    const mod = await import(module);
    const m = await mod[fn](...args, f => postMessage({ id, progress: f }));
    const info = {};
    for (const [k, v] of Object.entries(m)) if (k !== 'pos' && k !== 'idx' && (typeof v !== 'object' || Array.isArray(v))) info[k] = v;
    postMessage({ id, pos: m.pos, idx: m.idx, info }, [m.pos.buffer, m.idx.buffer]);
  } catch (e) {
    postMessage({ id, error: String(e && e.message || e) });
  }
};
