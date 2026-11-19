// The replay of a trace of aima.games written by tools/aima_games_trace.py:
// the game tree of minmax_decision, alpha_beta_search or
// alpha_beta_cutoff_search (one node for each call of max_value or
// min_value, with the step at which it is entered and the one at which its
// value comes back), or the tree of monte_carlo_tree_search (one node for
// each child that an expansion makes, with the visits N and the wins U of
// the side that moved into it, after each iteration). For a step k of the
// trace, the replay gives the path from the root to the node the event
// acts on, the position on the board and the line that says what happens.

import { t } from '../i18n.js';
import { cellName } from './board.js';

const inf = v => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);
export const fmt = v => (v === Infinity ? '+∞' : v === -Infinity ? '−∞' : v > 0 ? '+' + v : v < 0 ? '−' + -v : '0');
const ub = (a, k) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= k) lo = m + 1; else hi = m; } return lo; };
const other = p => (p === 'X' ? 'O' : 'X');

export function parseTrace(text) {
  const lines = text.trim().split('\n').map(l => JSON.parse(l));
  const head = lines[0], res = lines.at(-1).type === 'result' ? lines.at(-1) : null;
  const events = lines.slice(1, res ? -1 : undefined);
  return head.solver.id === 'aima-mcts' ? new MctsReplay(head, events, res) : new TreeReplay(head, events, res);
}

class Base {
  constructor(head, events, res) {
    this.head = head; this.events = events; this.result = res;
    this.c4 = head.game === 'connect4';
    this.player = head.instance.to_move;
    this.base = head.instance.played.map(([x, y], i) => ({ x, y, p: i % 2 ? 'O' : 'X', kind: 'base' }));
  }
  name(m) { return cellName(this.c4, m); }
  // the pieces of the moves from the root along a path of nodes
  pathPieces(path, kind = 'path') {
    return path.slice(1).map((id, i) => {
      const m = this.nodes.get(id).move;
      return { x: m[0], y: m[1], p: i % 2 ? other(this.player) : this.player, kind };
    });
  }
  pathPlayer(depth) { return depth % 2 ? other(this.player) : this.player; }
  says(p, m) {
    const it = p === 'X' ? 'X' : 'O';
    return this.c4 ? [`${p} in column ${m[1]}`, `${it} nella colonna ${m[1]}`]
      : [`${p} at ${this.name(m)}`, `${it} in ${this.name(m)}`];
  }
  path(id) { const p = []; for (let n = this.nodes.get(id); n; n = this.nodes.get(n.parent)) p.unshift(n.id); return p; }
  get length() { return this.events.length; }
  chosen() { return this.result && this.result.move; }
}

// ---------------------------------------------------------------- minimax and alpha-beta
export class TreeReplay extends Base {
  constructor(head, events, res) {
    super(head, events, res);
    this.kind = 'tree';
    this.ab = head.solver.id !== 'aima-minimax';
    const N = this.nodes = new Map();
    N.set(0, { id: 0, parent: -1, move: null, max: true, depth: 0, t0: -1, t1: Infinity, v: null, kids: [], alpha: -Infinity, beta: Infinity });
    events.forEach((e, k) => {
      if (e.type === 'enter' || e.type === 'leaf') {
        const n = { id: e.id, parent: e.parent, move: e.move, max: e.max, depth: e.depth, t0: k, t1: Infinity, v: null, kids: [],
          alpha: inf(e.alpha ?? '-inf'), beta: inf(e.beta ?? 'inf'), leaf: e.type === 'leaf', terminal: e.terminal };
        if (e.type === 'leaf') { n.t1 = k; n.v = inf(e.v); }
        N.set(e.id, n);
        N.get(e.parent).kids.push(e.id);
      } else if (e.type === 'value') {
        const n = N.get(e.id); n.t1 = k; n.v = inf(e.v); n.pruned = e.pruned || null;
      } else if (e.type === 'choose') {
        const r = N.get(0); r.t1 = k; r.v = inf(e.v); this.chooseStep = k;
      }
    });
    // the steps at which the nodes under each node appear, for the size of a folded subtree
    for (const n of N.values()) n.desc = [];
    for (const n of N.values()) for (let p = N.get(n.parent); p; p = N.get(p.parent)) p.desc.push(n.t0);
    for (const n of N.values()) n.desc.sort((a, b) => a - b);
  }
  nodeAt(k) { const e = this.events[k]; return e.type === 'choose' ? 0 : e.id; }
  focus(k) {
    const e = this.events[k];
    if (e.type === 'choose') { const c = this.nodes.get(0).kids.find(id => same(this.nodes.get(id).move, e.move)); return [0, c]; }
    return this.path(e.id);
  }
  seen(n, k) { return n.t0 <= k; }
  done(n, k) { return n.t1 <= k; }
  under(n, k) { return ub(n.desc, k); }
  // the value backed up so far: the best of the children done
  bound(n, k) {
    let b = null;
    for (const id of n.kids) { const c = this.nodes.get(id); if (c.t1 <= k) b = b === null ? c.v : n.max ? Math.max(b, c.v) : Math.min(b, c.v); }
    return b;
  }
  // the window alpha, beta of a node at step k: the one it was called with,
  // narrowed by the values of its children done, as max_value and min_value do
  window(n, k) {
    let a = n.alpha, b = n.beta;
    for (const id of n.kids) {
      const c = this.nodes.get(id);
      if (c.t1 > k) break;
      if (n.max) a = Math.max(a, c.v); else b = Math.min(b, c.v);
    }
    return [a, b];
  }
  board(k) {
    const e = this.events[k];
    if (e.type === 'choose') return { pieces: [...this.base, { x: e.move[0], y: e.move[1], p: this.player, kind: 'chosen' }], chosen: e.move };
    const path = this.path(e.id), pcs = this.pathPieces(path);
    return { pieces: [...this.base, ...pcs], hot: pcs.length ? [pcs.at(-1).x, pcs.at(-1).y] : null };
  }
  line(k) {
    const e = this.events[k];
    if (e.type === 'choose') {
      const [en, it] = this.says(this.player, e.move);
      return [`Chooses ${en}, the move of greatest value (${fmt(inf(e.v))} for ${this.player}).`,
        `Sceglie ${it}, la mossa di valore massimo (${fmt(inf(e.v))} per ${this.player}).`];
    }
    const n = this.nodes.get(e.id), p = this.pathPlayer(n.depth - 1), [en, it] = this.says(p, n.move);
    const who = n.max ? [`a MAX node, ${this.player} to move`, `un nodo MAX, muove ${this.player}`]
      : [`a MIN node, ${other(this.player)} to move`, `un nodo MIN, muove ${other(this.player)}`];
    const win = this.ab ? [`, window α = ${fmt(n.alpha)}, β = ${fmt(n.beta)}`, `, finestra α = ${fmt(n.alpha)}, β = ${fmt(n.beta)}`] : ['', ''];
    if (e.type === 'enter') return [`Tries ${en} (depth ${n.depth}): ${who[0]}${win[0]}.`, `Prova ${it} (profondità ${n.depth}): ${who[1]}${win[1]}.`];
    if (e.type === 'leaf') {
      const v = fmt(n.v);
      if (!n.terminal) return [`Tries ${en}: depth ${n.depth} is past the cutoff, and the evaluation gives ${v}.`,
        `Prova ${it}: la profondità ${n.depth} supera il taglio, e la valutazione dà ${v}.`];
      const end = n.v === 0 ? ['the game ends in a draw', 'la partita finisce pari']
        : [`${n.v > 0 ? this.player : other(this.player)} wins`, `vince ${n.v > 0 ? this.player : other(this.player)}`];
      return [`Tries ${en}: ${end[0]}, value ${v}.`, `Prova ${it}: ${end[1]}, valore ${v}.`];
    }
    // value: the node returns
    const pr = n.pruned;
    const names = pr ? pr.map(m => this.name(m)).join(', ') : '';
    const cut = !pr ? ['', ''] : n.max
      ? [`; since ${fmt(n.v)} ≥ β = ${fmt(this.window(n, k - 1)[1])}, MIN above would never let the game come here, and the ${pr.length} moves left (${names}) are pruned`,
        `; poiché ${fmt(n.v)} ≥ β = ${fmt(this.window(n, k - 1)[1])}, il MIN sopra non lascerebbe mai arrivare qui, e le ${pr.length} mosse rimaste (${names}) sono potate`]
      : [`; since ${fmt(n.v)} ≤ α = ${fmt(this.window(n, k - 1)[0])}, MAX above would never let the game come here, and the ${pr.length} moves left (${names}) are pruned`,
        `; poiché ${fmt(n.v)} ≤ α = ${fmt(this.window(n, k - 1)[0])}, il MAX sopra non lascerebbe mai arrivare qui, e le ${pr.length} mosse rimaste (${names}) sono potate`];
    return [`Backs up ${fmt(n.v)} to ${en}, the ${n.max ? 'largest' : 'smallest'} value of its children${cut[0]}.`,
      `Riporta ${fmt(n.v)} su ${it}, il valore ${n.max ? 'massimo' : 'minimo'} dei suoi figli${cut[1]}.`];
  }
}

// ---------------------------------------------------------------- Monte Carlo tree search
export class MctsReplay extends Base {
  constructor(head, events, res) {
    super(head, events, res);
    this.kind = 'mcts';
    const N = this.nodes = new Map();
    N.set(0, { id: 0, parent: -1, move: null, depth: 0, t0: -1, hs: [], hN: [], hU: [], kids: [] });
    events.forEach((e, k) => {
      if (e.type !== 'iter') { this.chooseStep = k; return; }
      for (const [id, par, m] of e.new) {
        const p = N.get(par);
        N.set(id, { id, parent: par, move: m, depth: p.depth + 1, t0: k, hs: [], hN: [], hU: [], kids: [] });
        p.kids.push(id);
      }
      e.path.forEach((id, i) => { const n = N.get(id); n.hs.push(k); n.hN.push(e.NU[i][0]); n.hU.push(e.NU[i][1]); });
    });
    for (const n of N.values()) n.desc = [];
    for (const n of N.values()) for (let p = N.get(n.parent); p; p = N.get(p.parent)) p.desc.push(n.t0);
    for (const n of N.values()) n.desc.sort((a, b) => a - b);
  }
  stats(n, k) { const i = ub(n.hs, k) - 1; return i < 0 ? [0, 0] : [n.hN[i], n.hU[i]]; }
  seen(n, k) { return n.t0 <= k; }
  under(n, k) { return ub(n.desc, k); }
  focus(k) {
    const e = this.events[k];
    if (e.type === 'iter') return e.path;
    return [0, this.nodes.get(0).kids.find(id => same(this.nodes.get(id).move, e.move))];
  }
  board(k) {
    const e = this.events[k];
    if (e.type !== 'iter') return { pieces: [...this.base, { x: e.move[0], y: e.move[1], p: this.player, kind: 'chosen' }], chosen: e.move };
    const pcs = this.pathPieces(e.path);
    const play = e.playout.map(([x, y, p]) => ({ x, y, p, kind: 'playout' }));
    return { pieces: [...this.base, ...pcs, ...play], hot: pcs.length ? [pcs.at(-1).x, pcs.at(-1).y] : null };
  }
  line(k) {
    const e = this.events[k];
    if (e.type !== 'iter') {
      const c = e.children.find(x => same(x[1], e.move)), [en, it] = this.says(this.player, e.move);
      return [`After ${this.events.length - 1} iterations, chooses ${en}, the most visited move (${c[2]} visits, ${c[3]} won by ${this.player}).`,
        `Dopo ${this.events.length - 1} iterazioni sceglie ${it}, la mossa più visitata (${c[2]} visite, ${c[3]} vinte da ${this.player}).`];
    }
    const names = e.moves.map(m => this.name(m)).join(', ');
    const last = e.moves.length ? this.name(e.moves.at(-1)) : '';
    const mover = this.pathPlayer(e.moves.length - 1), winner = e.r > 0 ? mover : e.r < 0 ? other(mover) : null;
    const grow = e.new.length ? [`, adds the ${e.new.length} moves after ${last}`, `, aggiunge le ${e.new.length} mosse dopo ${last}`] : ['', ''];
    const out = e.playout.length ? [`${e.playout.length} random moves`, `${e.playout.length} mosse a caso`]
      : ['the game is over', 'la partita è finita'];
    const end = winner ? [`${winner} wins`, `vince ${winner}`] : ['a draw', 'pari'];
    return [`Iteration ${e.i}: down ${names} by UCB${grow[0]}; ${out[0]}: ${end[0]}; +1 visit on the path${winner ? `, +1 win to the moves of ${winner}` : ''}.`,
      `Iterazione ${e.i}: giù per ${names} secondo UCB${grow[1]}; ${out[1]}: ${end[1]}; +1 visita sul cammino${winner ? `, +1 vittoria alle mosse di ${winner}` : ''}.`];
  }
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
export { same, other };
export const tt = pair => t(...pair);
