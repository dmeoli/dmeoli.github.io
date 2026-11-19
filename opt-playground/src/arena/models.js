// The structures that the solvers of the arena build, rebuilt once per trace
// from its events, with no drawing here (panels.js draws them): the decision
// tree of a backtracking search (CSP, DPLL, CDCL, CaDiCaL), the search tree
// of a state-space search when the trace and the instance determine it
// exactly, and the series of a local search. Each node or point carries the
// index of the event that creates it, so that the panel shows, at any point
// of the timeline, what the solver had built up to that event.

import { domain } from './states.js';

const EPS = 1e-6;

// ---------------------------------------------------------------- decision tree
// The tree of the decisions of a trace of decide (or split), propagate,
// conflict and backtrack events. The root is the state before any decision;
// a decision at level L is a child of the deepest node of the current path
// with a level below L (so that the levels of DPLL, which count the
// propagations too, give the right parent); a conflict is a leaf under the
// current node; a backtrack to level K abandons the nodes of the path above
// K, and a backtrack that abandons more than one decision at once is a
// backjump, whose arc goes from the conflict to the node kept.
export function decisionModel(tr, label) {
  const ev = tr.events, nodes = [{ id: 0, p: null, born: -1, dead: Infinity, kind: 'root', level: 0, props: 0 }];
  const stack = [0], cur = new Int32Array(ev.length), jumps = [];
  const cnt = { decisions: [], conflicts: [], backjumps: [], restarts: [] };
  let nd = 0, nc = 0, nj = 0, nr = 0, lastConflict = -1;
  const top = () => nodes[stack[stack.length - 1]];
  const kids = new Map();
  const add = n => { n.id = nodes.length; nodes.push(n); if (!kids.has(n.p)) kids.set(n.p, 0); kids.set(n.p, kids.get(n.p) + 1); return n.id; };
  ev.forEach((e, i) => {
    let at = null;
    switch (e.type) {
      case 'decide': case 'split': {
        const L = e.level ?? stack.length;
        while (stack.length > 1 && top().level >= L) { top().dead = Math.min(top().dead, i); stack.pop(); }
        const lits = e.type === 'decide' ? [e.lit] : (e.lits || []);
        const lit = lits.find(l => l > 0) ?? lits[0];
        const id = add({ p: top().id, born: i, dead: Infinity, kind: 'dec', level: L, lit, neg: e.type === 'decide' && e.lit < 0, label: label(lit, e.type === 'decide' && e.lit < 0), props: 0 });
        stack.push(id); nd++;
        break;
      }
      case 'propagate': if (e.reason !== 'random start') top().props += (e.lits || []).length; break;
      case 'conflict':
        at = add({ p: top().id, born: i, dead: Infinity, kind: 'conflict', level: e.level, label: '✕' });
        lastConflict = at; nc++;
        break;
      case 'backtrack': {
        const K = e.level ?? 0, from = top().id;
        let popped = 0;
        while (stack.length > 1 && top().level > K) {
          const n = top();
          n.dead = Math.min(n.dead, i);
          // a decision left with no child failed, unless a restart takes it back
          if (!e.restart && !kids.has(n.id)) n.failed = true;
          stack.pop(); popped++;
        }
        if (e.restart) nr++;
        else if (popped > 1) {
          nj++;
          jumps.push({ i, from: lastConflict >= 0 && nodes[lastConflict].p === from ? lastConflict : from, to: top().id, skipped: popped - 1 });
        }
        break;
      }
    }
    cur[i] = at ?? top().id;
    cnt.decisions.push(nd); cnt.conflicts.push(nc); cnt.backjumps.push(nj); cnt.restarts.push(nr);
  });
  return { nodes, cur, jumps, cnt };
}

// ---------------------------------------------------------------- search tree
// The states expanded by a state-space search, and the parent of each: the
// one the trace gives (fields id and parent of each expand event, and
// ancestors in a sampled trace), or, for a trace without them, the one that
// the trace and the instance determine exactly: for a best-first graph
// search on one worker (A*, uniform cost, breadth-first, greedy), the first
// state expanded one move away whose g plus the cost of the move is the g of
// the state, which is the parent that these searches keep (they change a
// parent only for a strictly cheaper path); for a depth-first search (IDA*,
// RBFS), the deepest state of the current path with that property. The tree
// is not drawn, and the reason is said, when a trace without parents keeps
// only a sample of the expansions, when several workers expand at once
// (HDA*), or when the game has no successors in the page.
export function searchModel(tr) {
  const h = tr.header, game = h.game, alg = (h.solver.config && h.solver.config.algorithm) || '';
  const ev = tr.events, D = domain(game, h), workers = h.workers || 1;
  // with no successors in the page, a state is still known by its x
  const keyOf = D ? D.key : e => (e.x ? String(e.x) : null), pathKeyOf = D ? D.pathKey : keyOf;
  const exps = [];
  // an iteration of IDA* starts at its threshold event, or, in a trace with
  // none (aima-python), at the expansion of the root
  const hasThr = ev.some(e => e.type === 'threshold');
  let thr = null, iter = 0, nthr = 0;
  ev.forEach((e, i) => {
    if (e.type === 'threshold') { thr = e.g; if (nthr++ > 0) iter++; }
    if (e.type !== 'expand') return;
    if (!hasThr && exps.length && e.g === 0 && /idastar/.test(alg)) iter++;
    exps.push({ i, g: e.g, h: e.h, f: e.f, w: e.w || 0, key: keyOf(e), state: D ? D.state(e) : null, iter, thr, p: -1 });
  });
  const total = exps.length ? (ev[exps[exps.length - 1].i].n || {}).expanded : 0;
  const sampled = exps.length > 0 && total !== exps.length;
  // a trace that gives with each expansion its id and the id of its parent
  // (and, when sampled, the expansions on its path from the start that no
  // earlier event gives) determines the tree with no inference: the nodes
  // in the order they appear, an ancestor just before the expansion that
  // carries it, a root (parent null) of IDA* after the first starting a new
  // iteration
  const exact = exps.length > 0 && ev.every(e => e.type !== 'expand' || (e.id !== undefined && e.parent !== undefined));
  if (exact) {
    const nkey = a => (a.key !== undefined && a.key !== null ? String(a.key) : keyOf(a));
    const nodes = [], seen = new Set(), ida = /idastar/.test(alg), itOf = new Map();
    let it = 0, roots = 0, th = null;
    ev.forEach((e, i) => {
      if (e.type === 'threshold') th = e.g;
      if (e.type !== 'expand') return;
      for (const a of (e.ancestors || []).concat([e])) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        if (ida && a.parent === null && roots++ > 0) it++;
        nodes.push({ i, id: a.id, p: a.parent, g: a.g, h: a.h, f: a.f, w: a.w || 0, key: nkey(a), iter: it, thr: th, anc: a !== e });
      }
      itOf.set(i, it);
    });
    exps.forEach(x => { x.iter = itOf.get(x.i); });
    const path = [];
    ev.forEach((e, i) => { if (e.type === 'path') path.push({ i, key: /^backward/.test(alg) ? null : pathKeyOf(e) }); });
    return { game, alg, mode: /^(idastar|rbfs)$/.test(alg) ? 'dfs' : 'graph', exact: true, why: null, nodes, exps, path, workers, sampled, total,
      kept: exps.length, iters: it + 1, anc: nodes.length - exps.length };
  }
  let mode = 'layers', why = null;
  if (!D) why = 'nosucc';
  else if (sampled) why = 'sampled';
  else if (workers > 1) why = 'parallel';
  else if (/^(idastar|rbfs)$/.test(alg)) mode = 'dfs';
  else if (/^(astar|ucs|bfs|greedy)$/.test(alg)) mode = 'graph';
  else why = 'alg';
  if (mode !== 'layers' && !exps.every(x => x.key !== null)) { mode = 'layers'; why = 'nostate'; }
  const near = (a, b) => Math.abs(a - b) < EPS * Math.max(1, Math.abs(b));
  if (mode === 'graph') {
    const at = new Map();
    exps.forEach((x, j) => { if (!at.has(x.key)) at.set(x.key, []); at.get(x.key).push(j); });
    for (let j = 1; j < exps.length && mode === 'graph'; j++) {
      const x = exps[j];
      let best = -1;
      for (const [k, c] of D.succ(x.state)) for (const q of at.get(k) || []) {
        if (q >= j) break;
        if (near(exps[q].g + c, x.g)) { if (best < 0 || q < best) best = q; break; }
      }
      if (best < 0) { mode = 'layers'; why = 'noparent'; }
      x.p = best;
    }
  } else if (mode === 'dfs') {
    const stack = [];
    exps.forEach((x, j) => {
      if (mode !== 'dfs') return;
      if (x.g === 0) { stack.length = 0; stack.push(j); return; }
      while (stack.length) {
        const t = exps[stack[stack.length - 1]];
        const c = D.succ(t.state).find(([k]) => k === x.key);
        if (c && near(t.g + c[1], x.g)) break;
        stack.pop();
      }
      if (!stack.length) { mode = 'layers'; why = 'noparent'; return; }
      x.p = stack[stack.length - 1];
      stack.push(j);
    });
  }
  if (mode === 'layers') exps.forEach(x => { x.p = -1; });
  // the states of the solution path, by the index of their path event
  const path = [];
  // (a subgoal of a backward search is not a state of the path)
  ev.forEach((e, i) => { if (e.type === 'path') path.push({ i, key: /^backward/.test(alg) ? null : pathKeyOf(e) }); });
  return { game, alg, mode, why, exps, path, workers, sampled, total, kept: exps.length, iters: iter + 1 };
}

// ---------------------------------------------------------------- local search
// The series of a local search: for min-conflicts the variables in conflict
// after each step, as the trace gives them (none while the first assignment
// is not complete); for WalkSAT the clauses of the CNF that the assignment
// leaves unsatisfied after each flip, counted here from the assignment of
// the trace on the direct encoding (map colouring and the queens; the
// clauses written twice by MapColoringSAT counted once).
export function localSeries(tr) {
  const ev = tr.events, h = tr.header, inst = h.instance;
  if (ev.some(e => e.type === 'assign')) return { kind: 'conflicted', y: ev.map(e => (e.type === 'assign' && e.conflicted >= 0 ? e.conflicted : null)) };
  const k = inst.colours.length, nv = inst.vertices.length, val = new Int8Array(nv * k + 1);
  let pairs = null;
  if (inst.edges) {
    const ix = new Map(inst.vertices.map((v, i) => [v, i]));
    pairs = [];
    for (const [a, b] of inst.edges) for (let c = 0; c < k; c++) pairs.push([ix.get(a) * k + c + 1, ix.get(b) * k + c + 1]);
  } else if (inst.kind === 'queens') {
    pairs = [];
    for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++)
      if (a === b || Math.abs(a - b) === j - i) pairs.push([i * k + a + 1, j * k + b + 1]);
  }
  if (!pairs) return null;
  const unsat = () => {
    let n = 0;
    for (let v = 0; v < nv; v++) {
      let t = 0;
      for (let c = 0; c < k; c++) if (val[v * k + c + 1] > 0) t++;
      if (!t) n++;                       // at least one value
      n += t * (t - 1) / 2;              // at most one value
    }
    for (const [a, b] of pairs) if (val[a] > 0 && val[b] > 0) n++;
    return n;
  };
  const y = ev.map(e => {
    if (e.type === 'propagate' || e.type === 'flip') for (const l of e.lits || []) val[Math.abs(l)] = l > 0 ? 1 : -1;
    return e.type === 'flip' || e.reason === 'random start' ? unsat() : null;
  });
  return { kind: 'unsat', y };
}
