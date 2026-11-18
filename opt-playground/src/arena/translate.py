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
    """The CSP of aima.csp behind an instance of the queens, Sudoku, the zebra
    puzzle, Kakuro, cryptarithmetic or the crossword, and its variables in the
    order of the instance."""
    k = inst['kind']
    if k == 'queens':
        return C.NQueensCSP(inst['n']), list(range(inst['n']))
    if k == 'sudoku':
        p = C.Sudoku(getattr(C, inst['grid']))
        return p, [cell for row in C.Sudoku.rows for cell in row]
    if k == 'zebra':
        return C.Zebra(), list(inst['vertices'])
    return NARY[k](inst), list(inst['vertices'])


# the n-ary CSPs of aima.csp (NaryCSP): the puzzles of Kakuro, the
# cryptarithmetic problems and the crossword, by name
KAKURO = {'2': 'kakuro2', '3': 'kakuro3', '4': 'kakuro4'}
CRYPTO = {'send': ('send_more_money', ['SEND', 'MORE', 'MONEY']), 'two': ('two_two_four', ['TWO', 'TWO', 'FOUR'])}
NARY = {'kakuro': lambda inst: C.Kakuro(getattr(C, KAKURO[inst['id'].split('-')[1]])),
        'crypto': lambda inst: getattr(C, CRYPTO[inst['id'].split('-')[1]][0]),
        'crossword': lambda inst: C.Crossword(C.crossword1, C.words1)}
# the value j of the list of an instance as the value of its CSP
VALUE = {'queens': lambda inst, j: j, 'kakuro': lambda inst, j: j + 1, 'crypto': lambda inst, j: j,
         'zebra': lambda inst, j: j + 1}


def value_of(inst, j):
    f = VALUE.get(inst['kind'])
    return f(inst, j) if f else inst['colours'][j]


def nary_instance(name):
    """The instances kakuro-<2|3|4>, crypto-<send|two>, crossword-1 and zebra:
    the variables and values, and the layout of the board, a list of cells
    [row, column, what] where what is the index of a variable, or a clue
    [down, right] of Kakuro, or a text (a sign of the sum)."""
    kind, rest = name.split('-', 1) if '-' in name else (name, '')
    if kind == 'zebra':
        z = C.Zebra()
        groups = [z.variables[i:i + 5] for i in range(0, 25, 5)]
        return {'id': name, 'kind': 'zebra', 'vertices': list(z.variables), 'colours': list('12345'),
                'groups': groups}
    if kind == 'kakuro':
        grid = getattr(C, KAKURO[rest])
        vs, cells = [], []
        for i, line in enumerate(grid):
            for j, e in enumerate(line):
                if e == '_':
                    cells.append([i, j, len(vs)])
                    vs.append('X%02d%02d' % (i, j))
                elif e != '*':
                    cells.append([i, j, [e[0] if e[0] != '' else None, e[1] if e[1] != '' else None]])
        return {'id': name, 'kind': 'kakuro', 'vertices': vs, 'colours': list('123456789'),
                'rows': len(grid), 'cols': len(grid[0]), 'cells': cells}
    if kind == 'crypto':
        csp_name, words = CRYPTO[rest]
        csp = getattr(C, csp_name)
        letters = []
        for w in words:
            for ch in w:
                if ch not in letters:
                    letters.append(ch)
        carries = sorted((v for v in csp.variables if v.startswith('C')), key=lambda v: int(v[1:]))
        vs = letters + carries
        width = max(len(w) for w in words)
        cells = []
        # the carries above the columns they go into, the addends, the rule
        # and the sum, aligned on the right
        for c in carries:
            cells.append([0, width - 1 - int(c[1:]), vs.index(c)])
        for r, w in enumerate(words):
            row = r + 1 if r < len(words) - 1 else r + 2
            cells += [[row, width - len(w) + i, vs.index(ch)] for i, ch in enumerate(w)]
        cells.append([len(words) - 1, -1, '+'])
        cells.append([len(words), -1, '='])
        return {'id': name, 'kind': 'crypto', 'vertices': vs, 'colours': list('0123456789'),
                'rows': len(words) + 2, 'cols': width, 'cells': cells, 'words': words}
    puzzle = C.crossword1
    vs, cells = [], []
    for i, line in enumerate(puzzle):
        for j, e in enumerate(line):
            if e == '_':
                cells.append([i, j, len(vs)])
                vs.append(C.Crossword.cell(i, j))
    return {'id': name, 'kind': 'crossword', 'vertices': vs, 'colours': list('abcdefghijklmnopqrstuvwxyz'),
            'rows': len(puzzle), 'cols': len(puzzle[0]), 'cells': cells}


def instance(name):
    """The instance named australia, usa, france, planar-<level>-<seed>,
    queens-<n>, sudoku-<easy1|harder1>, zebra, kakuro-<2|3|4>, crypto-<send|two>
    or crossword-1."""
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
    if name.split('-')[0] in ('kakuro', 'crypto', 'crossword', 'zebra'):
        return nary_instance(name)
    if name in MAPS:
        csp, colours = MAPS[name]
        vs = list(csp.variables)
        edges = sorted({tuple(sorted((a, b))) for a in vs for b in csp.neighbors[a]})
        return {'id': name, 'kind': 'map', 'colours': list(colours), 'vertices': vs,
                'edges': [list(e) for e in edges]}
    _, level, seed = name.split('-')
    return planar(level, int(seed))


def translate_csp(inst):
    """The direct encoding of a CSP of aima.csp: a Boolean v_c for each
    variable v and value c, at least one and at most one value per variable,
    a unit clause for each value outside the domain of a variable, and for
    each pair of neighbours and each pair of values that the constraint of
    the CSP rejects the clause that forbids both; the constraint is asked of
    aima, never written here. The constraints of more than two variables of
    a NaryCSP are written by translate_nary."""
    csp, order = csp_of(inst)
    names, vals, k = inst['vertices'], inst['colours'], len(inst['colours'])
    value = lambda j: value_of(inst, j)
    pos = {v: i for i, v in enumerate(order)}
    lit = lambda i, j: i * k + j + 1
    symbols = ['%s_%s' % (names[i], vals[j]) for i in range(len(order)) for j in range(k)]
    clauses = []
    for i, v in enumerate(order):
        dom = set(csp.domains[v])
        clauses.append([lit(i, j) for j in range(k)])
        clauses += [[-lit(i, a), -lit(i, b)] for a in range(k) for b in range(a + 1, k)]
        clauses += [[-lit(i, j)] for j in range(k) if value(j) not in dom]
    if isinstance(csp, C.NaryCSP):
        clauses += translate_nary(csp, inst, pos, lit, value)
    else:
        for v in order:
            for w in csp.neighbors[v]:
                i, h = pos[v], pos[w]
                if i < h:
                    clauses += [[-lit(i, a), -lit(h, b)] for a in range(k) for b in range(k)
                                if not csp.constraints(v, value(a), w, value(b))]
    clauses = [sorted(c, key=lambda x: (abs(x), x)) for c in clauses]
    return {'symbols': symbols, 'clauses': clauses, 'distinct': len({tuple(c) for c in clauses})}


def translate_nary(csp, inst, pos, lit, value):
    """The clauses of the constraints of a NaryCSP. An all_diff_constraint
    becomes, for each pair of its scope, the clauses of the values that it
    rejects for the pair (asked of the constraint on two values, which is
    the same constraint); any other constraint is written by the prefixes of
    its scope: for each prefix of a tuple that the constraint accepts and
    each value of the next variable that no accepted tuple has after that
    prefix, the clause that forbids the prefix with that value. A complete
    assignment then breaks a clause exactly when the constraint rejects its
    tuple. The values that an all_diff_constraint already rejects (two
    variables of its scope equal) are not enumerated nor written again."""
    k = len(inst['colours'])
    dom = {v: [j for j in range(k) if value(j) in set(csp.domains[v])] for v in csp.variables}
    diff = [set(c.scope) for c in csp.constraints if c.condition is C.all_diff_constraint]
    out = []
    for con in csp.constraints:
        sc = list(con.scope)
        if con.condition is C.all_diff_constraint:
            for a in range(len(sc)):
                for b in range(a + 1, len(sc)):
                    u, v = sc[a], sc[b]
                    out += [[-lit(pos[u], x), -lit(pos[v], y)] for x in dom[u] for y in dom[v]
                            if not con.condition(value(x), value(y))]
            continue
        # the pairs of the scope that an all_diff_constraint keeps distinct
        apart = {(a, b) for a in range(len(sc)) for b in range(a) if any(sc[a] in d and sc[b] in d for d in diff)}
        clash = lambda t, j, a: any((a, b) in apart and t[b] == j for b in range(a))
        # the tuples are enumerated over the product of the domains of the
        # scope, unless the condition was built from a list of words
        # (is_word_constraint of the crossword), whose tuples are its words
        words = next((c.cell_contents for c in getattr(con.condition, '__closure__', None) or ()
                      if isinstance(c.cell_contents, (set, list, tuple))), None)
        accepted = set()
        if words is None:
            def walk(t):
                a = len(t)
                if a == len(sc):
                    if con.condition(*(value(j) for j in t)):
                        accepted.add(tuple(t))
                    return
                for j in dom[sc[a]]:
                    if not clash(t, j, a):
                        walk(t + [j])
            walk([])
        else:
            index = {value(j): j for j in range(k)}
            for w in words:
                if len(w) == len(sc) and all(ch in index for ch in w):
                    t = tuple(index[ch] for ch in w)
                    if all(t[a] in dom[sc[a]] for a in range(len(sc))) and con.condition(*(value(j) for j in t)):
                        accepted.add(t)
        live = {t[:a] for t in accepted for a in range(len(sc) + 1)}
        for p in sorted(x for x in live if len(x) < len(sc)):
            a = len(p)
            for j in dom[sc[a]]:
                if p + (j,) not in live and not clash(list(p), j, a):
                    out.append([-lit(pos[sc[b]], p[b]) for b in range(a)] + [-lit(pos[sc[a]], j)])
    return out


CSPKINDS = ('queens', 'sudoku', 'zebra', 'kakuro', 'crypto', 'crossword')


def translate(inst):
    """The CNF of MapColoringSAT, or of translate_csp for the queens and
    Sudoku, and the rows SATBlock makes of it."""
    if inst['kind'] in CSPKINDS:
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
    two neighbours of a CSP), a value outside a domain, or a prefix of the
    tuples that a constraint of more than two variables rejects."""
    if all(x > 0 for x in c):
        return 'alo'
    if len(c) == 1:
        return 'given'
    if len(c) > 2:
        return 'nary'
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
    groups = {'alo': [], 'amo': [], 'edge': [], 'nary': [], 'given': []}
    for i, c in enumerate(cl):
        groups[kind(c, k)].append(i)
    show = {g: [{'i': i, 'lits': cl[i],
                 'text': ' | '.join(('' if x > 0 else '~') + sy[abs(x) - 1] for x in cl[i]),
                 'row': row(cl[i], sy, i)} for i in ix[:sample]] for g, ix in groups.items()}
    return json.dumps({
        'instance': inst,
        'csp': {'variables': len(inst['vertices']), 'domain': k,
                'constraints': len(inst['edges']) if 'edges' in inst else n_constraints(inst)},
        'cnf': {'variables': len(sy), 'clauses': len(cl), 'distinct': t['distinct'],
                'by_kind': {g: len(ix) for g, ix in groups.items()},
                'literals': sum(len(c) for c in cl)},
        # SATBlock: one binary x per variable, one binary r per clause (fixed
        # to 0, the clauses being hard), one row per clause, objective 0
        'milp': {'columns': len(sy) + len(cl), 'x': len(sy), 'r': len(cl), 'rows': len(cl),
                 'nonzeros': sum(len(c) + 1 for c in cl)},
        'sample': show, 'symbols': sy})


def n_constraints(inst):
    csp, order = csp_of(inst)
    if isinstance(csp, C.NaryCSP):
        return len(csp.constraints)
    return sum(1 for v in order for w in csp.neighbors[v] if w != v) // 2


# the class of aima.csp behind each kind of CSP, as the header names it
SOURCE = {'queens': 'NQueensCSP', 'sudoku': 'Sudoku', 'zebra': 'Zebra', 'kakuro': 'Kakuro',
          'crypto': 'NaryCSP', 'crossword': 'Crossword'}


def header(name):
    inst = instance(name)
    t = translate(inst)
    return {'instance': inst,
            'encoding': {'form': 'cnf', 'translator': 'aima.logic.MapColoringSAT' if 'edges' in inst else
                         'translate_csp on aima.csp.' + SOURCE[inst['kind']],
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
