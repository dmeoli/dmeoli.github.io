// Bracketed, parametric and stochastic L-systems with a turtle in three
// dimensions, after Prusinkiewicz and Lindenmayer, The Algorithmic Beauty of
// Plants (Springer, 1990), chapters 1 and 2, whose notation the text of the
// rules follows:
//
//   #define r1 0.9            a constant (delta is the angle of the slider)
//   axiom: A(1,10)            the start word (omega)
//   A(l,w) -> !(w)F(l)[&B(l*r2,w*wr)]/(d)A(l*r1,w*wr)
//   A(t) : t > 0 -> A(t-1)    a condition on the parameters
//   F ->(.33) F[+F]F[-F]F     a stochastic production and its probability
//
// The turtle (ABOP section 1.5) carries a heading H, a left L and an up U
// vector, with H x L = U: F(l) draws a step of length l (1 without a
// parameter), f(l) moves without drawing, + and - turn about U, & and ^ pitch
// about L, \ and / roll about H, by the angle in brackets or by delta, |
// turns back, $ rolls L to the horizontal, [ and ] push and pop the state, {
// and } bound a polygon whose vertices are the positions after each f, F or
// .; ! and ' (width and colour) are read and skipped, since the radii follow
// the rule of Leonardo (see radii). After each F the heading bends towards
// the vertical by the tropism e (ABOP section 2.2, gravity for e > 0).

const ARROW = /->|→/;

// the text of the rules -> { axiom, rules: Map(symbol -> [rule]), defines }
export function parse(text, delta = 22.5) {
  const D = { delta }, rules = new Map();
  let axiom = null;
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  for (const s of lines) {
    let m;
    if ((m = s.match(/^#define\s+([A-Za-z_]\w*)\s+(.+)$/))) { D[m[1]] = evalConst(m[2], D, s); continue; }
    if ((m = s.match(/^(?:axiom|ω|omega)\s*:?\s*(.+)$/i))) { axiom = m[1]; continue; }
  }
  if (axiom === null) throw new Error('no axiom (a line "axiom: ...")');
  const names = Object.keys(D);
  for (const s of lines) {
    if (/^#define|^(axiom|ω|omega)\b/i.test(s)) continue;
    const parts = s.split(ARROW);
    if (parts.length !== 2) throw new Error('not a production: ' + s);
    let [left, right] = parts;
    let prob = null;
    right = right.trim();
    const pm = right.match(/^\(\s*([\d.]+)\s*\)\s*/);
    if (pm) { prob = +pm[1]; right = right.slice(pm[0].length); }
    let cond = null;
    const ci = left.indexOf(':');
    if (ci >= 0) { cond = left.slice(ci + 1).trim(); left = left.slice(0, ci); }
    left = left.trim();
    const lm = left.match(/^(\S)\s*(?:\(([^)]*)\))?$/);
    if (!lm) throw new Error('bad predecessor: ' + left);
    const sym = lm[1], params = lm[2] ? lm[2].split(',').map(x => x.trim()).filter(Boolean) : [];
    const env = [...names, ...params];
    const rule = {
      params, prob,
      cond: cond ? expr(cond, env, s) : null,
      succ: compileWord(right, env, s),
    };
    if (!rules.has(sym)) rules.set(sym, []);
    rules.get(sym).push(rule);
  }
  return { axiom: compileWord(axiom, names, 'axiom')(D, []), rules, D };
}

const MATH = 'const {sin,cos,tan,sqrt,abs,min,max,pow,exp,log,PI,floor,ceil,round,atan2,hypot} = Math;';
const KNOWN = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'min', 'max', 'pow', 'exp', 'log', 'PI', 'floor', 'ceil', 'round', 'atan2', 'hypot']);

// a word with expressions in its brackets -> f(D, values) -> modules
function compileWord(word, env, line) {
  const toks = tokens(word, line);
  const fns = toks.map(([s, args]) => [s, args ? args.map(a => expr(a, env, line)) : null]);
  return (D, vals) => {
    const out = new Array(fns.length);
    for (let i = 0; i < fns.length; i++) {
      const [s, as] = fns[i];
      out[i] = as ? [s, as.map(f => f(D, vals))] : [s, null];
    }
    return out;
  };
}

// an expression over the names env (the defines, then the parameters of the
// predecessor) -> f(D, vals), the defines read by name from D
function expr(src, env, line) {
  if (!/^[\w\s.+\-*/%()<>=!&|?:,]*$/.test(src)) throw new Error('bad expression in: ' + line);
  for (const id of src.match(/[A-Za-z_]\w*/g) || [])
    if (!KNOWN.has(id) && !env.includes(id) && !/^\d/.test(id)) throw new Error(`unknown name "${id}" in: ${line}`);
  let f;
  try {
    // eslint-disable-next-line no-new-func
    f = new Function(...env, `"use strict";${MATH}return (${src});`);
  } catch (e) { throw new Error(`bad expression "${src}" in: ${line}`); }
  return (D, vals) => {
    const args = new Array(env.length), nd = env.length - vals.length;
    for (let i = 0; i < nd; i++) args[i] = D[env[i]];
    for (let i = 0; i < vals.length; i++) args[nd + i] = vals[i];
    const v = f(...args);
    if (typeof v !== 'number' && typeof v !== 'boolean') throw new Error(`"${src}" is not a number`);
    return +v;
  };
}

function evalConst(src, D, line) { return expr(src, Object.keys(D), line)(D, []); }

// the modules of a word: a symbol and, if a bracket follows, its arguments
function tokens(w, line) {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (/\s/.test(c)) continue;
    if (c === '(' || c === ')' || c === ',') throw new Error('misplaced bracket in: ' + line);
    let args = null;
    if (w[i + 1] === '(') {
      let depth = 0, j = i + 1, cur = '';
      args = [];
      for (; j < w.length; j++) {
        const d = w[j];
        if (d === '(') { if (depth++ > 0) cur += d; continue; }
        if (d === ')') { if (--depth === 0) break; cur += d; continue; }
        if (d === ',' && depth === 1) { args.push(cur.trim()); cur = ''; continue; }
        cur += d;
      }
      if (depth !== 0) throw new Error('unclosed bracket in: ' + line);
      args.push(cur.trim());
      i = j;
    }
    out.push([c === '∧' ? '^' : c, args]);
  }
  return out;
}

// a seeded generator (mulberry32), for the stochastic productions
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n derivation steps; lengths[k] is the number of modules after k steps; the
// derivation stops early beyond max modules
export function derive(sys, n, seed = 1, max = 300000) {
  const rand = rng(seed * 7919 + 13);
  let w = sys.axiom;
  const lengths = [w.length];
  let truncated = false;
  for (let k = 0; k < n; k++) {
    const out = [];
    for (const mod of w) {
      const [s, a] = mod, rs = sys.rules.get(s);
      if (!rs) { out.push(mod); continue; }
      const vals = a || [];
      const ok = rs.filter(r => r.params.length === vals.length && (!r.cond || r.cond(sys.D, vals)));
      if (!ok.length) { out.push(mod); continue; }
      let r = ok[0];
      if (ok.length > 1 || ok[0].prob !== null) {
        const tot = ok.reduce((t, x) => t + (x.prob ?? 1), 0);
        let u = rand() * tot;
        for (const x of ok) { u -= x.prob ?? 1; if (u <= 0) { r = x; break; } }
      }
      const succ = r.succ(sys.D, vals);
      for (const m of succ) out.push(m);
      if (out.length > max) break;
    }
    if (out.length > max) { truncated = true; break; }
    w = out;
    lengths.push(w.length);
  }
  return { word: w, lengths, truncated };
}

/* ----------------------------------------------------------- the turtle -- */

const rot = (a, b, c, s) => [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// v turned by angle t about the unit axis k (Rodrigues)
const about = (v, k, t) => {
  const c = Math.cos(t), s = Math.sin(t), d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c), x = crs(k, v);
  return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d];
};

// the word drawn: segments { a, b, parent, order } (order = depth of
// brackets), polygons (arrays of points), all in model units; the turtle
// starts at the origin heading up (+z) with L = +y
export function turtle(word, { delta = 22.5, tropism = 0 } = {}) {
  const R = Math.PI / 180;
  let P = [0, 0, 0], H = [0, 0, 1], L = [0, 1, 0], U = crs(H, L), last = -1, order = 0;
  const stack = [], segs = [], polys = [], pstack = [];
  const T = [0, 0, -1];
  for (const [s, a] of word) {
    const ang = (a && a.length ? a[0] : delta) * R;
    switch (s) {
      case 'F': case 'f': case 'G': {
        const l = a && a.length ? a[0] : 1;
        const Q = [P[0] + H[0] * l, P[1] + H[1] * l, P[2] + H[2] * l];
        if (pstack.length) { if (s !== 'G') pstack[pstack.length - 1].push(Q); }
        else if (s !== 'f') { segs.push({ a: P, b: Q, parent: last, order }); last = segs.length - 1; }
        P = Q;
        if (s === 'F' && tropism && !pstack.length) {
          const x = crs(H, T), m = Math.hypot(x[0], x[1], x[2]);
          if (m > 1e-9) {
            const k = [x[0] / m, x[1] / m, x[2] / m], t = tropism * m;
            H = nrm(about(H, k, t)); L = nrm(about(L, k, t)); U = crs(H, L);
          }
        }
        break;
      }
      case '+': [H, L] = [rot(H, L, Math.cos(ang), -Math.sin(ang)), rot(L, H, Math.cos(ang), Math.sin(ang))]; break;
      case '-': [H, L] = [rot(H, L, Math.cos(ang), Math.sin(ang)), rot(L, H, Math.cos(ang), -Math.sin(ang))]; break;
      case '&': [H, U] = [rot(H, U, Math.cos(ang), Math.sin(ang)), rot(U, H, Math.cos(ang), -Math.sin(ang))]; break;
      case '^': [H, U] = [rot(H, U, Math.cos(ang), -Math.sin(ang)), rot(U, H, Math.cos(ang), Math.sin(ang))]; break;
      case '\\': [L, U] = [rot(L, U, Math.cos(ang), Math.sin(ang)), rot(U, L, Math.cos(ang), -Math.sin(ang))]; break;
      case '/': [L, U] = [rot(L, U, Math.cos(ang), -Math.sin(ang)), rot(U, L, Math.cos(ang), Math.sin(ang))]; break;
      case '|': H = H.map(x => -x); L = L.map(x => -x); break;
      case '$': {
        const v = crs([0, 0, 1], H), m = Math.hypot(v[0], v[1], v[2]);
        if (m > 1e-6) { L = [v[0] / m, v[1] / m, v[2] / m]; U = crs(H, L); }
        break;
      }
      case '[': stack.push([P, H, L, U, last, order]); order++; break;
      case ']': if (stack.length) [P, H, L, U, last, order] = stack.pop(); break;
      case '{': pstack.push([P]); break;
      case '.': if (pstack.length) pstack[pstack.length - 1].push(P); break;
      case '}': { const p = pstack.pop(); if (p && p.length >= 3) polys.push(p); break; }
      default: break;
    }
  }
  return { segs, polys };
}

// the radii by the rule of Leonardo, generalized: a branch of weight w (the
// number of tips it carries) has radius tip * w^(1/e); e = 2 keeps the sum of
// the cross sections through every fork, as Leonardo wrote of trees; r0 is the
// radius at the start of a segment, r1 at its end (that of its largest child)
export function radii(segs, tip, e) {
  const n = segs.length, w = new Float64Array(n), big = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (w[i] === 0) w[i] = 1;
    const p = segs[i].parent;
    if (p >= 0) { w[p] += w[i]; big[p] = Math.max(big[p], w[i]); }
  }
  for (let i = 0; i < n; i++) {
    segs[i].w = w[i];
    segs[i].r0 = tip * Math.pow(w[i], 1 / e);
    segs[i].r1 = big[i] ? tip * Math.pow(big[i], 1 / e) : tip;
    segs[i].tip = !big[i];
  }
  return segs;
}
