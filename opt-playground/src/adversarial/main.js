// The scenes of the two-player games, games-tictactoe.html and
// games-connect4.html, named by <body data-game>: for a position of the
// game, one lane for each search of aima.games recorded on it
// (traces/games/<game>/, by tools/aima_games_trace.py), each a board in 3D
// with, under it, the game tree the search explores, all in step on one
// timeline; and first the lane "You", where the reader plays against the
// search chosen in its menu. The page searches only in that lane, when a
// position has no recorded trace, with the port of engine.js.

import * as THREE from 'three';
import { t, bi, onLang } from '../i18n.js';
import { GameBoard, cellName } from './board.js';
import { parseTrace, fmt, same } from './replay.js';
import { TreePanel } from './gametree.js';
import * as E from './engine.js';

const $ = id => document.getElementById(id);
const GAME = document.body.dataset.game, C4 = GAME === 'connect4';
const BASE = `traces/games/${GAME}/`;
const MAXPOS = 200;
const ORDER = ['aima-minimax', 'aima-alphabeta', 'aima-cutoff', 'aima-mcts'];
const INSTNAMES = {
  opening: ['opening', 'apertura'], middle: ['middle game', 'mediogioco'], end: ['near the end', 'verso la fine'] };
const ALGO = {
  'aima-minimax': ['Minimax', 'Minimax', 'minmax_decision, the whole tree', 'minmax_decision, l\'albero intero'],
  'aima-alphabeta': ['Alpha-beta', 'Alfa-beta', 'alpha_beta_search, to the end of the game', 'alpha_beta_search, fino alla fine della partita'],
  'aima-cutoff': ['Alpha-beta with cutoff', 'Alfa-beta con taglio', 'alpha_beta_cutoff_search, depth 4 and an evaluation', 'alpha_beta_cutoff_search, profondità 4 e una valutazione'],
  'aima-mcts': ['Monte Carlo tree search', 'Ricerca ad albero Monte Carlo', 'monte_carlo_tree_search, 1000 iterations', 'monte_carlo_tree_search, 1000 iterazioni'] };
const COUNTERS = {
  nodes: ['nodes', 'nodi'], leaves: ['leaves', 'foglie'], pruned: ['pruned', 'potati'], cutoffs: ['cut off', 'tagliati'],
  iterations: ['iterations', 'iterazioni'], playouts_won: ['won', 'vinte'], playouts_drawn: ['drawn', 'pari'] };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const info = window.__adv = { errors: [], game: GAME };
window.addEventListener('error', e => { if (!/ResizeObserver loop/.test(e.message)) info.errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', e => info.errors.push(String(e.reason && e.reason.message || e.reason)));

const STATE = { inst: 'opening', pos: 0, playing: false, speed: 1 };
let INDEX = [], lanes = [], you = null, timer = null, req = 0;
const cache = new Map();
const fetchTrace = file => {
  if (!cache.has(file)) cache.set(file, fetch(BASE + file).then(r => { if (!r.ok) throw new Error(file + ': ' + r.status); return r.text(); }).then(parseTrace));
  return cache.get(file);
};

// ---------------------------------------------------------------- a lane
function laneShell(name, where) {
  const art = document.createElement('article');
  art.className = 'lane';
  art.innerHTML = `<header><h3>${esc(name)}</h3><p class="where">${esc(where)}</p></header>
    <dl class="stats counters"></dl><p class="evline" aria-live="polite"></p><div class="board"></div><div class="panel"></div>`;
  return art;
}

class TraceLane {
  constructor(R) {
    this.R = R;
    const id = R.head.solver.id, a = ALGO[id];
    this.art = laneShell(t(a[0], a[1]), t(a[2], a[3]));
    this.view = new GameBoard(this.art.querySelector('.board'), GAME);
    this.art.querySelector('.panel').innerHTML = `<figure class="gtpanel"><figcaption class="scap"></figcaption><div class="sbox"></div><p class="sstat"></p></figure>`;
    this.tree = new TreePanel(this.art.querySelector('.sbox'));
    this.k = -1;
  }
  at(k) {
    const R = this.R;
    this.k = k;
    const e = R.events[k];
    const names = R.head.counters, a = ALGO[R.head.solver.id];
    this.art.querySelector('h3').textContent = t(a[0], a[1]);
    this.art.querySelector('.where').textContent = t(a[2], a[3]);
    this.art.querySelector('.counters').innerHTML = `<div><dt>${t('event', 'evento')}</dt><dd>${k + 1}</dd></div>` +
      names.map(n => `<div><dt>${esc(t(...(COUNTERS[n] || [n, n])))}</dt><dd>${e.n[n]}</dd></div>`).join('');
    this.art.querySelector('.evline').textContent = t(...R.line(k));
    this.view.show(R.board(k));
    this.tree.draw(R, k);
    const cap = R.kind === 'mcts'
      ? t('The tree of the search: each disc is a move, as large as its visits, with visits·wins of the side that plays it; the path of the iteration is unfolded, the other moves fold their subtree into +n.',
        'L\'albero della ricerca: ogni disco è una mossa, grande quanto le sue visite, con visite·vittorie di chi la gioca; il cammino dell\'iterazione è aperto, le altre mosse chiudono il loro sottoalbero in +n.')
      : R.ab
        ? t('The game tree: ▲ MAX, ▼ MIN, the value under each node (≥ or ≤ while it is open), the window α, β of the path at the left; pruned moves are dashed, other subtrees folded into +n.',
          'L\'albero di gioco: ▲ MAX, ▼ MIN, il valore sotto ogni nodo (≥ o ≤ finché è aperto), la finestra α, β del cammino a sinistra; le mosse potate sono tratteggiate, gli altri sottoalberi chiusi in +n.')
        : t('The game tree: ▲ MAX, ▼ MIN, the value under each node (≥ or ≤ while it is open), backed up from the leaves; only the path of the event is unfolded, other subtrees fold into +n.',
          'L\'albero di gioco: ▲ MAX, ▼ MIN, il valore sotto ogni nodo (≥ o ≤ finché è aperto), riportato dalle foglie; solo il cammino dell\'evento è aperto, gli altri sottoalberi sono chiusi in +n.');
    this.art.querySelector('.scap').textContent = cap;
    const mv = R.chosen();
    this.art.querySelector('.sstat').textContent = mv
      ? t(`move chosen by aima-python: ${cellName(C4, mv)}`, `mossa scelta da aima-python: ${cellName(C4, mv)}`) : '';
  }
  dispose() { this.view.S.renderer.dispose(); this.view.S.renderer.forceContextLoss(); }
}

// ---------------------------------------------------------------- the lane "You"
class YouLane {
  constructor() {
    this.art = laneShell('', '');
    this.art.classList.add('play');
    this.g = E.makeGame(GAME);
    this.view = new GameBoard(this.art.querySelector('.board'), GAME);
    const algos = C4 ? ['aima-cutoff', 'aima-mcts'] : ['aima-minimax', 'aima-alphabeta', 'aima-mcts'];
    this.art.querySelector('.panel').innerHTML = `<p class="howto"></p><div class="playbar">
      <label>${bi('against', 'contro')} <select class="opp">${algos.map(a => `<option value="${a}"></option>`).join('')}</select></label>
      <label>${bi('from', 'da')} <select class="from"><option value="inst"></option><option value="empty"></option></select></label>
      <label>${bi('first', 'per primo')} <select class="first"><option value="you"></option><option value="algo"></option></select></label>
      <button type="button" class="newgame">${bi('New game', 'Nuova partita')}</button></div>`;
    const q = s => this.art.querySelector(s);
    q('.opp').value = algos.includes('aima-alphabeta') ? 'aima-alphabeta' : algos[0];
    for (const s of ['.opp', '.from', '.first']) q(s).onchange = () => this.reset();
    q('.newgame').onclick = () => this.reset();
    this.wire();
  }
  // the words of the menus (an option holds no markup, so they follow the language here)
  words() {
    const q = s => this.art.querySelector(s);
    q('.opp').querySelectorAll('option').forEach(o => { o.textContent = t(ALGO[o.value][0], ALGO[o.value][1]); });
    const [a, b] = q('.from').options, [c, d] = q('.first').options;
    a.textContent = t('this position', 'questa posizione'); b.textContent = t('the empty board', 'la tavola vuota');
    c.textContent = t('you', 'tu'); d.textContent = t('the algorithm', 'l\'algoritmo');
  }
  get opp() { return this.art.querySelector('.opp').value; }
  reset() {
    clearTimeout(this.pending);
    const fromInst = this.art.querySelector('.from').value === 'inst';
    const inst = INDEX.find(x => x.instance === STATE.inst);
    this.start = fromInst && inst ? inst.played : [];
    this.s = E.play(this.g, this.start);
    this.me = this.art.querySelector('.first').value === 'you' ? this.s.to_move : (this.s.to_move === 'X' ? 'O' : 'X');
    this.moves = []; this.mine = 0; this.refused = 0; this.optimal = 0; this.misses = [];
    this.thinking = false;
    this.say = [`You play ${this.me}${this.me === this.s.to_move ? ', and it is your turn' : ''}.`, `Giochi con ${this.me}${this.me === this.s.to_move ? ', e tocca a te' : ''}.`];
    this.kind = '';
    this.draw();
    if (this.s.to_move !== this.me) this.reply();
  }
  pieces() {
    const base = this.start.map(([x, y], i) => ({ x, y, p: i % 2 ? 'O' : 'X', kind: 'base' }));
    return [...base, ...this.moves.map(m => ({ x: m.c[0], y: m.c[1], p: m.p, kind: 'you' }))];
  }
  draw() {
    this.words();
    const last = this.moves.at(-1);
    this.view.show({ pieces: this.pieces(), hot: last ? last.c : null });
    const c = [[t('your moves', 'tue mosse'), this.mine], [t('refused', 'rifiutate'), this.refused]];
    if (!C4) c.push([t('optimal', 'ottime'), `${this.optimal} / ${this.mine}`]);
    this.art.querySelector('.counters').innerHTML = c.map(([n, v]) => `<div><dt>${esc(n)}</dt><dd>${v}</dd></div>`).join('');
    this.art.querySelector('h3').textContent = t('You', 'Tu');
    this.art.querySelector('.where').textContent = t(`you play ${this.me}, against the search chosen below`, `giochi con ${this.me}, contro la ricerca scelta sotto`);
    this.art.querySelector('.evline').textContent = t(...this.say);
    this.art.classList.toggle('conflict', this.kind === 'conflict');
    this.art.classList.toggle('solved', this.kind === 'end');
    this.art.querySelector('.howto').textContent = C4
      ? t('Click a column to drop your disc; the search answers with its move. Drag to turn the board.', 'Fai clic su una colonna per lasciar cadere il tuo disco; la ricerca risponde con la sua mossa. Trascina per ruotare la tavola.')
      : t('Click an empty cell to play your mark; the search answers with its move. Drag to turn the board.', 'Fai clic su una cella vuota per mettere il tuo segno; la ricerca risponde con la sua mossa. Trascina per ruotare la tavola.');
  }
  refuse(en, it) {
    this.refused++;
    this.say = [en, it]; this.kind = 'conflict';
    this.art.classList.add('refused');
    clearTimeout(this.flash);
    this.flash = setTimeout(() => this.art.classList.remove('refused'), 1200);
    this.draw();
    return false;
  }
  // a move of the reader: a cell of tic-tac-toe, a column of connect four
  act(target) {
    const g = this.g, s = this.s;
    if (E.terminal(s)) return this.refuse('The game is over: press New game to play again.', 'La partita è finita: premi Nuova partita per giocare ancora.');
    if (this.thinking || s.to_move !== this.me) return this.refuse(`Not your turn: ${s.to_move} is to move, and the search is choosing.`, `Non è il tuo turno: muove ${s.to_move}, e la ricerca sta scegliendo.`);
    let m;
    if (C4) {
      m = E.dropCell(g, s, target);
      if (!m) return this.refuse(`Column ${target} is full: choose another one.`, `La colonna ${target} è piena: scegline un'altra.`);
    } else {
      m = target;
      const p = s.board[E.key(...m)];
      if (p) return this.refuse(`${cellName(false, m)} is taken by ${p}: choose an empty cell.`, `${cellName(false, m)} è già occupata da ${p}: scegli una cella vuota.`);
    }
    // the verdict on the move, by the minimax values (tic-tac-toe only)
    let verdict = ['', ''];
    if (!C4) {
      const vals = E.moveValues(g, s), best = Math.max(...vals.map(x => x.v)), mine = vals.find(x => same(x.move, m)).v;
      const word = v => (v > 0 ? ['a win', 'una vittoria'] : v < 0 ? ['a loss', 'una sconfitta'] : ['a draw', 'un pari']);
      if (mine === best) { this.optimal++; verdict = [` It is optimal: with best play it leads to ${word(mine)[0]}.`, ` È ottima: con il gioco migliore porta a ${word(mine)[1]}.`]; }
      else {
        const b = vals.find(x => x.v === best).move;
        this.misses.push([cellName(false, m), cellName(false, b), mine, best]);
        verdict = [` It is not optimal: it leads to ${word(mine)[0]}, while ${cellName(false, b)} kept ${word(best)[0]}.`, ` Non è ottima: porta a ${word(mine)[1]}, mentre ${cellName(false, b)} teneva ${word(best)[1]}.`];
      }
    }
    this.s = E.result(g, s, m);
    this.moves.push({ c: m, p: this.me }); this.mine++;
    this.kind = '';
    this.say = [`You play ${cellName(C4, m)}.${verdict[0]}`, `Giochi ${cellName(C4, m)}.${verdict[1]}`];
    if (C4) this.say = [`You drop in column ${m[1]}.`, `Lasci cadere nella colonna ${m[1]}.`];
    if (!this.end()) { this.draw(); this.reply(); }
    return true;
  }
  // the answer of the search: the move of the recorded trace if this
  // position is one of the recorded ones, else the port of engine.js
  async reply() {
    this.thinking = true;
    const s = this.s, g = this.g, algo = this.opp, said = this.say;
    const t0 = performance.now();
    let move = null, how;
    const inst = INDEX.find(x => x.solver.id === algo && samePos(E.play(g, x.played || []), s));
    if (inst) {
      try { const R = await fetchTrace(inst.file); move = R.chosen(); how = ['replayed from its recorded trace', 'ripresa dalla sua traccia registrata']; } catch (e) { move = null; }
    }
    if (!move) {
      await new Promise(r => setTimeout(r, 30));
      move = algo === 'aima-minimax' ? E.minimax(g, s).move : algo === 'aima-alphabeta' ? E.alphaBeta(g, s).move
        : algo === 'aima-cutoff' ? E.cutoff(g, s).move : E.mcts(g, s, 1000, E.mulberry(this.moves.length + 1)).move;
      how = ['computed in the page by the port of aima-python', 'calcolata nella pagina dalla versione JS di aima-python'];
    }
    const wait = Math.max(0, 700 - (performance.now() - t0));
    this.pending = setTimeout(() => {
      if (this.s !== s) return;
      this.s = E.result(g, s, move);
      this.moves.push({ c: move, p: s.to_move });
      this.thinking = false;
      const a = ALGO[algo];
      const mn = C4 ? [`column ${move[1]}`, `colonna ${move[1]}`] : [cellName(false, move), cellName(false, move)];
      this.say = [`${said[0]} ${a[0]} answers ${mn[0]} (${how[0]}).`, `${said[1]} ${a[1]} risponde ${mn[1]} (${how[1]}).`];
      if (this.say[0].startsWith(' ')) this.say = this.say.map(x => x.trim());
      if (!this.end()) { this.say = [this.say[0] + ' Your turn.', this.say[1] + ' Tocca a te.']; this.draw(); }
    }, wait);
  }
  end() {
    const s = this.s;
    if (!E.terminal(s)) return false;
    const u = E.utility(s, this.me);
    const res = u > 0 ? ['You win!', 'Hai vinto!'] : u < 0 ? [`The search wins (${this.me === 'X' ? 'O' : 'X'} has ${this.g.k} in a row).`, `Vince la ricerca (${this.me === 'X' ? 'O' : 'X'} ha ${this.g.k} in fila).`] : ['A draw: the board is full.', 'Pari: la tavola è piena.'];
    let opt = ['', ''];
    if (!C4 && this.mine) {
      opt = this.misses.length
        ? [` ${this.optimal} of your ${this.mine} moves were optimal by the minimax value; ${this.misses.map(([m, b, v, w]) => `${m} (${fmt(v)}, while ${b} gave ${fmt(w)})`).join(', ')} ${this.misses.length > 1 ? 'were' : 'was'} not.`,
          ` ${this.optimal} delle tue ${this.mine} mosse erano ottime per il valore minimax; ${this.misses.map(([m, b, v, w]) => `${m} (${fmt(v)}, mentre ${b} dava ${fmt(w)})`).join(', ')} ${this.misses.length > 1 ? 'no' : 'no'}.`]
        : [` All your ${this.mine} moves were optimal by the minimax value.`, ` Tutte le tue ${this.mine} mosse erano ottime per il valore minimax.`];
    }
    this.thinking = false;
    this.say = [`${this.say[0]} ${res[0]}${opt[0]}`, `${this.say[1]} ${res[1]}${opt[1]}`];
    this.kind = 'end';
    this.draw();
    return true;
  }
  // a click (a press and release that barely moves, so that a drag still
  // turns the board) plays the cell or the column under the pointer
  wire() {
    const S = this.view.S, cv = S.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    cv.setAttribute('aria-label', t('your board', 'la tua tavola'));
    const pick = e => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      S.scene.updateMatrixWorld(); S.camera.updateMatrixWorld();
      ray.setFromCamera(ndc, S.camera);
      const h = ray.intersectObjects(this.view.targets, false)[0];
      return h ? (C4 ? h.object.userData.col : h.object.userData.cell) : null;
    };
    let down = null;
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; }
      down = null;
      const p = pick(e);
      if (p !== null && p !== undefined) this.act(p);
    });
    cv.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const p = pick(e);
      if (p === null || p === undefined || E.terminal(this.s)) { this.view.setHover(null); return; }
      this.view.setHover(C4 ? E.dropCell(this.g, this.s, p) : (this.s.board[E.key(...p)] ? null : p));
    });
    cv.addEventListener('pointerleave', () => this.view.setHover(null));
    // for the tests: the point of the canvas where a cell or a column is picked
    this.where = c => {
      const v = new THREE.Vector3(...this.view.at(...(C4 ? [3, c] : c))).project(S.camera), r = cv.getBoundingClientRect();
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    };
  }
}
function samePos(a, b) {
  if (a.to_move !== b.to_move) return false;
  const ka = Object.keys(a.board), kb = Object.keys(b.board);
  return ka.length === kb.length && ka.every(k => a.board[k] === b.board[k]);
}

// ---------------------------------------------------------------- the timeline
const total = () => Math.max(1, ...lanes.map(L => Math.min(L.R.length, MAXPOS)));
function laneStep(L, p) {
  const n = L.R.length, T = total();
  return n <= T ? Math.min(p, n - 1) : Math.round(p * (n - 1) / Math.max(1, T - 1));
}
function render() {
  const T = total();
  $('time').max = T - 1;
  $('time').value = STATE.pos;
  $('iter').textContent = `${STATE.pos + 1} / ${T}`;
  for (const L of lanes) L.at(laneStep(L, STATE.pos));
}
function setPlaying(on) {
  STATE.playing = on;
  clearInterval(timer);
  $('play').innerHTML = on ? bi('Pause', 'Pausa') : bi('Play', 'Avvia');
  if (on) timer = setInterval(() => {
    if (STATE.pos >= total() - 1) { setPlaying(false); return; }
    STATE.pos++; render();
  }, 1000 / STATE.speed);
}

async function load() {
  const r = ++req;
  setPlaying(false);
  const files = INDEX.filter(x => x.instance === STATE.inst).sort((a, b) => ORDER.indexOf(a.solver.id) - ORDER.indexOf(b.solver.id));
  const Rs = await Promise.all(files.map(x => fetchTrace(x.file)));
  if (r !== req) return;
  for (const L of lanes) { L.art.remove(); L.dispose(); }
  lanes = Rs.map(R => new TraceLane(R));
  const box = $('lanes');
  box.replaceChildren(you.art, ...lanes.map(L => L.art));
  box.dataset.n = lanes.length + 1;
  STATE.pos = 0;
  you.reset();
  history.replaceState(null, '', '#inst=' + STATE.inst);
  render();
}

async function main() {
  const h = new URLSearchParams(location.hash.slice(1));
  const idx = await (await fetch(BASE + 'index.json')).json();
  // the moves played of each instance, from the header of its first trace
  INDEX = idx.traces;
  const heads = await Promise.all([...new Set(INDEX.map(x => x.instance))].map(async id => {
    const R = await fetchTrace(INDEX.find(x => x.instance === id).file);
    return [id, R.head.instance.played];
  }));
  const played = Object.fromEntries(heads);
  for (const x of INDEX) x.played = played[x.instance];
  const ids = Object.keys(INSTNAMES).filter(id => played[id]);
  if (h.get('inst') && ids.includes(h.get('inst'))) STATE.inst = h.get('inst');
  const names = () => {
    $('inst').innerHTML = ids.map(id => {
      const p = played[id], who = p.length % 2 ? 'O' : 'X';
      return `<option value="${id}">${esc(t(...INSTNAMES[id]))} · ${p.length} ${t('moves played', 'mosse giocate')}, ${t(`${who} to move`, `muove ${who}`)}</option>`;
    }).join('');
    $('inst').value = STATE.inst;
  };
  names();
  you = new YouLane();
  $('inst').onchange = () => { STATE.inst = $('inst').value; load(); };
  $('speed').onchange = () => { STATE.speed = parseFloat($('speed').value); if (STATE.playing) setPlaying(true); };
  $('reset').onclick = () => { setPlaying(false); STATE.pos = 0; render(); };
  $('step').onclick = () => { setPlaying(false); STATE.pos = Math.min(total() - 1, STATE.pos + 1); render(); };
  $('play').onclick = () => { if (!STATE.playing && STATE.pos >= total() - 1) STATE.pos = 0; setPlaying(!STATE.playing); };
  $('time').oninput = () => { setPlaying(false); STATE.pos = parseInt($('time').value, 10); render(); };
  onLang(() => { names(); render(); you.draw(); });
  await load();
  info.ready = true;
}
info.lanes = () => lanes;
info.you = () => you;
info.setPos = p => { setPlaying(false); STATE.pos = Math.max(0, Math.min(total() - 1, p)); render(); };
info.total = total;
main().catch(e => info.errors.push(String(e && e.message || e)));
