// The rules of TicTacToe and ConnectFour and the searches of aima.games
// (aima-python), ported line by line so that, on the same position, they
// try the moves in the same order and return the same move: the lane "You"
// of games-tictactoe.html and games-connect4.html answers the reader with
// them when a position has no recorded trace. A state is, as in aima,
// { to_move, utility, board, moves }: board maps "x,y" (x the row from the
// top, y the column, both from 1) to 'X' or 'O', moves lists the empty
// cells in the order of aima (by row, then by column), utility is +1 when X
// has just won, -1 when O has, 0 otherwise. No DOM here.

export const key = (x, y) => x + ',' + y;

export function makeGame(kind) {
  const c4 = kind === 'connect4';
  const g = { kind, c4, h: c4 ? 6 : 3, v: c4 ? 7 : 3, k: c4 ? 4 : 3 };
  const moves = [];
  for (let x = 1; x <= g.h; x++) for (let y = 1; y <= g.v; y++) moves.push([x, y]);
  g.initial = { to_move: 'X', utility: 0, board: {}, moves };
  return g;
}

export function actions(g, s) {
  if (!g.c4) return s.moves;
  return s.moves.filter(([x, y]) => x === g.h || s.board[key(x + 1, y)] !== undefined);
}

function kInRow(g, board, [x0, y0], player, [dx, dy]) {
  let n = 0, x = x0, y = y0;
  while (board[key(x, y)] === player) { n++; x += dx; y += dy; }
  x = x0; y = y0;
  while (board[key(x, y)] === player) { n++; x -= dx; y -= dy; }
  return n - 1 >= g.k;
}

function computeUtility(g, board, move, player) {
  if (kInRow(g, board, move, player, [0, 1]) || kInRow(g, board, move, player, [1, 0]) ||
      kInRow(g, board, move, player, [1, -1]) || kInRow(g, board, move, player, [1, 1])) return player === 'X' ? 1 : -1;
  return 0;
}

export function result(g, s, m) {
  const i = s.moves.findIndex(([x, y]) => x === m[0] && y === m[1]);
  if (i < 0) return s;
  const board = { ...s.board, [key(m[0], m[1])]: s.to_move };
  const moves = s.moves.slice(); moves.splice(i, 1);
  return { to_move: s.to_move === 'X' ? 'O' : 'X', utility: computeUtility(g, board, m, s.to_move), board, moves };
}

export const utility = (s, p) => (p === 'X' ? s.utility : -s.utility);
export const terminal = s => s.utility !== 0 || s.moves.length === 0;

// the state after a list of moves from the empty board
export function play(g, cells) {
  let s = g.initial;
  for (const c of cells) s = result(g, s, c);
  return s;
}
// the cell where a disc dropped in column y lands, or null if the column is full
export const dropCell = (g, s, y) => actions(g, s).find(m => m[1] === y) || null;

// Python's max(xs, key=f): the first element of greatest key
function argmax(xs, f) {
  let best = null, bv = -Infinity;
  for (const a of xs) { const v = f(a); if (best === null || v > bv) { best = a; bv = v; } }
  return best;
}

// minmax_decision; the values of a state are memoized on its board, which
// changes the work and not the value nor the move
export function minimax(g, s) {
  const player = s.to_move, memo = new Map();
  const id = st => Object.keys(st.board).sort().map(k => k + st.board[k]).join(';');
  const value = (st, isMax) => {
    if (terminal(st)) return utility(st, player);
    const k = id(st);
    if (memo.has(k)) return memo.get(k);
    let v = isMax ? -Infinity : Infinity;
    for (const a of actions(g, st)) v = isMax ? Math.max(v, value(result(g, st, a), false)) : Math.min(v, value(result(g, st, a), true));
    memo.set(k, v);
    return v;
  };
  const vals = new Map();
  const move = argmax(actions(g, s), a => { const v = value(result(g, s, a), false); vals.set(key(...a), v); return v; });
  return { move, values: vals };
}

// alpha_beta_search, and alpha_beta_cutoff_search with depth d and eval_fn
export function alphaBeta(g, s, opts = {}) {
  const player = s.to_move, cut = opts.cutoff;
  const d = opts.d ?? 4, evalFn = opts.evalFn || (st => utility(st, player));
  const stop = (st, depth) => (cut ? depth > d || terminal(st) : terminal(st));
  let nodes = 0;
  function maxValue(st, alpha, beta, depth) {
    nodes++;
    if (stop(st, depth)) return cut ? evalFn(st) : utility(st, player);
    let v = -Infinity;
    for (const a of actions(g, st)) {
      v = Math.max(v, minValue(result(g, st, a), alpha, beta, depth + 1));
      if (v >= beta) return v;
      alpha = Math.max(alpha, v);
    }
    return v;
  }
  function minValue(st, alpha, beta, depth) {
    nodes++;
    if (stop(st, depth)) return cut ? evalFn(st) : utility(st, player);
    let v = Infinity;
    for (const a of actions(g, st)) {
      v = Math.min(v, maxValue(result(g, st, a), alpha, beta, depth + 1));
      if (v <= alpha) return v;
      beta = Math.min(beta, v);
    }
    return v;
  }
  let best = -Infinity, bestAction = null;
  for (const a of actions(g, s)) {
    const v = minValue(result(g, s, a), best, Infinity, 1);
    if (v > best) { best = v; bestAction = a; }
  }
  return { move: bestAction, value: best, nodes };
}

// EVAL of tools/aima_games_trace.py: a won position is worth +-1000, any
// other the sum over the windows of 4 cells holding pieces of one side only
// of 1, 3 or 9 for 1, 2 or 3 pieces, positive for the pieces of player
const W = [0, 1, 3, 9, 27];
export function evalC4(g, s, player) {
  if (s.utility !== 0) return 1000 * (player === 'X' ? s.utility : -s.utility);
  const b = s.board;
  let score = 0;
  for (let x = 1; x <= g.h; x++) for (let y = 1; y <= g.v; y++) {
    for (const [dx, dy] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let ok = true, mine = 0, theirs = 0;
      for (let i = 0; i < 4; i++) {
        const cx = x + i * dx, cy = y + i * dy;
        if (cx < 1 || cx > g.h || cy < 1 || cy > g.v) { ok = false; break; }
        const p = b[key(cx, cy)];
        if (p === player) mine++; else if (p !== undefined) theirs++;
      }
      if (!ok) continue;
      if (theirs === 0) score += W[mine]; else if (mine === 0) score -= W[theirs];
    }
  }
  return score;
}
export const cutoff = (g, s) => alphaBeta(g, s, { cutoff: true, d: 4, evalFn: st => evalC4(g, st, s.to_move) });

// monte_carlo_tree_search with N iterations, on a seeded generator of its
// own (not the one of Python, so its playouts are not those of a trace)
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mcts(g, s, N = 1000, rng = mulberry(1)) {
  const node = (state, parent) => ({ state, parent, U: 0, N: 0, children: [] });
  const ucb = n => (n.N === 0 ? Infinity : n.U / n.N + 1.4 * Math.sqrt(Math.log(n.parent.N) / n.N));
  const select = n => (n.children.length ? select(argmax(n.children, c => ucb(c.node)).node) : n);
  const expand = n => {
    if (!n.children.length && !terminal(n.state)) n.children = actions(g, n.state).map(a => ({ node: node(result(g, n.state, a), n), a }));
    return select(n);
  };
  const simulate = st => {
    const player = st.to_move;
    while (!terminal(st)) { const acts = actions(g, st); st = result(g, st, acts[Math.floor(rng() * acts.length)]); }
    return -utility(st, player);
  };
  const backprop = (n, u) => { if (u > 0) n.U += u; n.N += 1; if (n.parent) backprop(n.parent, -u); };
  const root = node(s, null);
  for (let i = 0; i < N; i++) {
    const leaf = select(root), child = expand(leaf);
    backprop(child, simulate(child.state));
  }
  const best = argmax(root.children, c => c.node.N);
  return { move: best.a, children: root.children.map(c => ({ move: c.a, N: c.node.N, U: c.node.U })) };
}

// the minimax value of every move of s for the side to move (+1 win, 0
// draw, -1 loss), memoized; for the verdict on the moves of the reader
export function moveValues(g, s) {
  const memo = new Map();
  const id = st => st.to_move + Object.keys(st.board).sort().map(k => k + st.board[k]).join(';');
  const neg = st => {
    if (terminal(st)) return st.utility === 0 ? 0 : -1; // the side to move has just lost
    const k = id(st);
    if (memo.has(k)) return memo.get(k);
    let v = -Infinity;
    for (const a of actions(g, st)) v = Math.max(v, -neg(result(g, st, a)));
    memo.set(k, v);
    return v;
  };
  return actions(g, s).map(a => ({ move: a, v: -neg(result(g, s, a)) }));
}
