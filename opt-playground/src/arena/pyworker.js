// The model of the arena in a Web Worker: Pyodide runs src/arena/translate.py
// over the unmodified modules of aima-python, and answers with the counts and
// a sample of the CNF and of the rows of SATBlock. Nothing here solves.

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const FILES = ['translate.py', 'aima/__init__.py', 'aima/utils.py', 'aima/search.py', 'aima/agents.py',
  'aima/csp.py', 'aima/logic.py'];

let ready = null;
async function boot() {
  const t0 = performance.now();
  importScripts(PYODIDE + 'pyodide.js');
  const py = await self.loadPyodide({ indexURL: PYODIDE });
  const t1 = performance.now();
  py.FS.mkdirTree('/arena/aima');
  await Promise.all(FILES.map(async f => {
    const r = await fetch(new URL(f, self.location.href));
    if (!r.ok) throw new Error(f + ': ' + r.status);
    py.FS.writeFile('/arena/' + f, await r.text());
  }));
  py.runPython("import sys; sys.path.insert(0, '/arena'); import translate");
  const t2 = performance.now();
  self.postMessage({ type: 'ready', pyodide: (t1 - t0) / 1000, modules: (t2 - t1) / 1000 });
  return py;
}

self.onmessage = async e => {
  const { id, instance } = e.data;
  try {
    if (!ready) ready = boot();
    const py = await ready;
    const t0 = performance.now();
    const out = py.runPython(`translate.summary(${JSON.stringify(instance)})`);
    self.postMessage({ type: 'model', id, model: JSON.parse(out), seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
