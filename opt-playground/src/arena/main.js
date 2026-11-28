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
import { makePanel } from './panels.js';
import { SearchReplay, PuzzleView, GridView, drawStrip, WORKERS, heurOf, placesF, fAt, niceStep, tileTerms } from './search.js';
import { drawCharts } from './charts.js';
import { CubeView } from './cube.js';
import { QueensView, SudokuView } from './cells.js';
import { HanoiView } from './hanoi.js';
import { GraphView } from './graph.js';
import { PlanView } from './plan.js';
import { CellGridView, ZebraView } from './puzzles.js';
import { KnapsackView } from './knapsack.js';
import { PancakeView, TopSpinView } from './stacks.js';
import { PlayLane } from './play.js';
import { attachCode } from './pseudocode.js';
import { Predict, arenaQuestion, arenaNote } from './predict.js';
// the runs of the reader and the instances the reader draws (ownrun.js)
import * as OWN from './ownrun.js';

const $ = id => document.getElementById(id);
const GAME = document.body.dataset.game;
const MAXLANES = 4;      // most lanes one can choose at once
const DEFLANES = 2;      // lanes shown by default (besides "You"), so the trees stay readable
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
// one lane per search family, in its best version and in this order, the first
// DEFLANES shown by default: CaDiCaL (CDCL), the systematic CP search (GAC with
// domain splitting where the constraints are n-ary, backtracking with MAC
// otherwise) and min-conflicts (local search). The weaker variants of each
// family (forward checking, DPLL, WalkSAT, AC-3 alone) are not offered
const SOLVERS = ['cadical', 'aima-gac', 'aima-bt-mac', 'aima-minconf'];
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
// the games that the reader can play in the lane "You" (play.js), first in the row
// (module, class), loaded only on the page of that game
const PLAY = {
  queens: ['./play-cells.js', 'QueensPlay'], coloring: ['./play-cells.js', 'ColoringPlay'], sudoku: ['./play-cells.js', 'SudokuPlay'],
  zebra: ['./play-zebra.js', 'ZebraPlay'],
  kakuro: ['./play-puzzles.js', 'KakuroPlay'], crypto: ['./play-puzzles.js', 'CryptoPlay'], crossword: ['./play-puzzles.js', 'CrosswordPlay'],
  knapsack: ['./play-knapsack.js', 'KnapsackPlay'],
  pancake: ['./play-stacks.js', 'PancakePlay'], topspin: ['./play-stacks.js', 'TopSpinPlay'],
  hanoi: ['./play-hanoi.js', 'HanoiPlay'], cube: ['./play-cube.js', 'CubePlay'],
  puzzle: ['./play-search.js', 'PuzzlePlay'], grid: ['./play-search.js', 'GridPlay'], romania: ['./play-search.js', 'RomaniaPlay'],
  planning: ['./play-plan.js', 'PlanningPlay'] };
const info = window.__arena = { errors: [], pyodide: null, modelSeconds: null, game: GAME, lanes: () => lanes };
window.addEventListener('error', e => { if (!/ResizeObserver loop/.test(e.message)) info.errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', e => info.errors.push(String(e.reason && e.reason.message || e.reason)));

let INDEX = [], MAPS = {}, lanes = [], you = null, loadReq = 0, PRED = null;

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
    if (!ids.includes(STATE.inst) && !OWN.instOption($('inst'), STATE.inst)) STATE.inst = ids[0] || '';
    $('inst').value = STATE.inst;
    return;
  }
  if ($('inst').innerHTML !== COLOURINST) $('inst').innerHTML = COLOURINST;
  if (!STATE.inst) STATE.inst = 'australia';
  const planar = STATE.inst.startsWith('planar-');
  OWN.instOption($('inst'), STATE.inst);
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
    worker = OWN.worker();
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
  $('mstatus').innerHTML = bi('Loading Python (Pyodide) and the modules of aima-python in the page...',
    'Caricamento di Python (Pyodide) e dei moduli di aima-python nella pagina...');
  worker.postMessage({ id: req, instance: id, custom: OWN.custom(id) });
}
let lastModel = null;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function renderModel(m) {
  lastModel = m;
  if (!m) return;
  // no timings here: the page shows no seconds of any machine
  $('mstatus').textContent = t('Computed in this browser by the modules of aima-python, run in Pyodide.',
    'Calcolato in questo browser dai moduli di aima-python, eseguiti in Pyodide.');
  const csp = GAME !== 'coloring', c = m.cnf;
  const kinds = { alo: csp ? t('at least one value per variable', 'almeno un valore per variabile') : t('at least one color per vertex', 'almeno un colore per vertice'),
    amo: csp ? t('at most one value per variable', 'al più un valore per variabile') : t('at most one color per vertex', 'al più un colore per vertice'),
    edge: csp ? t('two values that the constraint of two neighbors rejects', 'due valori che il vincolo di due vicini respinge') : t('the two ends of an edge differ', 'i due estremi di un lato differiscono'),
    nary: t('a prefix of the tuples that a constraint on more than two variables rejects', 'un prefisso delle tuple che un vincolo su più di due variabili respinge'),
    given: t('a value outside the domain (the givens)', 'un valore fuori dal dominio (i dati del problema)') };
  for (const g of Object.keys(kinds)) if (!m.sample[g] || !m.sample[g].length) delete kinds[g];
  const what = { coloring: [t('One variable per vertex, its color; one constraint "different" per edge.', 'Una variabile per vertice, il suo colore; un vincolo "diverso" per lato.'), 'MapColoringSAT'],
    queens: [t('NQueensCSP of aima-python: one variable per column, the row of its queen; one constraint per pair of columns, no shared row or diagonal.', 'NQueensCSP di aima-python: una variabile per colonna, la riga della sua regina; un vincolo per coppia di colonne, nessuna riga o diagonale in comune.'), 'translate_csp'],
    sudoku: [t('Sudoku of aima-python: one variable per cell, its digit (a given has a domain of one digit); one constraint "different" per pair of cells in a row, column or box.', 'Sudoku di aima-python: una variabile per cella, la sua cifra (un dato ha un dominio di una cifra); un vincolo "diverso" per coppia di celle in una riga, colonna o riquadro.'), 'translate_csp'],
    zebra: [t('Zebra of aima-python: one variable per attribute (a color, a pet, a drink, a nationality, a smoke), its house from 1 to 5; one constraint per pair of attributes of a group (different houses) and per clue.', 'Zebra di aima-python: una variabile per attributo (un colore, un animale, una bevanda, una nazionalità, un tipo di sigaretta), la sua casa da 1 a 5; un vincolo per coppia di attributi di un gruppo (case diverse) e per indizio.'), 'translate_csp'],
    kakuro: [t('Kakuro of aima-python, a NaryCSP: one variable per white cell, its digit; for each run of cells a constraint of sum and one of all different, on the whole run.', 'Kakuro di aima-python, un NaryCSP: una variabile per cella bianca, la sua cifra; per ogni sequenza di celle un vincolo di somma e uno "tutte diverse", sull\'intera sequenza.'), 'translate_csp'],
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
      `Una variabile booleana <code>v_c</code> per ogni variabile v e ogni valore c, la codifica diretta del CSP. Un vincolo "tutte diverse" si traduce nelle coppie di valori che respinge; ogni altro vincolo si traduce, per ogni prefisso di una tupla che accetta e per ogni valore della variabile successiva che nessuna tupla accettata ha dopo quel prefisso, nella clausola che li vieta insieme; le tuple sono chieste al vincolo di aima-python.`)
      : csp ? t(`A Boolean variable <code>v_c</code> for each variable v and value c, the direct encoding of the CSP: the pairs of values that a constraint rejects are asked of the constraint of aima-python.`,
      `Una variabile booleana <code>v_c</code> per ogni variabile v e ogni valore c, la codifica diretta del CSP: le coppie di valori che un vincolo respinge sono chieste al vincolo di aima-python.`)
      : t(`A Boolean variable <code>v_c</code> for each vertex v and color c. The edge clauses are written once from each end, so the ${c.by_kind.edge} of them are ${c.by_kind.edge / 2} distinct ones twice.`,
      `Una variabile booleana <code>v_c</code> per ogni vertice v e ogni colore c. Le clausole dei lati sono scritte una volta da ciascun estremo, quindi le ${c.by_kind.edge} sono ${c.by_kind.edge / 2} distinte, ognuna due volte.`)}</p>
    ${Object.keys(kinds).map(g => `<p class="kind">${kinds[g]} (${c.by_kind[g]})</p><ul class="cl">${list(g, s => s.text)}</ul>`).join('')}`;
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
      {
        // the place expanded, on the boards that are a set of places
        const at = Object.entries(e.set || {}).find(([, v]) => v[0] === 'e'), wd = rep.tr.header.instance.width;
        const what = !at ? [t('a state', 'uno stato'), t('uno stato', 'uno stato')]
          : GAME === 'romania' ? [at[0], at[0]] : [`the cell (${+at[0] % wd}, ${Math.floor(+at[0] / wd)})`, `la cella (${+at[0] % wd}, ${Math.floor(+at[0] / wd)})`];
        return t(`${W(e.w)} expands ${what[0]}, with g ${fmt(e.g)}, h ${fmt(e.h)}, f ${fmt(e.f)}.`,
          `${W(e.w)} espande ${what[1]}, con g ${fmt(e.g)}, h ${fmt(e.h)}, f ${fmt(e.f)}.`);
      }
    case 'level': return t(`Level ${e.g} of the planning graph: ${e.n.propositions} propositions, ${e.n.actions} actions, ${e.n.mutexes} mutexes.`,
      `Livello ${e.g} del grafo di pianificazione: ${e.n.propositions} proposizioni, ${e.n.actions} azioni, ${e.n.mutexes} mutex.`);
    case 'threshold': return t(`A new iteration, with threshold ${fmt(e.g)} on f.`, `Una nuova iterazione, con soglia ${fmt(e.g)} su f.`);
    case 'solution': return t(`${W(e.w)} reaches the goal with cost ${fmt(e.cost)}.`, `${W(e.w)} raggiunge l'obiettivo con costo ${fmt(e.cost)}.`);
    case 'path': return e.i === 0 ? t(`The solution path, ${N} moves: the start.`, `Il cammino soluzione, ${N} mosse: la partenza.`)
      : e.flip ? t(`The solution path: move ${e.i} of ${N}, flip the top ${e.flip} pancakes.`, `Il cammino soluzione: mossa ${e.i} di ${N}, ribalta le ${e.flip} frittelle in cima.`)
      : e.turn !== undefined ? (() => {
        // the tokens now in the turnstile, and the order they had before
        const K = rep.tr.header.instance.turnstile || 4, n = e.x.length;
        const now = Array.from({ length: K }, (_, o) => e.x[(e.turn + o) % n]), was = [...now].reverse().join(' ');
        return t(`The solution path: move ${e.i} of ${N}, the turnstile reverses ${was} into ${now.join(' ')}.`,
          `Il cammino soluzione: mossa ${e.i} di ${N}, il tornello rovescia ${was} in ${now.join(' ')}.`);
      })()
      : (() => {
        const m = pathMove(rep, e);
        return t(`The solution path: move ${e.i} of ${N}${m ? ', ' + m[0] : ''}.`, `Il cammino soluzione: mossa ${e.i} di ${N}${m ? ', ' + m[1] : ''}.`);
      })();
    default: return e.type;
  }
}
// a literal as the value it names, whatever its sign ("WA = R")
const litVal = (sym, l) => litText(sym, Math.abs(l));
// a move of the solution path in words, in English and Italian, from the
// state before it (the previous event of the path) and the state after it
const FACES = { U: ['top', 'superiore'], D: ['bottom', 'inferiore'], F: ['front', 'frontale'], B: ['back', 'posteriore'], L: ['left', 'sinistra'], R: ['right', 'destra'] };
function pathMove(rep, e) {
  const prev = rep.tr.events[rep.pos - 2], a = prev && prev.type === 'path' ? prev.x : null, b = e.x;
  if (GAME === 'cube' && e.move && FACES[e.move[0]]) {
    const f = FACES[e.move[0]], q = e.move.slice(1);
    return [`${e.move}: turn the ${f[0]} face ${q === '2' ? 'by half a turn' : q === "'" ? 'a quarter counterclockwise' : 'a quarter clockwise'}`,
      `${e.move}: gira la faccia ${f[1]} di ${q === '2' ? 'mezzo giro' : q === "'" ? 'un quarto in senso antiorario' : 'un quarto in senso orario'}`];
  }
  if (e.move) return [e.move, e.move];
  if (GAME === 'hanoi' && a && b) {
    const d = b.findIndex((p, i) => p !== a[i]);
    if (d >= 0) return [`move disk ${d + 1} (1 the smallest) from peg ${a[d] + 1} to peg ${b[d] + 1}`, `sposta il disco ${d + 1} (1 il più piccolo) dal piolo ${a[d] + 1} al piolo ${b[d] + 1}`];
  }
  if (GAME === 'puzzle' && a && b) {
    const side = rep.tr.header.instance.side, from = b.indexOf(0), to = a.indexOf(0), tile = a[from];
    const dir = to === from - 1 ? ['left', 'a sinistra'] : to === from + 1 ? ['right', 'a destra'] : to === from - side ? ['up', 'in su'] : ['down', 'in giù'];
    if (tile) return [`slide tile ${tile} ${dir[0]}`, `fai scorrere la tessera ${tile} ${dir[1]}`];
  }
  if (GAME === 'romania' && e.set) { const c = Object.keys(e.set)[0]; return [`on to ${c}`, `si prosegue verso ${c}`]; }
  return null;
}
function describe(rep, e) {
  if (!e) return t('Before the first event.', 'Prima del primo evento.');
  if (rep instanceof SearchReplay) return describeSearch(rep, e);
  const sym = rep.tr.header.encoding ? rep.tr.header.encoding.symbols : [];
  const L = ls => { const a = ls.slice(0, 5).map(l => litVal(sym, l)).join(', '); return ls.length > 5 ? a + t(` and ${ls.length - 5} more`, ` e altri ${ls.length - 5}`) : a; };
  // what a set of literals does: the values it forces and those it rules out
  const does = (ls = []) => {
    const P = ls.filter(l => l > 0), N = ls.filter(l => l < 0);
    return [P.length ? t(`sets ${L(P)}`, `fissa ${L(P)}`) : '', N.length ? t(`rules out ${L(N)}`, `esclude ${L(N)}`) : '']
      .filter(Boolean).join(t('; it ', '; ')) || t('nothing new', 'niente di nuovo');
  };
  const vname = v => rep.verts[v];
  switch (e.type) {
    case 'decide': return e.lit > 0
      ? t(`Decision at level ${e.level}: try ${litVal(sym, e.lit)} (gold frame).`, `Decisione al livello ${e.level}: si prova ${litVal(sym, e.lit)} (cornice dorata).`)
      : t(`Decision at level ${e.level}: try without ${litVal(sym, e.lit)} (gold frame).`, `Decisione al livello ${e.level}: si prova senza ${litVal(sym, e.lit)} (cornice dorata).`);
    case 'propagate':
      if (e.reason === 'given') return t(`The givens of the puzzle: ${L((e.lits || []).filter(l => l > 0))}.`, `I dati del problema: ${L((e.lits || []).filter(l => l > 0))}.`);
      if (e.reason === 'random start') return t('A random assignment of every variable.', 'Un assegnamento casuale di ogni variabile.');
      if (e.reason === 'pure') return t(`Pure symbol at depth ${e.level}: it ${does(e.lits)}.`, `Simbolo puro alla profondità ${e.level}: ${does(e.lits)}.`);
      if (e.reason === 'unit') return t(`Unit clause at depth ${e.level}: it ${does(e.lits)}.`, `Clausola unitaria alla profondità ${e.level}: ${does(e.lits)}.`);
      return t(`Propagation at level ${e.level}: it ${does(e.lits)}.`, `Propagazione al livello ${e.level}: ${does(e.lits)}.`);
    case 'split': return t(`Split of a domain at depth ${e.level} (gold frame): it ${does(e.lits)}.`, `Suddivisione di un dominio alla profondità ${e.level} (cornice dorata): ${does(e.lits)}.`);
    case 'flip': return t(`Flip of one variable: now ${L((e.lits || []).filter(l => l > 0))}.`, `Inversione di una variabile: ora ${L((e.lits || []).filter(l => l > 0))}.`);
    case 'assign': return t(`${e.var} = ${e.value}; ${e.conflicted < 0 ? 'the first assignment is not complete yet' : e.conflicted + ' variables in conflict'}.`,
      `${e.var} = ${e.value}; ${e.conflicted < 0 ? 'il primo assegnamento non è ancora completo' : e.conflicted + ' variabili in conflitto'}.`);
    case 'conflict': {
      if (e.vars) return t(`Wipeout: no value left for ${e.vars.join(', ')} (red).`, `Dominio vuoto: nessun valore rimasto per ${e.vars.join(', ')} (in rosso).`);
      if (!e.clause) {
        const f = rep.focus()[0], who = f ? vname(f.v) : '';
        return who ? t(`Conflict at level ${e.level}: after the decision on ${who} (red) a constraint cannot be met.`, `Conflitto al livello ${e.level}: dopo la decisione su ${who} (in rosso) un vincolo non si può soddisfare.`)
          : t(`Conflict at level ${e.level}: a constraint cannot be met.`, `Conflitto al livello ${e.level}: un vincolo non si può soddisfare.`);
      }
      const c = (e.clause || []).map(l => litText(sym, l)), cs = c.slice(0, 5).join(', ') + (c.length > 5 ? t(` and ${c.length - 5} more`, ` e altri ${c.length - 5}`) : '');
      return t(`Conflict: every literal of (${cs}) is false (red).`, `Conflitto: ogni letterale di (${cs}) è falso (in rosso).`);
    }
    case 'backtrack': {
      if (e.restart) return t('Restart: every decision is taken back.', 'Riavvio: ogni decisione viene ritirata.');
      const u = [...(rep.undone || [])].map(vname), us = u.slice(0, 5).join(', ') + (u.length > 5 ? t(` and ${u.length - 5} more`, ` e altri ${u.length - 5}`) : '');
      return u.length ? t(`Backtrack to level ${e.level}: the values of ${us} are taken back (grey frame).`, `Ritorno al livello ${e.level}: si ritirano i valori di ${us} (cornice grigia).`)
        : t(`Backtrack to level ${e.level}.`, `Ritorno al livello ${e.level}.`);
    }
    case 'node': {
      const st = { open: ['open', 'aperto'], branched: ['branched', 'ramificato'], pruned: ['pruned', 'potato'], infeasible: ['infeasible', 'inammissibile'], feasible: ['feasible', 'ammissibile'] }[e.status] || [e.status, e.status];
      const last = e.fix && e.fix.length ? e.fix[e.fix.length - 1] : 0;
      const ks = last && GAME === 'knapsack' ? /^(.*)_(in|out)$/.exec(sym[Math.abs(last) - 1] || '') : null;
      const item = !last ? t('fixes nothing (the root)', 'non fissa niente (la radice)')
        : ks ? (ks[2] === 'in' ? t(`takes the item ${ks[1]}`, `prende l'oggetto ${ks[1]}`) : t(`leaves out the item ${ks[1]}`, `lascia fuori l'oggetto ${ks[1]}`))
        : t(`fixes ${litText(sym, last)}`, `fissa ${litText(sym, last)}`);
      const why = e.status === 'pruned' && e.bound !== undefined && e.ub !== null && e.ub !== undefined
        ? t(`, since its bound ${fmt(e.bound)} does not beat the incumbent ${fmt(e.ub)}`, `, perché il suo bound ${fmt(e.bound)} non supera la miglior soluzione ${fmt(e.ub)}`)
        : e.bound !== undefined ? t(`, bound ${fmt(e.bound)}`, `, bound ${fmt(e.bound)}`) : '';
      return t(`Node at depth ${e.depth}: it ${item} (gold frame); ${st[0]}${why}.`, `Nodo alla profondità ${e.depth}: ${item} (cornice dorata); ${st[1]}${why}.`);
    }
    case 'bound': return t(`Bound ${fmt(e.lb)}, incumbent ${fmt(e.ub)}.`, `Bound ${fmt(e.lb)}, miglior soluzione ${fmt(e.ub)}.`);
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
  if ($('nolanes')) $('nolanes').hidden = n > 0 || OWN.isCustom(id);
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
  const panel = makePanel(art.querySelector('.panel'), tr, null);
  const L = { file, tr, rep: new SearchReplay(tr), view, art, search: true, k: -1, panel, hon: false };
  heurOption(L);
  return L;
}
// ---------------------------------------------------------------- the option "show h / g / f"
// A box in the header of each search lane (off by default) draws the
// heuristic of the lane on its board, computed in the page as the solver
// defines it, and the f that the trace records for the places expanded; a
// caption under the box says what the marks are and which heuristic the
// trace header names.
function heurOption(L) {
  const h = L.tr.header, H = heurOf(L.tr);
  if (h.solver.config && h.solver.config.algorithm === 'graphplan') return;
  const hd = L.art.querySelector('header');
  const p = document.createElement('p');
  p.className = 'hopt';
  p.innerHTML = `<label><input type="checkbox"><span></span></label>${h.game === 'grid' ? ' <button type="button" class="htop" hidden></button>' : ''}`;
  const cap = document.createElement('p');
  cap.className = 'hcap'; cap.hidden = true;
  hd.append(p, cap);
  L.hinfo = H;
  if (SETBOARD.has(h.game)) {
    L.hplaces = placesF(L.tr);
    const fs = L.hplaces.map(x => x.f);
    // the bands run up to the cost of the solution: A* expands no state of
    // larger f, a parallel search a few, which fall in the last band
    const C = L.tr.result && typeof L.tr.result.cost === 'number' ? L.tr.result.cost : Infinity;
    L.hlo = fs.length ? Math.min(...fs) : 0; L.hhi = fs.length ? Math.min(C, Math.max(...fs)) : 1;
    L.hstep = niceStep(L.hhi - L.hlo);
  }
  const top = p.querySelector('.htop');
  p.querySelector('input').onchange = e => { L.hon = e.target.checked; cap.hidden = !L.hon; if (top) top.hidden = !L.hon; applyHeur(L); };
  // the grid seen from straight above, where the bands of f read as a map
  // (Reset view of the board goes back to the default camera)
  if (top) top.onclick = () => { const S = L.view.S; S.camera.position.set(0, -0.08, 2.85); S.controls.target.set(0, 0, 0); S.controls.update(); };
  heurTexts(L);
}
function heurTexts(L) {
  const sp = L.art.querySelector('.hopt span');
  if (sp) sp.textContent = t('show h / g / f', 'mostra h / g / f');
  const top = L.art.querySelector('.htop');
  if (top) top.textContent = t('view from above', 'vista dall\'alto');
}
const SQ = (a, b) => Math.trunc(Math.hypot(a[0] - b[0], a[1] - b[1]));
function applyHeur(L) {
  const h = L.tr.header, H = L.hinfo, I = h.instance;
  if (!H) return;
  const fmap = L.hplaces ? fAt(L.hplaces, L.k) : null;
  if (h.game === 'grid') L.view.setHeur(L.hon, { zero: H.zero, fmap, lo: L.hlo, hi: L.hhi, step: L.hstep });
  else if (h.game === 'romania') L.view.setHeur(L.hon, H.zero ? null : c => SQ(I.nodes[c], I.nodes[I.goal]), fmap);
  else if (h.game === 'puzzle') L.view.setHeur(L.hon ? (H.name === 'misplaced tiles' ? 'misplaced' : 'manhattan') : null);
  if (L.hon) heurCaption(L, fmap);
}
// the caption of the option, for the state of the current event
function heurCaption(L, fmap) {
  const h = L.tr.header, H = L.hinfo, e = L.rep.last, cap = L.art.querySelector('.hcap');
  const ex = e && e.type === 'expand' ? e : null;
  const ghf = ex ? t(` For the state of this event the trace gives g ${fmt(ex.g)}, h ${fmt(ex.h)}, f ${fmt(ex.f)}.`, ` Per lo stato di questo evento la traccia dà g ${fmt(ex.g)}, h ${fmt(ex.h)}, f ${fmt(ex.f)}.`) : '';
  const named = H.zero ? t('no heuristic', 'nessuna euristica') : `"${esc(H.name)}"`;
  const zero = t(`This lane searches with ${named} (${esc(H.alg)} in its trace header): h = 0, so f = g.`, (H.zero ? `Questa corsia cerca senza euristica (${esc(H.alg)} nell'intestazione della sua traccia): h = 0, quindi f = g.` : `Questa corsia cerca con ${named} (${esc(H.alg)} nell'intestazione della sua traccia): h = 0, quindi f = g.`));
  const ramp = (a, b, lo, hi) => `<span class="hkey"><span>${lo}</span><span class="hbar" style="background:linear-gradient(90deg,var(${a}),var(${b}))"></span><span>${hi}</span></span>`;
  let s = '';
  if (h.game === 'grid') {
    const nb = Math.floor((L.hhi - L.hlo) / L.hstep) + 1, known = fmap ? fmap.size : 0;
    const bands = t(`an expanded cell takes the band of its f = g + h, in steps of ${fmt(L.hstep)} ${ramp('--fband-lo', '--fband-hi', fmt(L.hlo), (L.hhi < Infinity ? '≥ ' : '') + fmt(L.hlo + (nb - 1) * L.hstep))}, the last band holding also any f beyond the cost of the solution, so that the bands draw the contours of f: A* stretches them from the start toward the goal, while uniform cost would spread them in circles.`,
      `una cella espansa prende la fascia del suo f = g + h, a passi di ${fmt(L.hstep)} ${ramp('--fband-lo', '--fband-hi', fmt(L.hlo), '≥ ' + fmt(L.hlo + (nb - 1) * L.hstep))}, l'ultima fascia comprendendo anche ogni f oltre il costo della soluzione, così che le fasce disegnano le curve di livello di f: A* le allunga dalla partenza verso l'obiettivo, mentre il costo uniforme le allargherebbe in cerchi.`);
    s = H.zero ? zero + ' ' + t('The free cells keep their color; ', 'Le celle libere restano del loro colore; ') + bands
      : t(`The free cells not yet expanded are shaded by h, the octile distance to the goal that the lane uses ("${esc(H.name)}" in its trace header: max(dx, dy) + (√2 − 1) min(dx, dy)) ${ramp('--heur-lo', '--heur-hi', 0, L.view.hmax.toFixed(1))}; `,
        `Le celle libere non ancora espanse sono sfumate secondo h, la distanza ottile dall'obiettivo che la corsia usa ("${esc(H.name)}" nell'intestazione della sua traccia: max(dx, dy) + (√2 − 1) min(dx, dy)) ${ramp('--heur-lo', '--heur-hi', 0, L.view.hmax.toFixed(1))}; `) + bands;
    if (L.hplaces.length < (L.tr.result && L.tr.result.stats ? L.tr.result.stats.expanded : 0))
      s += t(` The trace of this parallel search records the f of ${L.hplaces.length} of its ${L.tr.result.stats.expanded} expansions, so the expanded cells whose f it does not give are grey (${known} cells with their f at this event).`,
        ` La traccia di questa ricerca parallela registra f per ${L.hplaces.length} delle sue ${L.tr.result.stats.expanded} espansioni, quindi le celle espanse di cui non dà f sono grigie (${known} celle con il loro f a questo evento).`);
  } else if (h.game === 'romania') {
    s = H.zero ? zero + ' ' + t('The card of each city expanded gives its f as the trace records it, the km driven from Arad.', 'La scheda di ogni città espansa dà il suo f come lo registra la traccia, i km percorsi da Arad.')
      : t(`The card of every city gives h, the straight-line distance to Bucharest of the heuristic "${esc(H.name)}" of this lane, as aima-python computes it from the coordinates of the map (the Euclidean distance truncated to an integer, which differs from the table of the book), and for each city expanded its f as the trace records it${H.alg === 'greedy' ? ' (greedy best-first ranks by h alone, so its f is h)' : ', g + h'}.`,
        `La scheda di ogni città dà h, la distanza in linea d'aria da Bucarest dell'euristica "${esc(H.name)}" di questa corsia, come la calcola aima-python dalle coordinate della mappa (la distanza euclidea troncata a un intero, che differisce dalla tabella del libro), e per ogni città espansa il suo f come lo registra la traccia${H.alg === 'greedy' ? ' (la ricerca golosa ordina per sola h, quindi il suo f è h)' : ', g + h'}.`);
  } else if (h.game === 'puzzle') {
    const x = L.rep.x || h.instance.board, I = h.instance;
    const man = tileTerms(x, I.goal, I.side, false).reduce((a, b) => a + b, 0), mis = tileTerms(x, I.goal, I.side, true).reduce((a, b) => a + b, 0);
    s = H.name === 'misplaced tiles' ? t(`On each tile a badge says 1 if the tile is out of its goal cell: the heuristic "misplaced tiles" of this lane counts them, the blank included when it is out of place, as aima-python does; here ${mis}.`,
        `Su ogni tessera un bollino dice 1 se la tessera è fuori dalla sua cella obiettivo: l'euristica "misplaced tiles" di questa corsia le conta, compreso lo spazio vuoto quando è fuori posto, come fa aima-python; qui ${mis}.`)
      : H.name === 'h2' ? t(`On each tile a badge gives its Manhattan distance to its goal cell (rows plus columns): the heuristic h2 of this lane is their sum, here ${man}.`, `Su ogni tessera un bollino dà la sua distanza di Manhattan dalla cella obiettivo (righe più colonne): l'euristica h2 di questa corsia è la loro somma, qui ${man}.`)
      : H.zero ? zero + ' ' + t(`The badges give the Manhattan distance of each tile to its goal cell for reference (sum ${man}), which the lanes with h2 use.`, `I bollini danno per confronto la distanza di Manhattan di ogni tessera dalla sua cella obiettivo (somma ${man}), che usano le corsie con h2.`)
      : t(`This lane uses "${esc(H.name)}", the additive pattern databases 5-5-5: tables that the page does not recompute. The badges give the Manhattan distance of each tile, whose sum (${man}) never exceeds the h of the databases.`, `Questa corsia usa "${esc(H.name)}", i database di pattern additivi 5-5-5: tabelle che la pagina non ricalcola. I bollini danno la distanza di Manhattan di ogni tessera, la cui somma (${man}) non supera mai la h dei database.`);
  } else if (h.game === 'pancake') s = t('The gold ticks on the board already show the heuristic: they mark the gaps, the neighbors whose sizes are not consecutive (the plate counting as the largest), and the gap heuristic of this lane is their number.', 'Le tacche dorate sul tabellone mostrano già l\'euristica: segnano i buchi, i vicini le cui misure non sono consecutive (il piatto conta come la più grande), e l\'euristica gap di questa corsia è il loro numero.');
  else if (h.game === 'topspin') s = t('The gold bars on the board already show the heuristic: they mark the breakpoints, the neighbors that are not consecutive (11 and 0 are), from which the heuristic "breakpoints" of this lane is computed.', 'Le barre dorate sul tabellone mostrano già l\'euristica: segnano i punti di rottura, i vicini non consecutivi (11 e 0 lo sono), da cui si calcola l\'euristica "breakpoints" di questa corsia.');
  else if (h.game === 'cube') s = t(`This lane uses "${esc(H.name)}": the maximum of Korf's three pattern databases (the 8 corners and two sets of 6 edges), tables that the page does not load, so h is not drawn on the cube.`, `Questa corsia usa "${esc(H.name)}": il massimo dei tre database di pattern di Korf (gli 8 angoli e due insiemi di 6 spigoli), tabelle che la pagina non carica, quindi h non è disegnata sul cubo.`);
  else if (h.game === 'hanoi') s = t(`This lane uses "${esc(H.name)}", an additive pattern database over ranges of disks, a table that the page does not recompute, so h is not drawn on the pegs.`, `Questa corsia usa "${esc(H.name)}", un database di pattern additivo su intervalli di dischi, una tabella che la pagina non ricalcola, quindi h non è disegnata sui pioli.`);
  else s = H.zero ? zero : t(`This lane uses "${esc(H.name)}", which the page does not draw on the board.`, `Questa corsia usa "${esc(H.name)}", che la pagina non disegna sul tabellone.`);
  cap.innerHTML = s + ghf;
}
function updateSearchLane(L, prev) {
  const { rep, art, tr } = L, h = tr.header, e = rep.last;
  if (L.panel) L.panel.draw(L.k);
  const w = e && e.type === 'expand' && h.workers > 1 ? e.w : null;
  if (L.hon) applyHeur(L);
  if (SETBOARD.has(h.game)) {
    // the place being expanded at this event, marked on the board
    const cur = e && e.type === 'expand' ? Object.entries(e.set || {}).find(([, v]) => v[0] === 'e') : null;
    L.view.show(rep.set, cur ? cur[0] : null);
  }
  else if (h.game === 'cube') L.view.show(rep.x || h.instance.facelets, w, e && e.type === 'path' && L.k === prev + 1 ? e.move : null);
  else L.view.show(rep.x || h.instance.board || h.instance.start || h.instance.initial, w);
  if (!NOSTRIP.has(h.game)) {
    const ida = h.solver.config && h.solver.config.algorithm === 'idastar';
    art.querySelector('.stripbox figcaption').textContent = ida
      ? t('f of the state expanded against the threshold of the iteration (IDA* keeps no OPEN)', 'f dello stato espanso rispetto alla soglia dell\'iterazione (IDA* non mantiene una lista OPEN)')
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
  const tcap = GAME === 'knapsack'
    ? bi('The branch-and-bound tree: the root is the whole problem, a node a subproblem with one more item taken or left out than its parent; a node is filled in the color of the worker that branched it, gold when it is feasible, grey when pruned (its bound does not beat the incumbent) or infeasible; the ring marks the node of this event and ink its path from the root, the bound is written beside the nodes of that path (under every node of a small tree) and in the tooltip, and a big tree folds the subtrees off that path into a count.',
      'L\'albero del branch-and-bound: la radice è l\'intero problema, un nodo un sottoproblema con un oggetto in più preso o lasciato fuori rispetto al genitore; un nodo è pieno nel colore del worker che lo ha ramificato, in oro quando è ammissibile, grigio quando è potato (il suo bound non supera la miglior soluzione) o inammissibile; l\'anello segna il nodo di questo evento e il colore inchiostro il suo cammino dalla radice, il bound è scritto accanto ai nodi di quel cammino (sotto ogni nodo di un albero piccolo) e nel suggerimento, e un albero grande raccoglie i sottoalberi fuori da quel cammino in un numero.')
    : bi('The branch-and-bound tree: a node is a subproblem, filled in the color of its worker when branched, gold when feasible, grey when pruned or infeasible; the ring marks the node of this event.',
      'L\'albero del branch-and-bound: un nodo è un sottoproblema, pieno nel colore del suo worker quando è ramificato, in oro se ammissibile, grigio se potato o inammissibile; l\'anello segna il nodo di questo evento.');
  art.querySelector('.panel').innerHTML = hasTree
    ? `<figure class="spanel treebox"><figcaption class="scap">${tcap}</figcaption><div class="sbox tree"></div><p class="bounds"></p></figure>`
    : `<p class="bounds"></p>`;
  const box = art.querySelector('.board');
  const view = GAME === 'queens' ? new QueensView(box, h.instance) : GAME === 'sudoku' ? new SudokuView(box, h.instance)
    : NARY ? new CellGridView(box, h.instance) : GAME === 'zebra' ? new ZebraView(box, h.instance)
    : GAME === 'knapsack' ? new KnapsackView(box, h.instance) : new BoardView(box, h.instance, MAPS[h.instance.id] || null);
  const rep = new Replay(tr);
  const panel = hasTree ? null : makePanel(art.querySelector('.panel'), tr, rep);
  return { file, tr, rep, view, art, hasTree, k: -1, panel };
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
  L.art.querySelector('.evline').textContent = describe(L.rep, e) + (k === L.tr.events.length && L.tr.result ? ' ' + endText(L.tr.result.status) : '');
  L.art.classList.toggle('conflict', !!e && e.type === 'conflict');
  if (L.code) L.code.show(L.tr.events, k, prev, { end: k === L.tr.events.length && L.tr.result ? L.tr.result.status : null });
  if (L.search) { updateSearchLane(L, prev); return; }
  L.view.show(L.rep.board(), L.rep.hot(), L.rep.focus());
  if (L.hasTree) drawTree(L.art.querySelector('.tree'), L.rep.nodes, L.rep.node, h.encoding ? h.encoding.symbols : []);
  if (L.panel) L.panel.draw(k);
  const pd = h.solver.paradigm;
  L.art.querySelector('.bounds').textContent = L.hasTree || L.rep.lb !== null || L.rep.ub !== null
    ? t(`bound ${fmt(L.rep.lb)} · incumbent ${fmt(L.rep.ub)}`, `bound ${fmt(L.rep.lb)} · miglior soluzione ${fmt(L.rep.ub)}`)
    : GAME === 'zebra' ? t('the pegs in a cell are the attributes of its group that may still stand in that house', 'i pioli in una cella sono gli attributi del suo gruppo che possono ancora stare in quella casa')
    : pd === 'csp' && GAME !== 'queens' ? t('the pegs are the values left in each domain', 'i pioli sono i valori rimasti in ogni dominio')
    : pd === 'local search' ? t('a complete assignment, repaired step by step', 'un assegnamento completo, riparato passo per passo')
    : GAME === 'queens' ? t('a crossed cell is a row ruled out for its column', 'una cella con la croce è una riga esclusa per la sua colonna')
    : GAME === 'coloring' ? t('the pegs are the colors not yet ruled out', 'i pioli sono i colori non ancora esclusi')
    : t('the pegs are the values not yet ruled out', 'i pioli sono i valori non ancora esclusi');
  // the frames of the current event (Marks in cells.js)
  if (!L.hasTree && pd !== 'local search') L.art.querySelector('.bounds').textContent += t('; a frame marks what the event acts on: gold the value tried, ink the values propagated, red a conflict, grey the values a backtrack takes back',
    '; una cornice segna ciò su cui agisce l\'evento: dorata il valore provato, color inchiostro i valori propagati, rossa un conflitto, grigia i valori ritirati da un ritorno indietro');
  else if (pd === 'local search') L.art.querySelector('.bounds').textContent += t('; a gold frame marks the variable just changed', '; una cornice dorata segna la variabile appena cambiata');
}

let boardOnly = null;
function emptyBoard(inst) {   // the board of an instance with no trace yet
  if (lanes.length || inst.id !== STATE.inst || OWN.isCustom(inst.id)) return;
  dispose(boardOnly);
  $('lanes').innerHTML = '';
  const art = laneShell(t('The instance', 'L\'istanza'), '');
  art.querySelector('.evline').textContent = t('No trace of a run on this instance yet.', 'Ancora nessuna traccia di un\'esecuzione su questa istanza.');
  $('lanes').dataset.n = 1;
  boardOnly = new BoardView(art.querySelector('.board'), inst, MAPS[inst.id] || null);
  boardOnly.show(inst.vertices.map(v => ({ id: v, colour: -1, mask: (1 << inst.colours.length) - 1 })), new Set());
}

// a lane thrown away gives back its WebGL context
// the end of a run in words: what the status of its result means
const ENDS = {
  sat: ['End: a solution is found.', 'Fine: trovata una soluzione.'],
  optimal: ['End: an optimal solution, proved optimal.', 'Fine: una soluzione ottima, con la prova dell\'ottimalità.'],
  feasible: ['End: a solution, with no proof that it is optimal.', 'Fine: una soluzione, senza la prova che sia ottima.'],
  unsat: ['End: no solution exists, and the solver proved it.', 'Fine: non esiste nessuna soluzione, e il solutore lo ha dimostrato.'],
  infeasible: ['End: no solution exists, and the solver proved it.', 'Fine: non esiste nessuna soluzione, e il solutore lo ha dimostrato.'],
  limit: ['End: the run reached its limit of steps without a solution (a local search cannot prove that none exists).',
    'Fine: l\'esecuzione ha raggiunto il suo limite di passi senza una soluzione (una ricerca locale non può dimostrare che non ne esiste nessuna).'],
  'arc consistent': ['End: every arc is consistent, but cells are still open; propagation alone goes no further, and a search that branches is needed to finish.',
    'Fine: ogni arco è consistente, ma restano celle aperte; la sola propagazione non va oltre, e per finire serve una ricerca che ramifichi.'] };
const endText = st => t(...(ENDS[st] || [`End: ${st}.`, `Fine: ${st}.`]));
function dispose(v) {
  if (!v) return;
  v.S.renderer.dispose();
  v.S.renderer.forceContextLoss();
}
// the lane "You", on the instance of the lanes (or, with no lane chosen, of
// the first trace of the instance), before them
async function buildPlay(trs, req) {
  const m = PLAY[GAME];
  const Game = m && await import(m[0]).then(x => x[m[1]], err => { info.errors.push(m[0] + ': ' + err.message); return null; });
  if (!Game || req !== loadReq) return;
  let tr = trs.find(Boolean) || OWN.playTrace(STATE.inst);
  if (!tr) {
    const x = tracesFor(STATE.inst)[0];
    tr = x ? await openTrace({ url: BASE + x.file }).catch(() => null) : null;
    if (!tr || req !== loadReq) return;
    trs = [tr];
  }
  const art = laneShell('', '');
  $('lanes').prepend(art);
  $('lanes').scrollLeft = 0;    // the row of lanes opens on the lane "You"
  const results = () => (lanes.length ? lanes.map(L => L.tr) : trs.filter(Boolean)).filter(r => !r.header.sample && r.result)
    .map(r => ({ name: r.header.solver.name, result: r.result, header: r.header }));
  you = info.play = new PlayLane(art, Game, tr.header.instance, { results });
}
async function loadLanes() {
  stop();
  const req = ++loadReq;
  lanes.forEach(L => dispose(L.view)); dispose(boardOnly); if (you) dispose(you.game.view);
  lanes = []; boardOnly = null; you = null;
  $('lanes').innerHTML = '';
  const files = STATE.lanes.filter(Boolean);
  const trs = await Promise.all(files.map(f => openTrace({ url: BASE + f }).catch(err => { info.errors.push(f + ': ' + err.message); return null; })));
  if (req !== loadReq) return;
  files.forEach((f, i) => {
    if (!trs[i]) return;
    const L = buildLane(f, trs[i]);
    // the color of the lane, by the select it comes from (charts.js)
    L.slot = Math.max(0, STATE.lanes.indexOf(f));
    L.art.classList.add('lc'); L.art.style.setProperty('--lane', `var(--lane-${L.slot + 1})`);
    lanes.push(L);
  });
  // the run of the reader, after the lanes of the traces (ownrun.js)
  for (const o of OWN.lanes(STATE.inst)) {
    const L = buildLane(o.file, o.tr);
    L.slot = 4; L.art.classList.add('lc'); L.art.style.setProperty('--lane', 'var(--lane-5)');
    lanes.push(L); OWN.decorate(L);
  }
  // the pseudocode under each lane and the box of its questions (pseudocode.js, predict.js)
  if (PRED) PRED.pend.clear();
  for (const L of lanes) { const pn = L.art.querySelector('.panel'); L.code = attachCode(pn, L.tr.header); if (PRED) PRED.attach(L, pn, arenaNote(L.tr)); }
  await buildPlay(trs, req);
  $('lanes').dataset.n = lanes.length + (you ? 1 : 0);
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
// event, at most MAXEV for the events of the search and again one position
// for each move of the solution paths, up to MAXPATH; by time, at most
// MAXEV; a long trace is sampled evenly.
const SEARCHPOS = 50, MAXPATH = 40, MAXEV = 80;
// a search with few expansions takes one position for each
const searchPos = () => Math.min(SEARCHPOS, Math.max(1, ...lanes.map(L => L.rep.work)));
const nsearch = L => (L.rep.nsearch === undefined ? L.tr.events.length : L.rep.nsearch);
const pathLen = L => L.tr.events.length - nsearch(L);
const longest = f => Math.max(0, ...lanes.map(f));
const pathStride = () => Math.max(1, longest(pathLen) / MAXPATH);
const evStride = () => Math.max(1, longest(nsearch) / MAXEV);
const evPos = () => Math.ceil(longest(nsearch) / evStride());
function maxPos() {
  if (STATE.align === 'work') return searchPos() + Math.ceil(longest(pathLen) / pathStride());
  return STATE.align === 'time' ? MAXEV : evPos() + Math.ceil(longest(pathLen) / pathStride());
}
const maxWork = () => Math.max(1, ...lanes.map(L => L.rep.work));
function laneK(L, p) {
  if (STATE.align === 'work') {
    if (p > searchPos()) return nsearch(L) + Math.min(Math.round((p - searchPos()) * pathStride()), pathLen(L));
    return L.rep.atWork(maxWork() * p / searchPos());
  }
  if (STATE.align !== 'time') {
    if (p > evPos()) return nsearch(L) + Math.min(Math.round((p - evPos()) * pathStride()), pathLen(L));
    return Math.min(Math.round(p * evStride()), nsearch(L));
  }
  const T = Math.max(...lanes.map(L => L.tr.events.at(-1).t)) * p / MAXEV, ev = L.tr.events;
  let lo = 0, hi = ev.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t <= T) lo = m + 1; else hi = m; }
  return lo;
}
// mode 'ask': a step of the reader, which in the mode "predict" halts a lane
// before its event to ask about it; 'keep': a redraw that keeps the questions
function setPos(p, mode) {
  STATE.pos = Math.max(0, Math.min(p, maxPos()));
  $('time').max = maxPos(); $('time').value = STATE.pos;
  if (STATE.align === 'time' && lanes.length) {
    const T = Math.max(...lanes.map(L => L.tr.events.at(-1).t)) * STATE.pos / MAXEV;
    $('iter').textContent = (T * 1000).toFixed(T < 0.01 ? 2 : 1) + ' ms';
  } else if (STATE.align === 'work' && lanes.length) {
    $('iter').textContent = STATE.pos <= searchPos() ? Math.round(maxWork() * STATE.pos / searchPos()) + t(' expanded', ' espansi')
      : t('path ', 'cammino ') + Math.min(Math.round((STATE.pos - searchPos()) * pathStride()), longest(pathLen));
  } else $('iter').textContent = `${STATE.pos} / ${maxPos()}`;
  let asked = false;
  for (const L of lanes) {
    const k = laneK(L, STATE.pos), pd = PRED && PRED.pending(L);
    if (pd && mode === 'keep') { updateLane(L, pd.k - 1); continue; }
    if (pd) PRED.drop(L);
    if (mode === 'ask' && PRED && PRED.on && k > L.k && k > 0) {
      updateLane(L, k - 1);
      const q = arenaQuestion(L, L.tr.events[k - 1], GAME);
      if (q) { PRED.pose(L, q, k, () => updateLane(L, k)); asked = true; continue; }
    }
    if (PRED) PRED.clear(L);
    updateLane(L, k);
  }
  if (asked || STATE.pos >= maxPos()) stop();
}
let acc = 0, lastT = 0;
function tick(now) {
  if (!STATE.playing) return;
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  acc += dt * STATE.speed;
  if (acc >= 1) { const s = Math.floor(acc); acc -= s; setPos(STATE.pos + s, 'ask'); }
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
      return `<tr><td><span class="lchip" style="--lane:var(--lane-${L.slot + 1})">${esc(laneName(L.file, L.tr.header.solver.name))}</span></td><td>${esc(r.status)}</td>${hasCost ? `<td>${fmt(r.cost)}</td>` : ''}<td>${r.events ?? L.tr.events.length}${r.capped ? t(' (capped)', ' (troncati)') : ''}</td>${keys.map(k => `<td>${cell(r.stats[k])}</td>`).join('')}</tr>`; }).join('');
  charts(real);
}
// the section "charts" under the scoreboard (charts.js), closed by default
function charts(real) {
  let det = $('charts');
  if (!det) {
    det = document.createElement('details');
    det.id = 'charts'; det.className = 'charts';
    det.innerHTML = '<summary></summary><div class="cbody"></div>';
    $('score').append(det);
    det.addEventListener('toggle', () => { if (det.open) charts(lanes.filter(L => !L.tr.header.sample && L.tr.result)); });
  }
  det.querySelector('summary').textContent = t('Charts: the lanes compared', 'Grafici: le corsie a confronto');
  if (!det.open) return;
  drawCharts(det.querySelector('.cbody'), real.map(L => ({ name: laneName(L.file, L.tr.header.solver.name), slot: L.slot, tr: L.tr })), GAME);
}

// ---------------------------------------------------------------- wiring
function chooseInstance(id = instId()) {
  STATE.inst = id;
  showInstControls();
  STATE.lanes = tracesFor(STATE.inst).map(x => x.file).slice(0, DEFLANES);
  laneSelects(); writeHash(); model(STATE.inst); loadLanes();
}
function texts() {
  if (LISTED) showInstControls();
  laneSelects();
  stop();
  for (const L of lanes) { L.k = -1; heurTexts(L); }
  setPos(STATE.pos, 'keep');
  scoreboard();
  if (you) you.texts();
  if (lastModel) renderModel(lastModel);
}

async function main() {
  readHash();
  await OWN.prepare(STATE.inst);
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
  if (!STATE.lanes.length) STATE.lanes = tracesFor(STATE.inst).map(x => x.file).slice(0, DEFLANES);
  laneSelects();
  $('inst').onchange = () => { if (!LISTED) $('planarbox').hidden = $('inst').value !== 'planar'; chooseInstance(); };
  if (!LISTED) $('level').onchange = $('seed').onchange = () => chooseInstance();
  $('align').onchange = () => { STATE.align = $('align').value; STATE.alignAuto = false; writeHash(); stop(); for (const L of lanes) L.k = -1; setPos(0); };
  $('speed').onchange = () => { STATE.speed = +$('speed').value; };
  $('time').oninput = () => { stop(); setPos(+$('time').value); };
  $('reset').onclick = () => { stop(); setPos(0); };
  $('step').onclick = () => { stop(); setPos(STATE.pos + 1, 'ask'); };
  PRED = info.predict = new Predict(document.querySelector('.controls .settings'));
  $('play').onclick = () => (STATE.playing ? stop() : play());
  onLang(texts);
  OWN.init({ game: GAME, inst: () => STATE.inst, reload: loadLanes, lanes: () => lanes,
    choose: async id => { await OWN.prepare(id); chooseInstance(id); } });
  writeHash();
  model(STATE.inst);
  await loadLanes();
  info.loaded = true;
}
main().catch(err => { info.errors.push(String(err && err.stack || err)); });
