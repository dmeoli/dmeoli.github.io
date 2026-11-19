// The states of the search games as the page can rebuild them from a trace:
// the key of the state of an event (expand or path), and the successors of a
// state with the cost of their move, so that the panel of a search lane
// (panels.js) can put a state expanded under the state it was reached from.
// Every domain here is reversible (a move undone by a move of the same
// cost), so the successors of a state are also its predecessors. Planning
// has no entry: its traces carry the fluents of a state but not the actions
// of the problem, so a state cannot be matched to its predecessor.

const SQ2 = Math.SQRT2;

// the 18 moves of the cube on its 54 facelets (U1..U9, R1..R9, F1..F9,
// D1..D9, L1..L9, B1..B9 of Kociemba), turning the stickers of a layer in
// space as tools/pbefs_to_games.py does: R on +x, B on +y, U on +z, a
// quarter turn clockwise seen from outside the face
let CUBE = null;
function cubeMoves() {
  if (CUBE) return CUBE;
  const place = k => {
    const f = 'URFDLB'[Math.floor(k / 9)], r = Math.floor(k % 9 / 3), c = k % 3;
    return { U: [[c - 1, 1 - r, 1], [0, 0, 1]], D: [[c - 1, r - 1, -1], [0, 0, -1]], F: [[c - 1, -1, 1 - r], [0, -1, 0]],
      B: [[1 - c, 1, 1 - r], [0, 1, 0]], R: [[1, c - 1, 1 - r], [1, 0, 0]], L: [[-1, 1 - c, 1 - r], [-1, 0, 0]] }[f];
  };
  const at = new Map();
  for (let k = 0; k < 54; k++) at.set(place(k).join(';'), k);
  const N = { U: [0, 0, 1], D: [0, 0, -1], F: [0, -1, 0], B: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0] };
  CUBE = [];
  for (const f of 'URFDLB') for (const [s, q] of [['', 3], ['2', 2], ["'", 1]]) {
    const n = N[f];
    const rot = v => {
      for (let i = 0; i < q; i++) {
        const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
        v = [n[1] * v[2] - n[2] * v[1] + d * n[0], n[2] * v[0] - n[0] * v[2] + d * n[1], n[0] * v[1] - n[1] * v[0] + d * n[2]];
      }
      return v;
    };
    const dest = new Int8Array(54);
    for (let k = 0; k < 54; k++) {
      const [p, nn] = place(k);
      dest[k] = p[0] * n[0] + p[1] * n[1] + p[2] * n[2] === 1 ? at.get([rot(p), rot(nn)].join(';')) : k;
    }
    CUBE.push({ move: f + s, dest });
  }
  return CUBE;
}

// the cell or city of a board of places that an event marks with a value
// starting with c ('e' expanded, 'p' on the path)
const placeOf = (e, c) => { for (const [a, v] of Object.entries(e.set || {})) if (v[0] === c) return a; return null; };
const swap = (x, i, j) => { const y = x.slice(); y[i] = x[j]; y[j] = x[i]; return y; };

// for a game and the header of a trace: key(e) of an expand event, pathKey(e)
// of a path event, state(e) and succ(state), the list of [key, cost]
export function domain(game, h) {
  const inst = h.instance, arr = e => (Array.isArray(e.x) || typeof e.x === 'string' ? e.x : null);
  const byX = { key: e => (arr(e) ? String(arr(e)) : null), pathKey: e => (arr(e) ? String(arr(e)) : null), state: arr };
  switch (game) {
    case 'puzzle': {
      const s = inst.side;
      return { ...byX, succ: x => {
        const b = x.indexOf(0), r = Math.floor(b / s), c = b % s, out = [];
        if (c > 0) out.push(swap(x, b, b - 1)); if (c < s - 1) out.push(swap(x, b, b + 1));
        if (r > 0) out.push(swap(x, b, b - s)); if (r < s - 1) out.push(swap(x, b, b + s));
        return out.map(y => [String(y), 1]);
      } };
    }
    case 'pancake':
      return { ...byX, succ: x => {
        const out = [];
        for (let k = 2; k <= x.length; k++) out.push([String(x.slice(0, k).reverse().concat(x.slice(k))), 1]);
        return out;
      } };
    case 'topspin': {
      const K = inst.turnstile || 4;
      return { ...byX, succ: x => {
        const n = x.length, out = [];
        for (let p = 0; p < n; p++) {
          const y = x.slice();
          for (let o = 0; o < K; o++) y[(p + o) % n] = x[(p + K - 1 - o) % n];
          out.push([String(y), 1]);
        }
        return out;
      } };
    }
    case 'hanoi': {
      const P = Math.max(4, ...(inst.goal || []).map(v => v + 1));
      return { ...byX, succ: x => {
        const top = new Array(P).fill(Infinity), out = [];
        x.forEach((p, d) => { if (d < top[p]) top[p] = d; });
        for (let a = 0; a < P; a++) {
          const d = top[a];
          if (d === Infinity) continue;
          for (let b = 0; b < P; b++) if (b !== a && top[b] > d) { const y = x.slice(); y[d] = b; out.push([String(y), 1]); }
        }
        return out;
      } };
    }
    case 'cube':
      return { key: e => (typeof e.x === 'string' ? e.x : null), pathKey: e => (typeof e.x === 'string' ? e.x : null),
        state: e => (typeof e.x === 'string' ? e.x : null), succ: fl => cubeMoves().map(({ dest }) => {
          const out = new Array(54);
          for (let k = 0; k < 54; k++) out[dest[k]] = fl[k];
          return [out.join(''), 1];
        }) };
    case 'grid': {
      const W = inst.width, H = inst.height;
      return { key: e => placeOf(e, 'e'), pathKey: e => placeOf(e, 'p'), state: e => placeOf(e, 'e'), succ: c => {
        const x = +c % W, y = Math.floor(+c / W), out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const X = x + dx, Y = y + dy;
          if (X >= 0 && Y >= 0 && X < W && Y < H && inst.rows[Y][X] !== '@') out.push([String(Y * W + X), dx && dy ? SQ2 : 1]);
        }
        return out;
      } };
    }
    case 'romania': {
      const adj = new Map();
      for (const [a, b, d] of inst.edges) {
        if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push([b, d]); adj.get(b).push([a, d]);
      }
      return { key: e => placeOf(e, 'e'), pathKey: e => placeOf(e, 'p'), state: e => placeOf(e, 'e'), succ: c => adj.get(c) || [] };
    }
    default: return null;
  }
}
