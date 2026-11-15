// The toy sequence tasks of the LSTM scene, generated in the page. A sequence
// is { xs, outs, sym }: the input symbols (indices), the outputs { t, y } to be
// predicted and the characters shown for the symbols.
//   first   T random bits; at the last step, the first bit
//   depth   T brackets (depth at most 4); at every step, the nesting depth
//   count   T bits with 0..5 ones; at the last step, how many ones

export const TASKS = {
  first: { K: 2, sym: ['0', '1'], name: 'the first bit' },
  depth: { K: 5, sym: ['(', ')'], name: 'the nesting depth' },
  count: { K: 6, sym: ['0', '1'], name: 'the number of ones' },
};

export function sample(task, T, r) {
  const xs = [], outs = [];
  if (task === 'first') {
    for (let t = 0; t < T; t++) xs.push(r() < 0.5 ? 0 : 1);
    outs.push({ t: T - 1, y: xs[0] });
  } else if (task === 'depth') {
    let d = 0;
    for (let t = 0; t < T; t++) {
      const open = d === 0 ? true : d === 4 ? false : r() < 0.5;
      d += open ? 1 : -1; xs.push(open ? 0 : 1); outs.push({ t, y: d });
    }
  } else {
    const k = Math.min(T, Math.floor(6 * r())), pos = new Set();
    while (pos.size < k) pos.add(Math.floor(r() * T));
    for (let t = 0; t < T; t++) xs.push(pos.has(t) ? 1 : 0);
    outs.push({ t: T - 1, y: k });
  }
  return { xs, outs, sym: TASKS[task].sym };
}
