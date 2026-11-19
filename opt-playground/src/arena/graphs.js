// The second view of the structure panel of a lane (panels.js), chosen by a
// toggle over the tree: the constraint graph of a CSP lane (and of DPLL,
// whose literals are values of the same variables), and the implication
// graph of a CDCL or CaDiCaL lane at its conflicts. Both are drawn from the
// trace alone, and each caption says what the trace does not carry and which
// field would let the page draw it.
//
// The constraint graph has a node per variable, placed as on the board when
// the game has a natural layout (the centroids of the regions of a map, the
// points of a planar graph, the cells of a grid) and on a circle or by a
// force layout computed once otherwise, an edge per binary constraint and a
// small square (a hub) per constraint on more than two variables, joined to
// its scope. The constraints are those of the CSP of aima-python: the edges
// of the map, every pair of columns of the queens, the pairs of a row,
// column or box of a Sudoku, the groups and clues of Zebra(), the runs of
// Kakuro and of the crossword, the columns of a cryptarithm.

import { t } from '../i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PREF = 'arena-structure-view';
const pref = () => { try { return localStorage.getItem(PREF) || 'tree'; } catch (e) { return 'tree'; } };
const setPref = v => { try { localStorage.setItem(PREF, v); } catch (e) { /* no storage: the choice lasts the page */ } };

// the maps of the colouring (assets/arena/maps.json): the label point of each region
let MAPS = null;
const mapsReady = () => MAPS || (MAPS = fetch('assets/arena/maps.json').then(r => r.json()).then(m => m.maps).catch(() => ({})));

// ---------------------------------------------------------------- the constraints
// the clues of Zebra() of aima.csp, with the relation each one states
const ZEBRA = [['Englishman', 'Red', 'same'], ['Spaniard', 'Dog', 'same'], ['Kools', 'Yellow', 'same'], ['Chesterfields', 'Fox', 'next'],
  ['Norwegian', 'Blue', 'next'], ['Winston', 'Snails', 'same'], ['LuckyStrike', 'OJ', 'same'], ['Ukrainian', 'Tea', 'same'],
  ['Japanese', 'Parliaments', 'same'], ['Kools', 'Horse', 'next'], ['Coffee', 'Green', 'same'], ['Green', 'Ivory', 'right']];
const REL = { same: ['same house', 'stessa casa'], next: ['next to each other', 'case vicine'], right: ['Green just right of Ivory', 'Green subito a destra di Ivory'] };

// the cells of a grid instance: (row, col) -> index of the variable, or the clue
function cellMap(inst) {
  const at = new Map();
  for (const [r, c, w] of inst.cells || []) at.set(r + ',' + c, w);
  return at;
}
// the runs of white cells that start right after (r, c), down or across
function run(at, r, c, dr, dc) {
  const out = [];
  for (let i = r + dr, j = c + dc; typeof at.get(i + ',' + j) === 'number'; i += dr, j += dc) out.push(at.get(i + ',' + j));
  return out;
}

// { pts: [[x, y]] per variable, hubs: [{ x, y, label, title, scope }],
// edges: [{ a, b, title, rel }], names: whether to write the names, grid }
function structure(inst, maps) {
  const V = inst.vertices, n = V.length, ix = new Map(V.map((v, i) => [v, i]));
  const pts = new Array(n), hubs = [], edges = [];
  const pair = (a, b, title, rel) => edges.push({ a, b, title, rel });
  const circle = () => V.forEach((_, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n; pts[i] = [Math.cos(a), Math.sin(a)]; });
  let names = false, grid = false;
  switch (inst.kind) {
    case 'map': case 'planar': {
      const m = maps && maps[inst.id];
      if (inst.xy) V.forEach((_, i) => { pts[i] = [inst.xy[i][0], -inst.xy[i][1]]; });
      else if (m) V.forEach((v, i) => { const r = m.regions[v]; pts[i] = r ? [r.label[0], -r.label[1]] : [0, 0]; });
      else circle();
      for (const [a, b] of inst.edges) pair(ix.get(a), ix.get(b), `${a} ≠ ${b}`);
      names = true;
      break;
    }
    case 'queens':
      circle();
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pair(i, j, t(`${V[i]}, ${V[j]}: no shared row or diagonal`, `${V[i]}, ${V[j]}: nessuna riga o diagonale in comune`));
      names = true;
      break;
    case 'sudoku':
      grid = true;
      V.forEach((_, i) => { pts[i] = [i % 9, Math.floor(i / 9)]; });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const ri = Math.floor(i / 9), ci = i % 9, rj = Math.floor(j / 9), cj = j % 9;
        if (ri === rj || ci === cj || (Math.floor(ri / 3) === Math.floor(rj / 3) && Math.floor(ci / 3) === Math.floor(cj / 3))) pair(i, j, `${V[i]} ≠ ${V[j]}`);
      }
      break;
    case 'zebra': {
      const G = inst.groups || [];
      G.forEach((g, r) => g.forEach((v, c) => { pts[ix.get(v)] = [c, r * 1.25]; }));
      for (const g of G) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) pair(ix.get(g[a]), ix.get(g[b]), `${g[a]} ≠ ${g[b]}`, 'diff');
      for (const [a, b, r] of ZEBRA) if (ix.has(a) && ix.has(b)) pair(ix.get(a), ix.get(b), `${a}, ${b}: ${t(...REL[r])}`, 'clue');
      names = true;
      break;
    }
    case 'kakuro': case 'crossword': {
      grid = true;
      const at = cellMap(inst);
      for (const [r, c, w] of inst.cells) if (typeof w === 'number') pts[w] = [c, r];
      if (inst.kind === 'kakuro') {
        for (const [r, c, w] of inst.cells) {
          if (!Array.isArray(w)) continue;
          if (w[0] !== null) { const s = run(at, r, c, 1, 0); if (s.length) hubs.push({ x: c - 0.18, y: r + 0.18, label: String(w[0]), scope: s, title: t(`the run down: sum ${w[0]}, all different`, `la sequenza in verticale: somma ${w[0]}, tutte diverse`) }); }
          if (w[1] !== null) { const s = run(at, r, c, 0, 1); if (s.length) hubs.push({ x: c + 0.18, y: r - 0.18, label: String(w[1]), scope: s, title: t(`the run across: sum ${w[1]}, all different`, `la sequenza in orizzontale: somma ${w[1]}, tutte diverse`) }); }
        }
      } else {
        // a run of two or more cells, across or down, spells a word
        for (const [r, c, w] of inst.cells) {
          if (typeof w !== 'number') continue;
          if (typeof at.get(r + ',' + (c - 1)) !== 'number') { const s = [w].concat(run(at, r, c, 0, 1)); if (s.length > 1) hubs.push({ x: c - 0.62, y: r, label: '→', scope: s, title: t(`a word of ${s.length} letters, across`, `una parola di ${s.length} lettere, in orizzontale`) }); }
          if (typeof at.get((r - 1) + ',' + c) !== 'number') { const s = [w].concat(run(at, r, c, 1, 0)); if (s.length > 1) hubs.push({ x: c, y: r - 0.62, label: '↓', scope: s, title: t(`a word of ${s.length} letters, down`, `una parola di ${s.length} lettere, in verticale`) }); }
        }
      }
      break;
    }
    case 'crypto': {
      // the columns of the sum, from the right: the letters of the addends
      // and of the result in that column, the carry in and the carry out;
      // the last column of the result equals the last carry
      const W = inst.words || [], R = W[W.length - 1] || '', add = W.slice(0, -1);
      const letters = V.filter(v => !/^C\d+$/.test(v));
      hubs.push({ label: '≠', scope: letters.map(v => ix.get(v)), title: t('all the letters different', 'tutte le lettere diverse') });
      for (let c = 0; c < R.length; c++) {
        const s = [];
        const put = v => { if (ix.has(v) && !s.includes(ix.get(v))) s.push(ix.get(v)); };
        for (const w of add) if (c < w.length) put(w[w.length - 1 - c]);
        put(R[R.length - 1 - c]);
        if (c > 0) put('C' + c);
        put('C' + (c + 1));
        if (s.length === 2) pair(s[0], s[1], t(`${V[s[0]]} = ${V[s[1]]}`, `${V[s[0]]} = ${V[s[1]]}`));
        else if (s.length > 2) hubs.push({ label: '+', scope: s, title: t(`column ${c + 1} of the sum, from the right`, `colonna ${c + 1} della somma, da destra`) });
      }
      force(pts, hubs, edges, n);
      names = true;
      break;
    }
    default: circle();
  }
  return { pts, hubs, edges, names, grid };
}
// a force layout of the variables and hubs, from a circle, computed once
function force(pts, hubs, edges, n) {
  const N = n + hubs.length, P = [];
  for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / N; P.push([Math.cos(a), Math.sin(a)]); }
  const links = edges.map(e => [e.a, e.b]);
  hubs.forEach((h, j) => { for (const v of h.scope) links.push([n + j, v]); });
  const L = 0.55;
  for (let it = 0, T = 0.1; it < 400; it++, T *= 0.992) {
    const D = P.map(() => [0, 0]);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d2 = dx * dx + dy * dy + 1e-4, f = L * L / d2;
      D[i][0] += dx * f; D[i][1] += dy * f; D[j][0] -= dx * f; D[j][1] -= dy * f;
    }
    for (const [i, j] of links) {
      const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.hypot(dx, dy) + 1e-6, f = d / L;
      D[i][0] -= dx * f; D[i][1] -= dy * f; D[j][0] += dx * f; D[j][1] += dy * f;
    }
    for (let i = 0; i < N; i++) {
      const m = Math.hypot(D[i][0], D[i][1]) + 1e-9, s = Math.min(m, T) / m;
      P[i][0] += D[i][0] * s; P[i][1] += D[i][1] * s;
    }
  }
  for (let i = 0; i < n; i++) pts[i] = P[i];
  hubs.forEach((h, j) => { h.x = P[n + j][0]; h.y = P[n + j][1]; });
}

// the values left in the domain of each variable after the events seen by
// rep: the count and, when one is left, its index
function domains(rep, nv, k) {
  const out = [];
  for (let v = 0; v < nv; v++) {
    let c = 0, one = -1, set = -1;
    for (let j = 0; j < k; j++) { const x = rep.val[v * k + j + 1]; if (x >= 0) { c++; one = j; } if (x > 0) set = j; }
    out.push(set >= 0 ? { c: 1, v: set } : { c, v: c === 1 ? one : -1 });
  }
  return out;
}

// ---------------------------------------------------------------- constraint graph
function constraintGraph(panel, tr, rep) {
  const h = tr.header, inst = h.instance, V = inst.vertices, nv = V.length, k = inst.colours.length;
  // an own run of backtracking writes its choices as its config: its id names the inference
  const cfg = /\s/.test(String(h.solver.config || '')) ? String(h.solver.id || '').replace(/^aima-/, '') : String(h.solver.config || ''), ev = tr.events;
  const fig = document.createElement('figure');
  fig.className = 'spanel cgraph';
  fig.innerHTML = '<figcaption class="scap"></figcaption><div class="sbox"></div><p class="sstat"></p><details class="smore"><summary></summary><p></p></details>';
  let S = null, built = 0, maps = null;
  const hasArc = ev.some(e => e.arc || e.arcs);
  // a variable of an arc, by name or by index
  const vix = x => (typeof x === 'number' ? (x >= 0 && x < nv ? x : -1) : V.indexOf(String(x)));
  // the arc revised by this event, when the trace names it: [X, Y] for a
  // binary constraint, [X, scope] (or { var, scope }) for a constraint on
  // more than two variables
  const arcOne = a => {
    if (!a) return null;
    const X = vix(Array.isArray(a) ? a[0] : a.var ?? a.x), Y = Array.isArray(a) ? a[1] : a.scope ?? a.with ?? a.y;
    if (X < 0) return null;
    return Array.isArray(Y) ? { X, scope: new Set(Y.map(vix)) } : { X, Y: vix(Y) };
  };
  // the arcs of an event: "arcs", parallel to its literals (MAC and forward
  // checking revise several arcs in one event), or the one "arc"
  const arcsOf = e => {
    if (!e) return [];
    const src = Array.isArray(e.arcs) ? e.arcs : e.arc ? [e.arc] : [], seen = new Set(), out = [];
    for (const a of src) { const k = JSON.stringify(a); if (seen.has(k)) continue; seen.add(k); const o = arcOne(a); if (o) out.push(o); }
    return out;
  };
  const need = inst.kind === 'map' && !inst.xy;
  const q = { fig, k: -1 };
  if (need) mapsReady().then(m => { maps = m; built = 0; if (q.k >= 0 && !fig.hidden) q.draw(q.k); });
  const varOf = l => { const a = Math.abs(l); return a >= 1 && a <= nv * k ? Math.floor((a - 1) / k) : -1; };
  const build = () => {
    const box = fig.querySelector('.sbox'), W = Math.max(150, box.clientWidth || 300);
    const M = structure(inst, maps);
    const all = M.pts.concat(M.hubs.map(x => [x.x, x.y]));
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = M.names ? 18 : 12, bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
    const sc = Math.min((W - 2 * pad) / bw, (300 - 2 * pad) / bh);
    const H = Math.round(bh * sc + 2 * pad + (M.names ? 8 : 0));
    const ox = (W - bw * sc) / 2;
    const X = p => [ox + (p[0] - x0) * sc, pad + (p[1] - y0) * sc];
    const P = M.pts.map(X);
    // the radius of a node from the spacing of its neighbors on the page
    const nn = P.map((p, i) => Math.min(...P.map((q2, j) => (i === j ? 1e9 : Math.hypot(p[0] - q2[0], p[1] - q2[1])))));
    const srt = nn.slice().sort((a, b) => a - b), d = srt[Math.floor(srt.length * 0.25)] || 30;
    const r = clamp(d * (M.grid ? 0.36 : 0.32), 3.5, 12);
    const svg = el('svg', { class: 'cg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const ge = el('g'), gh = el('g'), gn = el('g');
    svg.append(ge, gh, gn);
    // an edge between two cells of a grid on the same line bows, so that it
    // does not run over the cells between them
    const curve = (a, b, bow) => {
      const [ax, ay] = a, [bx, by] = b, mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
      if (!bow || len < 1) return `M${ax},${ay}L${bx},${by}`;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, off = Math.min(len * 0.22, 26);
      return `M${ax},${ay}Q${mx + nx * off},${my + ny * off} ${bx},${by}`;
    };
    const line = (a, b) => (M.grid || inst.kind === 'zebra') && (Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5) && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1.5 * sc;
    const E = M.edges.map(e => {
      const p = el('path', { class: 'ce' + (e.rel === 'clue' ? ' clue' : ''), d: curve(P[e.a], P[e.b], line(P[e.a], P[e.b])) });
      const ti = el('title'); ti.textContent = e.title; p.append(ti); ge.append(p);
      return { ...e, el: p };
    });
    const HB = M.hubs.map(hb => {
      const c = X([hb.x, hb.y]), g = el('g', { class: 'ch' }), s = Math.max(4, r * 0.75);
      const legs = hb.scope.map(v => { const p = el('path', { class: 'ce hub', d: `M${c[0]},${c[1]}L${P[v][0]},${P[v][1]}` }); ge.append(p); return { v, el: p }; });
      g.append(el('rect', { x: c[0] - s, y: c[1] - s, width: 2 * s, height: 2 * s, rx: 2 }));
      const tx = el('text', { x: c[0], y: c[1] + 0.5, 'font-size': clamp(s * 1.25, 7, 10) }); tx.textContent = hb.label; g.append(tx);
      const ti = el('title'); ti.textContent = hb.title; g.append(ti);
      gh.append(g);
      return { ...hb, el: g, legs };
    });
    const N = P.map((p, i) => {
      const g = el('g', { class: 'cn', transform: `translate(${p[0]},${p[1]})` });
      g.append(el('circle', { r }));
      const tx = el('text', { class: 'cv', y: 0.5, 'font-size': clamp(r * 0.95, 6, 10.5) }); g.append(tx);
      if (M.names && r >= 6) { const nm = el('text', { class: 'cname', y: r + 7.5 }); nm.textContent = V[i].length > 7 ? V[i].slice(0, 6) + '.' : V[i]; g.append(nm); }
      const ti = el('title'); g.append(ti);
      gn.append(g);
      return { el: g, tx, ti };
    });
    box.replaceChildren(svg);
    S = { E, HB, N, r, W, M };
    built = W;
  };
  q.draw = kk => {
    q.k = kk;
    const box = fig.querySelector('.sbox');
    if (!S || built !== Math.max(150, box.clientWidth || 300)) build();
    const e = kk > 0 ? ev[kk - 1] : null, D = domains(rep, nv, k);
    const dec = new Set(), shr = new Set(), bad = new Set();
    if (e && e.type === 'decide') dec.add(varOf(e.lit));
    if (e && (e.type === 'propagate' || e.type === 'split') && e.reason !== 'random start') {
      const ch = new Set((e.lits || []).map(varOf).filter(v => v >= 0));
      if (e.type === 'split') {
        // the variable split is the one whose values the split removes
        for (const l of e.lits || []) if (l < 0) { dec.add(varOf(l)); break; }
        for (const v of ch) if (!dec.has(v)) shr.add(v);
      } else for (const v of ch) shr.add(v);
    }
    if (e && e.type === 'conflict' && e.vars) for (const nm of e.vars) { const i = V.indexOf(nm); if (i >= 0) bad.add(i); }
    D.forEach((d, i) => { if (d.c === 0) bad.add(i); });
    // the decision this propagation follows, at the same level
    const last = rep.decs && rep.decs.length ? rep.decs[rep.decs.length - 1] : null;
    const src = e && e.type === 'propagate' && last && last.level === e.level ? varOf(last.lit) : -1;
    const act = new Set([...shr, ...dec]); if (src >= 0) act.add(src);
    // a revision of AC-3 or GAC: one variable shrinks, by one of its
    // constraints, which the trace does not name
    const arcs = arcsOf(e), arc = arcs.length ? arcs : null;
    const lone = !arc && e && e.type === 'propagate' && !dec.size && src < 0 && shr.size === 1 && /^(ac3|gac|bt-mac)$/.test(cfg) ? [...shr][0] : -1;
    const isArc = (a, b) => arcs.some(q => !q.scope && ((q.X === a && q.Y === b) || (q.X === b && q.Y === a)));
    const arcHub = hb => arcs.some(q => q.scope && hb.scope.includes(q.X) && hb.scope.length === q.scope.size && hb.scope.every(v => q.scope.has(v)));
    for (const ed of S.E) {
      const a = ed.a, b = ed.b;
      const cls = isArc(a, b) ? 'gold' : dec.has(a) || dec.has(b) ? (act.has(a) && act.has(b) && !(dec.has(a) && dec.has(b)) ? 'ink' : 'gold')
        : act.has(a) && act.has(b) && (shr.has(a) || shr.has(b)) ? 'ink' : lone === a || lone === b ? 'cand' : '';
      ed.el.setAttribute('class', 'ce' + (ed.rel === 'clue' ? ' clue' : '') + (cls ? ' ' + cls : ''));
    }
    for (const hb of S.HB) {
      const inA = hb.scope.filter(v => act.has(v)), hasDec = hb.scope.some(v => dec.has(v));
      const on = hasDec || arcHub(hb) ? 'gold' : inA.length >= 2 && hb.scope.some(v => shr.has(v)) ? 'ink' : lone >= 0 && hb.scope.includes(lone) ? 'cand' : '';
      hb.el.setAttribute('class', 'ch' + (on ? ' ' + on : ''));
      for (const lg of hb.legs) lg.el.setAttribute('class', 'ce hub' + (on && (act.has(lg.v) || on === 'cand') ? ' ' + on : ''));
    }
    let fixed = 0, left = 0;
    S.N.forEach((nd, i) => {
      const d = D[i];
      left += d.c; if (d.c === 1) fixed++;
      nd.el.setAttribute('class', 'cn' + (bad.has(i) ? ' wipe' : dec.has(i) ? ' dec' : shr.has(i) ? ' shr' : '') + (d.c === 1 ? ' one' : ''));
      nd.tx.textContent = S.r < 5.5 && !dec.has(i) && !shr.has(i) && !bad.has(i) ? '' : d.c === 1 ? inst.colours[d.v] : String(d.c);
      const vals = []; for (let j = 0; j < k; j++) if (rep.val[i * k + j + 1] >= 0) vals.push(inst.colours[j]);
      nd.ti.textContent = `${V[i]}: ${d.c === 1 ? inst.colours[d.v] : vals.length ? '{' + vals.join(' ') + '}' : t('no value left', 'nessun valore rimasto')}`;
    });
    fig.querySelector('.sstat').textContent = [t(`values left ${left} of ${nv * k}`, `valori rimasti ${left} su ${nv * k}`),
      t(`variables with one value ${fixed} of ${nv}`, `variabili con un solo valore ${fixed} su ${nv}`),
      bad.size ? t(`empty domains ${bad.size}`, `domini vuoti ${bad.size}`) : ''].filter(Boolean).join(' · ');
    const hubs = S.HB.length > 0;
    fig.querySelector('.scap').textContent = t(`A node is a variable, with the values left in its domain (its value on lilac once one is left); ${hubs ? 'a line or a small square' : 'a line'} is a constraint. Gold the variable decided${hasArc ? ' or the arc revised' : ''}, ink the domains this event shrinks, red one left empty.`,
      `Un nodo è una variabile, con i valori rimasti nel suo dominio (il suo valore su fondo lilla quando ne resta uno); ${hubs ? 'una linea o un quadratino' : 'una linea'} è un vincolo. In oro la variabile decisa${hasArc ? ' o l\'arco revisionato' : ''}, color inchiostro i domini che l'evento riduce, in rosso quello rimasto vuoto.`);
    const where = t(`The nodes stand ${S.M.grid ? 'on the cells of the board' : inst.kind === 'map' || inst.kind === 'planar' ? 'on the regions of the map' : inst.kind === 'zebra' ? 'on a row per group of attributes, whose members must stand in different houses (the clues in accent)' : inst.kind === 'queens' ? 'on a circle, a column of the board each' : 'where a force layout puts them'}${hubs ? ', and a small square is a constraint on more than two variables, joined to every variable of its scope' : ''}; gold lines are the constraints of the variable decided, ink lines those that join the domains shrunk to the decision.`,
      `I nodi stanno ${S.M.grid ? 'sulle celle della tavola' : inst.kind === 'map' || inst.kind === 'planar' ? 'sulle regioni della mappa' : inst.kind === 'zebra' ? 'su una riga per gruppo di attributi, i cui membri devono stare in case diverse (gli indizi in colore)' : inst.kind === 'queens' ? 'su un cerchio, una colonna della scacchiera ciascuno' : 'dove li mette un layout a forze'}${hubs ? ', e un quadratino è un vincolo su più di due variabili, collegato a ogni variabile del suo ambito' : ''}; le linee in oro sono i vincoli della variabile decisa, quelle color inchiostro i vincoli che collegano i domini ridotti alla decisione.`);
    const named = t(` The trace names the arc of each revision, drawn in gold${cfg === 'ac3' || cfg === 'gac' ? '' : ' (all the arcs revised by the event, and on a domain emptied the arc that emptied it)'}: the variable that shrinks against the constraint that removes its values.`,
      ` La traccia nomina l'arco di ogni revisione, disegnato in oro${cfg === 'ac3' || cfg === 'gac' ? '' : ' (tutti gli archi revisionati dall\'evento, e su un dominio svuotato l\'arco che l\'ha svuotato)'}: la variabile che si riduce rispetto al vincolo che ne toglie i valori.`);
    const how = cfg === 'bt-fc'
      ? t(' Forward checking removes, after each decision, the values of the neighbors that conflict with it, so the ink lines are exactly the constraints it checked.',
        ' Il forward checking toglie, dopo ogni decisione, i valori dei vicini in conflitto con essa, quindi le linee color inchiostro sono esattamente i vincoli che ha controllato.') + (hasArc ? named : '')
      : (cfg === 'ac3' || cfg === 'bt-mac' || cfg === 'gac') && hasArc
      ? named
      : cfg === 'ac3' || cfg === 'bt-mac' || cfg === 'gac'
      ? t(` The trace gives the values that ${cfg === 'gac' ? 'each revision of GAC' : cfg === 'ac3' ? 'each revision of AC-3' : 'each call of MAC (all its revisions together)'} removes but not the arc revised, ${cfg === 'gac' ? 'a variable X against one constraint of its scope' : '(X, Y)'}: the variable that shrinks is X, and when it is alone its constraints are dashed, since the one revised is among them; a field "arc" on each propagate event would let the page mark it.`,
        ` La traccia dà i valori che ${cfg === 'gac' ? 'ogni revisione di GAC' : cfg === 'ac3' ? 'ogni revisione di AC-3' : 'ogni chiamata di MAC (tutte le sue revisioni insieme)'} toglie ma non l'arco revisionato, ${cfg === 'gac' ? 'una variabile X rispetto a un vincolo del suo ambito' : '(X, Y)'}: la variabile che si riduce è X, e quando è sola i suoi vincoli sono tratteggiati, perché quello revisionato è fra loro; un campo "arc" su ogni evento propagate permetterebbe alla pagina di segnarlo.`)
      : h.solver.paradigm === 'sat'
      ? t(' This solver works on the clauses of the direct encoding, and its literals are drawn on the variables whose values they set or rule out.',
        ' Questo solutore lavora sulle clausole della codifica diretta, e i suoi letterali sono disegnati sulle variabili di cui fissano o escludono i valori.')
      : '';
    fig.querySelector('.smore summary').textContent = t('more', 'di più');
    fig.querySelector('.smore p').textContent = where + how;
  };
  return q;
}

// ---------------------------------------------------------------- implication graph
// The trail of a CDCL or CaDiCaL trace, rebuilt from its events: every
// literal set, with its level, whether it is a decision and, when the
// propagate event carries it, its reason (the clause that forced it). A
// checkpoint every 128 events makes any position cheap to reach.
const isClause = c => Array.isArray(c) && c.every(x => Number.isInteger(x));
// the reason of each literal of a propagate event: a field "reason" (or
// "reasons") that is a list of clauses, one per literal, or one clause for
// an event of one literal; anything else (a text, an index) gives none
function reasonsOf(e) {
  const r = Array.isArray(e.reasons) ? e.reasons : e.reason, n = (e.lits || []).length;
  if (Array.isArray(r) && r.length === n && r.every(c => isClause(c) || c === null)) return r;
  if (n === 1 && isClause(r) && r.length && !r.every(c => Array.isArray(c))) return [r];
  return null;
}
function trailModel(tr) {
  const ev = tr.events, cps = [[]];
  let trail = [];
  const step = (trl, e) => {
    if (e.type === 'decide') trl.push({ lit: e.lit, level: e.level, dec: true, why: null });
    else if (e.type === 'propagate') { const R = reasonsOf(e); (e.lits || []).forEach((l, j) => trl.push({ lit: l, level: e.level, dec: false, why: R ? R[j] : null })); }
    else if (e.type === 'backtrack') return trl.filter(x => x.level <= e.level);
    return trl;
  };
  ev.forEach((e, i) => { trail = step(trail, e); if ((i + 1) % 128 === 0) cps.push(trail.slice()); });
  return { at: k => { let trl = cps[Math.floor(k / 128)].slice(); for (let i = Math.floor(k / 128) * 128; i < k; i++) trl = step(trl, ev[i]); return trl; } };
}
// the first-UIP analysis of a conflict at level L, from the clause falsified
// and the reasons of the literals of that level: the index of the 1UIP in
// row, the learned clause, and the indices of row on the conflict side;
// null when a reason it needs is missing
function analyze(row, trail, clause, L) {
  const at = new Map(trail.map(x => [Math.abs(x.lit), x])), seen = new Set(), lower = [];
  let count = 0;
  const take = l => {
    const v = Math.abs(l), x = at.get(v);
    if (!x || seen.has(v)) return;
    seen.add(v);
    if (x.level === L) count++; else if (x.level > 0) lower.push(l);
  };
  clause.forEach(take);
  let uip = -1;
  for (let i = row.length - 1; i >= 0; i--) {
    const x = row[i];
    if (!seen.has(Math.abs(x.lit))) continue;
    if (--count === 0) { uip = i; break; }
    if (!x.why) return null;
    for (const l of x.why) if (Math.abs(l) !== Math.abs(x.lit)) take(l);
  }
  if (uip < 0) return null;
  // the conflict side: the literals after the 1UIP that it implies
  const side = new Set([Math.abs(row[uip].lit)]), cs = new Set();
  for (let i = uip + 1; i < row.length; i++) {
    const w = row[i].why;
    if (w && w.some(l => Math.abs(l) !== Math.abs(row[i].lit) && side.has(Math.abs(l)))) { side.add(Math.abs(row[i].lit)); cs.add(i); }
  }
  return { uip, learned: [-row[uip].lit, ...lower], cs };
}
function implicationGraph(panel, tr) {
  const h = tr.header, ev = tr.events, sym = h.encoding ? h.encoding.symbols : [];
  const aima = h.solver.config === 'cdcl' && !/cadical/.test(h.solver.id || '');
  const hasWhy = ev.some(e => e.type === 'propagate' && reasonsOf(e)), hasClause = ev.some(e => e.type === 'conflict' && isClause(e.clause));
  const hasLearned = ev.some(e => e.type === 'conflict' && isClause(e.learned));
  const TM = trailModel(tr);
  const lab = l => {
    const s = sym[Math.abs(l) - 1] || 'x' + Math.abs(l), i = s.lastIndexOf('_');
    return i < 0 ? (l > 0 ? s : '¬' + s) : s.slice(0, i) + (l > 0 ? '=' : '≠') + s.slice(i + 1);
  };
  const fig = document.createElement('figure');
  fig.className = 'spanel igraph';
  fig.innerHTML = '<figcaption class="scap"></figcaption><div class="sbox"></div><p class="ilearn"></p><p class="sstat"></p><details class="smore"><summary></summary><p></p></details>';
  const q = { fig, k: -1 };
  // the conflict that an event belongs to: the conflict itself, the
  // backtrack after it and the propagation that follows the backtrack
  const anchor = kk => {
    const at = j => (j >= 0 && j < ev.length ? ev[j] : null);
    const j = kk - 1;
    if (at(j) && at(j).type === 'conflict') return j;
    if (at(j) && at(j).type === 'backtrack' && at(j - 1) && at(j - 1).type === 'conflict') return j - 1;
    if (at(j) && at(j).type === 'propagate' && at(j - 1) && at(j - 1).type === 'backtrack' && at(j - 2) && at(j - 2).type === 'conflict') return j - 2;
    return -1;
  };
  q.draw = kk => {
    q.k = kk;
    const box = fig.querySelector('.sbox'), W = Math.max(150, box.clientWidth || 300);
    const c = anchor(kk), trail = TM.at(c >= 0 ? c + 1 : kk);
    const L = c >= 0 ? ev[c].level : trail.reduce((m, x) => Math.max(m, x.level), 0);
    const bt = c >= 0 && ev[c + 1] && ev[c + 1].type === 'backtrack' ? ev[c + 1] : null;
    const as = bt && ev[c + 2] && ev[c + 2].type === 'propagate' && (ev[c + 2].lits || []).length ? ev[c + 2].lits[0] : null;
    const row = trail.filter(x => x.level === L);
    const clause = c >= 0 && isClause(ev[c].clause) ? ev[c].clause : null;
    const learnedTr = c >= 0 && isClause(ev[c].learned) ? ev[c].learned : null;
    // the 1UIP: by resolution when the trace carries the clause falsified
    // and the reasons; otherwise, for aima, the literal of the level of the
    // conflict whose negation is asserted first after the backjump (aima
    // propagates first the learned clause, the only clause the backjump
    // leaves unit)
    const A = clause ? analyze(row, trail, clause, L) : null;
    let uip = A ? A.uip : -1;
    if (uip < 0 && aima && as !== null) uip = row.findIndex(x => x.lit === -as);
    const byLev = new Map();
    for (const x of trail) { if (!byLev.has(x.level)) byLev.set(x.level, { dec: null, n: 0 }); const b = byLev.get(x.level); if (x.dec) b.dec = x.lit; else b.n++; }
    const levs = [...byLev.keys()].filter(l => l !== L).sort((a, b) => a - b);
    // the levels below that of the conflict, one line each; a deep trail
    // keeps its first two and last five
    const shown = levs.length > 8 ? levs.slice(0, 2).concat([null], levs.slice(-5)) : levs;
    const svg = el('svg', { class: 'ig', width: W });
    const ge = el('g', { class: 'iedges' });
    svg.append(ge);
    const cw = ch => ch.length * 6.1 + 10, lh = 20;
    const lx = 12 + 5.8 * Math.max(...levs.concat([L]).map(l => t(`level ${l}`, `livello ${l}`).length));
    const levY = new Map();          // the anchor of the literals of a lower level
    let y = 12, foldY = null;
    for (const l of shown) {
      if (l === null) { const tx = el('text', { x: lx, y: y + 3, class: 'ilev' }); tx.textContent = t(`… ${levs.length - 7} levels folded`, `… ${levs.length - 7} livelli raccolti`); svg.append(tx); foldY = y; y += lh; continue; }
      const b = byLev.get(l), back = bt && l === bt.level;
      const lt = el('text', { x: 4, y: y + 3, class: 'ilev' + (back ? ' back' : '') }); lt.textContent = t(`level ${l}`, `livello ${l}`); svg.append(lt);
      let x = lx;
      if (b.dec !== null) { const s = lab(b.dec), w = cw(s); svg.append(chip(x, y, w, s, 'dec')); levY.set(l, [x + w / 2, y + 8]); x += w + 4; }
      else levY.set(l, [lx + 10, y + 8]);
      const more = el('text', { x: x + 2, y: y + 3, class: 'imore' });
      more.textContent = (b.dec === null ? (l === 0 ? t('units: ', 'unità: ') : t('no decision in the trace; ', 'nessuna decisione nella traccia; ')) : '') + `+${b.n}` + (back ? ' ↩' + (as !== null ? ' ' + lab(as) : '') : '');
      svg.append(more);
      if (back) svg.append(el('rect', { x: 1, y: y - 9, width: W - 2, height: 18, rx: 4, class: 'iback' }));
      y += lh;
    }
    for (const l of levs) if (!levY.has(l) && foldY !== null) levY.set(l, [lx + 30, foldY + 6]);
    // the level of the conflict, or the current one, in full; with the
    // analysis, the side of the reasons first, then the cut and the side of
    // the conflict, each in the order of the trail
    const top = uip >= 0 ? 12 : 6;
    const lt = el('text', { x: 4, y: y + top, class: 'ilev cur' }); lt.textContent = t(`level ${L}`, `livello ${L}`); svg.append(lt);
    const MAX = 70;
    let items = row.map((x, i) => ({ ...x, i }));
    if (A) items = items.filter(x => x.i <= A.uip || !A.cs.has(x.i)).concat([{ cut: true }], items.filter(x => x.i > A.uip && A.cs.has(x.i)));
    if (items.length > MAX) {
      // the decision, the 1UIP and the last literals before the conflict
      const keep = new Set([0, uip, ...items.slice(-(MAX - 12)).map(x => x.i), ...items.slice(0, 8).map(x => x.i)]);
      const out = []; let gap = 0;
      for (const x of items) { if (x.cut || keep.has(x.i)) { if (gap) out.push({ gap }); gap = 0; out.push(x); } else gap++; }
      if (gap) out.push({ gap });
      items = out;
    }
    if (c >= 0) items.push({ conflict: true });
    if (!row.length && c < 0) items.push({ empty: true });
    let x = lx, yy = y + top, cut = null, confAt = null;
    const pos = new Map();
    items.forEach(it => {
      if (it.cut) { cut = 'next'; return; }
      const s = it.conflict ? t('✕ conflict', '✕ conflitto') : it.gap ? `… ${it.gap} …` : it.empty ? t('no literal yet', 'ancora nessun letterale') : lab(it.lit), w = cw(s);
      if (x + w > W - 4 && x > lx) { x = lx; yy += lh + (hasWhy ? 18 : uip >= 0 ? 12 : 4); }
      if (cut === 'next') cut = [x - 2, yy];
      const side = A ? (it.i === uip ? 'uip' : A.cs.has(it.i) ? 'cside' : 'reason') : uip >= 0 && it.i > uip ? 'unk' : uip >= 0 && it.i === uip ? 'uip' : c >= 0 && uip >= 0 && !it.dec ? 'reason' : '';
      const cls = it.conflict ? 'conf' : it.gap || it.empty ? 'gap' : [it.dec ? 'dec' : '', side].filter(Boolean).join(' ');
      svg.append(chip(x, yy, w, s, cls));
      if (it.lit !== undefined) pos.set(Math.abs(it.lit), [x + w / 2, yy]);
      if (it.conflict) confAt = [x + w / 2, yy];
      if (it.i === uip && !A) cut = [x + w + 2, yy];
      if (it.i === uip) { const u = el('text', { x: x + w / 2, y: hasWhy ? yy + 15 : yy - 11, class: 'iuipl' }); u.textContent = '1UIP'; svg.append(u); }
      x += w + 4;
    });
    if (cut === 'next') cut = confAt ? [confAt[0] - 40, confAt[1]] : null;
    if (Array.isArray(cut)) svg.append(el('path', { class: 'icut', d: `M${cut[0]},${cut[1] - 13}L${cut[0]},${cut[1] + 13}` }));
    // the edges, from each literal of a reason to the literal it forced and
    // from the literals of the clause falsified to the conflict; a literal
    // of a lower level starts from the line of its level
    const lvOf = new Map(trail.map(t2 => [Math.abs(t2.lit), t2.level]));
    const from = l => pos.get(Math.abs(l)) || (lvOf.has(Math.abs(l)) ? levY.get(lvOf.get(Math.abs(l))) : null);
    const edge = (a, b, cls) => {
      if (!a || !b) return;
      const [ax, ay] = a, [bx, by] = b, same = Math.abs(ay - by) < 1;
      const d = same ? `M${ax},${ay - 8}Q${(ax + bx) / 2},${ay - 8 - Math.min(26, 6 + Math.abs(bx - ax) * 0.18)} ${bx},${by - 8}` : `M${ax},${ay + (ay < by ? 8 : -8)}L${bx},${by + (ay < by ? -8 : 8)}`;
      ge.append(el('path', { class: 'iedge' + (cls ? ' ' + cls : ''), d }));
    };
    for (const xr of row) if (xr.why && pos.has(Math.abs(xr.lit))) for (const l of xr.why) if (Math.abs(l) !== Math.abs(xr.lit)) edge(from(l), pos.get(Math.abs(xr.lit)), lvOf.get(Math.abs(l)) === L ? '' : 'low');
    if (clause && confAt) for (const l of clause) edge(from(l), confAt, 'conf');
    const H = yy + (hasWhy && uip >= 0 ? 22 : 16);
    svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    box.replaceChildren(svg);
    // the learned clause, as far as the trace determines it
    const learn = fig.querySelector('.ilearn'), cl = ls => '(' + ls.map(lab).join(' ∨ ') + ')';
    const jump = bt ? t(`, backjump to level ${bt.level}`, `, salto al livello ${bt.level}`) : '';
    if (c < 0) learn.textContent = '';
    else if (learnedTr) learn.textContent = t(`learned clause: ${cl(learnedTr)}`, `clausola appresa: ${cl(learnedTr)}`) + jump;
    else if (A) learn.textContent = t(`learned clause, by resolution up to the 1UIP: ${cl(A.learned)}`, `clausola appresa, per risoluzione fino al 1UIP: ${cl(A.learned)}`) + jump;
    else if (uip >= 0) learn.textContent = t(`learned clause: (${lab(-row[uip].lit)}${bt && bt.level > 0 ? (bt.level === 1 ? ' ∨ literals false at level 1' : ` ∨ literals false at levels 1 to ${bt.level}, one at least of level ${bt.level}`) : ''})${bt && bt.level === 0 ? ', a unit clause: the backjump goes to level 0' : jump}`,
      `clausola appresa: (${lab(-row[uip].lit)}${bt && bt.level > 0 ? (bt.level === 1 ? ' ∨ letterali falsi al livello 1' : ` ∨ letterali falsi ai livelli da 1 a ${bt.level}, almeno uno del livello ${bt.level}`) : ''})${bt && bt.level === 0 ? ', una clausola unitaria: il salto va al livello 0' : jump}`);
    else learn.textContent = bt ? t(`learned clause: not in the trace; backjump to level ${bt.level}`, `clausola appresa: non è nella traccia; salto al livello ${bt.level}`)
      : t('a conflict at level 0: the formula is unsatisfiable', 'un conflitto al livello 0: la formula è insoddisfacibile');
    const nconf = ev.slice(0, kk).filter(e => e.type === 'conflict').length;
    fig.querySelector('.sstat').textContent = [t(`trail ${trail.length} literals`, `traccia degli assegnamenti ${trail.length} letterali`),
      t(`at level ${L}: ${row.length}`, `al livello ${L}: ${row.length}`), t(`conflicts so far ${nconf}`, `conflitti finora ${nconf}`),
      c < 0 ? t('the graph of a conflict shows at its event', 'il grafo di un conflitto si vede al suo evento') : ''].filter(Boolean).join(' · ');
    fig.querySelector('.scap').textContent = t('A row per decision level, its decision in gold; the level of the conflict in full, in the order of the trail, up to the conflict (red), with the 1UIP ringed and the cut dashed.',
      'Una riga per livello di decisione, con la decisione in oro; il livello del conflitto per intero, nell\'ordine della traccia, fino al conflitto (in rosso), con il 1UIP cerchiato e il taglio tratteggiato.');
    fig.querySelector('.smore summary').textContent = t('more', 'di più');
    // a trace with the reasons and no conflict at all is as complete as it can be
    const full = hasWhy && (hasClause || !ev.some(e => e.type === 'conflict'));
    fig.querySelector('.smore p').textContent = (full
      ? t('An arrow goes from each literal of the reason of a literal (the clause that forced it) to that literal, and from the literals of the clause falsified to the conflict; a literal of a lower level starts from the line of its level. The 1UIP comes from resolving the clause falsified with the reasons, backward along the trail, until one literal of the level of the conflict is left: lilac the literals on the side of the reasons, left of the cut, and red-edged those it implies, on the side of the conflict. ',
        'Una freccia va da ogni letterale della ragione di un letterale (la clausola che lo ha forzato) a quel letterale, e dai letterali della clausola falsificata al conflitto; un letterale di un livello inferiore parte dalla riga del suo livello. Il 1UIP si ottiene risolvendo la clausola falsificata con le ragioni, all\'indietro lungo la traccia, finché resta un solo letterale del livello del conflitto: in lilla i letterali dalla parte delle ragioni, a sinistra del taglio, e bordati di rosso quelli che implica, dalla parte del conflitto. ')
        + (hasLearned ? t('The learned clause is the one the solver reports.', 'La clausola appresa è quella che il solutore riporta.') : t('The learned clause is the resolvent at the 1UIP, before any minimization the solver may apply.', 'La clausola appresa è il risolvente al 1UIP, prima di ogni minimizzazione che il solutore può applicare.'))
      : aima
      ? t('The 1UIP is exact: it is the literal whose negation the solver asserts first after the backjump (written after ↩ on the dashed line, the level of the backjump), the one literal of the learned clause at the level of the conflict, and every literal before it lies on the side of the reasons. The trace carries neither the clause that forced each literal nor the clause falsified, so no edge is drawn, the literals after the 1UIP (dashed) may lie on either side of the cut, and of the learned clause only that literal is known; a field "reason" on each propagate event and "clause" on the conflict would complete the graph.',
        'Il 1UIP è esatto: è il letterale la cui negazione il solutore afferma per prima dopo il salto all\'indietro (scritto dopo ↩ sulla riga tratteggiata, il livello del salto), l\'unico letterale della clausola appresa al livello del conflitto, e ogni letterale prima di esso sta dalla parte delle ragioni. La traccia non porta né la clausola che ha forzato ciascun letterale né la clausola falsificata, quindi nessun arco è disegnato, i letterali dopo il 1UIP (tratteggiati) possono stare da una parte o dall\'altra del taglio, e della clausola appresa si conosce solo quel letterale; un campo "reason" su ogni evento propagate e "clause" sul conflitto completerebbero il grafo.')
      : t('CaDiCaL is followed through its external propagator, which is told the assignments and the levels but no clause: neither the reason of a literal, nor the clause falsified, nor the clause learned, so no edge, 1UIP or cut is drawn, and a level may lack its decision when CaDiCaL decides on a variable the propagator does not observe; the fields "reason" on each propagate event and "clause" and "learned" on the conflict would complete the graph.',
        'CaDiCaL è seguito attraverso il suo propagatore esterno, al quale arrivano gli assegnamenti e i livelli ma nessuna clausola: né la ragione di un letterale, né la clausola falsificata, né la clausola appresa, quindi non sono disegnati archi, 1UIP o taglio, e a un livello può mancare la decisione quando CaDiCaL decide su una variabile che il propagatore non osserva; i campi "reason" su ogni evento propagate e "clause" e "learned" sul conflitto completerebbero il grafo.'));
  };
  return q;
}
function chip(x, y, w, s, cls) {
  const g = el('g', { class: 'ichip' + (cls ? ' ' + cls : '') });
  g.append(el('rect', { x, y: y - 8, width: w, height: 16, rx: 8 }));
  const tx = el('text', { x: x + w / 2, y: y + 0.5 }); tx.textContent = s; g.append(tx);
  return g;
}

// ---------------------------------------------------------------- the toggle
// the kind of graph of a lane: a constraint graph for a CSP lane and DPLL,
// an implication graph for CDCL and CaDiCaL, none for the others
function kindOf(tr) {
  const h = tr.header, pd = h.solver.paradigm, cfg = String(h.solver.config || '');
  if (!h.instance || !h.instance.vertices || !h.instance.colours) return null;
  if (pd === 'sat' && (cfg === 'cdcl' || /cadical/.test(h.solver.id || ''))) return 'ig';
  if (pd === 'csp' || (pd === 'sat' && cfg === 'dpll')) return 'cg';
  return null;
}
// p: the panel of the tree (or of the domains of AC-3), inside the element
// panel; returns a panel that draws the view chosen
export function withGraph(panel, p, tr, rep) {
  const kind = kindOf(tr);
  if (!kind || !rep) return p;
  const G = kind === 'cg' ? constraintGraph(panel, tr, rep) : implicationGraph(panel, tr);
  const bar = document.createElement('div');
  bar.className = 'sviewtog';
  bar.setAttribute('role', 'group');
  bar.innerHTML = '<button type="button" data-v="tree"></button><button type="button" data-v="graph"></button>';
  p.el.before(bar);
  p.el.after(G.fig);
  const ac3 = String(tr.header.solver.config) === 'ac3';
  let view = pref() === 'graph' ? 'graph' : 'tree';
  const q = { el: p.el, k: -1 };
  const show = () => {
    const [a, b] = bar.querySelectorAll('button');
    a.textContent = ac3 ? t('domains', 'domini') : t('tree', 'albero');
    b.textContent = kind === 'cg' ? t('constraint graph', 'grafo dei vincoli') : t('implication graph', 'grafo delle implicazioni');
    a.setAttribute('aria-pressed', String(view === 'tree')); b.setAttribute('aria-pressed', String(view === 'graph'));
    bar.setAttribute('aria-label', t('view of the structure', 'vista della struttura'));
    p.el.hidden = view !== 'tree'; G.fig.hidden = view !== 'graph';
  };
  q.draw = k => {
    q.k = k;
    show();
    if (view === 'graph') G.draw(k); else p.draw(k);
  };
  bar.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || b.dataset.v === view) return;
    view = b.dataset.v; setPref(view);
    if (q.k >= 0) q.draw(q.k); else show();
  });
  // the graph draws again when its lane changes width
  let w = 0;
  new ResizeObserver(() => { const b = G.fig.querySelector('.sbox'), nw = b ? b.clientWidth : 0; if (nw && nw !== w) { w = nw; if (view === 'graph' && q.k >= 0) G.draw(q.k); } }).observe(G.fig);
  show();
  return q;
}
