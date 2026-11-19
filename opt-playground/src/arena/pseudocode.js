// The pseudocode of the algorithm of a lane, under its panel, with the
// lines that the event of the timeline carries out marked: the algorithms
// of aima-python as AIMA (4th ed.) states them, and those of SMS++ and of
// PBeFS (CDCL, HDA*, branch and bound) in their textbook form, written here
// in a compact notation of our own. For each family a table maps the type of
// an event of the trace (section 5.1 of docs/study-search-games.md) to its
// lines; the lines of the other events of the same step of the timeline are
// marked faintly, and those of a failure in red.

import { bi } from '../i18n.js';

// a program: lines [id, indent, text], a trailing "// ..." is a comment
const P = s => s.trim().split('\n').map(l => {
  const m = /^(\S+)\s+(\d)\s(.*)$/.exec(l.trim());
  return [m[1], +m[2], m[3]];
});

const CODE = {
  cdcl: P(`
head 0 CDCL(F):                                  // F a formula in CNF
init 1 A ← ∅;  d ← 0                             // A the assignment, d the decision level
up0  1 if UNIT-PROPAGATE(F, A) meets a conflict: return UNSAT
loop 1 while some variable of F is unassigned:
pick 2 d ← d + 1;  ℓ ← PICK-BRANCHING-LITERAL(F, A);  A ← A ∪ {ℓ}
up   2 while UNIT-PROPAGATE(F, A) meets a conflict:
lvl0 3 if d = 0: return UNSAT
anal 3 (C, b) ← ANALYZE-CONFLICT(F, A)           // C a learned clause, b < d
lrn  3 F ← F ∧ C
jump 3 undo the assignments above level b;  d ← b   // backjump
rest 2 now and then: RESTART (undo to level 0, keep the learned clauses)
sat  1 return SAT, A`),
  dpll: P(`
top  0 DPLL-SATISFIABLE(s): return DPLL(CLAUSES(s), SYMBOLS(s), {})
head 0 DPLL(clauses, symbols, model):
true 1 if every clause is true in model: return true
fals 1 if some clause is false in model: return false
pure 1 P, v ← FIND-PURE-SYMBOL(symbols, clauses, model)
pur2 1 if P ≠ null: return DPLL(clauses, symbols − P, model ∪ {P = v})
unit 1 P, v ← FIND-UNIT-CLAUSE(clauses, model)
uni2 1 if P ≠ null: return DPLL(clauses, symbols − P, model ∪ {P = v})
frst 1 P ← FIRST(symbols);  rest ← REST(symbols)
try  1 return DPLL(clauses, rest, model ∪ {P = true})
or   2 or DPLL(clauses, rest, model ∪ {P = false})`),
  bt: P(`
top  0 BACKTRACKING-SEARCH(csp): return BACKTRACK(csp, {})
head 0 BACKTRACK(csp, assignment):
done 1 if assignment is complete: return assignment
var  1 var ← SELECT-UNASSIGNED-VARIABLE(csp, assignment)   // SEL
for  1 for each value in ORDER-DOMAIN-VALUES(csp, var, assignment):   // ORD
cons 2 if value is consistent with assignment:
add  3 add {var = value} to assignment
inf  3 inferences ← INFERENCE(csp, var, value)   // INF
ok   3 if inferences ≠ failure:
rec  4 add inferences to csp;  result ← BACKTRACK(csp, assignment)
ret  4 if result ≠ failure: return result
undo 3 remove {var = value} and inferences from csp
fail 1 return failure`),
  ac3: P(`
head 0 AC-3(csp):
q    1 queue ← every arc (Xi, Xj) of csp
loop 1 while queue ≠ ∅:
pop  2 (Xi, Xj) ← POP(queue)
rev  2 if REVISE(csp, Xi, Xj):
emp  3 if Di = ∅: return false                  // inconsistent
push 3 for each Xk in NEIGHBORS(Xi) − {Xj}: add (Xk, Xi) to queue
true 1 return true
rh   0 REVISE(csp, Xi, Xj):
rfor 1 for each x in Di:
rif  2 if no y in Dj satisfies the constraint with x:
rdel 3 delete x from Di;  revised ← true
rret 1 return revised`),
  gac: P(`
head 0 SOLVE(csp, D):                            // D the domains
gac  1 D ← GAC(csp, D)
emp  1 if some Dv = ∅: return failure
one  1 if every Dv has one value: return D
spl  1 pick v with |Dv| > 1;  split Dv into halves H1, H2
for  1 for each half H in (H1, H2):
rec  2 r ← SOLVE(csp, D with Dv ← H)
ret  2 if r ≠ failure: return r
fail 1 return failure
gh   0 GAC(csp, D):                              // generalized arc consistency
todo 1 to_do ← every pair (v, c), c a constraint on v
wl   1 while to_do ≠ ∅:
pop  2 (v, c) ← POP(to_do)
keep 2 Dv' ← {x ∈ Dv : some tuple that satisfies c has v = x}
chg  2 if Dv' ≠ Dv: Dv ← Dv';  add to to_do each (u, c'), c' ≠ c on v, u ≠ v in c'
gret 1 return D`),
  minconf: P(`
head 0 MIN-CONFLICTS(csp, max_steps):
init 1 current ← a complete assignment           // each variable at its value of fewest conflicts
for  1 for i = 1 to max_steps:
sol  2 if current is a solution of csp: return current
var  2 var ← a conflicted variable, chosen at random
val  2 value ← the v that minimizes CONFLICTS(csp, var, v, current)
set  2 set var = value in current
fail 1 return failure`),
  walksat: P(`
head 0 WALKSAT(clauses, p, max_flips):
init 1 model ← a random assignment of true/false to the symbols
for  1 for i = 1 to max_flips:
sol  2 if model satisfies every clause: return model
cl   2 clause ← a clause false in model, chosen at random
rnd  2 with probability p: flip a random symbol of clause
grd  2 else: flip the symbol of clause that maximizes the satisfied clauses
fail 1 return failure`),
  milp: P(`
head 0 BRANCH-AND-BOUND(MILP):                   // minimize
init 1 incumbent ← +∞;  open ← {root}
loop 1 while open ≠ ∅ and bound < incumbent:
sel  2 N ← a node of open, removed from it
lp   2 z ← the LP relaxation of N (with cuts)
pr   2 if N is infeasible or z ≥ incumbent: prune N
inc  2 else if the solution of the LP is integral: incumbent ← z
br   2 else: split on a fractional x_j, x_j ≤ ⌊v⌋ and x_j ≥ ⌈v⌉, both into open
bd   2 bound ← the least z over open
ret  1 return incumbent                           // optimal once bound = incumbent`),
  bb: P(`
head 0 BRANCH-AND-BOUND(items, capacity):        // maximize the profit
init 1 best ← −∞;  L ← {root}                     // the root fixes no item
loop 1 while L ≠ ∅:
pop  2 N ← POP(L)
inf  2 if the items N takes exceed the capacity: discard N
bnd  2 b ← bound(N)                              // LP: items by profit/weight, the last one in part
pr   2 if b ≤ best: prune N
feas 2 else if the relaxation of N is integral: best ← b
br   2 else: branch on the item taken in part, N+ takes it, N− leaves it out;  L ← L ∪ {N+, N−}
ret  1 return best`),
  bestfirst: P(`
head 0 BEST-FIRST-SEARCH(problem, f):            // F
node 1 node ← NODE(problem.INITIAL)
fr   1 frontier ← a priority queue by f, holding node
rch  1 reached ← {problem.INITIAL: node}
loop 1 while frontier ≠ ∅:
pop  2 node ← POP(frontier)                      // the least f
goal 2 if IS-GOAL(node.STATE): return node
for  2 for each child in EXPAND(problem, node):  // X
s    3 s ← child.STATE
if   3 if s ∉ reached or child.PATH-COST < reached[s].PATH-COST:
add  4 reached[s] ← child;  add child to frontier
fail 1 return failure`),
  bfs: P(`
head 0 BREADTH-FIRST-SEARCH(problem):
node 1 node ← NODE(problem.INITIAL)
g0   1 if IS-GOAL(node.STATE): return node
fr   1 frontier ← a FIFO queue holding node;  reached ← {problem.INITIAL}
loop 1 while frontier ≠ ∅:
pop  2 node ← POP(frontier)                      // the oldest
for  2 for each child in EXPAND(problem, node):
s    3 s ← child.STATE
goal 3 if IS-GOAL(s): return child               // tested when generated
add  3 if s ∉ reached: add s to reached;  add child to frontier
fail 1 return failure`),
  ida: P(`
head 0 IDA*(problem):
b0   1 bound ← h(problem.INITIAL)
loop 1 loop:
call 2 t ← CONTOUR(NODE(problem.INITIAL), bound)
fnd  2 if t = FOUND: return the path to the goal
inf  2 if t = ∞: return failure
nb   2 bound ← t                                 // the least f past the old bound
ch   0 CONTOUR(node, bound):                     // depth first, no OPEN list
cut  1 if f(node) > bound: return f(node)
goal 1 if IS-GOAL(node.STATE): return FOUND
min  1 m ← ∞
for  1 for each child in EXPAND(problem, node):
rec  2 t ← CONTOUR(child, bound)
rf   2 if t = FOUND: return FOUND
mn   2 m ← MIN(m, t)
ret  1 return m`),
  rbfs: P(`
head 0 RBFS-SEARCH(problem): return RBFS(problem, NODE(problem.INITIAL), ∞)
h    0 RBFS(problem, node, f_limit):
goal 1 if IS-GOAL(node.STATE): return node
exp  1 successors ← EXPAND(problem, node)
emp  1 if successors = ∅: return failure, ∞
upd  1 for each s in successors: s.f ← MAX(s.g + s.h, node.f)
loop 1 loop:
best 2 best ← the successor of least f
over 2 if best.f > f_limit: return failure, best.f
alt  2 alternative ← the second least f among successors
rec  2 result, best.f ← RBFS(problem, best, MIN(f_limit, alternative))
ret  2 if result ≠ failure: return result`),
  hda: P(`
head 0 HDA*(problem, P):                         // P workers, each runs the loop
own  1 owner(s) ← HASH(s) mod P                  // every state has one owner
init 1 OPEN_w ← {INITIAL} for its owner w;  incumbent ← ∞
loop 1 until every OPEN_w is empty or past the incumbent, and no message is in flight:
recv 2 for each state s sent to w: add s to OPEN_w unless CLOSED_w has it at no greater g
pop  2 n ← POP(OPEN_w)                           // the least f of w
prn  2 if f(n) ≥ incumbent: skip n
goal 2 if IS-GOAL(n.STATE): incumbent ← g(n);  broadcast it
for  2 for each child c in EXPAND(problem, n): send c to owner(c.STATE)
ret  1 return the path of the incumbent`),
  graphplan: P(`
head 0 GRAPHPLAN(problem):
init 1 graph ← INITIAL-PLANNING-GRAPH(problem);  goals ← CONJUNCTS(problem.GOAL)
ng   1 nogoods ← an empty table
for  1 for t = 0, 1, 2, …:
test 2 if goals all appear in level S_t of graph, no two of them mutex:
ext  3 solution ← EXTRACT-SOLUTION(graph, goals, t, nogoods)
ret  3 if solution ≠ failure: return solution
off  2 if graph and nogoods have both leveled off: return failure
exp  2 graph ← EXPAND-GRAPH(graph, problem)`),
  minimax: P(`
dec  0 MINIMAX-DECISION(state):
best 1 best ← −∞
for  1 for each a in ACTIONS(state):
v    2 v ← MIN-VALUE(RESULT(state, a))
upd  2 if v > best: best ← v;  move ← a
ret  1 return move
mxh  0 MAX-VALUE(state):
mxt  1 if TERMINAL-TEST(state): return UTILITY(state)
mxv  1 v ← −∞
mxf  1 for each a in ACTIONS(state):
mxu  2 v ← MAX(v, MIN-VALUE(RESULT(state, a)))
mxr  1 return v
mnh  0 MIN-VALUE(state):
mnt  1 if TERMINAL-TEST(state): return UTILITY(state)
mnv  1 v ← +∞
mnf  1 for each a in ACTIONS(state):
mnu  2 v ← MIN(v, MAX-VALUE(RESULT(state, a)))
mnr  1 return v`),
  alphabeta: P(`
dec  0 ALPHA-BETA-SEARCH(state):
best 1 best ← −∞;  β ← +∞
for  1 for each a in ACTIONS(state):
v    2 v ← MIN-VALUE(RESULT(state, a), best, β)
upd  2 if v > best: best ← v;  move ← a
ret  1 return move
mxh  0 MAX-VALUE(state, α, β):
mxt  1 if TERMINAL-TEST(state): return UTILITY(state)
mxv  1 v ← −∞
mxf  1 for each a in ACTIONS(state):
mxu  2 v ← MAX(v, MIN-VALUE(RESULT(state, a), α, β))
mxp  2 if v ≥ β: return v                        // prune the moves left
mxa  2 α ← MAX(α, v)
mxr  1 return v
mnh  0 MIN-VALUE(state, α, β):
mnt  1 if TERMINAL-TEST(state): return UTILITY(state)
mnv  1 v ← +∞
mnf  1 for each a in ACTIONS(state):
mnu  2 v ← MIN(v, MAX-VALUE(RESULT(state, a), α, β))
mnp  2 if v ≤ α: return v                        // prune the moves left
mnb  2 β ← MIN(β, v)
mnr  1 return v`),
  mcts: P(`
head 0 MONTE-CARLO-TREE-SEARCH(state):
tree 1 tree ← NODE(state)
loop 1 repeat N times:
sel  2 leaf ← SELECT(tree)                        // down the tree, by UCB1
exp  2 child ← EXPAND(leaf)                       // its moves become nodes
sim  2 result ← SIMULATE(child)                   // a playout of random moves
bp   2 BACK-PROPAGATE(result, child)              // a visit on the path, a win to the moves of the winner
ret  1 return the move of tree with the most playouts
ucb  0 UCB1(n) = U(n)/N(n) + C·√(log N(PARENT(n)) / N(n))`) };

// the cutoff variant of alpha-beta: the test of a leaf is the cutoff
const cutoff = CODE.alphabeta.map(([id, i, s]) => [id, i, id === 'mxt' || id === 'mnt'
  ? 'if CUTOFF-TEST(state, depth): return EVAL(state)    // past depth d, or the end' : s.replace('ALPHA-BETA-SEARCH', 'ALPHA-BETA-CUTOFF-SEARCH')]);

// ---------------------------------------------------------------- families
// the family of the solver of a trace header, with the words for its caption
export function family(h) {
  const id = String(h.solver.id || '').replace(/-\d+$/, ''), cfg = h.solver.config, alg = cfg && cfg.algorithm;
  if (id === 'cadical') return { key: 'cdcl', name: ['CDCL in its textbook form; CaDiCaL adds its own heuristics, restarts, clause deletion and inprocessing', 'CDCL nella forma dei manuali; CaDiCaL aggiunge le sue euristiche, i riavvii, la cancellazione di clausole e l\'inprocessing'] };
  if (id === 'aima-cdcl') return { key: 'cdcl', name: ['CDCL in its textbook form, as aima-python runs it', 'CDCL nella forma dei manuali, come la esegue aima-python'] };
  if (id === 'aima-dpll') return { key: 'dpll', name: ['DPLL as AIMA states it', 'DPLL come lo scrive AIMA'] };
  if (/^aima-bt(-fc|-mac)?$/.test(id)) {
    // the recorded runs use MRV and the order of the domain; an own run says
    // its choices in its config ("select mrv, order lcv, inference ...")
    const inf = id === 'aima-bt-fc' ? 'fc' : id === 'aima-bt-mac' ? 'mac' : 'none', c = typeof cfg === 'string' ? cfg : '';
    const mrv = !/select first/.test(c), lcv = /order lcv/.test(c);
    const IN = { fc: ['forward checking', 'forward checking'], mac: ['MAC', 'MAC'], none: ['no inference', 'nessuna inferenza'] }[inf];
    const sel = mrv ? ['MRV', 'MRV'] : ['the first unassigned variable', 'la prima variabile non assegnata'];
    const ord = lcv ? [', LCV for the order of the values', ', LCV per l\'ordine dei valori'] : ['', ''];
    return { key: 'bt', sub: { INF: inf === 'fc' ? 'forward checking' : inf === 'mac' ? 'MAC: AC-3 from the arcs into var' : 'none: no value is pruned',
      SEL: mrv ? 'MRV: fewest values left' : 'the first unassigned', ORD: lcv ? 'LCV: the value that rules out fewest first' : 'in the order of the domain' },
      name: [`backtracking search as AIMA states it, with ${sel[0]}${ord[0]} and ${inf === 'none' ? 'no inference' : IN[0] + ' as INFERENCE'}`,
        `ricerca con backtracking come la scrive AIMA, con ${sel[1]}${ord[1]} e ${inf === 'none' ? 'nessuna inferenza' : IN[1] + ' come INFERENCE'}`] };
  }
  if (id === 'aima-ac3') return { key: 'ac3', name: ['AC-3 as AIMA states it', 'AC-3 come lo scrive AIMA'] };
  if (id === 'aima-gac') return { key: 'gac', name: ['generalized arc consistency with domain splitting, in the form of Poole and Mackworth that aima-python follows', 'consistenza d\'arco generalizzata con suddivisione dei domini, nella forma di Poole e Mackworth che aima-python segue'] };
  if (id === 'aima-minconf') return { key: 'minconf', name: ['min-conflicts as AIMA states it', 'min-conflicts come lo scrive AIMA'] };
  if (id === 'aima-walksat') return { key: 'walksat', name: ['WalkSAT as AIMA states it', 'WalkSAT come lo scrive AIMA'] };
  if (id === 'highs') return { key: 'milp', name: ['LP-based branch and bound in its textbook form; HiGHS adds presolve, cuts and heuristics', 'branch-and-bound su LP nella forma dei manuali; HiGHS aggiunge presolve, tagli ed euristiche'] };
  if (/^bb/.test(id)) {
    const par = /shared/.test(id) ? ['; each worker runs the loop on one shared list L and one shared best', '; ogni worker esegue il ciclo su una sola lista L e una sola best condivise']
      : /dist/.test(id) ? ['; each worker runs the loop on its own list L, and a new best is broadcast to all', '; ogni worker esegue il ciclo sulla sua lista L, e una nuova best è inviata a tutti'] : ['', ''];
    return { key: 'bb', name: ['branch and bound for the 0-1 knapsack in its textbook form' + par[0], 'branch-and-bound per lo zaino 0-1 nella forma dei manuali' + par[1]] };
  }
  if (/^aima-(minimax)$/.test(id)) return { key: 'minimax', name: ['minimax as AIMA states it', 'minimax come lo scrive AIMA'] };
  if (id === 'aima-alphabeta') return { key: 'alphabeta', name: ['alpha-beta search as AIMA states it', 'la ricerca alfa-beta come la scrive AIMA'] };
  if (id === 'aima-cutoff') return { key: 'cutoff', name: ['alpha-beta search with a cutoff and an evaluation, as AIMA states it', 'la ricerca alfa-beta con taglio e valutazione, come la scrive AIMA'] };
  if (id === 'aima-mcts') return { key: 'mcts', name: ['Monte Carlo tree search as AIMA states it', 'la ricerca ad albero Monte Carlo come la scrive AIMA'] };
  if (!alg) return null;
  if (alg === 'graphplan') return { key: 'graphplan', name: ['GraphPlan as AIMA (3rd ed.) states it', 'GraphPlan come lo scrive AIMA (3a ed.)'] };
  if (alg === 'idastar') return { key: 'ida', name: ['IDA* in its textbook form', 'IDA* nella forma dei manuali'] };
  if (alg === 'rbfs') return { key: 'rbfs', name: ['recursive best-first search as AIMA states it', 'la ricerca best-first ricorsiva come la scrive AIMA'] };
  if (alg === 'bfs') return { key: 'bfs', name: ['breadth-first search as AIMA states it', 'la ricerca in ampiezza come la scrive AIMA'] };
  if (alg === 'hda') return { key: 'hda', name: ['HDA* (A* with hash distribution of the states among the workers) in its textbook form', 'HDA* (A* con distribuzione degli stati fra i worker per hash) nella forma dei manuali'] };
  const plan = /^(forward|backward)-/.exec(alg), base = alg.replace(/^(forward|backward)-/, '');
  const w = cfg && cfg.w !== undefined ? cfg.w : 'w';
  const F = { astar: 'A*: f = g + h', wastar: `weighted A*: f = g + w·h, w = ${w}`, ucs: 'uniform cost: f = g', greedy: 'greedy: f = h' }[base];
  if (!F) return null;
  const X = !plan ? '' : plan[1] === 'forward' ? 'the actions whose preconditions hold' : 'regression through each relevant action';
  const nm = { astar: ['A*', 'A*'], wastar: [`weighted A* (w = ${w})`, `A* pesato (w = ${w})`], ucs: ['uniform-cost search', 'la ricerca a costo uniforme'], greedy: ['greedy best-first search', 'la ricerca best-first greedy'] }[base];
  const pl = !plan ? ['', ''] : plan[1] === 'forward' ? [', forward over the states of the plan', ', in avanti sugli stati del piano'] : [', backward over the subgoals', ', all\'indietro sui sottobiettivi'];
  return { key: 'bestfirst', sub: { F, X }, name: [`${nm[0]} as best-first search, as AIMA states it${pl[0]}`, `${nm[1]} come ricerca best-first, come la scrive AIMA${pl[1]}`] };
}

// ---------------------------------------------------------------- the maps
// each returns the ids of the lines of event e (index i of the events);
// ctx = { events, header, R } with R the replay of the two-player games
const prevOf = (ev, i, f) => { for (let j = i - 1; j >= 0; j--) if (f(ev[j])) return ev[j]; return null; };
const MAPS = {
  cdcl: e => ({ decide: ['pick'], propagate: e.level ? ['up'] : ['up0'], conflict: ['up', 'anal', 'lrn'],
    backtrack: e.restart ? ['rest'] : ['jump'] }[e.type]),
  dpll: e => ({ decide: e.lit > 0 ? ['frst', 'try'] : ['or'], conflict: ['fals'], backtrack: ['fals', 'or'],
    propagate: e.reason === 'pure' ? ['pure', 'pur2'] : e.reason === 'unit' ? ['unit', 'uni2'] : ['top'] }[e.type]),
  bt: (e, i, { events }) => {
    if (e.type === 'decide') {
      const p = prevOf(events, i, x => x.type !== 'propagate');
      return p && p.type === 'backtrack' && p.level === e.level - 1 ? ['for', 'cons', 'add'] : ['var', 'add'];
    }
    return { propagate: e.reason === 'given' ? ['top'] : ['inf', 'ok'], conflict: ['inf', 'ok'], backtrack: ['undo', 'fail'] }[e.type];
  },
  ac3: e => (e.type === 'propagate' ? (e.reason === 'given' ? ['q'] : ['pop', 'rev', 'rif', 'rdel']) : null),
  gac: e => ({ propagate: e.reason === 'given' ? ['todo'] : ['gac', 'pop', 'keep', 'chg'], split: ['spl', 'rec'],
    conflict: ['emp'], backtrack: ['fail', 'for'] }[e.type]),
  minconf: e => (e.type === 'assign' ? (e.conflicted < 0 ? ['init'] : ['var', 'val', 'set']) : null),
  walksat: e => ({ propagate: ['init'], flip: ['cl', 'rnd', 'grd'] }[e.type]),
  milp: (e, i, { events }) => {
    if (e.type !== 'bound') return null;
    const p = prevOf(events, i, x => x.type === 'bound');
    return p && p.ub !== e.ub ? ['lp', 'inc', 'bd'] : ['sel', 'lp', 'bd'];
  },
  bb: e => (e.type !== 'node' ? null : { pruned: ['pop', 'bnd', 'pr'], branched: ['pop', 'bnd', 'br'], feasible: ['pop', 'bnd', 'feas'],
    infeasible: ['pop', 'inf'], open: ['pop'] }[e.status] || ['pop']),
  bestfirst: e => ({ expand: ['pop', 'for', 'add'], solution: ['goal'], path: ['goal'] }[e.type]),
  bfs: e => ({ expand: ['pop', 'for', 'add'], solution: ['goal'], path: ['goal'] }[e.type]),
  ida: (e, i, { events }) => ({ threshold: prevOf(events, i, x => x.type === 'threshold') ? ['nb', 'call'] : ['b0', 'call'],
    expand: ['for', 'rec'], solution: ['goal', 'fnd'], path: ['fnd'] }[e.type]),
  rbfs: e => ({ expand: ['exp', 'upd'], path: ['goal'] }[e.type]),
  hda: e => ({ expand: ['recv', 'pop', 'for'], solution: ['goal'], path: ['ret'] }[e.type]),
  graphplan: e => ({ level: ['exp', 'test'], path: ['ext', 'ret'] }[e.type]),
  // the two-player games: a node of max_value or min_value
  tree: (e, i, { R }) => {
    if (e.type === 'choose') return ['ret'];
    const n = R.nodes.get(e.id); if (!n) return null;
    const fn = n.max ? 'mx' : 'mn', up = n.depth === 1 ? ['for', 'v'] : [n.max ? 'mnf' : 'mxf', n.max ? 'mnu' : 'mxu'];
    if (e.type === 'enter') return [...up, fn + 'h'];
    if (e.type === 'leaf') return [up[0], fn + 't'];
    if (e.type === 'value') return n.pruned ? [fn + 'u', fn + 'p'] : [fn + 'r', up[1], ...(n.depth === 1 ? ['upd'] : [])];
    return null;
  },
  mcts: e => (e.type === 'iter' ? ['sel', ...(e.new && e.new.length ? ['exp'] : []), 'sim', 'bp'] : e.type === 'choose' ? ['ret'] : null) };
MAPS.minimax = MAPS.alphabeta = MAPS.cutoff = MAPS.tree;
// the lines of the end of a run, by the status of its result
const ENDS = { cdcl: { sat: ['sat'], unsat: ['lvl0'] }, dpll: { sat: ['true'], unsat: ['fals'] }, bt: { sat: ['done'] },
  ac3: { sat: ['true'], 'arc consistent': ['true'], unsat: ['emp'] }, gac: { sat: ['one'], unsat: ['fail'] },
  minconf: { sat: ['sol'], limit: ['fail'] }, walksat: { sat: ['sol'], limit: ['fail'] }, milp: { optimal: ['ret'], feasible: ['ret'] },
  bb: { optimal: ['ret'], feasible: ['ret'] } };

// ---------------------------------------------------------------- the block
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const narrow = () => matchMedia('(max-width: 700px)').matches;

// the block of the pseudocode at the end of box, for the trace header h;
// show(events, k, prev, ctx) marks the lines of the event k - 1 and, faintly,
// those of the events from prev to k - 2; null if the family is not known
// "di" joined to the article of an Italian name (della ricerca, del ...)
const di = n => (/^la /.test(n) ? 'della ' + n.slice(3) : /^il /.test(n) ? 'del ' + n.slice(3) : /^l'/.test(n) ? 'dell\'' + n.slice(2) : 'di ' + n);
export function attachCode(box, h) {
  const fam = family(h);
  if (!fam) return null;
  const code = fam.key === 'cutoff' ? cutoff : CODE[fam.key];
  const sub = s => s.replace(/\b(INF|F|X|SEL|ORD)$/, m => (fam.sub && fam.sub[m]) || '').replace(/\s*\/\/\s*$/, '');
  const det = document.createElement('details');
  det.className = 'pcode';
  det.open = !narrow();
  det.innerHTML = `<summary>${bi('Pseudocode', 'Pseudocodice')}</summary>
    <p class="pccap">${bi(`The pseudocode of ${fam.name[0]}, written compactly. The marked line is what the event of this lane carries out (red when it fails); the faint lines, the other events of the same step.`,
      `Lo pseudocodice ${di(fam.name[1])}, scritto in forma compatta. La riga evidenziata è ciò che esegue l'evento di questa corsia (in rosso quando fallisce); quelle tenui, gli altri eventi dello stesso passo.`)}</p>
    <div class="pclines" translate="no">${code.map(([id, ind, text]) => {
      const s = sub(text), c = s.indexOf('//');
      const body = c < 0 ? esc(s.trimEnd()) : `${esc(s.slice(0, c).trimEnd())} <span class="pcc">${esc(s.slice(c))}</span>`;
      return `<div class="pl" data-id="${id}" style="--i:${ind}">${body}</div>`;
    }).join('')}</div>`;
  box.append(det);
  const lines = new Map([...det.querySelectorAll('.pl')].map(el => [el.dataset.id, el]));
  const map = MAPS[fam.key], ends = ENDS[fam.key] || {};
  const of = (events, i, ctx) => (i >= 0 && events[i] ? map(events[i], i, ctx) || [] : []);
  return {
    el: det, key: fam.key,
    show(events, k, prev, ctx = {}) {
      ctx.events = events;
      const now = new Set(of(events, k - 1, ctx)), faint = new Set();
      if (prev >= 0 && prev < k - 1 && k - 1 - prev <= 400) for (let i = prev; i < k - 1; i++) for (const id of of(events, i, ctx)) faint.add(id);
      if (ctx.end && ends[ctx.end]) for (const id of ends[ctx.end]) now.add(id);
      const bad = events[k - 1] && events[k - 1].type === 'conflict';
      for (const [id, el] of lines) {
        el.classList.toggle('on', now.has(id) && !bad);
        el.classList.toggle('bad', now.has(id) && bad);
        el.classList.toggle('past', !now.has(id) && faint.has(id));
      }
    } };
}
