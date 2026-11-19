// The runs of the reader and the instances the reader draws (the levels
// "changing" and "constructing" of the scenes of the arena). The box "Run it
// yourself", closed at first, runs a solver of aima-python with the options
// the reader picks on the instance of the page, in the Web Worker of the
// model (src/arena/pyworker.js, src/arena/ownrun.py), recorded by the
// recorder of the traces (tools/aima_trace.py); the trace it returns is
// replayed by the page as the lane "Your run", with the timeline, the panels,
// the pseudocode and the questions of every lane. On map coloring and grid
// paths the box "Draw your own instance" (src/arena/editor.js) makes an
// instance whose id holds it whole (mygraph-, mymap-, mygrid-), so that the
// address of the page shares it.

import { t, bi, onLang } from '../i18n.js';
import { openTrace } from './trace.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// the limits of a run, as src/arena/ownrun.py applies them
export const CAP = 5000, SECONDS = 15, MAXEXP = 200000;

// ---------------------------------------------------------------- the worker
let W = null, seq = 0;
const waiting = new Map();
// the one worker of the page, shared with the model of main.js
export function worker() {
  if (W) return W;
  W = new Worker('src/arena/pyworker.js');
  W.addEventListener('message', e => {
    const m = e.data, w = m && waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === 'error') w.reject(new Error(m.message)); else w.resolve(m);
  });
  W.addEventListener('error', e => { for (const w of waiting.values()) w.reject(new Error(e.message || 'worker')); waiting.clear(); });
  return W;
}
function ask(msg) {
  const id = 'own-' + (++seq);
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); worker().postMessage({ ...msg, id }); });
}
export const instanceOf = name => ask({ type: 'instance', name }).then(m => m.instance);

// ---------------------------------------------------------------- the instances drawn
// bytes <-> base64url
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const bitsOut = (bits, bytes) => { for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) if (bits[i + j]) b |= 1 << j; bytes.push(b); } return bytes; };
const bitIn = (bytes, off, i) => (bytes[off + (i >> 3)] >> (i & 7)) & 1;
export const isCustom = id => /^my(graph|map|grid)-/.test(id || '');
const COLS = k => (k === 3 ? ['R', 'G', 'B'] : ['R', 'G', 'B', 'Y']);
const q = v => Math.max(0, Math.min(255, Math.round((v + 1) * 127.5))), uq = b => +(b / 127.5 - 1).toFixed(3);

// a graph of the reader: {k, xy: [[x, y]], edges: [[i, j]]}, x and y in [-1, 1]
export function encodeGraph(g) {
  const n = g.xy.length, bytes = [g.k, n];
  for (const [x, y] of g.xy) bytes.push(q(x), q(y));
  const adj = new Set(g.edges.map(([a, b]) => Math.min(a, b) * 64 + Math.max(a, b))), bits = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) bits.push(adj.has(i * 64 + j) ? 1 : 0);
  return 'mygraph-' + b64(bitsOut(bits, bytes));
}
// regions of a map of maps.json picked by the reader: {map, k, keys (all, in
// the order of maps.json), pick: [indices], edges: [[i, j]] among the picked}
export function encodeMap(m) {
  const pick = new Set(m.pick), bits = m.keys.map((_, i) => (pick.has(i) ? 1 : 0)), list = [...pick].sort((a, b) => a - b);
  const adj = new Set(m.edges.map(([a, b]) => Math.min(a, b) * 256 + Math.max(a, b))), eb = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) eb.push(adj.has(list[i] * 256 + list[j]) ? 1 : 0);
  return `mymap-${m.map}-` + b64(bitsOut(eb, bitsOut(bits, [m.k])));
}
// a grid of the reader: {width, height, start, goal, walls: Set of cells}
export function encodeGrid(g) {
  const n = g.width * g.height, bits = Array.from({ length: n }, (_, c) => (g.walls.has(c) ? 1 : 0));
  return 'mygrid-' + b64(bitsOut(bits, [g.width, g.height, g.start & 255, g.start >> 8, g.goal & 255, g.goal >> 8]));
}
let MAPSJSON = null;
export const maps = () => (MAPSJSON || (MAPSJSON = fetch('assets/arena/maps.json').then(r => r.json()).then(m => m.maps)));
const decoded = new Map();
// the instance behind an id of the reader, in the form of translate.py (a
// graph is the kind "custom" with its points xy) or of the traces of grid
async function decode(id) {
  const [, kind, rest] = /^my(graph|map|grid)-(.*)$/.exec(id);
  if (kind === 'grid') {
    const B = unb64(rest), W = B[0], H = B[1], start = B[2] | (B[3] << 8), goal = B[4] | (B[5] << 8);
    const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (bitIn(B, 6, y * W + x) ? '@' : '.')).join(''));
    return { id, kind: 'grid', width: W, height: H, start, goal, rows, moves: 8 };
  }
  let names, xy, B, off, n;
  if (kind === 'graph') {
    B = unb64(rest); n = B[1];
    names = Array.from({ length: n }, (_, i) => 'v' + (i + 1));
    xy = Array.from({ length: n }, (_, i) => [uq(B[2 + 2 * i]), uq(B[3 + 2 * i])]);
    off = 2 + 2 * n;
  } else {
    const i = rest.indexOf('-'), map = rest.slice(0, i), M = (await maps())[map];
    if (!M) throw new Error('no map ' + map);
    B = unb64(rest.slice(i + 1));
    const keys = Object.keys(M.regions), pick = keys.map((_, j) => j).filter(j => bitIn(B, 1, j));
    names = pick.map(j => keys[j]); xy = pick.map(j => M.regions[keys[j]].label.map(v => +v.toFixed(3)));
    n = names.length; off = 1 + Math.ceil(keys.length / 8);
  }
  const edges = [];
  let b = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (bitIn(B, off, b++)) edges.push([names[i], names[j]]);
  return { id, kind: 'custom', colours: COLS(B[0]), vertices: names, xy, edges };
}
// decodes an id of the reader once, before main.js asks for it
export async function prepare(id) {
  if (!isCustom(id) || decoded.has(id)) return;
  try { decoded.set(id, await decode(id)); } catch (err) { decoded.set(id, null); }
}
export const custom = id => (isCustom(id) && decoded.get(id)) || null;
// the trace that the lane "You" takes its instance from, for an id of the reader
export const playTrace = id => (custom(id) ? { header: { game: API && API.game, instance: custom(id) }, events: [], result: null } : null);
const instLabel = () => t('your instance (drawn below)', 'la tua istanza (disegnata sotto)');
// the option of the instance of the reader in the select of the instances;
// true if id is one
export function instOption(sel, id) {
  if (!isCustom(id) || !custom(id)) return false;
  let o = [...sel.options].find(x => x.value === id);
  if (!o) { o = document.createElement('option'); o.value = id; sel.append(o); }
  o.textContent = instLabel();
  return true;
}

// ---------------------------------------------------------------- the box
// the solvers of aima-python offered on each game
const CSPALG = { queens: ['bt', 'minconf'], coloring: ['bt', 'minconf'], sudoku: ['bt', 'ac3', 'minconf'], zebra: ['bt', 'ac3', 'minconf'],
  kakuro: ['gac'], crypto: ['gac'], crossword: ['gac'] };
const HEUR = { puzzle: [['misplaced tiles', 'misplaced tiles', 'tessere fuori posto'], ['h2', 'Manhattan distance (h2)', 'distanza di Manhattan (h2)']],
  romania: [['straight-line distance', 'straight-line distance to Bucharest', 'distanza in linea d\'aria da Bucarest']],
  grid: [['octile', 'octile distance', 'distanza ottile']] };
const SEARCHALG = ['astar', 'ucs', 'bfs', 'greedy', 'idastar', 'rbfs'];
const NAMES = {
  bt: ['backtracking search (backtracking_search)', 'ricerca con backtracking (backtracking_search)'],
  ac3: ['AC-3 alone (AC3)', 'AC-3 da solo (AC3)'],
  minconf: ['min-conflicts (min_conflicts)', 'min-conflicts (min_conflicts)'],
  gac: ['GAC with domain splitting (ACSolver)', 'GAC con suddivisione dei domini (ACSolver)'],
  astar: ['A* (astar_search), f = g + w h', 'A* (astar_search), f = g + w h'],
  ucs: ['uniform cost (uniform_cost_search)', 'costo uniforme (uniform_cost_search)'],
  bfs: ['breadth-first (breadth_first_graph_search)', 'in ampiezza (breadth_first_graph_search)'],
  greedy: ['greedy best-first (best_first_graph_search, f = h)', 'best-first golosa (best_first_graph_search, f = h)'],
  idastar: ['IDA* (iterative_deepening_astar_search)', 'IDA* (iterative_deepening_astar_search)'],
  rbfs: ['RBFS (recursive_best_first_search)', 'RBFS (recursive_best_first_search)'] };

let API = null, RUN = null, BOX = null, busy = false;
const algos = g => CSPALG[g] || (HEUR[g] ? SEARCHALG : null);

// the runs of the reader as lanes of main.js, for the instance id
export const lanes = id => (RUN && RUN.inst === id ? [{ file: 'own:' + RUN.n, tr: RUN.tr }] : []);
// the lane of a run of the reader, once main.js has built it
export function decorate(L) {
  L.own = true;
  L.art.classList.add('own');
  RUN.L = L;
  laneTitle();
}
function laneTitle() {
  const L = RUN && RUN.L;
  if (!L || !L.art.isConnected) return;
  L.art.querySelector('h3').textContent = t('Your run: ', 'La tua esecuzione: ') + L.tr.header.solver.name;
}

// api: { game, inst() the id of the instance, reload() the lanes again,
// lanes() those of main.js, choose(id) an instance, base() the box after which the boxes go }
export function init(api) {
  API = api;
  const g = api.game, A = algos(g);
  BOX = document.createElement('details');
  BOX.className = 'ownrun'; BOX.id = 'ownrun';
  const where = document.querySelector('.timeline');
  where.after(BOX);
  // the editor of instances, before this box, on the games that have one
  if (g === 'coloring' || g === 'grid') import('./editor.js').then(m => m.attach(BOX, api)).catch(err => window.__arena && window.__arena.errors.push('editor: ' + err.message));
  if (!A) {
    BOX.innerHTML = `<summary>${bi('Run it yourself', 'Esegui tu')}</summary><p class="onote">${g === 'planning' ? bi(
      'The planners of aima-python of this page are not offered as runs of your own yet: a run of your own is offered on the pages of the CSPs, of the sliding puzzle, of Romania and of the grid.',
      'I pianificatori di aima-python di questa pagina non sono ancora offerti come esecuzioni tue: un\'esecuzione tua si può fare nelle pagine dei CSP, del gioco del 15, della Romania e della griglia.') : bi(
      'The lanes of this page come from SMS++ and PBeFS, compiled programs that cannot run in a browser, and aima-python, which runs in the page, has no solver of this game; so a run of your own is offered only on the pages of the CSPs, of the sliding puzzle, of Romania and of the grid.',
      'Le corsie di questa pagina vengono da SMS++ e da PBeFS, programmi compilati che non possono girare in un browser, e aima-python, che gira nella pagina, non ha un solutore di questo gioco; quindi un\'esecuzione tua si può fare solo nelle pagine dei CSP, del gioco del 15, della Romania e della griglia.')}</p>`;
    return;
  }
  const search = !!HEUR[g];
  const opt = (v, en, it) => `<option value="${esc(v)}">${esc(t(en, it))}</option>`;
  BOX.innerHTML = `<summary>${bi('Run it yourself', 'Esegui tu')}</summary>
    <p class="onote"></p>
    <div class="oform">
      <label><span class="olab"></span><select class="oalg"></select></label>
      <label class="o-bt"><input type="checkbox" class="omrv" checked> <span class="tmrv"></span></label>
      <label class="o-bt"><input type="checkbox" class="olcv"> <span class="tlcv"></span></label>
      <label class="o-bt"><span class="tinf"></span><select class="oinf"></select></label>
      <label class="o-minconf"><span class="tsteps"></span><input type="number" class="osteps" min="1" max="100000" value="5000"></label>
      <label class="o-minconf"><span class="tseed"></span><input type="number" class="oseed" min="0" max="9999" value="1"></label>
      <label class="o-h"><span class="th"></span><select class="oh"></select></label>
      <label class="o-w"><span class="tw"></span><input type="number" class="ow" min="0" max="10" step="0.5" value="1"></label>
      <button type="button" class="ogo"></button>
    </div>
    <p class="ostatus" role="status" aria-live="polite"></p>`;
  const form = BOX.querySelector('.oform');
  const fill = () => {
    BOX.querySelector('.onote').textContent = t(
      `Pick a solver of aima-python and its options: it runs on the instance of the page, in a Python of the page (Pyodide, in a worker, so the page stays usable), recorded as the traces of aima-python are, and its trace appears as the lane "Your run", which the timeline, the panels, the pseudocode and "predict" treat as any other lane. A run stops after ${CAP} events${search ? ` (${MAXEXP} expansions)` : ''} or ${SECONDS} s, and then says so. Only the solvers of aima-python can run here: those of SMS++ and of PBeFS are compiled programs that do not run in a browser.`,
      `Scegli un solutore di aima-python e le sue opzioni: gira sull'istanza della pagina, in un Python della pagina (Pyodide, in un worker, così la pagina resta utilizzabile), registrato come le tracce di aima-python, e la sua traccia compare come la corsia "La tua esecuzione", che la linea del tempo, i pannelli, lo pseudocodice e "prevedi" trattano come ogni altra corsia. Un'esecuzione si ferma dopo ${CAP} eventi${search ? ` (${MAXEXP} espansioni)` : ''} o ${SECONDS} s, e allora lo dice. Qui possono girare solo i solutori di aima-python: quelli di SMS++ e di PBeFS sono programmi compilati che non girano in un browser.`);
    const a = form.querySelector('.oalg'), av = a.value;
    a.innerHTML = A.map(x => opt(x, ...NAMES[x])).join(''); a.value = av || A[0];
    const inf = form.querySelector('.oinf'), iv = inf.value;
    inf.innerHTML = opt('fc', 'forward checking', 'forward checking') + opt('mac', 'MAC (maintained arc consistency)', 'MAC (consistenza d\'arco mantenuta)') + opt('none', 'none', 'nessuna');
    inf.value = iv || 'fc';
    if (search) {
      const h = form.querySelector('.oh'), hv = h.value;
      h.innerHTML = HEUR[g].map(([v, en, it]) => opt(v, en, it)).join('') + opt('', 'none (h = 0)', 'nessuna (h = 0)');
      h.value = !h.dataset.set ? HEUR[g][g === 'puzzle' ? 1 : 0][0] : hv;
      h.dataset.set = '1';
    }
    const T = (c, en, it) => { form.querySelector(c).textContent = t(en, it); };
    T('.olab', 'solver', 'solutore'); T('.tmrv', 'MRV: the variable with fewest values left first', 'MRV: prima la variabile con meno valori rimasti');
    T('.tlcv', 'LCV: the value that rules out fewest first', 'LCV: prima il valore che ne esclude meno');
    T('.tinf', 'inference', 'inferenza'); T('.tsteps', 'max steps', 'passi massimi'); T('.tseed', 'seed', 'seme');
    T('.th', 'heuristic h', 'euristica h'); T('.tw', 'weight w', 'peso w'); T('.ogo', 'Run', 'Esegui');
    shown();
  };
  const shown = () => {
    const a = form.querySelector('.oalg').value;
    form.querySelectorAll('.o-bt').forEach(x => { x.hidden = a !== 'bt'; });
    form.querySelectorAll('.o-minconf').forEach(x => { x.hidden = a !== 'minconf'; });
    form.querySelector('.o-h').hidden = !search || a === 'bfs' || a === 'ucs';
    form.querySelector('.o-w').hidden = a !== 'astar';
  };
  form.querySelector('.oalg').onchange = shown;
  form.querySelector('.ogo').onclick = () => go(form);
  fill();
  onLang(() => { fill(); laneTitle(); const s = API.inst(); const sel = $('inst'); if (sel && isCustom(s)) instOption(sel, s); if (MSG) status(MSG); });
}
let MSG = null;
function status(m) {
  MSG = m;
  const p = BOX.querySelector('.ostatus');
  p.textContent = typeof m === 'function' ? m() : m;
}
const say = (en, it) => () => t(en, it);

// the instance of a search game as the page has it: the instance of the
// reader, or the instance of a trace of the page
async function searchInst(id) {
  if (custom(id)) return custom(id);
  const L = API.lanes().find(L => L.tr.header.instance && L.tr.header.instance.id === id);
  if (L) return L.tr.header.instance;
  const idx = await fetch(`traces/games/${API.game}/index.json`).then(r => r.json());
  const x = idx.traces.find(x => x.instance === id);
  if (!x) return null;
  const r = await fetch(`traces/games/${API.game}/${x.file}`).then(r => r.text());
  return JSON.parse(r.slice(0, r.indexOf('\n'))).instance;
}
async function go(form) {
  if (busy) return;
  const g = API.game, id = API.inst(), algo = form.querySelector('.oalg').value;
  const opts = { mrv: form.querySelector('.omrv').checked, lcv: form.querySelector('.olcv').checked, inference: form.querySelector('.oinf').value,
    steps: Math.max(1, Math.min(100000, parseInt(form.querySelector('.osteps').value, 10) || 5000)),
    seed: Math.max(0, parseInt(form.querySelector('.oseed').value, 10) || 0),
    h: form.querySelector('.oh').value, w: Math.max(0, Math.min(10, parseFloat(form.querySelector('.ow').value) || 1)) };
  const spec = { game: g, name: id, algo, opts, cap: CAP, seconds: SECONDS, custom: custom(id) };
  if (HEUR[g] && g !== 'romania') {
    spec.inst = await searchInst(id).catch(() => null);
    if (!spec.inst) { status(say('The instance of the page is not loaded yet.', 'L\'istanza della pagina non è ancora caricata.')); return; }
    if (g === 'puzzle' && spec.inst.side !== 3) {
      status(say('EightPuzzle of aima-python is 3 x 3: choose an instance of the 8-puzzle to run it.', 'EightPuzzle di aima-python è 3 x 3: scegli un\'istanza del gioco dell\'8 per eseguirlo.'));
      return;
    }
  }
  busy = true;
  const btn = form.querySelector('.ogo'); btn.disabled = true;
  status(say('Running in the Python of the page (the first run also loads Pyodide and aima-python, which takes a few seconds)...',
    'Esecuzione nel Python della pagina (la prima carica anche Pyodide e aima-python, il che richiede qualche secondo)...'));
  try {
    const m = await ask({ type: 'run', spec });
    const url = URL.createObjectURL(new Blob([m.text], { type: 'application/x-ndjson' }));
    const tr = await openTrace({ url });
    URL.revokeObjectURL(url);
    if (API.inst() !== id) return;
    RUN = { inst: id, n: (RUN ? RUN.n : 0) + 1, tr };
    status(endWords(tr));
    window.__arena && (window.__arena.own = { status: tr.result.status, events: tr.events.length, stopped: tr.result.stopped || null, solver: tr.header.solver.name });
    await API.reload();
    const L = RUN.L;
    if (L) { const box = $('lanes'); box.scrollLeft = L.art.offsetLeft - box.offsetLeft - 8; }
  } catch (err) {
    status(say('The run failed: ' + err.message, 'L\'esecuzione non è riuscita: ' + err.message));
    if (window.__arena) window.__arena.errors.push('own run: ' + err.message);
  } finally {
    busy = false; btn.disabled = false;
  }
}
// what the end of a run of the reader says, with the limit it reached
function endWords(tr) {
  const r = tr.result, n = tr.events.length;
  const lim = { events: [`it stopped at the limit of ${CAP} events`, `si è fermata al limite di ${CAP} eventi`],
    time: [`it stopped at the limit of ${SECONDS} s`, `si è fermata al limite di ${SECONDS} s`],
    expansions: [`it stopped at the limit of ${MAXEXP} expansions`, `si è fermata al limite di ${MAXEXP} espansioni`],
    steps: ['min-conflicts used all its steps without a solution', 'min-conflicts ha usato tutti i suoi passi senza una soluzione'],
    recursion: ['it stopped because its recursion went deeper than Python allows', 'si è fermata perché la sua ricorsione è andata più a fondo di quanto Python consenta'] }[r.stopped];
  const st = { sat: ['a solution', 'una soluzione'], optimal: ['an optimal solution', 'una soluzione ottima'], feasible: ['a solution, not proved optimal', 'una soluzione, senza prova di ottimalità'],
    unsat: ['no solution exists', 'non esiste soluzione'], infeasible: ['no path exists', 'non esiste un cammino'], 'arc consistent': ['every arc consistent, cells still open', 'ogni arco consistente, celle ancora aperte'],
    limit: ['no solution yet', 'ancora nessuna soluzione'] }[r.status] || [r.status, r.status];
  const cost = typeof r.cost === 'number' ? [`, cost ${+r.cost.toFixed(4)}`, `, costo ${+r.cost.toFixed(4)}`] : ['', ''];
  const samp = r.capped && tr.header.sampling ? [` (the expansions kept evenly, ${tr.header.sampling.expansions_kept} of ${r.stats.expanded})`, ` (le espansioni tenute in modo uniforme, ${tr.header.sampling.expansions_kept} su ${r.stats.expanded})`] : ['', ''];
  return () => t(`Done: ${st[0]}${cost[0]}, ${n} events${samp[0]}${lim ? '; ' + lim[0] : ''}. The lane "Your run" replays it.`,
    `Fatto: ${st[1]}${cost[1]}, ${n} eventi${samp[1]}${lim ? '; ' + lim[1] : ''}. La corsia "La tua esecuzione" la ripete.`);
}
