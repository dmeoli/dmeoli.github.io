"""The packing puzzles of the scene packing-mip, solved offline by a MIP.

Every placement p of a piece (a translation of one of its distinct
orientations inside the tray) is a binary variable y_p. The model maximizes the
covered area,

    max  sum_p |p| y_p
    s.t. sum_{p covers c} y_p <= 1   for every cell c of the tray,
         sum_{p of piece i} y_p <= 1  for every piece i,
         y_p in {0, 1},

so a solution covers the whole tray exactly when the optimum equals its area,
and every other solution leaves holes. It is solved by HiGHS through
scipy.optimize.milp; the result is written to data.js next to this file.

    python3 src/forms/packing-mip/solve.py
"""

import json
import os
import time

import numpy as np
from scipy.optimize import LinearConstraint, milp
from scipy.sparse import coo_matrix

PENTOMINOES = {
    'F': ['.##', '##.', '.#.'], 'I': ['#####'], 'L': ['####', '#...'],
    'N': ['##..', '.###'], 'P': ['##', '##', '#.'], 'T': ['###', '.#.', '.#.'],
    'U': ['#.#', '###'], 'V': ['#..', '#..', '###'], 'W': ['#..', '##.', '.##'],
    'X': ['.#.', '###', '.#.'], 'Y': ['####', '.#..'], 'Z': ['##.', '.#.', '.##'],
}

# the Soma cube of Piet Hein: seven pieces of 3 or 4 cubes, as (x, y, z)
SOMA = {
    'V': [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
    'L': [(0, 0, 0), (1, 0, 0), (2, 0, 0), (0, 1, 0)],
    'T': [(0, 0, 0), (1, 0, 0), (2, 0, 0), (1, 1, 0)],
    'Z': [(0, 0, 0), (1, 0, 0), (1, 1, 0), (2, 1, 0)],
    'A': [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)],
    'B': [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 0, 1)],
    'P': [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 1, 1)],
}


def cells2d(rows):
    return [(x, y, 0) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == '#']


def norm(cs):
    m = [min(c[a] for c in cs) for a in range(3)]
    return tuple(sorted(tuple(c[a] - m[a] for a in range(3)) for c in cs))


def rotations3():
    """The 24 rotations of the cube as 3x3 integer matrices."""
    mats = []
    for p in [(0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0)]:
        for s in [(a, b, c) for a in (1, -1) for b in (1, -1) for c in (1, -1)]:
            M = np.zeros((3, 3), int)
            for i in range(3):
                M[i, p[i]] = s[i]
            if round(np.linalg.det(M)) == 1:
                mats.append(M)
    return mats


def orientations(cs, planar):
    out = set()
    if planar:   # the 8 symmetries of the square (pieces may be turned over)
        for k in range(4):
            for f in (1, -1):
                q = []
                for (x, y, z) in cs:
                    x2, y2 = (f * x, y)
                    for _ in range(k):
                        x2, y2 = -y2, x2
                    q.append((x2, y2, 0))
                out.add(norm(q))
    else:
        for M in rotations3():
            out.add(norm([tuple(M @ np.array(c)) for c in cs]))
    return sorted(out)


def solve(name, pieces, tray, planar):
    """tray: the set of cells, pieces: (name, cells); planar pieces may be
    turned over, solid ones take the 24 rotations of the cube."""
    cells = sorted(tray)
    cid = {c: i for i, c in enumerate(cells)}
    place = []   # (piece index, cells)
    for i, (pn, cs) in enumerate(pieces):
        for o in orientations(cs, planar):
            for c0 in cells:
                q = [tuple(c0[a] + c[a] for a in range(3)) for c in o]
                if all(c in cid for c in q):
                    place.append((i, q))
    n, m, k = len(place), len(cells), len(pieces)
    rows, cols = [], []
    for j, (i, q) in enumerate(place):
        for c in q:
            rows.append(cid[c]); cols.append(j)
        rows.append(m + i); cols.append(j)
    A = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(m + k, n)).tocsr()
    w = np.array([len(q) for _, q in place], float)
    t0 = time.time()
    res = milp(-w, constraints=LinearConstraint(A, -np.inf, 1), integrality=np.ones(n),
               bounds=(0, 1), options={'disp': False})
    secs = time.time() - t0
    lp = milp(-w, constraints=LinearConstraint(A, -np.inf, 1), bounds=(0, 1))
    y = np.round(res.x).astype(int)
    sol = []
    for j in np.nonzero(y)[0]:
        i, q = place[j]
        sol.append({'piece': pieces[i][0], 'cells': [[int(v) for v in c] for c in q]})
    covered = int(round(-res.fun))
    print(f'{name}: {n} placements, {m + k} rows, optimum {covered} of {m} cells, '
          f'LP bound {-lp.fun:.2f}, {secs:.1f} s, nodes {getattr(res, "mip_node_count", "?")}')
    assert covered == m, 'the pieces do not tile the tray'
    return {
        'vars': n, 'rows': m + k, 'cells': m, 'optimum': covered,
        'lp': round(-lp.fun, 4), 'nodes': int(getattr(res, 'mip_node_count', 0) or 0),
        'gap': float(getattr(res, 'mip_gap', 0) or 0),
        'solution': sol,
    }


def rect(w, h):
    return {(x, y, 0) for x in range(w) for y in range(h)}


def main():
    pent = [(k, cells2d(v)) for k, v in PENTOMINOES.items()]
    soma = [(k, v) for k, v in SOMA.items()]
    scott = rect(8, 8) - {(x, y, 0) for x in (3, 4) for y in (3, 4)}
    out = {}
    out['pent6x10'] = {'w': 10, 'h': 6, 'd': 1, 'planar': True,
                       'tray': sorted(rect(10, 6)), **solve('6x10', pent, rect(10, 6), True)}
    out['pent3x20'] = {'w': 20, 'h': 3, 'd': 1, 'planar': True,
                       'tray': sorted(rect(20, 3)), **solve('3x20', pent, rect(20, 3), True)}
    out['scott'] = {'w': 8, 'h': 8, 'd': 1, 'planar': True,
                    'tray': sorted(scott), **solve('scott', pent, scott, True)}
    cube = {(x, y, z) for x in range(3) for y in range(3) for z in range(3)}
    out['soma'] = {'w': 3, 'h': 3, 'd': 3, 'planar': False,
                   'tray': sorted(cube), **solve('soma', soma, cube, False)}
    # the pieces as they are printed: lying so that every column of cubes
    # stands on the bed (true for every piece of both sets), lowest first
    def lying(cs, planar):
        best = None
        for o in orientations(cs, planar):
            cols = {}
            for (x, y, z) in o:
                cols.setdefault((x, y), set()).add(z)
            if all(zs == set(range(len(zs))) for zs in cols.values()):
                key = (max(c[2] for c in o), max(c[1] for c in o))
                if best is None or key < best[0]:
                    best = (key, o)
        return [[int(v) for v in c] for c in best[1]]
    out['shapes'] = {'pent': {k: lying(v, True) for k, v in pent},
                     'soma': {k: lying(v, False) for k, v in soma}}
    for k, v in out.items():
        if k == 'shapes':
            continue
        v['tray'] = [list(c) for c in v['tray']]
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'data.js'), 'w') as f:
        f.write('// written by solve.py: the trays, the MIP solutions and their statistics\n')
        f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main()
