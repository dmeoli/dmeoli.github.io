// The model of the arena in a Web Worker: Pyodide runs src/arena/translate.py
// over the unmodified modules of aima-python, and answers with the counts and
// a sample of the CNF and of the rows of SATBlock. The runs of the reader
// (src/arena/ownrun.js) run here too, by src/arena/ownrun.py and the
// recorder of the traces, tools/aima_trace.py, loaded at the first of them;
// a run blocks this worker only, never the page.

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const FILES = ['translate.py', 'aima/__init__.py', 'aima/utils.py', 'aima/search.py', 'aima/agents.py',
  'aima/csp.py', 'aima/logic.py'];
// the files of the runs of the reader: [source, name in /arena]
const OWN = [['ownrun.py', 'ownrun.py'], ['../../tools/aima_trace.py', 'aima_trace.py']];

let ready = null, own = null;
async function fetchTo(py, src, name) {
  const r = await fetch(new URL(src, self.location.href), { cache: 'no-cache' });
  if (!r.ok) throw new Error(src + ': ' + r.status);
  py.FS.writeFile('/arena/' + name, await r.text());
}
async function boot() {
  const t0 = performance.now();
  importScripts(PYODIDE + 'pyodide.js');
  // the seed of the hashes of strings fixed, as the recorder fixes it, so that
  // the order of the sets of aima, and with it a run, is the recorded one
  const py = await self.loadPyodide({ indexURL: PYODIDE, env: { PYTHONHASHSEED: '0' } });
  // SortedSet orders the arcs of AC-3, MAC and GAC in aima.csp: the package
  // of Pyodide, a small wheel of pure Python
  await py.loadPackage('sortedcontainers').catch(() => {});
  const t1 = performance.now();
  py.FS.mkdirTree('/arena/aima');
  await Promise.all(FILES.map(f => fetchTo(py, f, f)));
  py.runPython("import sys; sys.path.insert(0, '/arena'); import translate");
  const t2 = performance.now();
  self.postMessage({ type: 'ready', pyodide: (t1 - t0) / 1000, modules: (t2 - t1) / 1000 });
  return py;
}
async function withOwn() {
  const py = await (ready || (ready = boot()));
  if (!own) own = Promise.all(OWN.map(([s, n]) => fetchTo(py, s, n))).then(() => { py.runPython('import ownrun'); return py; });
  return own;
}
// a value handed to Python as JSON, never spliced into its code
function call(py, expr, arg) {
  py.globals.set('_arg', JSON.stringify(arg === undefined ? null : arg));
  return py.runPython(expr);
}

self.onmessage = async e => {
  const { id, instance, custom, type } = e.data;
  try {
    if (type === 'run') {
      const py = await withOwn();
      const t0 = performance.now();
      const text = call(py, 'ownrun.run(_arg)', e.data.spec);
      self.postMessage({ type: 'trace', id, text, seconds: (performance.now() - t0) / 1000 });
      return;
    }
    if (type === 'instance') {
      const py = await (ready || (ready = boot()));
      self.postMessage({ type: 'instance', id, instance: JSON.parse(call(py, 'import json; json.dumps(translate.instance(json.loads(_arg)))', e.data.name)) });
      return;
    }
    if (!ready) ready = boot();
    let py = await ready;
    // an instance drawn by the reader is made known to translate.instance first
    if (custom) { py = await withOwn(); call(py, 'import json; ownrun.register(json.loads(_arg))', custom); }
    const t0 = performance.now();
    const out = call(py, 'import json; translate.summary(json.loads(_arg))', instance);
    self.postMessage({ type: 'model', id, model: JSON.parse(out), seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
