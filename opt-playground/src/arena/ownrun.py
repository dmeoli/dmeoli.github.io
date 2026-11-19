"""The runs of the reader (the box "Run it yourself" of src/arena/ownrun.js):
a solver of aima-python, with the options the reader picks, on the instance
of the page or on one the reader has drawn, run in Pyodide by
src/arena/pyworker.js and recorded by the recorder of the traces,
tools/aima_trace.py, whose Recorder and wrappers of the CSP are imported as
they are, so that the trace of a run of the reader has the format of the
recorded traces of aima-python and is replayed by the same lane.

A run is stopped after CAP events (or MAXEXP expansions of a search) or
SECONDS seconds, and its result then says so (status "limit", with the
member "stopped" naming the limit reached).
"""

import json
import math
import random
import sys
import time

import translate
from aima import csp as C
from aima import search as S

# aima-python reads numpy for a few constants and functions of the searches
# (np.inf in IDA* and RBFS, np.hypot in the straight-line distance); in
# Pyodide numpy is not loaded (translate.py gives an empty module in its
# place), so the few names the searches use are given from math
_np = sys.modules.get('numpy')
if _np is not None and not hasattr(_np, 'inf'):
    _np.inf, _np.pi, _np.e = math.inf, math.pi, math.e
    _np.hypot, _np.sqrt, _np.exp, _np.log = math.hypot, math.sqrt, math.exp, math.log

try:
    import aima_trace as AT
except ImportError:             # outside the page: the recorder is in tools/
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
    import aima_trace as AT

CAP, SECONDS, MAXEXP, KEEP = 5000, 10, 200000, 2500
CODE = 'aima-python, run in this browser'

# the instances drawn by the reader, by id, known to translate.instance
CUSTOM = {}
_instance = translate.instance


def _custom_or_named(name):
    return json.loads(json.dumps(CUSTOM[name])) if name in CUSTOM else _instance(name)


translate.instance = _custom_or_named


def register(inst):
    CUSTOM[inst['id']] = inst


class Recorder(AT.Recorder):
    """The recorder of tools/aima_trace.py, with a limit of time too."""

    def __init__(self, counters, cap, seconds):
        super().__init__(counters, cap)
        self.deadline = time.perf_counter() + seconds
        self.stopped = None

    def emit(self, o):
        if time.perf_counter() > self.deadline:
            self.stopped = 'time'
            raise AT.Stop()
        if len(self.events) >= self.cap:
            self.stopped = 'events'
        super().emit(o)


# ---------------------------------------------------------------- the CSPs
def run_bt(csp, inst, R, mrv, lcv, inference):
    """backtracking_search of aima.csp with the options of the reader, its
    assignments, prunings and retractions read by watch_csp of the recorder."""
    flush = AT.watch_csp(C, csp, inst, R)
    inf = {'none': C.no_inference, 'fc': C.forward_checking, 'mac': C.mac}[inference]

    def w_inference(*a, **k):
        r = inf(*a, **k)
        flush()
        return r
    res = C.backtracking_search(csp, select_unassigned_variable=C.mrv if mrv else C.first_unassigned_variable,
                                order_domain_values=C.lcv if lcv else C.unordered_domain_values,
                                inference=w_inference)
    flush()
    return res


def run_minconf(csp, inst, R, steps):
    """run_min_conflicts of the recorder, with the max_steps of the reader."""
    orig = C.min_conflicts
    C.min_conflicts = lambda csp, max_steps=None: orig(csp, max_steps=steps)
    try:
        return AT.run_min_conflicts(C, csp, inst, R)
    finally:
        C.min_conflicts = orig


INF = {'none': 'no inference', 'fc': 'forward checking', 'mac': 'MAC'}


def csp_run(game, name, algo, o, cap, seconds):
    hdr = translate.header(name)
    inst = hdr['instance']
    if algo == 'bt':
        mrv, lcv, inf = bool(o.get('mrv', True)), bool(o.get('lcv', False)), o.get('inference', 'fc')
        label = 'Backtracking, %s%s + %s' % ('MRV' if mrv else 'first unassigned', ', LCV' if lcv else '', INF[inf])
        sid = {'fc': 'aima-bt-fc', 'mac': 'aima-bt-mac'}.get(inf, 'aima-bt')
        config = 'select %s, order %s, inference %s' % ('mrv' if mrv else 'first_unassigned_variable',
                                                       'lcv' if lcv else 'unordered_domain_values',
                                                       {'none': 'no_inference', 'fc': 'forward_checking', 'mac': 'mac'}[inf])
        _, paradigm, counters = AT.ALGOS['bt-fc']
    else:
        label, paradigm, counters = AT.ALGOS[algo]
        sid = 'aima-' + algo
        config = algo
        if algo == 'minconf':
            steps, seed = int(o.get('steps', 5000)), int(o.get('seed', 1))
            config = 'min_conflicts, max_steps %d, seed %d' % (steps, seed)
    R = Recorder(counters, cap, seconds)
    random.seed(int(o.get('seed', 1)))
    status, solution = 'limit', None
    t0 = time.perf_counter()
    try:
        csp = AT.csp_for(C, inst)
        # the givens, as the recorder writes them (tools/aima_trace.py, record)
        forced = [AT.lit(inst, v, next(iter(csp.domains[v]))) for v in csp.variables if len(csp.domains[v]) == 1]
        if game in AT.NARYGAMES:
            forced += [-AT.lit(inst, v, x) for v in sorted(csp.variables, key=lambda v: inst['_index'][v])
                       for x in inst['_vals'] if x not in set(csp.domains[v])]
        if forced:
            R.emit({'type': 'propagate', 'level': 0, 'lits': forced, 'reason': 'given'})
        res = (AT.run_ac3(C, csp, inst, R) if algo == 'ac3' else run_minconf(csp, inst, R, steps) if algo == 'minconf'
               else AT.run_gac(C, csp, inst, R) if algo == 'gac' else run_bt(csp, inst, R, mrv, lcv, inf))
        if res == 'partial':
            status = 'arc consistent'
        elif res:
            status, solution = 'sat', {inst['_name'][v]: inst['_vname'][x] for v, x in res.items()}
        else:
            status = 'unsat' if algo != 'minconf' else 'limit'
            if algo == 'minconf':
                R.stopped = 'steps'
    except AT.Stop:
        status = 'limit'
    finally:
        sys.settrace(None)
    for k in ('_index', '_vals', '_name', '_vname'):
        inst.pop(k, None)
    header = {'kind': 'arena', 'v': 1, 'game': game, 'sample': False, **hdr,
              'solver': {'id': sid, 'name': 'aima ' + label, 'block': 'aima-python', 'paradigm': paradigm,
                         'code': CODE, 'config': config},
              'counters': counters, 'own': True}
    result = {'type': 'result', 'status': status, 'seconds': round(time.perf_counter() - t0, 4), 'stats': dict(R.n),
              'events': len(R.events), 'capped': R.stopped == 'events'}
    if R.stopped:
        result['stopped'] = R.stopped
    if solution:
        result['solution'] = solution
    return [header] + R.events + [result]


# ---------------------------------------------------------------- the searches
SQ2 = math.sqrt(2)


class GridPaths(S.GridProblem):
    """GridProblem of aima.search with the rules of the page (and of the
    traces of PBeFS): 8 moves, a diagonal costs sqrt(2) and may not cut the
    corner of a blocked cell; a state is a cell (x, y), y the row from the top."""

    def __init__(self, inst):
        W, H = inst['width'], inst['height']
        walls = [(x, y) for y in range(H) for x in range(W) if inst['rows'][y][x] == '@']
        st, gl = inst['start'], inst['goal']
        super().__init__((st % W, st // W), (gl % W, gl // W), W, H, walls, S.directions8)

    def actions(self, state):
        x, y = state
        return [a for a in super().actions(state) if not (self.directions[a][0] and self.directions[a][1])
                or (self.passable((x + self.directions[a][0], y)) and self.passable((x, y + self.directions[a][1])))]

    def path_cost(self, c, state1, action, state2):
        dx, dy = self.directions[action]
        return c + (SQ2 if dx and dy else 1)

    def h(self, node):
        x, y = node.state if isinstance(node, S.Node) else node
        dx, dy = abs(x - self.goal[0]), abs(y - self.goal[1])
        return max(dx, dy) + (SQ2 - 1) * min(dx, dy)


def manhattan(P, side):
    goal = {t: i for i, t in enumerate(P.goal)}

    def h(node):
        st = node.state if isinstance(node, S.Node) else node
        return sum(abs(i % side - goal[t] % side) + abs(i // side - goal[t] // side) for i, t in enumerate(st) if t)
    return h


ALG = {'astar': 'A*', 'bfs': 'breadth-first', 'ucs': 'uniform cost', 'greedy': 'greedy best-first',
       'rbfs': 'RBFS', 'idastar': 'IDA*'}


def search_run(game, inst, algo, o, cap, seconds):
    """A search of aima.search on the 8-puzzle, the map of Romania or a grid,
    recorded as record_search of the recorder does: every expansion read by
    wrapping Node.expand, at most KEEP of them kept, evenly spaced, the
    counters staying exact."""
    hname = o.get('h', '')
    w = float(o.get('w', 1) or 1)
    if game == 'puzzle':
        P = S.EightPuzzle(tuple(inst['board']), goal=tuple(inst['goal']))
        enc = lambda st: list(st)
        hf = {'misplaced tiles': P.h, 'h2': manhattan(P, inst.get('side', 3))}.get(hname)
    elif game == 'romania':
        inst = AT.romania_instance(S)
        P = S.GraphProblem(inst['start'], inst['goal'], S.romania_map)
        enc = lambda st: st
        hf = P.h if hname == 'straight-line distance' else None
    else:
        P = GridPaths(inst)
        W = inst['width']
        enc = lambda st: st[1] * W + st[0]
        hf = P.h if hname == 'octile' else None
    if algo in ('bfs', 'ucs'):
        hname, hf = '', None
    if hf is None:
        hname = ''
        hf = lambda n: 0
    hm = S.memoize(hf, 'h')
    runs = {'astar': lambda: S.astar_search(P, h=hf) if w == 1 else S.best_first_graph_search(P, lambda n: n.path_cost + w * hm(n)),
            'bfs': lambda: S.breadth_first_graph_search(P),
            'ucs': lambda: S.uniform_cost_search(P),
            'greedy': lambda: S.best_first_graph_search(P, lambda n: hf(n)),
            'rbfs': lambda: S.recursive_best_first_search(P, h=hf),
            'idastar': lambda: S.iterative_deepening_astar_search(P, h=hf)}
    exp, done = [], set()
    n = {'expanded': 0, 'generated': 0}
    expand = S.Node.expand
    deadline = time.perf_counter() + seconds
    stopped = [None]
    rnd = (lambda v: round(v, 4)) if game == 'grid' else int

    # the id of an expansion is its number, and its parent the last
    # expansion of the Node that generated it (RBFS and IDA* expand a Node
    # more than once); the Nodes are kept, so that their ids stay theirs
    last, alive = {}, []

    def w_expand(node, problem):
        kids = expand(node, problem)
        n['expanded'] += 1
        n['generated'] += len(kids)
        f = getattr(node, 'f', None)
        e = {'type': 'expand', 'w': 0, 'g': rnd(node.path_cost), 'h': rnd(hf(node)) if hname else 0,
             'f': rnd(f) if isinstance(f, (int, float)) and f != float('inf') else rnd(node.path_cost),
             'state': node.state, 'n': dict(n), 'id': n['expanded'],
             'parent': last.get(id(node.parent)) if node.parent is not None else None}
        last[id(node)] = n['expanded']
        alive.append(node)
        if game == 'grid':
            done.add(node.state)
            e['open'] = [k.state for k in kids if k.state not in done]
        exp.append(e)
        if n['expanded'] >= MAXEXP:
            stopped[0] = 'expansions'
            raise AT.Stop()
        if time.perf_counter() > deadline:
            stopped[0] = 'time'
            raise AT.Stop()
        return kids
    S.Node.expand = w_expand
    t0 = time.perf_counter()
    try:
        sol = runs[algo]()
        # greedy, A* with w > 1 and breadth-first on steps of unequal cost
        # (the roads of Romania, the diagonals of a grid) prove nothing
        exact = algo != 'greedy' and not (algo == 'astar' and w > 1) and not (algo == 'bfs' and game != 'puzzle')
        status = ('optimal' if exact else 'feasible') if sol is not None else 'infeasible'
    except AT.Stop:
        sol, status = None, 'limit'
    except RecursionError:
        sol, status, stopped[0] = None, 'limit', 'recursion'
    finally:
        S.Node.expand = expand
    seconds = time.perf_counter() - t0
    total = len(exp)
    stride = max(1, -(-total // cap))
    events, seen, opened = [], set(), set()
    # a sampled trace gives with each expansion kept its ancestors that no
    # earlier event gives, from the start down, so that the tree is connected
    byid, given = {e['id']: e for e in exp}, set()

    def node_of(a):
        d = {k: a[k] for k in ('id', 'parent', 'w', 'g', 'h', 'f')}
        if game == 'puzzle':
            d['x'] = enc(a['state'])
        else:
            d['key'] = enc(a['state'])
        return d
    for i, e in enumerate(exp):
        if game != 'puzzle':
            seen.add(enc(e['state']))
            opened.update(enc(s) for s in e.get('open', ()))
        if (i + 1) % stride and i + 1 < total:
            continue
        o2 = {k: v for k, v in e.items() if k not in ('state', 'open')}
        if game != 'puzzle':
            o2['key'] = enc(e['state'])
        if stride > 1:
            anc, p = [], e['parent']
            while p is not None and p not in given and p in byid:
                anc.append(node_of(byid[p]))
                p = byid[p]['parent']
            if anc:
                o2['ancestors'] = anc[::-1]
                given.update(a['id'] for a in anc)
        given.add(e['id'])
        if game == 'puzzle':
            o2['x'] = enc(e['state'])
        else:
            st = {str(c): 'o' for c in opened - seen} if game == 'grid' else {}
            st.update({str(c): 'e0' for c in seen})
            o2['set'] = st
            seen, opened = set(), set()
        events.append({'step': len(events), **o2})
    path = [enc(nd.state) for nd in sol.path()] if sol is not None else []
    for i, st in enumerate(path):
        events.append({'step': len(events), 'type': 'path', 'n': dict(n), 'i': i,
                       **({'x': st} if game == 'puzzle' else {'set': {str(st): 'p'}})})
    label = ALG[algo] + (', w = %g' % w if algo == 'astar' and w != 1 else '')
    alg = 'wastar' if algo == 'astar' and w != 1 else algo
    config = {'algorithm': alg, 'heuristic': hname, 'threads': 1}
    if alg == 'wastar':
        config['w'] = w
    header = {'kind': 'arena', 'v': 1, 'game': game, 'sample': False, 'instance': inst,
              'solver': {'id': 'aima-' + alg, 'name': 'aima ' + label, 'block': 'aima-python',
                         'paradigm': 'heuristic search', 'code': CODE, 'config': config},
              'counters': ['expanded', 'generated'], 'workers': 1, 'own': True,
              'lane': 'run of aima-python %s in this browser' % label,
              'sampling': {'every': stride, 'expansions_kept': sum(1 for e in events if e['type'] == 'expand')}}
    cost = sol.path_cost if sol is not None else None
    if isinstance(cost, float):
        cost = round(cost, 4)
    result = {'type': 'result', 'status': status, 'cost': cost, 'path': path,
              'seconds': round(seconds, 4), 'stats': dict(n), 'events': len(events), 'capped': stride > 1}
    if stopped[0]:
        result['stopped'] = stopped[0]
    return [header] + events + [result]


SEARCHGAMES = ('puzzle', 'romania', 'grid')


def run(spec):
    """spec: game, name (the instance), inst (the instance of a search, as
    the page has it), algo, opts; returns the trace as JSON lines."""
    sp = json.loads(spec) if isinstance(spec, str) else spec
    game, algo, o = sp['game'], sp['algo'], sp.get('opts') or {}
    cap, seconds = int(sp.get('cap', CAP)), float(sp.get('seconds', SECONDS))
    if sp.get('custom'):
        register(sp['custom'])
    old = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old, 5000))
    try:
        if game in SEARCHGAMES:
            out = search_run(game, sp.get('inst'), algo, o, min(cap, KEEP), seconds)
        else:
            out = csp_run(game, sp['name'], algo, o, cap, seconds)
    finally:
        sys.setrecursionlimit(old)
    return '\n'.join(json.dumps(x, separators=(',', ':')) for x in out) + '\n'
