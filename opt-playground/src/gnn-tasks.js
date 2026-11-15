// The tasks of scene L, on graphs generated in the page:
// - community: node classification on one graph of a stochastic block model
//   with 2 or 3 communities, a few labelled nodes, the others to be guessed
//   (semi-supervised); only the labelled nodes have a feature, their label,
//   and the network learns to spread it, being trained on fresh graphs of the
//   same model to guess the labels of their unlabelled nodes;
// - clauses: a random 3-CNF formula drawn as its literal-clause graph (an edge
//   from a literal to every clause containing it, and one between x and not x,
//   as in NeuroSAT); a hidden assignment is written on the positive literals
//   only, and every clause node has to say whether the assignment satisfies
//   it, so that a clause with a negated literal needs two rounds (the value
//   reaches not x from x, then the clause);
// - triangles: graph classification, whether a small random graph contains a
//   triangle, with the same feature on every node; two regular graphs of the
//   same degree get the same states in every round (the 1-WL test, Xu et al.),
//   so that one of the pair shown is always answered wrong.

import { forward, backward, zeroGrad, adam } from './gnn-model.js';
import { rng } from './nn.js';

const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const argmax = (P, v, C) => { let b = 0; for (let c = 1; c < C; c++) if (P[v * C + c] > P[v * C + b]) b = c; return b; };

// ------------------------------------------------------------ communities
export function sbm(k, per, pin, pout, r) {
  const N = k * per, y = Array.from({ length: N }, (_, v) => Math.floor(v / per)), edges = [], deg = new Array(N).fill(0);
  for (let u = 0; u < N; u++) for (let v = u + 1; v < N; v++)
    if (r() < (y[u] === y[v] ? pin : pout)) { edges.push([u, v]); deg[u]++; deg[v]++; }
  // no node left alone: it is tied to a node of its community
  for (let v = 0; v < N; v++) if (!deg[v]) {
    let u; do u = y[v] * per + Math.floor(r() * per); while (u === v);
    edges.push([u, v]); deg[u]++; deg[v]++;
  }
  return { N, edges, y };
}
// the features: the one-hot label on the labelled nodes whose label is shown,
// zero elsewhere (the other nodes have no feature of their own)
function withLabels(g, shown, C) {
  const X = new Float64Array(g.N * C);
  for (const v of shown) X[v * C + g.y[v]] = 1;
  return { ...g, F: C, X };
}

// a graph of the block model with `lab` labelled nodes per community
function labelledGraph(k, lab, r) {
  const g = sbm(k, k === 2 ? 16 : 14, 0.25, 0.02, r), L = [];
  for (let c = 0; c < k; c++) L.push(...shuffle(g.y.map((y, v) => (y === c ? v : -1)).filter(v => v >= 0), r).slice(0, lab));
  const d = withLabels(g, L, k), isLab = new Set(L);
  d.lab = L; d.test = g.y.map((y, v) => v).filter(v => !isLab.has(v));
  d.nodes = g.y.map((y, v) => ({ kind: 'node', y, labelled: isLab.has(v), text: isLab.has(v) ? 'ABC'[y] : '' }));
  return d;
}

const community = {
  name: 'communities', level: 'node',
  build(S) {
    const d = labelledGraph(S.comm, S.lab, rng(S.g * 7717 + 3));
    return { C: S.comm, F: S.comm, lab: S.lab, display: d, pcaSet: [d] };
  },
  // every step 4 fresh graphs of the same model, whose unlabelled nodes have to
  // be guessed from its labelled ones; the graph drawn is never trained on
  step(M, D, r, lr) {
    zeroGrad(M);
    for (let b = 0; b < 4; b++) {
      const g = labelledGraph(D.C, D.lab, r);
      backward(M, forward(M, g), g.test.map(v => ({ v, y: g.y[v], w: 1 })), 4 * g.test.length);
    }
    adam(M, lr);
  },
  // the unlabelled nodes of the graph drawn
  evaluate(M, D) {
    const g = D.display, R = forward(M, g), C = D.C;
    let ok = 0, loss = 0;
    for (const v of g.test) { ok += argmax(R.P, v, C) === g.y[v]; loss -= Math.log(R.P[v * C + g.y[v]] + 1e-300) / g.test.length; }
    return { acc: ok / g.test.length, loss };
  },
  view: (M, D) => ({ R: forward(M, D.display) }),
};

// ------------------------------------------------------------ clauses
export const NVARS = 5, NCLAUSES = 10;
export function formula(n, m, r) {
  const cls = [];
  for (let c = 0; c < m; c++) cls.push(shuffle([...Array(n).keys()], r).slice(0, 3).map(i => 2 * i + (r() < 0.5 ? 1 : 0)));
  const val = Array.from({ length: n }, () => r() < 0.5);
  const N = 2 * n + m, F = 4, X = new Float64Array(N * F), edges = [];
  for (let i = 0; i < n; i++) {
    edges.push([2 * i, 2 * i + 1]);
    X[2 * i * F] = 1; X[(2 * i + 1) * F + 1] = 1;
    if (val[i]) X[2 * i * F + 3] = 1;    // the value, on the positive literal only
  }
  const sat = cls.map(cl => cl.some(l => (l % 2 === 0) === val[l >> 1]));
  cls.forEach((cl, c) => { X[(2 * n + c) * F + 2] = 1; for (const l of cl) edges.push([l, 2 * n + c]); });
  const nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ kind: 'lit', text: `x${i + 1}`, value: val[i], pos: true });
    nodes.push({ kind: 'lit', text: `¬x${i + 1}`, value: !val[i], pos: false });
  }
  cls.forEach((cl, c) => nodes.push({ kind: 'clause', text: `c${c + 1}`, y: sat[c] ? 1 : 0, clause: cl }));
  return { N, F, X, edges, nodes, n, m, cls, val, sat };
}
// the weights of the cross-entropy: a 3-clause is falsified with probability 1/8
const W_UNSAT = 7;
const clauseTargets = f => f.sat.map((s, c) => ({ v: 2 * f.n + c, y: s ? 1 : 0, w: s ? 1 : W_UNSAT }));

const clauses = {
  name: 'clauses', level: 'node', C: 2, F: 4,
  build(S) {
    const er = rng(9091), ev = Array.from({ length: 200 }, () => formula(NVARS, NCLAUSES, er));
    const dr = rng(S.g * 131 + 7);
    let f; do f = formula(NVARS, NCLAUSES, dr); while (f.sat.filter(s => !s).length < 2);
    return { C: 2, F: 4, display: f, eval: ev, pcaSet: [f, ...ev.slice(0, 15)] };
  },
  step(M, D, r, lr) {
    zeroGrad(M);
    const batch = Array.from({ length: 8 }, () => formula(NVARS, NCLAUSES, r)), T = batch.map(clauseTargets);
    const norm = T.flat().reduce((s, t) => s + t.w, 0);
    batch.forEach((f, i) => backward(M, forward(M, f), T[i], norm));
    adam(M, lr);
  },
  evaluate(M, D) {
    let ok = 0, n = 0, okU = 0, nU = 0, okF = 0, loss = 0, wsum = 0;
    for (const f of D.eval) {
      const R = forward(M, f);
      let all = true, pall = true;
      for (const t of clauseTargets(f)) {
        const p = argmax(R.P, t.v, 2);
        ok += p === t.y; n++;
        if (!t.y) { okU += p === 0; nU++; }
        all &&= t.y === 1; pall &&= p === 1;
        loss -= t.w * Math.log(R.P[t.v * 2 + t.y] + 1e-300); wsum += t.w;
      }
      okF += all === pall;
    }
    return { acc: ok / n, acc2: okU / nU, accF: okF / D.eval.length, loss: loss / wsum };
  },
  view: (M, D) => ({ R: forward(M, D.display) }),
};

// ------------------------------------------------------------ triangles
const constFeat = N => new Float64Array(N).fill(1);
export function graphOf(N, edges) { return { N, F: 1, X: constFeat(N), edges }; }
export function hasTriangle(g) {
  const A = Array.from({ length: g.N }, () => new Set());
  for (const [u, v] of g.edges) { A[u].add(v); A[v].add(u); }
  return g.edges.some(([u, v]) => [...A[u]].some(w => A[v].has(w)));
}
export function randomGraph(r) {
  const want = r() < 0.5;
  for (;;) {
    const N = 6 + Math.floor(4 * r()), edges = [];
    for (let u = 0; u < N; u++) for (let v = u + 1; v < N; v++) if (r() < 0.32) edges.push([u, v]);
    const g = graphOf(N, edges);
    g.y = hasTriangle(g) ? 1 : 0;
    if (!!g.y === want) return g;
  }
}
const ring = (n, o = 0) => Array.from({ length: n }, (_, i) => [o + i, o + (i + 1) % n]);
export const PAIRS = {
  ring: { name: 'a 6-cycle and two triangles', a: ring(6), b: [...ring(3), ...ring(3, 3)] },
  k33: { name: 'K3,3 and the prism', a: [0, 1, 2].flatMap(i => [3, 4, 5].map(j => [i, j])), b: [...ring(3), ...ring(3, 3), [0, 3], [1, 4], [2, 5]] },
};
export function pairGraphs(key) {
  const P = PAIRS[key] || PAIRS.ring, a = graphOf(6, P.a), b = graphOf(6, P.b);
  for (const g of [a, b]) g.y = hasTriangle(g) ? 1 : 0;
  // the two drawn as one graph of 12 nodes, the second on the right
  const u = graphOf(12, [...P.a, ...P.b.map(([x, y]) => [x + 6, y + 6])]);
  u.nodes = Array.from({ length: 12 }, (_, v) => ({ kind: 'node', side: v < 6 ? 0 : 1, text: '' }));
  // drawn on circles (a centre in fractions of the width and height, an offset
  // in fractions of the width): a hexagon for C6 and
  // K3,3 (the two sides alternating), two triangles side by side or nested
  const circ = (cx, cy, rad, a0) => i => [cx, cy, rad * Math.cos(a0 + i * Math.PI / 3), rad * Math.sin(a0 + i * Math.PI / 3)];
  const hexL = circ(0.25, 0.47, 0.15, -Math.PI / 2), tri = (cx, cy, rad) => i => [cx, cy, rad * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / 3), rad * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / 3)];
  u.at = key === 'k33'
    ? [0, 2, 4, 1, 3, 5].map(hexL).concat([0, 1, 2].map(tri(0.75, 0.47, 0.17)), [0, 1, 2].map(tri(0.75, 0.47, 0.07)))
    : [0, 1, 2, 3, 4, 5].map(hexL).concat([0, 1, 2].map(tri(0.64, 0.47, 0.075)), [0, 1, 2].map(tri(0.86, 0.47, 0.075)));
  u.parts = [a, b];
  return u;
}

const triangles = {
  name: 'triangles', level: 'graph', C: 2, F: 1,
  build(S) {
    const er = rng(5151), ev = Array.from({ length: 200 }, () => randomGraph(er));
    const u = pairGraphs(S.pair);
    return { C: 2, F: 1, display: u, eval: ev, pcaSet: [u, ...ev.slice(0, 25)] };
  },
  step(M, D, r, lr) {
    zeroGrad(M);
    const B = 16;
    for (let i = 0; i < B; i++) { const g = randomGraph(r); backward(M, forward(M, g), [{ v: 0, y: g.y, w: 1 }], B); }
    adam(M, lr);
  },
  evaluate(M, D) {
    let ok = 0, loss = 0;
    for (const g of D.eval) { const R = forward(M, g); ok += argmax(R.P, 0, 2) === g.y; loss -= Math.log(R.P[g.y] + 1e-300) / D.eval.length; }
    return { acc: ok / D.eval.length, loss };
  },
  // the drawing, and the answer of the network on each graph of the pair
  view: (M, D) => ({ R: forward(M, D.display), parts: D.display.parts.map(g => ({ y: g.y, p: forward(M, g).P[1] })) }),
};

export const TASKS = { community, clauses, triangles };
export { argmax };
