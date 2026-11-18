// The solver arena (docs/study-search-games.md, section 5): one page per
// game, named by <body data-game>, with an instance and 1 to 4 lanes, each
// the replay of a trace of a solver of SMS++ or of PBeFS on that instance, in
// step on one timeline; for map colouring, under them the model the solvers
// read, computed in the page by aima-python in Pyodide. The page solves
// nothing: the boards change only as the traces say.
//
// The lanes stand on one row, of equal width, and each is a subgrid of the
// same five rows (header, counters, event, board, the panel of its
// paradigm), so that the parts of the lanes sit on the same lines.

import { t, bi, onLang } from '../i18n.js';
import { openTrace, Replay, timed } from './trace.js';
import { BoardView } from './view3d.js';
import { drawTree } from './tree.js';
import { SearchReplay, PuzzleView, GridView, drawStrip, WORKERS } from './search.js';
import { CubeView } from './cube.js';
import { QueensView, SudokuView } from './cells.js';
import { HanoiView } from './hanoi.js';
import { GraphView } from './graph.js';
import { PlanView } from './plan.js';
import { CellGridView, ZebraView } from './puzzles.js';
import { KnapsackView } from './knapsack.js';
import { PancakeView, TopSpinView } from './stacks.js';

const $ = id => document.getElementById(id);
const GAME = document.body.dataset.game;
const MAXLANES = 4;
const STATE = { inst: '', lanes: [], align: 'event', speed: 1, pos: 0, playing: false };
const BASE = `traces/games/${GAME}/`;
// the games whose traces come from SMS++ on a CNF, whose model the page
// computes by aima-python; the others are searches of PBeFS
const SAT = ['coloring', 'queens', 'sudoku', 'zebra', 'kakuro', 'crypto', 'crossword'].includes(GAME);
// the CSPs with constraints on more than two variables, drawn on the cells of their grid
const NARY = ['kakuro', 'crypto', 'crossword'].includes(GAME);
// the instances offered are those of the traces, but for map colouring
const LISTED = GAME !== 'coloring';
// the games whose board is a set of places (cells, cities) marked by the trace
const SETBOARD = new Set(['grid', 'romania']);
// the games with no strip of the frontier under the board
const NOSTRIP = new Set(['grid', 'romania', 'planning']);
// the lanes in this order, the first four shown by default
const SOLVERS = ['cadical', 'aima-gac', 'aima-cdcl', 'aima-bt-mac', 'aima-minconf', 'aima-bt-fc', 'aima-ac3', 'aima-dpll', 'aima-walksat', 'highs'];
// a trace of the minimum sum colouring of an instance, and the name of a lane
const MINSUM = file => /-minsum-/.test(file);
const laneName = (file, name) => name + (MINSUM(file) ? t(', minimum sum', ', somma minima') : '');
// the names of the instances of the search games
const INSTNAMES = {
  '8puzzle-easy': ['8-puzzle, easy (30 random moves, seed 2)', 'gioco dell\'8, facile (30 mosse casuali, seme 2)'],
  '8puzzle-medium': ['8-puzzle, medium (60 random moves, seed 1)', 'gioco dell\'8, medio (60 mosse casuali, seme 1)'],
  '8puzzle-hard': ['8-puzzle, hard (fig. 3.28 of AIMA)', 'gioco dell\'8, difficile (fig. 3.28 di AIMA)'],
  '15puzzle-korf79': ['15-puzzle, instance 79 of Korf', 'gioco del 15, istanza 79 di Korf'],
  'grid64-1': ['64 x 64 grid, a quarter blocked, seed 1', 'griglia 64 x 64, un quarto bloccato, seme 1'],
  'grid64-2': ['64 x 64 grid, a quarter blocked, seed 2', 'griglia 64 x 64, un quarto bloccato, seme 2'],
  'cube-walk5': ['5 random moves, seed 1', '5 mosse casuali, seme 1'],
  'cube-walk10': ['10 random moves, seed 2', '10 mosse casuali, seme 2'],
  'cube-walk13': ['13 random moves, seed 3', '13 mosse casuali, seme 3'],
  'hanoi-8': ['8 disks, all from the first peg to the last', '8 dischi, tutti dal primo piolo all\'ultimo'],
  'hanoi-10': ['10 disks, all from the first peg to the last', '10 dischi, tutti dal primo piolo all\'ultimo'],
  romania: ['from Arad to Bucharest', 'da Arad a Bucarest'],
  sussman: ['three blocks, the Sussman anomaly', 'tre blocchi, l\'anomalia di Sussman'],
  'spare-tire': ['the spare tire', 'la ruota di scorta'], 'have-cake': ['have the cake and eat it too', 'avere la torta e mangiarla'],
  'air-cargo': ['air cargo', 'trasporto aereo di merci'],
  'queens-8': ['8 queens', '8 regine'], 'queens-12': ['12 queens', '12 regine'], 'queens-20': ['20 queens', '20 regine'],
  'sudoku-easy1': ['easy1 of aima-python', 'easy1 di aima-python'], 'sudoku-harder1': ['harder1 of aima-python', 'harder1 di aima-python'],
  zebra: ['the zebra puzzle of aima-python', 'il problema della zebra di aima-python'],
  'kakuro-2': ['kakuro2 of aima-python (3 x 3)', 'kakuro2 di aima-python (3 x 3)'],
  'kakuro-3': ['kakuro3 of aima-python (7 x 5)', 'kakuro3 di aima-python (7 x 5)'],
  'kakuro-4': ['kakuro4 of aima-python (14 x 14)', 'kakuro4 di aima-python (14 x 14)'],
  'crypto-send': ['SEND + MORE = MONEY', 'SEND + MORE = MONEY'], 'crypto-two': ['TWO + TWO = FOUR', 'TWO + TWO = FOUR'],
  'crossword-1': ['crossword1 of aima-python, with words1', 'crossword1 di aima-python, con words1'],
  'knapsack-20': ['20 items, weakly correlated, seed 1', '20 oggetti, debolmente correlati, seme 1'],
  'knapsack-30': ['30 items, weakly correlated, seed 1', '30 oggetti, debolmente correlati, seme 1'],
  'pancake-10': ['10 pancakes, a random stack (seed 1)', '10 frittelle, una pila casuale (seme 1)'],
  'pancake-14': ['14 pancakes, a random stack (seed 1)', '14 frittelle, una pila casuale (seme 1)'],
  'topspin-walk20': ['12 tokens, 20 random moves from the goal (seed 1)', '12 gettoni, 20 mosse casuali dall\'obiettivo (seme 1)'],
  'topspin-random': ['12 tokens, a random ring (seed 1)', '12 gettoni, un anello casuale (seme 1)'] };
const info = window.__arena = { errors: [], pyodide: null, modelSeconds: null, game: GAME, lanes: () => lanes };
window.addEventListener('error', e => { if (!/ResizeObserver loop/.test(e.message)) info.errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', e => info.errors.push(String(e.reason && e.reason.message || e.reason)));

let INDEX = [], MAPS = {}, lanes = [];

// ---------------------------------------------------------------- the address
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('inst')) STATE.inst = h.get('inst');
  if (h.has('lanes')) STATE.lanes = h.get('lanes').split(',').filter(Boolean).slice(0, MAXLANES);
  if (h.get('align')) STATE.align = h.get('align');
}
function writeHash() {
  const h = new URLSearchParams({ inst: STATE.inst, lanes: STATE.lanes.join(','), align: STATE.align });
  history.replaceState(null, '', '#' + h.toString());
}

// ---------------------------------------------------------------- instance
let COLOURINST = '';
function instId() {
  const v = $('inst').value;
  if (LISTED || v !== 'planar') return v;
  return `planar-${$('level').value}-${Math.max(0, parseInt($('seed').value, 10) || 0)}`;
}
function showInstControls() {
  if (LISTED) {
    const ids = [...new Set(INDEX.map(x => x.instance))];
    $('inst').innerHTML = ids.map(id => `<option value="${id}">${esc(INSTNAMES[id] ? t(...INSTNAMES[id]) : id)}</option>`).join('');
    if (!ids.includes(STATE.inst)) STATE.inst = ids[0] || '';
    $('inst').value = STATE.inst;
    return;
  }
  if ($('inst').innerHTML !== COLOURINST) $('inst').innerHTML = COLOURINST;
  if (!STATE.inst) STATE.inst = 'australia';
  const planar = STATE.inst.startsWith('planar-');
  $('inst').value = planar ? 'planar' : STATE.inst;
  $('planarbox').hidden = !planar;
  if (planar) { const [, l, s] = STATE.inst.split('-'); $('level').value = l; $('seed').value = s; }
}
const tracesFor = id => INDEX.filter(x => x.instance === id);

// ---------------------------------------------------------------- the model
let worker = null, modelReq = 0;
function model(id) {
  if (!SAT) return;
  const box = $('model'), req = ++modelReq;
  if (!worker) {
    worker = new Worker('src/arena/pyworker.js');
    worker.onerror = e => { info.errors.push('worker: ' + (e.message || 'failed')); box.dataset.state = 'error'; $('mstatus').textContent = t('Python could not be loaded in this browser.', 'Non è stato possibile caricare Python in questo browser.'); };
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'ready') { info.pyodide = m.pyodide + m.modules; info.ready = m; return; }
      if (m.id !== modelReq) return;
      if (m.type === 'error') { info.errors.push('python: ' + m.message); box.dataset.state = 'error'; $('mstatus').textContent = m.message; return; }
      info.modelSeconds = m.seconds;
      box.dataset.state = 'done';
      renderModel(m.model);
      if (!lanes.length && GAME === 'coloring') emptyBoard(m.model.instance);
    };
  }
  box.dataset.state = 'loading';
  $('mstatus').textContent = t('Loading Python (Pyodide) and the modules of aima-python in the page...',
    'Carico Python (Pyodide) e i moduli di aima-python nella pagina...');
  worker.postMessage({ id: req, instance: id });
}
let lastModel = null;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderModel(m) {
  lastModel = m;
  if (!m) return;
  const r = info.ready;
  $('mstatus').textContent = r ? t(`Pyodide started in ${r.pyodide.toFixed(1)} s and imported aima-python in ${r.modules.toFixed(1)} s, in this browser; the translation took ${(info.modelSeconds * 1000).toFixed(0)} ms.`,
    `Pyodide è partito in ${r.pyodide.toFixed(1)} s e ha importato aima-python in ${r.modules.toFixed(1)} s, in questo browser; la traduzione ha richiesto ${(info.modelSeconds * 1000).toFixed(0)} ms.`) : '';
  const csp = GAME !== 'coloring', c = m.cnf;
  const kinds = { alo: csp ? t('at least one value per variable', 'almeno un valore per variabile') : t('at least one colour per vertex', 'almeno un colore per vertice'),
    amo: csp ? t('at most one value per variable', 'al più un valore per variabile') : t('at most one colour per vertex', 'al più un colore per vertice'),
    edge: csp ? t('two values that the constraint of two neighbours rejects', 'due valori che il vincolo di due vicini respinge') : t('the two ends of an edge differ', 'i due estremi di un lato differiscono'),
    nary: t('a prefix of the tuples that a constraint on more than two variables rejects', 'un prefisso delle tuple che un vincolo su più di due variabili respinge'),
    given: t('a value outside the domain (the givens)', 'un valore fuori dal dominio (i dati del problema)') };
  for (const g of Object.keys(kinds)) if (!m.sample[g] || !m.sample[g].length) delete kinds[g];
  const what = { coloring: [t('One variable per vertex, its colour; one constraint "different" per edge.', 'Una variabile per vertice, il suo colore; un vincolo "diverso" per lato.'), 'MapColoringSAT'],
    queens: [t('NQueensCSP of aima-python: one variable per column, the row of its queen; one constraint per pair of columns, no shared row or diagonal.', 'NQueensCSP di aima-python: una variabile per colonna, la riga della sua regina; un vincolo per coppia di colonne, nessuna riga o diagonale in comune.'), 'translate_csp'],
    sudoku: [t('Sudoku of aima-python: one variable per cell, its digit (a given has a domain of one digit); one constraint "different" per pair of cells in a row, column or box.', 'Sudoku di aima-python: una variabile per cella, la sua cifra (un dato ha un dominio di una cifra); un vincolo "diverso" per coppia di celle in una riga, colonna o riquadro.'), 'translate_csp'],
    zebra: [t('Zebra of aima-python: one variable per attribute (a colour, a pet, a drink, a nationality, a smoke), its house from 1 to 5; one constraint per pair of attributes of a group (different houses) and per clue.', 'Zebra di aima-python: una variabile per attributo (un colore, un animale, una bevanda, una nazionalità, un tipo di sigaretta), la sua casa da 1 a 5; un vincolo per coppia di attributi di un gruppo (case diverse) e per indizio.'), 'translate_csp'],
    kakuro: [t('Kakuro of aima-python, a NaryCSP: one variable per white cell, its digit; for each run of cells a constraint of sum and one of all different, on the whole run.', 'Kakuro di aima-python, un NaryCSP: una variabile per cella bianca, la sua cifra; per ogni sequenza di celle un vincolo di somma e uno di tutte diverse, sull\'intera sequenza.'), 'translate_csp'],
    crypto: [t('A NaryCSP of aima-python: one variable per letter, its digit, and one per carry; all the letters different, and one constraint per column of the sum on its letters and carries.', 'Un NaryCSP di aima-python: una variabile per lettera, la sua cifra, e una per riporto; tutte le lettere diverse, e un vincolo per colonna della somma sulle sue lettere e sui riporti.'), 'translate_csp'],
    crossword: [t('Crossword of aima-python, a NaryCSP: one variable per white cell, its letter; one constraint per run of cells, which must spell a word of the list.', 'Crossword di aima-python, un NaryCSP: una variabile per cella bianca, la sua lettera; un vincolo per sequenza di celle, che deve formare una parola dell\'elenco.'), 'translate_csp'] }[GAME];
  const list = (g, f) => m.sample[g].map(s => `<li><code>${esc(f(s))}</code></li>`).join('');
  $('mcsp').innerHTML = `<dl class="stats"><div><dt>${t('variables', 'variabili')}</dt><dd>${m.csp.variables}</dd></div>
    <div><dt>${t('domain', 'dominio')}</dt><dd>${m.instance.colours.length > 9 ? m.instance.colours.length + ' ' + t('values', 'valori') : m.instance.colours.join(' ')}</dd></div>
    <div><dt>${t('constraints', 'vincoli')}</dt><dd>${m.csp.constraints}</dd></div></dl>
    <p class="note">${what[0]}</p>`;
  $('mcnf').innerHTML = `<dl class="stats"><div><dt>${t('variables', 'variabili')}</dt><dd>${c.variables}</dd></div>
    <div><dt>${t('clauses', 'clausole')}</dt><dd>${c.clauses}</dd></div><div><dt>${t('distinct', 'distinte')}</dt><dd>${c.distinct}</dd></div></dl>
    <p class="note">${NARY ? t(`A Boolean variable <code>v_c</code> for each variable v and value c, the direct encoding of the CSP. A constraint "all different" becomes the pairs of values it rejects; any other constraint becomes, for each prefix of a tuple it accepts and each value of the next variable that no accepted tuple has after it, the clause that forbids both; the tuples are asked of the constraint of aima-python.`,
      `Una variabile booleana <code>v_c</code> per variabile v e valore c, la codifica diretta del CSP. Un vincolo "tutte diverse" diventa le coppie di valori che respinge; ogni altro vincolo diventa, per ogni prefisso di una tupla che accetta e ogni valore della variabile successiva che nessuna tupla accettata ha dopo di esso, la clausola che li vieta insieme; le tuple sono chieste al vincolo di aima-python.`)
      : csp ? t(`A Boolean variable <code>v_c</code> for each variable v and value c, the direct encoding of the CSP: the pairs of values that a constraint rejects are asked of the constraint of aima-python.`,
      `Una variabile booleana <code>v_c</code> per variabile v e valore c, la codifica diretta del CSP: le coppie di valori che un vincolo respinge sono chieste al vincolo di aima-python.`)
      : t(`A Boolean variable <code>v_c</code> for each vertex v and colour c. The edge clauses are written once from each end, so the ${c.by_kind.edge} of them are ${c.by_kind.edge / 2} distinct ones twice.`,
      `Una variabile booleana <code>v_c</code> per vertice v e colore c. Le clausole dei lati sono scritte una volta da ciascun estremo, quindi le ${c.by_kind.edge} sono ${c.by_kind.edge / 2} distinte, ognuna due volte.`)}</p>
    ${Object.keys(kinds).map(g => `<p class="kind">${kinds[g]} (${c.by_kind[g]})</p><ul class="cl">${list(g, s => s.text)}</ul>`).join('')}`;
  $('mmilp').innerHTML = `<dl class="stats"><div><dt>${t('columns', 'colonne')}</dt><dd>${m.milp.columns}</dd></div>
    <div><dt>${t('rows', 'righe')}</dt><dd>${m.milp.rows}</dd></div><div><dt>${t('nonzeros', 'non zeri')}</dt><dd>${m.milp.nonzeros}</dd></div></dl>
    <p class="note">${t(`As SATBlock represents a CNF: a binary x per variable (${m.milp.x}), a binary r per clause (${m.milp.r}, fixed to 0 since every clause is hard), and the row \\(\\sum_{P} x_i - \\sum_{N} x_i + r_c \\ge 1 - |N|\\) per clause.`,
      `Come SATBlock rappresenta una CNF: una x binaria per variabile (${m.milp.x}), una r binaria per clausola (${m.milp.r}, fissata a 0 perché ogni clausola è dura), e la riga \\(\\sum_{P} x_i - \\sum_{N} x_i + r_c \\ge 1 - |N|\\) per clausola.`)}</p>
    ${Object.keys(kinds).map(g => `<ul class="cl">${list(g, s => s.row)}</ul>`).join('')}`;
  if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([$('mmilp')]).catch(() => {});
}

// ---------------------------------------------------------------- the events in words
const litText = (sym, l) => {
  const s = sym[Math.abs(l) - 1] || String(Math.abs(l)), i = s.lastIndexOf('_');
  return i < 0 ? (l > 0 ? s : '¬' + s) : s.slice(0, i) + (l > 0 ? ' = ' : ' ≠ ') + s.slice(i + 1);
};
function describeSearch(rep, e) {
  const W = rep.tr.header.workers > 1 ? (w => t(`Worker ${w + 1}`, `Il worker ${w + 1}`)) : () => t('The search', 'La ricerca');
  const N = rep.tr.result ? rep.tr.result.path.length - 1 : 0;
  switch (e.type) {
    case 'expand':
      if (GAME === 'planning') return /^backward/.test(rep.tr.header.solver.config.algorithm)
        ? t(`The search regresses a subgoal ${fmt(e.g)} actions before the goal.`, `La ricerca regredisce un sottobiettivo ${fmt(e.g)} azioni prima dell'obiettivo.`)
        : t(`The search expands a state reached in ${fmt(e.g)} actions.`, `La ricerca espande uno stato raggiunto in ${fmt(e.g)} azioni.`);
      return t(`${W(e.w)} expands a state with g ${fmt(e.g)}, h ${fmt(e.h)}, f ${fmt(e.f)}.`,
      `${W(e.w)} espande uno stato con g ${fmt(e.g)}, h ${fmt(e.h)}, f ${fmt(e.f)}.`);
    case 'level': return t(`Level ${e.g} of the planning graph: ${e.n.propositions} propositions, ${e.n.actions} actions, ${e.n.mutexes} mutexes.`,
      `Livello ${e.g} del grafo di pianificazione: ${e.n.propositions} proposizioni, ${e.n.actions} azioni, ${e.n.mutexes} mutex.`);
    case 'threshold': return t(`A new iteration, with threshold ${fmt(e.g)} on f.`, `Una nuova iterazione, con soglia ${fmt(e.g)} su f.`);
    case 'solution': return t(`${W(e.w)} reaches the goal with cost ${fmt(e.cost)}.`, `${W(e.w)} raggiunge l'obiettivo con costo ${fmt(e.cost)}.`);
    case 'path': return e.i === 0 ? t(`The solution path, ${N} moves: the start.`, `Il cammino soluzione, ${N} mosse: la partenza.`)
      : t(`The solution path: move ${e.i} of ${N}${e.move ? ', ' + e.move : ''}.`, `Il cammino soluzione: mossa ${e.i} di ${N}${e.move ? ', ' + e.move : ''}.`);
    default: return e.type;
  }
}
function describe(rep, e) {
  if (!e) return t('Before the first event.', 'Prima del primo evento.');
  if (rep instanceof SearchReplay) return describeSearch(rep, e);
  const sym = rep.tr.header.encoding ? rep.tr.header.encoding.symbols : [];
  const L = ls => { const a = ls.slice(0, 5).map(l => litText(sym, l)).join(', '); return ls.length > 5 ? a + t(` and ${ls.length - 5} more`, ` e altri ${ls.length - 5}`) : a; };
  switch (e.type) {
    case 'decide': return t(`Decision at level ${e.level}: ${litText(sym, e.lit)}.`, `Decisione al livello ${e.level}: ${litText(sym, e.lit)}.`);
    case 'propagate':
      if (e.reason === 'given') return t(`The givens of the puzzle: ${L(e.lits || [])}.`, `I dati del problema: ${L(e.lits || [])}.`);
      if (e.reason === 'random start') return t('A random assignment of every variable.', 'Un assegnamento casuale di ogni variabile.');
      if (e.reason === 'pure') return t(`Pure symbol at depth ${e.level}: ${L(e.lits || [])}.`, `Simbolo puro alla profondità ${e.level}: ${L(e.lits || [])}.`);
      if (e.reason === 'unit') return t(`Unit clause at depth ${e.level}: ${L(e.lits || [])}.`, `Clausola unitaria alla profondità ${e.level}: ${L(e.lits || [])}.`);
      return t(`Propagation at level ${e.level}: ${L(e.lits || [])}.`, `Propagazione al livello ${e.level}: ${L(e.lits || [])}.`);
    case 'split': return t(`Split at depth ${e.level}: ${L((e.lits || []).filter(l => l < 0))}.`, `Divisione alla profondità ${e.level}: ${L((e.lits || []).filter(l => l < 0))}.`);
    case 'flip': return t(`Flip: ${L(e.lits || [])}.`, `Inversione: ${L(e.lits || [])}.`);
    case 'assign': return t(`${e.var} = ${e.value}; ${e.conflicted < 0 ? 'the first assignment is not complete yet' : e.conflicted + ' variables in conflict'}.`,
      `${e.var} = ${e.value}; ${e.conflicted < 0 ? 'il primo assegnamento non è ancora completo' : e.conflicted + ' variabili in conflitto'}.`);
    case 'conflict':
      if (e.vars) return t(`Wipeout: no value left for ${e.vars.join(', ')}.`, `Dominio vuoto: nessun valore rimasto per ${e.vars.join(', ')}.`);
      if (!e.clause) return t(`Conflict at level ${e.level}.`, `Conflitto al livello ${e.level}.`);
      return t(`Conflict: every literal of (${L(e.clause || [])}) is false.`, `Conflitto: ogni letterale di (${L(e.clause || [])}) è falso.`);
    case 'backtrack': return e.restart ? t('Restart.', 'Ripartenza.') : t(`Backtrack to level ${e.level}.`, `Ritorno al livello ${e.level}.`);
    case 'node': return t(`Node ${e.id} (depth ${e.depth}): ${e.status}${e.fix && e.fix.length ? ', fixed ' + L(e.fix) : ''}.`,
      `Nodo ${e.id} (profondità ${e.depth}): ${({ open: 'aperto', branched: 'ramificato', pruned: 'potato', infeasible: 'inammissibile', feasible: 'ammissibile' })[e.status] || e.status}${e.fix && e.fix.length ? ', fissati ' + L(e.fix) : ''}.`);
    case 'bound': return t(`Bound ${fmt(e.lb)}, incumbent ${fmt(e.ub)}.`, `Bound ${fmt(e.lb)}, incumbente ${fmt(e.ub)}.`);
    case 'iterate': return t(`Iteration: value ${fmt(e.value)}.`, `Iterazione: valore ${fmt(e.value)}.`);
    default: return e.type;
  }
}
const fmt = v => (v === null || v === undefined ? '–' : +(+v).toPrecision(6));

// ---------------------------------------------------------------- lanes
function laneOptions(sel, id, chosen) {
  const opts = tracesFor(id);
  sel.innerHTML = `<option value="">${t('none', 'nessuna')}</option>` + opts.map(x =>
    `<option value="${x.file}">${esc(laneName(x.file, x.solver.name))}${x.sample ? t(' (sample, not a run)', ' (esempio, non un\'esecuzione)') : ''}</option>`).join('');
  sel.value = opts.some(x => x.file === chosen) ? chosen : '';
}
function laneSelects() {
  const id = STATE.inst, n = tracesFor(id).length;
  $('laneselects').querySelectorAll('select').forEach((s, i) => { laneOptions(s, id, STATE.lanes[i]); s.disabled = !n; });
  if ($('nolanes')) $('nolanes').hidden = n > 0;
}

// the five rows of a lane, the same in every game
function laneShell(name, where, badge) {
  const art = document.createElement('article');
  art.className = 'lane';
  art.innerHTML = `<header><h3>${esc(name)}</h3>${badge || ''}<p class="where">${esc(where)}</p></header>
    <dl class="stats counters"></dl><p class="evline"></p><div class="board"></div><div class="panel"></div>`;
  $('lanes').append(art);
  return art;
}
function buildSearchLane(file, tr) {
  const h = tr.header, cfg = h.solver.config || {};
  const where = [h.solver.code, [cfg.algorithm, cfg.heuristic, cfg.threads > 1 ? cfg.threads + ' threads' : ''].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const art = laneShell(h.solver.name, where);
  art.classList.add('search');
  art.querySelector('.panel').innerHTML = `<figure class="stripbox"><figcaption></figcaption><canvas class="strip"></canvas></figure><p class="workers"></p>`;
  const box = art.querySelector('.board');
  const view = h.game === 'grid' ? new GridView(box, h.instance) : h.game === 'romania' ? new GraphView(box, h.instance)
    : h.game === 'cube' ? new CubeView(box, h.instance) : h.game === 'planning' ? new PlanView(box, h.instance)
    : h.game === 'hanoi' ? new HanoiView(box, h.instance) : h.game === 'pancake' ? new PancakeView(box, h.instance)
    : h.game === 'topspin' ? new TopSpinView(box, h.instance) : new PuzzleView(box, h.instance);
  art.querySelector('.stripbox').hidden = NOSTRIP.has(h.game);
  return { file, tr, rep: new SearchReplay(tr), view, art, search: true, k: -1 };
}
function updateSearchLane(L, prev) {
  const { rep, art, tr } = L, h = tr.header, e = rep.last;
  const w = e && e.type === 'expand' && h.workers > 1 ? e.w : null;
  if (SETBOARD.has(h.game)) L.view.show(rep.set);
  else if (h.game === 'cube') L.view.show(rep.x || h.instance.facelets, w, e && e.type === 'path' && L.k === prev + 1 ? e.move : null);
  else L.view.show(rep.x || h.instance.board || h.instance.start || h.instance.initial, w);
  if (!NOSTRIP.has(h.game)) {
    const ida = h.solver.config && h.solver.config.algorithm === 'idastar';
    art.querySelector('.stripbox figcaption').textContent = ida
      ? t('f of the state expanded against the threshold of the iteration (IDA* keeps no OPEN)', 'f dello stato espanso rispetto alla soglia dell\'iterazione (IDA* non tiene un OPEN)')
      : t('the frontier: the states generated and not yet expanded, by f (darker where more)', 'la frontiera: gli stati generati e non ancora espansi, per f (più scuro dove sono di più)');
    drawStrip(art.querySelector('.strip'), rep);
  }
  const wk = art.querySelector('.workers');
  if (h.workers > 1) {
    const tot = [...rep.by.values()].reduce((a, b) => a + b, 0) || 1;
    wk.innerHTML = t('expansions by worker: ', 'espansioni per worker: ') + Array.from({ length: h.workers }, (_, i) =>
      `<span class="wchip" style="--w:${WORKERS[i % WORKERS.length]}">${i + 1}: ${Math.round(100 * (rep.by.get(i) || 0) / tot)}%</span>`).join(' ');
  } else wk.textContent = t('one worker', 'un worker');
}
function buildLane(file, tr) {
  if (tr.header.solver.paradigm === 'heuristic search') return buildSearchLane(file, tr);
  const h = tr.header;
  const art = laneShell(laneName(file, h.solver.name), [h.solver.code && h.solver.code.startsWith(h.solver.block) ? '' : h.solver.block,
    h.solver.code, h.solver.config].filter(Boolean).join(' · '),
    h.sample ? `<span class="badge">${bi('sample, not a run', 'esempio, non un\'esecuzione')}</span>` : '');
  if (h.sample) art.classList.add('sample');
  const hasTree = tr.events.some(e => e.type === 'node');
  const tcap = GAME === 'knapsack' ? bi('Branch-and-bound tree: a node by worker colour, grey when pruned', 'Albero del branch-and-bound: un nodo nel colore del worker, grigio se potato') : bi('Branch-and-bound tree', 'Albero del branch-and-bound');
  art.querySelector('.panel').innerHTML = hasTree
    ? `<figure class="treebox"><figcaption>${tcap}</figcaption><svg class="tree"></svg><p class="bounds"></p></figure>`
    : `<p class="bounds"></p>`;
  const box = art.querySelector('.board');
  const view = GAME === 'queens' ? new QueensView(box, h.instance) : GAME === 'sudoku' ? new SudokuView(box, h.instance)
    : NARY ? new CellGridView(box, h.instance) : GAME === 'zebra' ? new ZebraView(box, h.instance)
    : GAME === 'knapsack' ? new KnapsackView(box, h.instance) : new BoardView(box, h.instance, MAPS[h.instance.id] || null);
  return { file, tr, rep: new Replay(tr), view, art, hasTree, k: -1 };
}
function updateLane(L, k) {
  if (L.k === k) return;
  const prev = L.k;
  L.k = k;
  L.rep.seek(k);
  const h = L.tr.header, names = h.counters || Object.keys(L.rep.n);
  L.art.querySelector('.counters').innerHTML = `<div><dt>${t('event', 'evento')}</dt><dd>${k} / ${L.tr.events.length}</dd></div>` +
    names.map(n => `<div><dt>${esc(n)}</dt><dd>${(L.rep.n[n] ?? 0) < 0 ? '–' : L.rep.n[n] ?? 0}</dd></div>`).join('');
  const e = k > 0 ? L.tr.events[k - 1] : null;
  L.art.querySelector('.evline').textContent = describe(L.rep, e) + (k === L.tr.events.length && L.tr.result ? ' ' + t(`End: ${L.tr.result.status}.`, `Fine: ${L.tr.result.status}.`) : '');
  L.art.classList.toggle('conflict', !!e && e.type === 'conflict');
  if (L.search) { updateSearchLane(L, prev); return; }
  L.view.show(L.rep.board(), L.rep.hot());
  if (L.hasTree) drawTree(L.art.querySelector('.tree'), L.rep.nodes, L.rep.node);
  const pd = h.solver.paradigm;
  L.art.querySelector('.bounds').textContent = L.hasTree || L.rep.lb !== null || L.rep.ub !== null
    ? t(`bound ${fmt(L.rep.lb)} · incumbent ${fmt(L.rep.ub)}`, `bound ${fmt(L.rep.lb)} · incumbente ${fmt(L.rep.ub)}`)
    : GAME === 'zebra' ? t('the pegs in a cell are the attributes of its group that may still stand in that house', 'i pioli in una cella sono gli attributi del suo gruppo che possono ancora stare in quella casa')
    : pd === 'csp' && GAME !== 'queens' ? t('the pegs are the values left in each domain', 'i pioli sono i valori rimasti in ogni dominio')
    : pd === 'local search' ? t('a complete assignment, repaired step by step', 'un assegnamento completo, riparato passo per passo')
    : GAME === 'queens' ? t('a dark cell is a row ruled out for its column', 'una cella scura è una riga esclusa per la sua colonna')
    : GAME === 'coloring' ? t('the pegs are the colours not yet ruled out', 'i pioli sono i colori non ancora esclusi')
    : t('the pegs are the values not yet ruled out', 'i pioli sono i valori non ancora esclusi');
}

let boardOnly = null;
function emptyBoard(inst) {   // the board of an instance with no trace yet
  if (lanes.length || inst.id !== STATE.inst) return;
  dispose(boardOnly);
  $('lanes').innerHTML = '';
  const art = laneShell(t('The instance', 'L\'istanza'), '');
  art.querySelector('.evline').textContent = t('No trace of a run on this instance yet.', 'Ancora nessuna traccia di un\'esecuzione su questa istanza.');
  $('lanes').dataset.n = 1;
  boardOnly = new BoardView(art.querySelector('.board'), inst, MAPS[inst.id] || null);
  boardOnly.show(inst.vertices.map(v => ({ id: v, colour: -1, mask: (1 << inst.colours.length) - 1 })), new Set());
}

// a lane thrown away gives back its WebGL context
function dispose(v) {
  if (!v) return;
  v.S.renderer.dispose();
  v.S.renderer.forceContextLoss();
}
async function loadLanes() {
  stop();
  lanes.forEach(L => dispose(L.view)); dispose(boardOnly);
  lanes = []; boardOnly = null;
  $('lanes').innerHTML = '';
  const files = STATE.lanes.filter(Boolean);
  const trs = await Promise.all(files.map(f => openTrace({ url: BASE + f }).catch(err => { info.errors.push(f + ': ' + err.message); return null; })));
  files.forEach((f, i) => { if (trs[i]) lanes.push(buildLane(f, trs[i])); });
  $('lanes').dataset.n = lanes.length;
  if (!lanes.length && GAME === 'coloring' && lastModel && lastModel.instance.id === STATE.inst) emptyBoard(lastModel.instance);
  // the seconds of runs on shared machines are not compared: no alignment by time
  const canTime = false;
  const canWork = lanes.length > 0 && lanes.every(L => L.search) && GAME !== 'planning';
  if ($('align').querySelector('[value=time]')) $('align').querySelector('[value=time]').disabled = !canTime;
  $('align').querySelector('[value=work]').disabled = !canWork;
  if (!canTime && STATE.align === 'time') STATE.align = 'event';
  if (!canWork && STATE.align === 'work') STATE.align = 'event';
  if (canWork && STATE.alignAuto) STATE.align = 'work';
  $('align').value = STATE.align;
  scoreboard();
  setPos(0);
}

// ---------------------------------------------------------------- timeline
// The timeline has few positions, so that a run lasts about a minute at the
// default speed of one position a second and the line of the event can be
// read: by work, SEARCHPOS positions for the expansions (up to those of the
// lane that expands most) and at most MAXPATH for the solution paths; by
// event and by time, at most MAXEV; a long trace is sampled evenly.
const SEARCHPOS = 50, MAXPATH = 40, MAXEV = 80;
// a search with few expansions takes one position for each
const searchPos = () => Math.min(SEARCHPOS, Math.max(1, ...lanes.map(L => L.rep.work)));
const pathLen = L => L.tr.events.length - L.rep.nsearch;
const longest = f => Math.max(0, ...lanes.map(f));
const pathStride = () => Math.max(1, longest(pathLen) / MAXPATH);
const evStride = () => Math.max(1, longest(L => L.tr.events.length) / MAXEV);
function maxPos() {
  if (STATE.align === 'work') return searchPos() + Math.ceil(longest(pathLen) / pathStride());
  return STATE.align === 'time' ? MAXEV : Math.ceil(longest(L => L.tr.events.length) / evStride());
}
const maxWork = () => Math.max(1, ...lanes.map(L => L.rep.work));
function laneK(L, p) {
  if (STATE.align === 'work') {
    if (p > searchPos()) return L.rep.nsearch + Math.min(Math.round((p - searchPos()) * pathStride()), pathLen(L));
    return L.rep.atWork(maxWork() * p / searchPos());
  }
  if (STATE.align !== 'time') return Math.min(Math.round(p * evStride()), L.tr.events.length);
  const T = Math.max(...lanes.map(L => L.tr.events.at(-1).t)) * p / MAXEV, ev = L.tr.events;
  let lo = 0, hi = ev.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t <= T) lo = m + 1; else hi = m; }
  return lo;
}
function setPos(p) {
  STATE.pos = Math.max(0, Math.min(p, maxPos()));
  $('time').max = maxPos(); $('time').value = STATE.pos;
  if (STATE.align === 'time' && lanes.length) {
    const T = Math.max(...lanes.map(L => L.tr.events.at(-1).t)) * STATE.pos / MAXEV;
    $('iter').textContent = (T * 1000).toFixed(T < 0.01 ? 2 : 1) + ' ms';
  } else if (STATE.align === 'work' && lanes.length) {
    $('iter').textContent = STATE.pos <= searchPos() ? Math.round(maxWork() * STATE.pos / searchPos()) + t(' expanded', ' espansi')
      : t('path ', 'cammino ') + Math.min(Math.round((STATE.pos - searchPos()) * pathStride()), longest(pathLen));
  } else $('iter').textContent = `${STATE.pos} / ${maxPos()}`;
  for (const L of lanes) updateLane(L, laneK(L, STATE.pos));
  if (STATE.pos >= maxPos()) stop();
}
let acc = 0, lastT = 0;
function tick(now) {
  if (!STATE.playing) return;
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  acc += dt * STATE.speed;
  if (acc >= 1) { const s = Math.floor(acc); acc -= s; setPos(STATE.pos + s); }
  requestAnimationFrame(tick);
}
function play() {
  if (!lanes.length) return;
  if (STATE.pos >= maxPos()) setPos(0);
  STATE.playing = true; acc = 0; lastT = performance.now();
  $('play').textContent = t('Pause', 'Pausa');
  requestAnimationFrame(tick);
}
function stop() { STATE.playing = false; $('play').textContent = t('Play', 'Avvia'); }

// ---------------------------------------------------------------- scoreboard
function scoreboard() {
  const real = lanes.filter(L => !L.tr.header.sample && L.tr.result);
  const box = $('score');
  box.hidden = !real.length;
  $('scorenote').hidden = !(lanes.length && !real.length);
  if (!real.length) return;
  const keys = [...new Set(real.flatMap(L => Object.keys(L.tr.result.stats || {})))];
  const cell = v => (Array.isArray(v) ? v.join(' / ') : v ?? '–');
  const hasCost = real.some(L => L.tr.result.cost !== undefined);
  box.querySelector('table').innerHTML = `<tr><th>${t('solver', 'solutore')}</th><th>${t('status', 'esito')}</th>${hasCost ? `<th>${t('cost', 'costo')}</th>` : ''}<th>${t('events', 'eventi')}</th>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr>` +
    real.map(L => { const r = L.tr.result;
      return `<tr><td>${esc(laneName(L.file, L.tr.header.solver.name))}</td><td>${esc(r.status)}</td>${hasCost ? `<td>${fmt(r.cost)}</td>` : ''}<td>${r.events ?? L.tr.events.length}${r.capped ? t(' (capped)', ' (troncati)') : ''}</td>${keys.map(k => `<td>${cell(r.stats[k])}</td>`).join('')}</tr>`; }).join('');
}

// ---------------------------------------------------------------- wiring
function chooseInstance() {
  STATE.inst = instId();
  showInstControls();
  STATE.lanes = tracesFor(STATE.inst).map(x => x.file).slice(0, MAXLANES);
  laneSelects(); writeHash(); model(STATE.inst); loadLanes();
}
function texts() {
  if (LISTED) showInstControls();
  laneSelects();
  stop();
  for (const L of lanes) { L.k = -1; }
  setPos(STATE.pos);
  scoreboard();
  if (lastModel) renderModel(lastModel);
}

async function main() {
  readHash();
  if (!LISTED) COLOURINST = $('inst').innerHTML;
  STATE.alignAuto = !new URLSearchParams(location.hash.slice(1)).get('align');
  const [idx, maps] = await Promise.all([fetch(BASE + 'index.json').then(r => r.json()).catch(() => ({ traces: [] })),
    GAME === 'coloring' ? fetch('assets/arena/maps.json').then(r => r.json()) : null]);
  const rank = x => { const i = SOLVERS.indexOf(x.solver.id.replace(/-\d+$/, '')); return i < 0 ? SOLVERS.length : i; };
  // the plain problem first, then its variant of minimum sum colouring
  const minsum = x => (MINSUM(x.file) ? 1 : 0);
  INDEX = idx.traces.map((x, i) => [x, i]).sort((a, b) => minsum(a[0]) - minsum(b[0]) || rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(a => a[0]);
  if (maps) { MAPS = maps.maps; for (const [id, m] of Object.entries(MAPS)) m.id = id; }
  const sel = $('laneselects');
  sel.innerHTML = Array.from({ length: MAXLANES }, (_, i) => `<label><span>${bi('lane', 'corsia')} ${i + 1}</span><select data-lane="${i}"></select></label>`).join('');
  sel.querySelectorAll('select').forEach((s, i) => s.onchange = () => {
    STATE.lanes[i] = s.value;
    STATE.lanes = STATE.lanes.slice(0, MAXLANES);
    writeHash(); loadLanes();
  });
  showInstControls();
  if (!STATE.lanes.length) STATE.lanes = tracesFor(STATE.inst).map(x => x.file).slice(0, MAXLANES);
  laneSelects();
  $('inst').onchange = () => { if (!LISTED) $('planarbox').hidden = $('inst').value !== 'planar'; chooseInstance(); };
  if (!LISTED) $('level').onchange = $('seed').onchange = chooseInstance;
  $('align').onchange = () => { STATE.align = $('align').value; STATE.alignAuto = false; writeHash(); stop(); for (const L of lanes) L.k = -1; setPos(0); };
  $('speed').onchange = () => { STATE.speed = +$('speed').value; };
  $('time').oninput = () => { stop(); setPos(+$('time').value); };
  $('reset').onclick = () => { stop(); setPos(0); };
  $('step').onclick = () => { stop(); setPos(STATE.pos + 1); };
  $('play').onclick = () => (STATE.playing ? stop() : play());
  onLang(texts);
  writeHash();
  model(STATE.inst);
  await loadLanes();
  info.loaded = true;
}
main().catch(err => { info.errors.push(String(err && err.stack || err)); });
