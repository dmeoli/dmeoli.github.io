"""The model of the solver arena: the instances of map colouring and their
translation into the formats the solvers of SMS++ read, by the unmodified
code of aima-python (src/arena/aima, copied from aimacode/aima-python).

The same file runs in the page (Pyodide, in src/arena/pyworker.js) and on
the machine that records the traces, so that the instance, the numbering of
the variables and the clauses a trace refers to are those the page shows:

    python3 src/arena/translate.py australia --dimacs au.cnf --header au.json
    python3 src/arena/translate.py planar-hard-7 --dimacs p.cnf --header p.json
    python3 src/arena/translate.py queens-8 --dimacs q.cnf --header q.json
    python3 src/arena/translate.py sudoku-harder1 --dimacs s.cnf --header s.json

writes the CNF in DIMACS and the "instance" and "encoding" members of the
header of a trace (docs/study-search-games.md, section 5.1).

The queens (NQueensCSP) and Sudoku of aima.csp go through translate_csp,
the direct encoding of their CSP, with the same numbering of the variables
(the variable is the column of a queen, its value the row; the cell of a
Sudoku, row by row, its value the digit). The CNF of colouring is
MapColoringSAT of aima.logic, whose symbols <vertex>_<colour> are
numbered vertex by vertex in the order of the instance, and the colours in
the order of its list, so that the variable of vertex i (from 0) and colour j
is i * k + j + 1 with k colours; the clauses are those of MapColoringSAT
with their literals sorted, in sorted order (the order of the edges that
MapColoringSAT produces depends on the hashing of the strings, which changes
from one process to another). MapColoringSAT writes the clause of an edge
once from each of its two ends, so each of those clauses is there twice; the
translation keeps them as aima writes them, and says how many they are.
"""

import importlib.util
import itertools
import json
import os
import random
import sys
import types

# aima.logic imports modules the translation never calls (numpy, networkx,
# IPython, sortedcontainers); those that are not installed (in Pyodide none
# is loaded, which spares the download of numpy) are given as empty modules
for _m, _names in (('numpy', ()), ('networkx', ()), ('IPython', ()), ('IPython.display', ('HTML', 'display', 'clear_output')),
                   ('sortedcontainers', ('SortedSet',))):
    try:
        _found = importlib.util.find_spec(_m) is not None
    except (ImportError, ValueError):
        _found = False
    if not _found and _m not in sys.modules:
        sys.modules[_m] = types.ModuleType(_m)
        for _n in _names:
            setattr(sys.modules[_m], _n, None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aima import csp as C
from aima import logic as L

MAPS = {'australia': (C.australia_csp, 'RGB'), 'usa': (C.usa_csp, 'RGBY'), 'france': (C.france_csp, 'RGBY')}

# the random planar graphs: vertices, colours and the share of the edges of
# the greedy triangulation that are kept
LEVELS = {'easy': (12, 'RGBY', 0.75), 'medium': (30, 'RGBY', 1.0), 'hard': (24, 'RGB', 0.9)}


def _cross(p, q, r, s):
    """True if the open segments pq and rs cross (shared ends do not count)."""
    if len({p, q, r, s}) < 4:
        return False

    def o(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        return (v > 1e-12) - (v < -1e-12)

    return o(p, q, r) * o(p, q, s) < 0 and o(r, s, p) * o(r, s, q) < 0


def planar(level, seed):
    """A random planar graph: points in the square [-1, 1]^2 drawn with the
    seed, the greedy triangulation (the pairs by increasing length, each kept
    if it crosses none of those kept before), then a share of its edges."""
    n, colours, keep = LEVELS[level]
    rnd = random.Random(seed)
    pts = []
    while len(pts) < n:  # not closer than a minimum, for a readable drawing
        p = (rnd.uniform(-1, 1), rnd.uniform(-1, 1))
        if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > (0.9 / n ** 0.5) ** 2 for q in pts):
            pts.append(p)
    pairs = sorted(itertools.combinations(range(n), 2),
                   key=lambda e: (pts[e[0]][0] - pts[e[1]][0]) ** 2 + (pts[e[0]][1] - pts[e[1]][1]) ** 2)
    edges = []
    for a, b in pairs:
        if not any(_cross(pts[a], pts[b], pts[c], pts[d]) for c, d in edges):
            edges.append((a, b))
    edges = [e for e in edges if rnd.random() < keep]
    names = ['v%d' % i for i in range(n)]
    return {'id': 'planar-%s-%d' % (level, seed), 'kind': 'planar', 'level': level, 'seed': seed,
            'colours': list(colours), 'vertices': names,
            'xy': [[round(x, 4), round(y, 4)] for x, y in pts],
            'edges': [[names[a], names[b]] for a, b in edges]}


# the Sudoku of aima.csp, by name
SUDOKUS = {'easy1': 'easy1', 'harder1': 'harder1'}


def csp_of(inst):
    """The CSP of aima.csp behind an instance of the queens or of Sudoku, and
    its variables in the order of the instance."""
    if inst['kind'] == 'queens':
        return C.NQueensCSP(inst['n']), list(range(inst['n']))
    p = C.Sudoku(getattr(C, inst['grid']))
    return p, [cell for row in C.Sudoku.rows for cell in row]


def instance(name):
    """The instance named australia, usa, france, planar-<level>-<seed>,
    queens-<n> or sudoku-<easy1|harder1>."""
    if name.startswith('queens-'):
        n = int(name.split('-')[1])
        return {'id': name, 'kind': 'queens', 'n': n, 'vertices': ['c%d' % (i + 1) for i in range(n)],
                'colours': ['r%d' % (j + 1) for j in range(n)]}
    if name.startswith('sudoku-'):
        g = SUDOKUS[name.split('-', 1)[1]]
        grid = getattr(C, g)
        return {'id': name, 'kind': 'sudoku', 'grid': g, 'givens': grid,
                'vertices': ['r%dc%d' % (r + 1, c + 1) for r in range(9) for c in range(9)],
                'colours': list('123456789')}
    if name in MAPS:
        csp, colours = MAPS[name]
        vs = list(csp.variables)
        edges = sorted({tuple(sorted((a, b))) for a in vs for b in csp.neighbors[a]})
        return {'id': name, 'kind': 'map', 'colours': list(colours), 'vertices': vs,
                'edges': [list(e) for e in edges]}
    _, level, seed = name.split('-')
    return planar(level, int(seed))


def translate_csp(inst):
    """The direct encoding of a CSP of aima.csp with binary constraints: a
    Boolean v_c for each variable v and value c, at least one and at most one
    value per variable, a unit clause for each value outside the domain of a
    variable, and for each pair of neighbours and each pair of values that
    the constraint of the CSP rejects the clause that forbids both; the
    constraint is asked of aima, never written here."""
    csp, order = csp_of(inst)
    names, vals, k = inst['vertices'], inst['colours'], len(inst['colours'])
    value = (lambda j: j) if inst['kind'] == 'queens' else (lambda j: vals[j])
    pos = {v: i for i, v in enumerate(order)}
    lit = lambda i, j: i * k + j + 1
    symbols = ['%s_%s' % (names[i], vals[j]) for i in range(len(order)) for j in range(k)]
    clauses = []
    for i, v in enumerate(order):
        dom = set(csp.domains[v])
        clauses.append([lit(i, j) for j in range(k)])
        clauses += [[-lit(i, a), -lit(i, b)] for a in range(k) for b in range(a + 1, k)]
        clauses += [[-lit(i, j)] for j in range(k) if value(j) not in dom]
    for v in order:
        for w in csp.neighbors[v]:
            i, h = pos[v], pos[w]
            if i < h:
                clauses += [[-lit(i, a), -lit(h, b)] for a in range(k) for b in range(k)
                            if not csp.constraints(v, value(a), w, value(b))]
    clauses = [sorted(c, key=lambda x: (abs(x), x)) for c in clauses]
    return {'symbols': symbols, 'clauses': clauses, 'distinct': len({tuple(c) for c in clauses})}


def translate(inst):
    """The CNF of MapColoringSAT, or of translate_csp for the queens and
    Sudoku, and the rows SATBlock makes of it."""
    if inst['kind'] in ('queens', 'sudoku'):
        return translate_csp(inst)
    colours, vs = inst['colours'], inst['vertices']
    nb = {v: [] for v in vs}
    for a, b in inst['edges']:
        nb[a].append(b)
        nb[b].append(a)
    sentence = L.MapColoringSAT(colours, nb)
    k = len(colours)
    index = {'%s_%s' % (v, c): i * k + j + 1 for i, v in enumerate(vs) for j, c in enumerate(colours)}
    symbols = sorted(index, key=index.get)
    clauses = []
    for cl in L.conjuncts(sentence):
        lits = []
        for lit in L.disjuncts(cl):
            sym, positive = L.inspect_literal(lit)
            lits.append(index[str(sym)] if positive else -index[str(sym)])
        clauses.append(sorted(lits, key=lambda x: (abs(x), x)))
    clauses.sort(key=lambda c: (len(c) == 2, [abs(x) for x in c], c))
    distinct = len({tuple(c) for c in clauses})
    return {'symbols': symbols, 'clauses': clauses, 'distinct': distinct}


def kind(c, k):
    """at least one colour, at most one colour, the two ends of an edge (or
    two neighbours of a CSP), or a value outside a domain."""
    if all(x > 0 for x in c):
        return 'alo'
    if len(c) == 1:
        return 'given'
    a, b = (abs(x) - 1 for x in c)
    return 'amo' if a // k == b // k else 'edge'


def row(c, symbols, r):
    """The row of SATBlock for the clause c (r is the index of its r_c):
    sum_{i in P} x_i - sum_{i in N} x_i + r_c >= 1 - |N|."""
    terms = ' '.join(('+ ' if x > 0 else '- ') + 'x[%s]' % symbols[abs(x) - 1] for x in c)
    return '%s + r%d >= %d' % (terms.lstrip('+ '), r, 1 - sum(1 for x in c if x < 0))


def dimacs(t):
    out = ['p cnf %d %d' % (len(t['symbols']), len(t['clauses']))]
    out += [' '.join(map(str, c)) + ' 0' for c in t['clauses']]
    return '\n'.join(out) + '\n'


def summary(name, sample=4):
    """What the page shows of the model: the counts and a few clauses and rows
    of each kind, as JSON."""
    inst = instance(name)
    t = translate(inst)
    k, sy, cl = len(inst['colours']), t['symbols'], t['clauses']
    groups = {'alo': [], 'amo': [], 'edge': [], 'given': []}
    for i, c in enumerate(cl):
        groups[kind(c, k)].append(i)
    show = {g: [{'i': i, 'lits': cl[i],
                 'text': ' | '.join(('' if x > 0 else '~') + sy[abs(x) - 1] for x in cl[i]),
                 'row': row(cl[i], sy, i)} for i in ix[:sample]] for g, ix in groups.items()}
    return json.dumps({
        'instance': inst,
        'csp': {'variables': len(inst['vertices']), 'domain': k,
                'constraints': len(inst['edges']) if 'edges' in inst else
                (lambda c, o: sum(1 for v in o for w in c.neighbors[v] if w != v) // 2)(*csp_of(inst))},
        'cnf': {'variables': len(sy), 'clauses': len(cl), 'distinct': t['distinct'],
                'by_kind': {g: len(ix) for g, ix in groups.items()},
                'literals': sum(len(c) for c in cl)},
        # SATBlock: one binary x per variable, one binary r per clause (fixed
        # to 0, the clauses being hard), one row per clause, objective 0
        'milp': {'columns': len(sy) + len(cl), 'x': len(sy), 'r': len(cl), 'rows': len(cl),
                 'nonzeros': sum(len(c) + 1 for c in cl)},
        'sample': show, 'symbols': sy})


def header(name):
    inst = instance(name)
    t = translate(inst)
    return {'instance': inst,
            'encoding': {'form': 'cnf', 'translator': 'aima.logic.MapColoringSAT' if 'edges' in inst else
                         'translate_csp on aima.csp.' + ('NQueensCSP' if inst['kind'] == 'queens' else 'Sudoku'),
                         'variables': len(t['symbols']), 'clauses': len(t['clauses']),
                         'symbols': t['symbols']}}


if __name__ == '__main__':
    args = sys.argv[1:]
    name = args[0]
    if '--dimacs' in args:
        open(args[args.index('--dimacs') + 1], 'w').write(dimacs(translate(instance(name))))
    if '--header' in args:
        json.dump(header(name), open(args[args.index('--header') + 1], 'w'))
    if '--dimacs' not in args and '--header' not in args:
        print(summary(name))
