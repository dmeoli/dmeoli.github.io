#!/usr/bin/env python3
"""Records traces of the solvers of aima-python for the games of the
playground (docs/study-search-games.md, section 5.1): the CSP solvers
(backtracking with MRV and forward checking or MAC, AC-3 alone,
min-conflicts) on the CSP of an instance, and the SAT solvers (DPLL, CDCL,
WalkSAT) on the CNF that src/arena/translate.py writes for it, the same that
SMS++ reads, with the variables numbered alike, so that the lanes of aima
and of SMS++ are drawn by the same replay.

    ~/GDrive/aima-python/.venv/bin/python tools/aima_trace.py \\
        --aima ~/GDrive/aima-python --games coloring queens sudoku

The code of aima-python is run as it is: the trace is taken by wrapping the
methods of the CSP that the solvers call (assign, unassign, prune) and the
functions of aima.logic that they call by name (dpll, find_pure_symbol,
find_unit_clause, assign_decision_literal, unit_propagation, backjump,
revise), each wrapper calling the original, and for WalkSAT, whose model is
a local variable, by reading that variable through sys.settrace at the head
of its loop. A run is stopped after --cap events or --timeout seconds and
then says so (status "limit"); every run is a process of its own, with
PYTHONHASHSEED=0.
"""

import argparse
import datetime
import json
import os
import random
import signal
import subprocess
import sys
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# the order of the sets of aima, and with it the counts of AC-3 and of the
# searches, depends on the seed of the hashes of strings: it is fixed
ENV = {**os.environ, 'PYTHONHASHSEED': '0'}


class Stop(Exception):
    pass


class Recorder:
    """The events of a run, with the cumulative counters n."""

    def __init__(self, counters, cap):
        self.n = dict.fromkeys(counters, 0)
        self.events, self.cap, self.level = [], cap, 0
        self.t0 = time.perf_counter()

    def emit(self, o):
        if len(self.events) >= self.cap:
            raise Stop()
        o = {'step': len(self.events), **o, 'n': dict(self.n)}
        self.events.append(o)


def lit(inst, var, val):
    """The literal of var = val in the numbering of translate.py."""
    return inst['_index'][var] * len(inst['colours']) + inst['_vals'][val] + 1


# ---------------------------------------------------------------- the CSPs
NARYGAMES = ('zebra', 'kakuro', 'crypto', 'crossword')


def csp_for(C, inst):
    """The CSP of aima.csp for an instance, and the maps from its variables
    and values to the vertices and colours of the instance."""
    k = inst['kind']
    if k in NARYGAMES:
        # the CSPs of the zebra puzzle, Kakuro, cryptarithmetic and the
        # crossword are those of translate.py, built on these modules of aima
        sys.path.insert(0, os.path.join(ROOT, 'src', 'arena'))
        import translate as T
        T.C = C
        csp, order = T.csp_of(inst)
        vals = [T.value_of(inst, j) for j in range(len(inst['colours']))]
    elif k == 'queens':
        csp = C.NQueensCSP(inst['n'])
        order, vals = list(range(inst['n'])), list(range(inst['n']))
    elif k == 'sudoku':
        csp = C.Sudoku(getattr(C, inst['grid']))
        order, vals = [c for row in C.Sudoku.rows for c in row], list('123456789')
    else:
        nb = {v: [] for v in inst['vertices']}
        for a, b in inst['edges']:
            nb[a].append(b)
            nb[b].append(a)
        csp = C.MapColoringCSP(list(inst['colours']), nb)
        order, vals = list(inst['vertices']), list(inst['colours'])
    inst['_index'] = {v: i for i, v in enumerate(order)}
    inst['_vals'] = {v: j for j, v in enumerate(vals)}
    inst['_name'] = {v: inst['vertices'][i] for i, v in enumerate(order)}
    inst['_vname'] = {v: inst['colours'][j] for j, v in enumerate(vals)}
    return csp


def arc_of(frame, var):
    """The arc (X, Y) whose revision prunes a value of var, read from the
    function that called csp.prune: revise of AC-3 revises (Xi, Xj), AC3b of
    MAC (Xi, Xj) or, on the values of Xj, (Xj, Xi), and forward_checking
    prunes the neighbor B of the variable var just assigned, i.e., revises
    (B, var); None for any other caller."""
    name, L = frame.f_code.co_name, frame.f_locals
    if name == 'revise':
        return L['Xi'], L['Xj']
    if name == 'AC3b':
        return (L['Xi'], L['Xj']) if var == L['Xi'] else (L['Xj'], L['Xi'])
    if name == 'forward_checking':
        return L['B'], L['var']
    return None


def watch_csp(C, csp, inst, R):
    """Wraps the methods of csp so that every assignment, pruning and
    retraction becomes an event; the prunings of one inference are one event,
    with the arc that removed each literal (arcs, parallel to lits, and arc
    when they are all the same)."""
    assign, unassign, prune = csp.assign, csp.unassign, csp.prune
    pending, arcs = [], []

    def flush():
        if pending:
            o = {'type': 'propagate', 'level': R.level, 'lits': list(pending), 'arcs': list(arcs)}
            if arcs[0] is not None and all(a == arcs[0] for a in arcs):
                o['arc'] = arcs[0]
            R.emit(o)
            pending.clear()
            arcs.clear()

    def w_assign(var, val, assignment):
        flush()
        assign(var, val, assignment)
        R.n['assigns'] += 1
        level = len(assignment)
        if R.level >= level:
            R.n['backtracks'] += 1
            R.emit({'type': 'backtrack', 'level': level - 1})
        R.level = level
        R.emit({'type': 'decide', 'level': level, 'lit': lit(inst, var, val)})

    def w_unassign(var, assignment):
        flush()
        unassign(var, assignment)
        if R.level > len(assignment):
            R.n['backtracks'] += 1
            R.level = len(assignment)
            R.emit({'type': 'backtrack', 'level': R.level})

    def w_prune(var, val, removals):
        a = arc_of(sys._getframe(1), var)
        a = [inst['_name'][a[0]], inst['_name'][a[1]]] if a else None
        prune(var, val, removals)
        R.n['prunings'] += 1
        pending.append(-lit(inst, var, val))
        arcs.append(a)
        left = csp.curr_domains[var]
        if len(left) == 1:          # the value left is forced
            pending.append(lit(inst, var, left[0]))
            arcs.append(a)
        if not left:
            flush()
            R.n['wipeouts'] += 1
            R.emit({'type': 'conflict', 'level': R.level, 'vars': [inst['_name'][var]], **({'arc': a} if a else {})})

    csp.assign, csp.unassign, csp.prune = w_assign, w_unassign, w_prune
    return flush


def run_backtracking(C, csp, inst, R, inference):
    flush = watch_csp(C, csp, inst, R)
    inf = {'fc': C.forward_checking, 'mac': C.mac}[inference]

    def w_inference(*a, **k):
        r = inf(*a, **k)
        flush()
        return r
    res = C.backtracking_search(csp, select_unassigned_variable=C.mrv, inference=w_inference)
    flush()
    return res


def run_ac3(C, csp, inst, R):
    flush = watch_csp(C, csp, inst, R)
    revise = C.revise

    def w_revise(*a, **k):
        r = revise(*a, **k)
        flush()
        return r
    C.revise = w_revise
    try:
        ok, _ = C.AC3(csp)
    finally:
        C.revise = revise
    flush()
    if not ok:
        return None
    dom = csp.curr_domains
    return {v: d[0] for v, d in dom.items()} if all(len(d) == 1 for d in dom.values()) else 'partial'


def run_min_conflicts(C, csp, inst, R):
    assign = csp.assign

    def w_assign(var, val, assignment):
        old = assignment.get(var)
        assign(var, val, assignment)
        if old == val:
            return
        R.n['assigns'] += 1
        R.n['conflicted'] = len(csp.conflicted_vars(assignment)) if len(assignment) == len(csp.variables) else -1
        R.emit({'type': 'assign', 'var': inst['_name'][var], 'value': inst['_vname'][val],
                'set': {inst['_name'][var]: inst['_vname'][val]}, 'conflicted': R.n['conflicted']})
    csp.assign = w_assign
    return C.min_conflicts(csp, max_steps=5000)


def run_gac(C, csp, inst, R):
    """ACSolver of aima.csp, generalized arc consistency with domain
    splitting (and the arc heuristic sat_up, its default), on a NaryCSP. The
    domains are read in GAC through sys.settrace at the head of its loop, so
    that every revision that removes values is an event; a split of a domain
    is an event of its own, one level deeper, and the return from a
    subtree a backtrack."""
    S = C.ACSolver(csp)
    shown = [{v: set(d) for v, d in csp.domains.items()}]      # the domains drawn, by depth
    depth = [0]

    def diff(dom, level, kind, arc=None):
        cur = shown[-1]
        lits = []
        for v in sorted(dom, key=lambda v: inst['_index'][v]):
            gone = cur[v] - set(dom[v])
            if gone:
                lits += [-lit(inst, v, x) for x in sorted(gone, key=lambda x: inst['_vals'][x])]
                if kind == 'propagate':
                    R.n['prunings'] += len(gone)
                if len(dom[v]) == 1:
                    lits.append(lit(inst, v, next(iter(dom[v]))))
                cur[v] = set(dom[v])
        if lits:
            if kind == 'split':
                R.n['splits'] += 1
            R.emit({'type': kind, 'level': level, 'lits': lits, **({'arc': arc} if arc else {})})

    def arc(frame):
        """The pair (variable, constraint) that the last iteration of the
        loop of GAC revised: the variable and the scope of the constraint."""
        L = frame.f_locals
        if 'var' not in L or 'const' not in L:
            return None
        return [inst['_name'][L['var']], [inst['_name'][v] for v in L['const'].scope]]

    code = C.ACSolver.GAC.__code__
    import inspect
    lines, first = inspect.getsourcelines(C.ACSolver.GAC)
    head = first + next(i for i, ln in enumerate(lines) if ln.strip() == 'while to_do:')

    def tracer(frame, event, arg):
        if frame.f_code is not code:
            return None

        def local(frame, event, arg):
            if event == 'line' and frame.f_lineno == head:
                dom = frame.f_locals.get('domains')
                if dom is not None:
                    diff(dom, depth[0], 'propagate', arc(frame))
            elif event == 'return' and arg is not None and arg[0] is False:
                R.n['wipeouts'] += 1
                empty = [v for v, d in arg[1].items() if not d]
                a = arc(frame)
                R.emit({'type': 'conflict', 'level': depth[0], 'vars': [inst['_name'][v] for v in empty],
                        **({'arc': a} if a else {})})
            elif event == 'return' and arg is not None:
                R.n['checks'] += arg[2]
                diff(arg[1], depth[0], 'propagate', arc(frame))
            return local
        return local

    split = C.ACSolver.domain_splitting

    def w_split(self, domains=None, to_do=None, arc_heuristic=C.sat_up):
        if domains is not None:
            depth[0] += 1
            d = depth[0]
            # back from a subtree: the domains drawn are those of the parent
            if R.level >= d:
                R.n['backtracks'] += 1
                R.emit({'type': 'backtrack', 'level': d - 1})
            del shown[d:]
            shown.append({v: set(x) for v, x in shown[d - 1].items()})
            R.level = d
            diff(domains, d, 'split')
        try:
            return split(self, domains, to_do, arc_heuristic)
        finally:
            if domains is not None:
                depth[0] -= 1
    C.ACSolver.domain_splitting = w_split
    sys.settrace(tracer)
    try:
        return S.domain_splitting()
    finally:
        sys.settrace(None)
        C.ACSolver.domain_splitting = split


# ---------------------------------------------------------------- the CNF
def sentence(L, symbols, clauses):
    syms = [L.Expr(s) for s in symbols]
    cl = [L.associate('|', [syms[x - 1] if x > 0 else ~syms[-x - 1] for x in c]) for c in clauses]
    return syms, L.associate('&', cl)


def number(sym_index, P, value):
    i = sym_index[str(P)]
    return i if value else -i


def clause_lits(L, sym_index, c):
    """The literals of a clause of aima.logic in the numbering of the CNF."""
    out = []
    for x in L.disjuncts(c):
        P, positive = L.inspect_literal(x)
        out.append(number(sym_index, P, positive))
    return out


def run_dpll(L, s, sym_index, R):
    """DPLL of aima.logic; a propagate event gives the clause that made its
    literal unit (reasons, null for a pure symbol) and a conflict the first
    clause that the model of the call falsifies (clause), which is the one
    that dpll finds false."""
    dpll, pure, unit = L.dpll, L.find_pure_symbol, L.find_unit_clause
    why = ['decide']
    unitc = [None]
    depth = [0]

    def w_pure(*a):
        r = pure(*a)
        if r[0] is not None:
            why[0] = 'pure'
            unitc[0] = None
        return r

    def w_unit(clauses, model):
        r = unit(clauses, model)
        if r[0] is not None:
            why[0] = 'unit'
            # the clause that find_unit_clause took: the first one unit in model
            unitc[0] = next(clause_lits(L, sym_index, c) for c in clauses if L.unit_clause_assign(c, model) == r)
        return r

    def w_dpll(clauses, symbols, model, h=L.no_branching_heuristic):
        depth[0] += 1
        d = depth[0]
        try:
            if model:
                P = list(model)[-1]          # extend() adds the new symbol last
                if R.level >= d:
                    R.n['backtracks'] += 1
                    R.emit({'type': 'backtrack', 'level': d - 1})
                R.level = d
                x = number(sym_index, P, model[P])
                if why[0] == 'decide':
                    R.n['decisions'] += 1
                    R.emit({'type': 'decide', 'level': d, 'lit': x})
                else:
                    R.n['propagations'] += 1
                    R.emit({'type': 'propagate', 'level': d, 'lits': [x], 'reason': why[0],
                            'reasons': [unitc[0] if why[0] == 'unit' else None]})
            why[0] = 'decide'
            r = dpll(clauses, symbols, model, h)
            if r is False and R.events and R.events[-1]['type'] != 'conflict':
                R.n['conflicts'] += 1
                bad = next((c for c in clauses if L.pl_true(c, model) is False), None)
                R.emit({'type': 'conflict', 'level': d,
                        **({'clause': clause_lits(L, sym_index, bad)} if bad is not None else {})})
            return r
        finally:
            depth[0] -= 1
    L.dpll, L.find_pure_symbol, L.find_unit_clause = w_dpll, w_pure, w_unit
    try:
        return L.dpll_satisfiable(s)
    finally:
        L.dpll, L.find_pure_symbol, L.find_unit_clause = dpll, pure, unit


def run_cdcl(L, s, sym_index, R):
    """CDCL of aima.logic; a propagate event gives, for each literal, the
    clause that forced it (reasons: the antecedent that unit_propagation
    writes on the edges of the implication graph into the literal, or the
    literal alone for a clause of one literal), and a conflict the clause
    falsified (clause, the antecedent of the conflict node K) and the clause
    that conflict_analysis learns from it (learned)."""
    dec, up, bj, ca = L.assign_decision_literal, L.unit_propagation, L.backjump, L.conflict_analysis
    lits = lambda c: clause_lits(L, sym_index, c)

    def reason(G, P, value):
        pred = list(G.pred[P])
        return lits(G[pred[0]][P]['antecedent']) if pred else [number(sym_index, P, value)]

    def w_dec(symbols, model, scores, G, dl):
        before = set(model)
        dec(symbols, model, scores, G, dl)
        (P,) = set(model) - before
        R.n['decisions'] += 1
        R.level = dl
        R.emit({'type': 'decide', 'level': dl, 'lit': number(sym_index, P, model[P])})

    def w_up(clauses, symbols, model, G, dl):
        before = set(model)
        r = up(clauses, symbols, model, G, dl)
        new = [P for P in model if P not in before]
        # the literals in the order of their propagation, 9 to an event, so that
        # a propagation that fills a whole Sudoku is seen spreading
        for i in range(0, len(new), 9):
            R.n['propagations'] += len(new[i:i + 9])
            R.emit({'type': 'propagate', 'level': dl, 'lits': [number(sym_index, P, model[P]) for P in new[i:i + 9]],
                    'reasons': [reason(G, P, model[P]) for P in new[i:i + 9]]})
        if r:
            R.n['conflicts'] += 1
            R.emit({'type': 'conflict', 'level': dl, 'clause': lits(next(G[p]['K']['antecedent'] for p in G.pred['K']))})
        return r

    def w_ca(G, dl):
        out = ca(G, dl)
        assert R.events[-1]['type'] == 'conflict'
        R.events[-1]['learned'] = lits(out[1])
        return out

    def w_bj(symbols, model, G, dl=0):
        bj(symbols, model, G, dl)
        R.level = dl
        R.emit({'type': 'backtrack', 'level': dl, **({'restart': True} if dl == 0 else {})})
    L.assign_decision_literal, L.unit_propagation, L.backjump, L.conflict_analysis = w_dec, w_up, w_bj, w_ca
    try:
        return L.cdcl_satisfiable(s)
    finally:
        L.assign_decision_literal, L.unit_propagation, L.backjump, L.conflict_analysis = dec, up, bj, ca


def run_walksat(L, s, sym_index, R, max_flips):
    code = L.WalkSAT.__code__
    last = {}

    def tracer(frame, event, arg):
        if frame.f_code is not code:
            return None

        def local(frame, event, arg):
            if event == 'line' and frame.f_lineno == code.co_firstlineno + 9:   # the head of the loop
                model = frame.f_locals.get('model')
                if model is not None:
                    changed = [P for P, v in model.items() if last.get(P) != v]
                    if changed:
                        R.n['flips'] += 0 if not last else len(changed)
                        if last:
                            R.emit({'type': 'flip', 'level': 0, 'lits': [number(sym_index, P, model[P]) for P in changed]})
                        else:
                            R.emit({'type': 'propagate', 'level': 0, 'lits': [number(sym_index, P, v) for P, v in model.items()],
                                    'reason': 'random start'})
                        last.clear()
                        last.update(model)
            return local
        return local
    sys.settrace(tracer)
    try:
        return L.WalkSAT(L.conjuncts(s), 0.5, max_flips)
    finally:
        sys.settrace(None)


# ---------------------------------------------------------------- the searches
def node_ids(node, k):
    """The id of the k-th expansion, that of node, and the id of its parent:
    the last expansion of the Node that generated node (a Node of aima is
    expanded more than once by RBFS and, the root, by every iteration of
    IDA*), written on the Node itself."""
    node._trace_id = k
    return {'id': k, 'parent': getattr(node.parent, '_trace_id', None) if node.parent is not None else None}


def ancestors(exp, keep, state):
    """For a sample of the expansions exp (the indices keep), the ancestors
    of each kept expansion that no kept expansion before it and no earlier
    list gives, from the root down, each with its id, parent, g, h, f and
    state, so that the tree of the states drawn is connected."""
    at = {e['id']: e for e in exp}
    shown, out = set(), {}
    for i in sorted(keep):
        chain, p = [], exp[i]['parent']
        while p is not None and p not in shown and not (at[p]['id'] - 1 in keep):
            chain.append(at[p])
            shown.add(p)
            p = at[p]['parent']
        shown.add(exp[i]['id'])
        if chain:
            out[i] = [{'id': a['id'], 'parent': a['parent'], 'g': a['g'], 'h': a['h'], 'f': a['f'], **state(a)}
                      for a in reversed(chain)]
    return out


SEARCHES = {
    'astar': ('A*', lambda S, P: S.astar_search(P)),
    'bfs': ('breadth-first', lambda S, P: S.breadth_first_graph_search(P)),
    'ucs': ('uniform cost', lambda S, P: S.uniform_cost_search(P)),
    'greedy': ('greedy best-first', lambda S, P: S.best_first_graph_search(P, lambda n: P.h(n))),
    'rbfs': ('RBFS', lambda S, P: S.recursive_best_first_search(P)),
    'idastar': ('IDA*', lambda S, P: S.iterative_deepening_astar_search(P)),
}
SEARCHPLAN = {'puzzle': ['astar', 'idastar', 'rbfs', 'bfs'], 'romania': ['bfs', 'ucs', 'greedy', 'astar', 'rbfs']}


def romania_instance(S):
    """The road map of Romania of aima.search, from Arad to Bucharest."""
    g, loc = S.romania_map, S.romania_map.locations
    edges = sorted({tuple(sorted((a, b))) + (g.get(a, b),) for a in g.nodes() for b in g.get(a)})
    return {'id': 'romania', 'kind': 'graph', 'start': 'Arad', 'goal': 'Bucharest',
            'nodes': {c: list(loc[c]) for c in sorted(loc)}, 'edges': [list(e) for e in edges]}


def record_search(aima, game, name, algo, out, cap, timeout):
    """A search of aima.search on the 8-puzzle (the instance of the traces of
    PBeFS, with the goal of Korf) or on the map of Romania; every expansion is
    read by wrapping Node.expand, and at most cap of them are kept, evenly
    spaced, the counters staying exact."""
    sys.path.insert(0, aima)
    from aima import search as S
    folder = os.path.join(ROOT, 'traces', 'games', game)
    if game == 'puzzle':
        ref = next(f for f in sorted(os.listdir(folder)) if f.startswith(name + '.') and f.endswith('.jsonl'))
        inst = json.loads(open(os.path.join(folder, ref)).readline())['instance']
        P = S.EightPuzzle(tuple(inst['board']), goal=tuple(inst['goal']))
        enc = lambda st: list(st)
        hname = 'misplaced tiles'
    else:
        inst = romania_instance(S)
        P = S.GraphProblem(inst['start'], inst['goal'], S.romania_map)
        enc = lambda st: st
        hname = 'straight-line distance'
    label, run = SEARCHES[algo]
    exp = []
    n = {'expanded': 0, 'generated': 0}
    expand = S.Node.expand

    def w_expand(node, problem):
        kids = expand(node, problem)
        n['expanded'] += 1
        n['generated'] += len(kids)
        f = getattr(node, 'f', None)
        h = int(P.h(node)) if algo != 'bfs' and algo != 'ucs' else 0
        # aima keeps f on the node only where it memoizes it (best-first,
        # RBFS); IDA* computes g + h without storing it
        exp.append({'type': 'expand', 'w': 0, 'g': node.path_cost, 'h': h,
                    'f': f if isinstance(f, (int, float)) and f != float('inf') else node.path_cost + h,
                    'state': node.state, 'n': dict(n), **node_ids(node, n['expanded'])})
        if len(exp) > 2_000_000:
            raise Stop()
        return kids
    S.Node.expand = w_expand

    def alarm(*_):
        raise Stop()
    signal.signal(signal.SIGALRM, alarm)
    signal.alarm(timeout)
    t0 = time.perf_counter()
    try:
        sol = run(S, P)
        status = 'optimal' if sol is not None and algo != 'greedy' else 'feasible' if sol is not None else 'infeasible'
    except Stop:
        sol, status = None, 'limit'
    finally:
        signal.alarm(0)
        S.Node.expand = expand
    seconds = time.perf_counter() - t0
    total = len(exp)
    stride = max(1, -(-total // cap))
    events, seen = [], set()
    keep = {i for i in range(total) if not (i + 1) % stride or i + 1 == total}
    anc = ancestors(exp, keep, lambda e: {('x' if game == 'puzzle' else 'key'): enc(e['state'])})
    for i, e in enumerate(exp):
        if game == 'romania':
            seen.add(e['state'])
        if i not in keep:
            continue
        o = {k: v for k, v in e.items() if k not in ('state', 'id', 'parent')}
        if game == 'puzzle':
            o['x'] = enc(e['state'])
        else:
            o['set'] = {c: 'e0' for c in seen}
            seen = set()
            o['key'] = e['state']
        o.update({'id': e['id'], 'parent': e['parent'], **({'ancestors': anc[i]} if anc.get(i) else {})})
        events.append({'step': len(events), **o})
    path = [enc(nd.state) for nd in sol.path()] if sol is not None else []
    for i, st in enumerate(path):
        events.append({'step': len(events), 'type': 'path', 'n': dict(n), 'i': i,
                       **({'x': st} if game == 'puzzle' else {'set': {st: 'p'}})})
    commit = subprocess.run(['git', '-C', aima, 'log', '-1', '--format=%h'], capture_output=True, text=True).stdout.strip()
    header = {'kind': 'arena', 'v': 1, 'game': game, 'sample': False, 'instance': inst,
              'solver': {'id': 'aima-' + algo, 'name': 'aima ' + label, 'block': 'aima-python',
                         'paradigm': 'heuristic search', 'code': 'aima-python ' + commit,
                         'config': {'algorithm': algo, 'heuristic': '' if algo in ('bfs', 'ucs') else hname, 'threads': 1}},
              'counters': ['expanded', 'generated'], 'workers': 1,
              'lane': 'recorded run of aima-python %s' % label,
              'sampling': {'every': 1, 'expansions_kept': sum(1 for e in events if e['type'] == 'expand')}}
    result = {'type': 'result', 'status': status, 'cost': sol.path_cost if sol is not None else None, 'path': path,
              'seconds': round(seconds, 4), 'stats': dict(n), 'events': len(events), 'capped': False}
    with open(out, 'w') as f:
        for o in [header] + events + [result]:
            f.write(json.dumps(o, separators=(',', ':')) + '\n')
    return status, total, seconds


# ---------------------------------------------------------------- planning
# have_cake_and_eat_cake_too ends in one level and one step, and logistics_problem
# asks for its goal: they are left out
PLANNING = {'sussman': 'three_block_tower', 'spare-tire': 'spare_tire', 'air-cargo': 'air_cargo'}
PLANALGOS = ['graphplan', 'forward-astar', 'backward-astar', 'forward-ucs']


def record_planning(aima, name, algo, out, timeout):
    """A planner of aima.planning on a problem of the book: GraphPlan, whose
    levels are read by wrapping Graph.expand_graph (of this planner only, not
    of those that ForwardPlan and BackwardPlan run for their heuristic), or
    ForwardPlan and BackwardPlan searched by A* or by uniform cost, whose
    expansions are read by wrapping Node.expand. A state, a subgoal or a level
    is written as the indices of its positive fluents in instance.fluents, and
    the plan found is replayed from the initial state by PlanningProblem.act."""
    sys.path.insert(0, aima)
    from aima import planning as PL, search as S, logic as L
    make = getattr(PL, PLANNING[name])
    prob = make()
    pos = lambda e: not e.op.startswith('Not')
    fluents = set(str(c) for c in prob.initial if pos(c)) | set(str(c) for c in prob.goals if pos(c))
    for act in prob.expand_actions():
        for e in list(act.precond) + list(act.effect):
            if pos(e):
                fluents.add(str(e))
    # the static fluents (true at the start and touched by no action) are left out
    touched = {str(e).replace('Not', '', 1) if not pos(e) else str(e)
               for act in prob.expand_actions() for e in act.effect}
    fluents = sorted(f for f in fluents if f in touched or f in {str(g) for g in prob.goals})
    idx = {f: i for i, f in enumerate(fluents)}
    enc = lambda atoms: sorted({idx[str(a)] for a in atoms if pos(a) and str(a) in idx})
    events, n = [], {'expanded': 0, 'generated': 0}

    def alarm(*_):
        raise Stop()
    signal.signal(signal.SIGALRM, alarm)
    signal.alarm(timeout)
    t0 = time.perf_counter()
    plan, status = None, 'limit'
    try:
        if algo == 'graphplan':
            gp = PL.GraphPlan(prob)
            target, expand = gp.graph, PL.Graph.expand_graph
            n = {'expanded': 0, 'propositions': 0, 'actions': 0, 'mutexes': 0}

            def w_expand(graph):
                expand(graph)
                if graph is target:
                    lv, prev = graph.levels[-1], graph.levels[-2]
                    n['expanded'] = len(graph.levels) - 1
                    n['propositions'] = sum(1 for c in lv.current_state if pos(c))
                    n['actions'] = len(prev.current_action_links)
                    n['mutexes'] = len(lv.state_mutexes) if hasattr(lv, 'state_mutexes') else 0
                    events.append({'type': 'level', 'w': 0, 'g': n['expanded'], 'h': 0, 'f': n['expanded'],
                                   'x': enc(lv.current_state), 'n': dict(n)})
            PL.Graph.expand_graph = w_expand
            try:
                sol = gp.execute()
            finally:
                PL.Graph.expand_graph = expand
            if sol:
                plan, status = PL.linearize(sol), 'feasible'
            else:
                status = 'infeasible'
        else:
            direction, how = algo.split('-')
            P = (PL.ForwardPlan if direction == 'forward' else PL.BackwardPlan)(prob)
            expand = S.Node.expand

            def w_expand(node, problem):
                kids = expand(node, problem)
                if problem is P:
                    n['expanded'] += 1
                    n['generated'] += len(kids)
                    f = getattr(node, 'f', None)
                    events.append({'type': 'expand', 'w': 0, 'g': node.path_cost, 'h': 0,
                                   'f': f if isinstance(f, (int, float)) and f != float('inf') else node.path_cost,
                                   'x': enc(L.conjuncts(node.state)), 'n': dict(n), **node_ids(node, n['expanded'])})
                return kids
            S.Node.expand = w_expand
            try:
                sol = S.astar_search(P) if how == 'astar' else S.uniform_cost_search(P)
            finally:
                S.Node.expand = expand
            if sol is not None:
                plan = sol.solution()
                if direction == 'backward':
                    plan = list(reversed(plan))
                status = 'optimal'
            else:
                status = 'infeasible'
    except Stop:
        status = 'limit'
    finally:
        signal.alarm(0)
    seconds = time.perf_counter() - t0
    path, moves = [], []
    if plan is not None:
        run = make()
        path.append(enc(run.initial))
        for a in plan:
            run.act(L.expr(str(a)))
            path.append(enc(run.initial))
            moves.append(str(a))
    for i, x in enumerate(path):
        events.append({'type': 'path', 'n': dict(n), 'i': i, 'x': x, **({'move': moves[i - 1]} if i else {})})
    events = [{'step': i, **e} for i, e in enumerate(events)]
    commit = subprocess.run(['git', '-C', aima, 'log', '-1', '--format=%h'], capture_output=True, text=True).stdout.strip()
    label = {'graphplan': 'GraphPlan', 'forward-astar': 'ForwardPlan, A*', 'backward-astar': 'BackwardPlan, A*',
             'forward-ucs': 'ForwardPlan, uniform cost'}[algo]
    inst = {'id': name, 'kind': 'planning', 'problem': PLANNING[name], 'fluents': fluents,
            'initial': enc(prob.initial), 'goal': enc(prob.goals)}
    header = {'kind': 'arena', 'v': 1, 'game': 'planning', 'sample': False, 'instance': inst,
              'solver': {'id': 'aima-' + algo, 'name': 'aima ' + label, 'block': 'aima-python',
                         'paradigm': 'heuristic search', 'code': 'aima-python ' + commit,
                         'config': {'algorithm': algo, 'heuristic': 'ignore delete lists' if 'astar' in algo else '',
                                    'threads': 1}},
              'counters': list(n), 'workers': 1,
              'lane': 'recorded run of aima-python %s' % label}
    result = {'type': 'result', 'status': status, 'cost': len(moves) if plan is not None else None, 'path': path,
              'moves': moves, 'seconds': round(seconds, 4), 'stats': dict(n), 'events': len(events), 'capped': False}
    with open(out, 'w') as f:
        for o in [header] + events + [result]:
            f.write(json.dumps(o, separators=(',', ':')) + '\n')
    return status, len(events), seconds


# ---------------------------------------------------------------- recording
ALGOS = {
    'bt-fc': ('Backtracking, MRV + forward checking', 'csp', ['assigns', 'prunings', 'backtracks', 'wipeouts']),
    'bt-mac': ('Backtracking, MRV + MAC', 'csp', ['assigns', 'prunings', 'backtracks', 'wipeouts']),
    'ac3': ('AC-3', 'csp', ['assigns', 'prunings', 'backtracks', 'wipeouts']),
    'minconf': ('Min-conflicts', 'local search', ['assigns', 'conflicted']),
    'dpll': ('DPLL', 'sat', ['decisions', 'propagations', 'conflicts', 'backtracks']),
    'cdcl': ('CDCL', 'sat', ['decisions', 'propagations', 'conflicts']),
    'walksat': ('WalkSAT', 'local search', ['flips']),
    'gac': ('GAC with domain splitting', 'csp', ['splits', 'prunings', 'checks', 'backtracks', 'wipeouts']),
}
# the solvers run on each game, those that end in time on its instances
PLAN = {'coloring': ['bt-fc', 'bt-mac', 'minconf', 'dpll', 'cdcl', 'walksat'],
        'queens': ['bt-fc', 'bt-mac', 'minconf', 'dpll', 'cdcl', 'walksat'],
        'sudoku': ['ac3', 'bt-fc', 'bt-mac', 'cdcl'],
        'zebra': ['ac3', 'bt-fc', 'bt-mac', 'minconf', 'dpll', 'cdcl', 'walksat'],
        'kakuro': ['gac', 'dpll', 'cdcl'], 'crypto': ['gac', 'dpll', 'cdcl'], 'crossword': ['gac', 'dpll', 'cdcl']}
# the instances of the games that have no trace of SMS++ yet to list them
INSTANCES = {'zebra': ['zebra'], 'kakuro': ['kakuro-2', 'kakuro-3', 'kakuro-4'], 'crypto': ['crypto-send', 'crypto-two'],
             'crossword': ['crossword-1']}


def record(aima, game, name, algo, out, cap, timeout, seed):
    sys.path.insert(0, aima)
    from aima import csp as C, logic as L
    hdr = json.loads(subprocess.run([sys.executable, os.path.join(ROOT, 'src', 'arena', 'translate.py'), name,
                                     '--header', '/dev/stdout'], capture_output=True, text=True, check=True).stdout)
    inst = hdr['instance']
    label, paradigm, counters = ALGOS[algo]
    R = Recorder(counters, cap)
    random.seed(seed)
    status, solution = 'limit', None

    def alarm(*_):
        raise Stop()
    signal.signal(signal.SIGALRM, alarm)
    signal.alarm(timeout)
    t0 = time.perf_counter()
    try:
        if paradigm != 'sat' and algo != 'walksat':
            csp = csp_for(C, inst)
            forced = [lit(inst, v, next(iter(csp.domains[v]))) for v in csp.variables if len(csp.domains[v]) == 1]
            if game in NARYGAMES:       # and the values outside a domain (the leading digits, 0 or 1 of a carry)
                forced += [-lit(inst, v, x) for v in sorted(csp.variables, key=lambda v: inst['_index'][v])
                           for x in inst['_vals'] if x not in set(csp.domains[v])]
            if forced:          # the givens of a Sudoku, domains of one value
                R.emit({'type': 'propagate', 'level': 0, 'lits': forced, 'reason': 'given'})
            res = (run_ac3(C, csp, inst, R) if algo == 'ac3' else run_min_conflicts(C, csp, inst, R) if algo == 'minconf'
                   else run_gac(C, csp, inst, R) if algo == 'gac' else run_backtracking(C, csp, inst, R, algo[3:]))
            if res == 'partial':
                status = 'arc consistent'
            elif res:
                status, solution = 'sat', {inst['_name'][v]: inst['_vname'][x] for v, x in res.items()}
            else:
                status = 'unsat' if algo != 'minconf' else 'limit'
            for k in ('_index', '_vals', '_name', '_vname'):
                inst.pop(k, None)
        else:
            translate = subprocess.run([sys.executable, os.path.join(ROOT, 'src', 'arena', 'translate.py'), name,
                                        '--dimacs', '/dev/stdout'], capture_output=True, text=True, check=True).stdout
            clauses = [[int(x) for x in ln.split()[:-1]] for ln in translate.splitlines()[1:] if ln.strip()]
            # aima reads a name in lowercase as a logical variable, so the symbols
            # are given to it with a capital initial, numbered as in the CNF
            symbols = [x[0].upper() + x[1:] for x in hdr['encoding']['symbols']]
            sym_index = {s: i + 1 for i, s in enumerate(symbols)}
            _, s = sentence(L, symbols, clauses)
            res = (run_dpll(L, s, sym_index, R) if algo == 'dpll' else run_cdcl(L, s, sym_index, R) if algo == 'cdcl'
                   else run_walksat(L, s, sym_index, R, 3000))
            if res:
                status = 'sat'
                model = sorted(sym_index[str(P)] for P, v in res.items() if v)
                solution = None
            else:
                status = 'unsat' if algo != 'walksat' and res is False else 'limit'
                model = None
    except Stop:
        status = 'limit'
        model = None
    finally:
        signal.alarm(0)
    seconds = time.perf_counter() - t0
    commit = subprocess.run(['git', '-C', aima, 'log', '-1', '--format=%h'], capture_output=True, text=True).stdout.strip()
    header = {'kind': 'arena', 'v': 1, 'game': game, 'sample': False, **hdr,
              'solver': {'id': 'aima-' + algo, 'name': 'aima ' + label, 'block': 'aima-python', 'paradigm': paradigm,
                         'code': 'aima-python ' + commit, 'config': algo},
              'counters': counters}
    result = {'type': 'result', 'status': status, 'seconds': round(seconds, 4), 'stats': dict(R.n),
              'events': len(R.events), 'capped': len(R.events) >= cap}
    if solution:
        result['solution'] = solution
    elif paradigm == 'sat' or algo == 'walksat':
        if status == 'sat':
            result['model'] = model
    with open(out, 'w') as f:
        for o in [header] + R.events + [result]:
            f.write(json.dumps(o, separators=(',', ':')) + '\n')
    return status, len(R.events), seconds


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--aima', default=os.path.expanduser('~/GDrive/aima-python'))
    ap.add_argument('--games', nargs='+', default=list(PLAN))
    ap.add_argument('--instances', nargs='*', help='only these instances')
    ap.add_argument('--algos', nargs='*', help='only these solvers')
    ap.add_argument('--cap', type=int, default=10000)
    ap.add_argument('--timeout', type=int, default=120)
    ap.add_argument('--seed', type=int, default=1)
    a = ap.parse_args()
    for game in a.games:
        folder = os.path.join(ROOT, 'traces', 'games', game)
        if game == 'planning':
            os.makedirs(folder, exist_ok=True)
            for name in PLANNING:
                if a.instances and name not in a.instances:
                    continue
                for i, algo in enumerate(PLANALGOS):
                    if a.algos and algo not in a.algos:
                        continue
                    out = os.path.join(folder, '%s.%d-aima-%s.jsonl' % (name, i + 1, algo))
                    r = subprocess.run([sys.executable, __file__, '--plan', name, algo, out, str(a.timeout), a.aima],
                                       capture_output=True, text=True, env=ENV)
                    print('%-10s %-22s %-14s %s' % (game, name, algo, (r.stdout + r.stderr).strip()[-300:]), flush=True)
            continue
        if game in SEARCHPLAN:
            os.makedirs(folder, exist_ok=True)
            insts = ['romania'] if game == 'romania' else ['8puzzle-easy', '8puzzle-medium', '8puzzle-hard']
            for name in insts:
                if a.instances and name not in a.instances:
                    continue
                for i, algo in enumerate(SEARCHPLAN[game]):
                    if a.algos and algo not in a.algos:
                        continue
                    out = os.path.join(folder, '%s.%d-aima-%s.jsonl' % (name, 5 + i, algo))
                    r = subprocess.run([sys.executable, __file__, '--search', game, name, algo, out, '2500',
                                        str(a.timeout), a.aima], capture_output=True, text=True, env=ENV)
                    print('%-10s %-22s %-8s %s' % (game, name, algo, (r.stdout + r.stderr).strip()[-300:]), flush=True)
            continue
        os.makedirs(folder, exist_ok=True)
        insts = INSTANCES.get(game) or sorted({x['instance'] for x in json.load(open(os.path.join(folder, 'index.json')))['traces']})
        for name in insts:
            if a.instances and name not in a.instances:
                continue
            for algo in PLAN[game]:
                if a.algos and algo not in a.algos:
                    continue
                out = os.path.join(folder, '%s-aima-%s.jsonl' % (name, algo))
                # each run in a process of its own, so that the wrappers and a stopped run leave nothing behind
                r = subprocess.run([sys.executable, __file__, '--one', game, name, algo, out, str(a.cap), str(a.timeout),
                                    str(a.seed), a.aima], capture_output=True, text=True, env=ENV)
                print('%-10s %-22s %-8s %s' % (game, name, algo, (r.stdout + r.stderr).strip()[-300:]), flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--plan':
        name, algo, out, timeout, aima = sys.argv[2:7]
        st, ne, sec = record_planning(aima, name, algo, out, int(timeout))
        print('%s, %d events, %.2f s' % (st, ne, sec))
    elif len(sys.argv) > 1 and sys.argv[1] == '--search':
        game, name, algo, out, cap, timeout, aima = sys.argv[2:9]
        st, ne, sec = record_search(aima, game, name, algo, out, int(cap), int(timeout))
        print('%s, %d expansions, %.2f s' % (st, ne, sec))
    elif len(sys.argv) > 1 and sys.argv[1] == '--one':
        game, name, algo, out, cap, timeout, seed, aima = sys.argv[2:10]
        st, ne, sec = record(aima, game, name, algo, out, int(cap), int(timeout), int(seed))
        print('%s, %d events, %.2f s' % (st, ne, sec))
    else:
        main()
