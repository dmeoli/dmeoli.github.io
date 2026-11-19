// The panel under the board of a lane: the structure that its solver builds,
// in step with the timeline. A backtracking search (CSP, DPLL, CDCL,
// CaDiCaL) draws its decision tree; a state-space search its search tree
// when the trace determines it exactly, and otherwise its expansions by
// order and depth; GraphPlan its planning graph; AC-3 the sizes of its
// domains; a local search the conflicts left after each step; a MILP its
// bound and incumbent. Each panel says in its caption what a node, an edge
// and a color mean, and, when it draws less than the tree, why.

import { t } from '../i18n.js';
import { renderTree } from './treeview.js';
import { decisionModel, searchModel, localSeries } from './models.js';
import { WORKERS } from './search.js';
import { withGraph } from './graphs.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = v => (v === null || v === undefined ? '–' : +(+v).toPrecision(5));
const LIVE = new Set();
addEventListener('themechange', () => { for (const p of LIVE) { if (!p.el.isConnected) LIVE.delete(p); else if (p.k >= 0) p.draw(p.k); } });
// the last index i of a sorted array a with key(a[i]) < k, plus one
const below = (a, k, key) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (key(a[m]) < k) lo = m + 1; else hi = m; } return lo; };

function shell(box, cls) {
  const fig = document.createElement('figure');
  fig.className = 'spanel ' + cls;
  fig.innerHTML = '<figcaption class="scap"></figcaption><div class="sbox"></div><p class="sstat"></p>';
  box.prepend(fig);
  return { fig, cap: fig.querySelector('.scap'), box: fig.querySelector('.sbox'), stat: fig.querySelector('.sstat') };
}
function canvasIn(box, H) {
  let cv = box.querySelector('canvas');
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'splot'; box.replaceChildren(cv); }
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = box.clientWidth || 300;
  cv.style.height = H + 'px';
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
  return { g, W, H };
}
// a line over the events of a lane, drawn up to the current one
function series(g, W, H, ys, k, col, ymax, pad, dash) {
  const n = ys.length, X = i => pad.l + (W - pad.l - pad.r) * (n > 1 ? i / (n - 1) : 0.5), Y = v => pad.t + (H - pad.t - pad.b) * (1 - v / (ymax || 1));
  g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash(dash || []);
  g.beginPath();
  let on = false, last = null;
  for (let i = 0; i < Math.min(k, n); i++) {
    const v = ys[i];
    if (v === null || v === undefined) { on = false; continue; }
    if (on) g.lineTo(X(i), Y(v)); else g.moveTo(X(i), Y(v));
    on = true; last = [X(i), Y(v)];
  }
  g.stroke(); g.setLineDash([]);
  return last;
}

// ---------------------------------------------------------------- decision tree
// the label of a literal: the value it tries ("WA = R"), or rules out
function litLabel(sym) {
  return (l, neg) => {
    const s = sym[Math.abs(l) - 1] || String(Math.abs(l)), i = s.lastIndexOf('_');
    const ok = !neg && l > 0;
    return i < 0 ? (ok ? s : '¬' + s) : s.slice(0, i) + (ok ? '=' : '≠') + s.slice(i + 1);
  };
}
function decisionPanel(box, tr) {
  const h = tr.header, cfg = String(h.solver.config || ''), sym = h.encoding ? h.encoding.symbols : [];
  const cdcl = cfg === 'cdcl' || /cadical/.test(h.solver.id || ''), dpll = cfg === 'dpll', gac = cfg === 'gac';
  const M = decisionModel(tr, litLabel(sym)), S = shell(box, 'dtree'), N = tr.events.length;
  const sat = tr.result && /^(sat|optimal|feasible)$/.test(tr.result.status);
  const p = { el: S.fig, k: -1 };
  p.draw = k => {
    p.k = k;
    const n = below(M.nodes, k, x => x.born), cur = k > 0 ? M.cur[k - 1] : 0;
    const path = new Set();
    for (let id = cur; id !== null && id !== undefined; id = M.nodes[id].p) path.add(id);
    const end = k >= N && sat;
    const nodes = new Map(), order = [];
    for (let i = 0; i < n; i++) {
      const x = M.nodes[i], dead = x.dead < k;
      const what = x.kind === 'root' ? t('the root: no decision yet', 'la radice: ancora nessuna decisione')
        : x.kind === 'conflict' ? t(`a conflict at level ${x.level}`, `un conflitto al livello ${x.level}`)
        : t(`decision ${x.label} at level ${x.level}`, `decisione ${x.label} al livello ${x.level}`);
      nodes.set(i, { id: i, p: x.p, label: x.kind === 'root' ? '' : x.label,
        cls: x.kind + (dead ? ' dead' : '') + (dead && x.failed ? ' failed' : '') + (path.has(i) ? ' path' : '') + (end && path.has(i) ? ' sol' : ''),
        ecls: dead ? 'dead' : path.has(i) ? 'path' : '',
        title: what + (x.props ? t(`; then ${x.props} literals propagated`, `; poi ${x.props} letterali propagati`) : '') });
      order.push(i);
    }
    const arcs = cdcl ? M.jumps.filter(j => j.i === k - 1 || j.i === k - 2).map(j => ({ from: j.from, to: j.to,
      label: t(`backjump, ${j.skipped} level${j.skipped > 1 ? 's' : ''} skipped`, `salto indietro, ${j.skipped} livell${j.skipped > 1 ? 'i' : 'o'} saltat${j.skipped > 1 ? 'i' : 'o'}`) })) : [];
    const r = renderTree(S.box, { nodes, order, cur, arcs, small: true });
    const c = name => (k > 0 ? M.cnt[name][k - 1] : 0);
    const parts = [t(`decisions ${c('decisions')}`, `decisioni ${c('decisions')}`), t(`conflicts ${c('conflicts')}`, `conflitti ${c('conflicts')}`)];
    if (cdcl) parts.push(t(`learned clauses ${c('conflicts')}`, `clausole apprese ${c('conflicts')}`), t(`backjumps ${c('backjumps')}`, `salti indietro ${c('backjumps')}`), t(`restarts ${c('restarts')}`, `riavvii ${c('restarts')}`));
    if (r.folded) parts.push(t(`${r.drawn} nodes drawn, ${r.folded} folded`, `${r.drawn} nodi disegnati, ${r.folded} raccolti`));
    S.stat.textContent = parts.join(' · ');
    S.cap.textContent = (M.nodes.length === 1
      ? t('The decision tree has only its root: this run never had to choose, since propagation alone fixed every value. ', 'L\'albero delle decisioni ha solo la radice: questa esecuzione non ha mai dovuto scegliere, perché la sola propagazione ha fissato ogni valore. ')
      : '') + (gac
      ? t('The search tree: the root is the problem after propagation, a node a split of a domain (the value tried, under the split of the level above), a red cross a domain left empty, grey a branch abandoned by a backtrack, red-ringed when it failed; the ring marks where the search stands, and gold at the end the path to the solution.',
        'L\'albero di ricerca: la radice è il problema dopo la propagazione, un nodo una suddivisione di un dominio (il valore provato, sotto la suddivisione del livello sopra), una croce rossa un dominio rimasto vuoto, grigio un ramo abbandonato da un ritorno indietro, con l\'anello rosso se è fallito; l\'anello segna dove si trova la ricerca, e in oro alla fine il cammino verso la soluzione.')
      : cdcl
      ? t('The decision tree, rebuilt from the levels of the trace: a node is a decision (under the decision of the level below it), a red cross a conflict, grey the decisions taken back; a backtrack that undoes more than one level at once is a backjump, drawn as a dashed arc from the conflict to the level kept; every conflict adds a learned clause, and after a restart the decisions start again from the root.',
        'L\'albero delle decisioni, ricostruito dai livelli della traccia: un nodo è una decisione (sotto la decisione del livello inferiore), una croce rossa un conflitto, grigie le decisioni ritirate; un ritorno indietro che annulla più di un livello alla volta è un salto all\'indietro, disegnato come un arco tratteggiato dal conflitto al livello mantenuto; ogni conflitto aggiunge una clausola appresa, e dopo un riavvio le decisioni ripartono dalla radice.')
      : dpll
      ? t('The decision tree of DPLL: a node is a literal tried (under the decision above it; the levels of the trace also count the propagations, so the depth of a node is the number of decisions over it), a red cross a clause falsified, grey a branch taken back, red-ringed when it failed; DPLL backtracks chronologically, trying the other value of the last decision.',
        'L\'albero delle decisioni di DPLL: un nodo è un letterale provato (sotto la decisione sopra di esso; i livelli della traccia contano anche le propagazioni, quindi la profondità di un nodo è il numero di decisioni sopra di esso), una croce rossa una clausola falsificata, grigio un ramo ritirato, con l\'anello rosso se è fallito; DPLL torna indietro in ordine cronologico, provando l\'altro valore dell\'ultima decisione.')
      : t('The search tree: the root is the empty assignment, a node a value tried for a variable (under the value of the level above), a red cross a domain emptied by the propagation, grey a branch abandoned by a backtrack, red-ringed when it failed; the ring marks where the search stands, and gold at the end the path to the solution.',
        'L\'albero di ricerca: la radice è l\'assegnamento vuoto, un nodo un valore provato per una variabile (sotto il valore del livello sopra), una croce rossa un dominio svuotato dalla propagazione, grigio un ramo abbandonato da un ritorno indietro, con l\'anello rosso se è fallito; l\'anello segna dove si trova la ricerca, e in oro alla fine il cammino verso la soluzione.'));
  };
  return p;
}

// ---------------------------------------------------------------- search tree
const WHY = {
  sampled: m => [`the recorder kept ${m.kept} of the ${m.total} expansions, so the parents of most states are not in the trace`,
    `la registrazione ha tenuto ${m.kept} delle ${m.total} espansioni, quindi i genitori della maggior parte degli stati non sono nella traccia`],
  parallel: () => ['the workers of HDA* expand at the same time, and the trace does not say whose message gave a state its parent',
    'i worker di HDA* espandono nello stesso momento, e la traccia non dice di chi è il messaggio che ha dato a uno stato il suo genitore'],
  nosucc: () => ['the trace carries the fluents of each state but not the actions of the problem, so a state cannot be matched to the one it comes from',
    'la traccia porta i fluenti di ogni stato ma non le azioni del problema, quindi uno stato non si può collegare a quello da cui proviene'],
  noparent: () => ['some state has no state expanded before it one move away with the right g', 'qualche stato non ha, fra quelli espansi prima, uno stato a una mossa di distanza con il g giusto'],
  nostate: () => ['some expansion carries no state', 'qualche espansione non porta lo stato'],
  alg: () => ['the page does not know how this algorithm chooses a parent', 'la pagina non sa come questo algoritmo sceglie un genitore'] };
const ALG = { astar: 'A*', ucs: ['uniform cost', 'costo uniforme'], bfs: ['breadth-first search', 'ricerca in ampiezza'], greedy: ['greedy best-first', 'best-first greedy'] };
function searchPanel(box, tr) {
  const M = searchModel(tr), S = shell(box, 'stree'), ev = tr.events, h = tr.header, game = h.game;
  const nsearch = (() => { const i = ev.findIndex(e => e.type === 'path'); return i < 0 ? ev.length : i; })();
  const W = h.instance.width;
  const name = x => (game === 'grid' ? `(${+x.key % W}, ${Math.floor(+x.key / W)})` : game === 'romania' ? x.key : '');
  const p = { el: S.fig, k: -1 };
  const dfs = M.mode === 'dfs', ida = /idastar/.test(M.alg);
  p.draw = k => {
    p.k = k;
    const nx = below(M.exps, k, x => x.i), np = below(M.path, k, x => x.i), last = nx - 1;
    if (M.mode === 'layers') { layers(S, M, k, nx, np); return; }
    const it = last >= 0 ? M.exps[last].iter : 0;
    const nodes = new Map(), order = [];
    let cur = last >= 0 ? last : null;
    const byKey = new Map();
    for (let j = 0; j < nx; j++) {
      const x = M.exps[j];
      if (dfs && x.iter !== it) continue;
      byKey.set(x.key, j);
      nodes.set(j, { id: j, p: x.p >= 0 ? x.p : null, label: game === 'romania' ? x.key : String(+(+x.f).toPrecision(4)),
        title: `${name(x) ? name(x) + ': ' : ''}g ${fmt(x.g)}, h ${fmt(x.h)}, f ${fmt(x.f)}` });
      order.push(j);
    }
    // the solution path, once the search is over: the state of the last path
    // event and its ancestors (a goal that was never expanded hangs under
    // the state before it)
    const sol = new Set();
    if (np > 0) {
      let at = byKey.get(M.path[np - 1].key);
      if (at === undefined && np > 1) {
        const pre = byKey.get(M.path[np - 2].key);
        if (pre !== undefined) {
          nodes.set('goal', { id: 'goal', p: pre, label: t('goal', 'obiettivo'), title: t('the goal, reached but not expanded', 'l\'obiettivo, raggiunto ma non espanso') });
          order.push('goal'); at = 'goal';
        }
      }
      if (at !== undefined) { cur = at; for (let id = at; id !== null && id !== undefined; id = nodes.get(id).p) sol.add(id); }
    }
    const stack = new Set();
    for (let id = cur; id !== null && id !== undefined && nodes.has(id); id = nodes.get(id).p) stack.add(id);
    for (const [id, n] of nodes) {
      n.cls = 'sn' + (id === 'goal' ? ' goalnode' : '') + (sol.has(id) ? ' sol path' : stack.has(id) ? ' path' : dfs ? ' off' : '');
      n.ecls = sol.has(id) ? 'sol' : stack.has(id) ? 'path' : dfs ? 'dead' : '';
    }
    const r = renderTree(S.box, { nodes, order, cur, small: true });
    const parts = [t(`expanded ${nx}`, `espansi ${nx}`)];
    if (dfs && ida) {
      const x = M.exps[Math.max(0, last)];
      parts.push(t(`iteration ${it + 1}`, `iterazione ${it + 1}`) + (x && x.thr !== null ? t(`, threshold ${fmt(x.thr)}`, `, soglia ${fmt(x.thr)}`) : ''),
        t(`this iteration ${order.length}`, `in questa iterazione ${order.length}`));
    }
    if (r.folded) parts.push(t(`${r.drawn} drawn, ${r.folded} folded`, `${r.drawn} disegnati, ${r.folded} raccolti`));
    if (k > nsearch) parts.push(t('gold: the solution path', 'in oro: il cammino soluzione'));
    S.stat.textContent = parts.join(' · ');
    const lab = game === 'romania' ? 'its city' : 'its f = g + h', labIt = game === 'romania' ? 'la sua città' : 'il suo f = g + h';
    const a = ALG[M.alg], an = Array.isArray(a) ? t(...a) : a || M.alg;
    S.cap.textContent = dfs
      ? (ida ? t(`The tree of the depth-first search of IDA* in its current iteration: a node is a state expanded, labeled by ${lab}, under the state it was reached from; the ring is the state of this event and its path from the root is ink, grey the branches already left (IDA* keeps only the path, so it forgets them, and every iteration, with a larger threshold on f, starts again from the root). The parent is exact: the deepest state of the path one move away with g smaller by the cost of the move.`,
          `L'albero della ricerca in profondità di IDA* nella sua iterazione corrente: un nodo è uno stato espanso, etichettato con ${labIt}, sotto lo stato da cui è stato raggiunto; l'anello è lo stato di questo evento e il suo cammino dalla radice è color inchiostro, grigi i rami già lasciati (IDA* tiene solo il cammino, quindi li dimentica, e ogni iterazione, con una soglia più alta su f, riparte dalla radice). Il genitore è esatto: lo stato più profondo del cammino a una mossa di distanza il cui g, più il costo della mossa, è il g dello stato.`)
        : t(`The tree of the recursive calls of RBFS: a node is a state expanded, labeled by ${lab}, under the call that reached it; the ring is the state of this event and its path from the root is ink, grey the branches RBFS has left (it keeps only the path and the best f of each sibling, so it expands again a branch it comes back to). The parent is exact: the deepest state of the path one move away with g smaller by the cost of the move.`,
          `L'albero delle chiamate ricorsive di RBFS: un nodo è uno stato espanso, etichettato con ${labIt}, sotto la chiamata che lo ha raggiunto; l'anello è lo stato di questo evento e il suo cammino dalla radice è color inchiostro, grigi i rami che RBFS ha lasciato (tiene solo il cammino e il miglior f di ogni fratello, quindi espande di nuovo un ramo a cui ritorna). Il genitore è esatto: lo stato più profondo del cammino a una mossa di distanza il cui g, più il costo della mossa, è il g dello stato.`))
      : t(`The search tree of ${an}: a node is a state expanded, labeled by ${lab}, under the state that generated it; the ring is the state of this event, ink its path from the start, gold at the end the solution path; hover over a node for g, h and f. The parent is exact: the first state expanded one move away with g smaller by the cost of the move, which is the parent that ${an} keeps, since it sets the parent of a state when it first generates it and changes it ${/^(astar|ucs)$/.test(M.alg) ? 'only for a strictly cheaper path' : 'never'}.`,
        `L'albero di ricerca di ${an}: un nodo è uno stato espanso, etichettato con ${labIt}, sotto lo stato che lo ha generato; l'anello è lo stato di questo evento, color inchiostro il suo cammino dalla partenza, in oro alla fine il cammino soluzione; passa col puntatore su un nodo per g, h e f. Il genitore è esatto: il primo stato espanso a una mossa di distanza il cui g, più il costo della mossa, è il g dello stato, che è il genitore che questa ricerca mantiene, perché fissa il genitore di uno stato quando lo genera la prima volta e ${/^(astar|ucs)$/.test(M.alg) ? 'lo cambia solo per un cammino strettamente più economico' : 'non lo cambia più'}.`);
  };
  return p;
}
// the expansions by order (left to right) and depth g (downwards), when the
// tree cannot be drawn exactly
function layers(S, M, k, nx, np) {
  const { g, W, H } = canvasIn(S.box, 170), ex = M.exps, n = Math.max(1, M.kept);
  const gmax = Math.max(1, ...ex.map(x => x.g));
  const hist = new Map();
  for (let j = 0; j < nx; j++) { const d = Math.round(ex[j].g); hist.set(d, (hist.get(d) || 0) + 1); }
  const layered = new Set(ex.map(x => Math.round(x.g))).size <= 80;
  const pad = { l: 40, r: layered ? 62 : 8, t: 14, b: 16 };
  const X = j => pad.l + (W - pad.l - pad.r) * (n > 1 ? j / (n - 1) : 0.5), Y = v => pad.t + (H - pad.t - pad.b) * v / gmax;
  const ink = css('--ink'), soft = css('--ink-soft'), rule = css('--rule'), accent = css('--accent'), gold = css('--gold');
  // the axes
  g.fillStyle = soft; g.textAlign = 'right';
  g.fillText('g 0', pad.l - 3, Y(0)); g.fillText(String(+gmax.toPrecision(3)), pad.l - 3, Y(gmax));
  g.strokeStyle = rule; g.lineWidth = 1; g.strokeRect(pad.l - 0.5, pad.t - 4, W - pad.l - pad.r + 1, H - pad.t - pad.b + 8);
  // the iterations of IDA*: a line where one starts, with its threshold
  if (/idastar/.test(M.alg)) {
    g.textAlign = 'left';
    let it = -1, lastX = -1e9;
    ex.forEach((x, j) => {
      if (x.iter === it || j >= nx) return;
      it = x.iter;
      const near = X(j) - lastX < 34;
      if (!near) lastX = X(j);
      g.strokeStyle = gold; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(j), pad.t - 4); g.lineTo(X(j), H - pad.b + 4); g.stroke(); g.setLineDash([]);
      if (!near) { g.fillStyle = gold; g.fillText(x.thr !== null ? '≤ ' + fmt(x.thr) : '#' + (it + 1), X(j) + 2, pad.t - 8); }
    });
  }
  // the expansions, in the color of their worker
  const rad = n > 800 ? 1.4 : n > 200 ? 2 : 3;
  for (let j = 0; j < nx; j++) {
    const x = ex[j];
    g.fillStyle = M.workers > 1 ? WORKERS[x.w % WORKERS.length] : accent;
    g.globalAlpha = 0.75;
    g.fillRect(X(j) - rad, Y(x.g) - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
  // the solution path, once the search is over
  if (np > 0) {
    const keys = new Set(M.path.slice(0, np).map(q => q.key));
    g.fillStyle = gold;
    for (let j = 0; j < nx; j++) if (ex[j].key !== null && keys.has(ex[j].key)) { g.beginPath(); g.arc(X(j), Y(ex[j].g), rad + 1.5, 0, 7); g.fill(); }
  }
  // the current expansion
  if (nx > 0 && !np) {
    const x = ex[nx - 1];
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.arc(X(nx - 1), Y(x.g), rad + 4, 0, 7); g.stroke();
  }
  // the expansions at each depth, so far
  if (layered) {
    const mx = Math.max(1, ...hist.values()), x0 = W - pad.r + 6, bwid = pad.r - 10, bh = Math.max(1.5, Math.min(8, (H - pad.t - pad.b) / (gmax + 1) - 1));
    g.fillStyle = soft;
    for (const [d, c] of hist) g.fillRect(x0, Y(d) - bh / 2, Math.max(1, bwid * c / mx), bh);
    g.textAlign = 'left'; g.fillText(t('by g', 'per g'), x0, pad.t - 8);
  }
  g.textAlign = 'left'; g.fillStyle = soft;
  g.fillText(t('expansions in order →', 'espansioni in ordine →'), pad.l, H - 5);
  const w = WHY[M.why] ? WHY[M.why](M) : ['', ''];
  S.stat.textContent = t(`expanded ${nx} of ${M.kept} kept`, `espansi ${nx} dei ${M.kept} tenuti`) + (M.sampled ? t(` (${M.total} in the run)`, ` (${M.total} nell'esecuzione)`) : '')
    + (np ? t(' · gold: the states of the solution path', ' · in oro: gli stati del cammino soluzione') : '');
  S.cap.textContent = t(`Each square is a state expanded, from left to right in the order of the trace and lower the larger its g (its depth), in the color of its worker; the ring is the state of this event, the bars at the right count the states expanded at each g${/idastar/.test(M.alg) ? ', and a dashed line starts an iteration of IDA*, with its threshold on f' : ''}. The search tree is not drawn, since ${w[0]}; an id per expand event and the id of its parent (a field "parent") would let the page draw it.`,
    `Ogni quadratino è uno stato espanso, da sinistra a destra nell'ordine della traccia e più in basso quanto più grande è il suo g (la sua profondità), nel colore del suo worker; l'anello è lo stato di questo evento, le barre a destra contano gli stati espansi per ogni g${/idastar/.test(M.alg) ? ', e una linea tratteggiata apre un\'iterazione di IDA*, con la sua soglia su f' : ''}. L'albero di ricerca non è disegnato, perché ${w[1]}; un id per ogni evento expand e l'id del suo genitore (un campo "parent") permetterebbero alla pagina di disegnarlo.`);
}

// ---------------------------------------------------------------- planning graph
function planGraphPanel(box, tr) {
  const S = shell(box, 'pgraph'), inst = tr.header.instance, F = inst.fluents, goal = new Set(inst.goal);
  const lv = tr.events.map((e, i) => ({ e, i })).filter(q => q.e.type === 'level');
  const p = { el: S.fig, k: -1 };
  const NS = 'http://www.w3.org/2000/svg', mk = (n, a) => { const e = document.createElementNS(NS, n); for (const q in a) e.setAttribute(q, a[q]); return e; };
  p.draw = k => {
    p.k = k;
    const n = below(lv, k, q => q.i), cols = [{ x: inst.initial, g: 0 }].concat(lv.slice(0, n).map(q => ({ x: q.e.x, g: q.e.g, c: q.e.n })));
    const lw = 8 + Math.max(...F.map(f => f.length)) * 5.8, cw = 56, rh = 14, top = 34;
    const Wd = lw + cols.length * cw + 10, Hd = top + F.length * rh + 6;
    const svg = mk('svg', { class: 'pg', width: Wd, height: Hd, viewBox: `0 0 ${Wd} ${Hd}` });
    svg.style.width = Wd + 'px'; svg.style.height = Hd + 'px';
    F.forEach((f, r) => { const tx = mk('text', { x: lw - 6, y: top + r * rh + 4, class: 'pgf' + (goal.has(r) ? ' goal' : ''), 'text-anchor': 'end' }); tx.textContent = f; svg.append(tx); });
    cols.forEach((c, j) => {
      const x = lw + j * cw + cw / 2, on = new Set(c.x || []), now = j === cols.length - 1 && k > 0;
      if (now) svg.append(mk('rect', { x: x - cw / 2 + 4, y: top - 10, width: cw - 8, height: F.length * rh + 6, rx: 5, class: 'pgnow' }));
      const head = mk('text', { x, y: 11, class: 'pgh', 'text-anchor': 'middle' }); head.textContent = 'P' + c.g; svg.append(head);
      if (c.c) {
        const sub = mk('text', { x: x - cw / 2, y: 24, class: 'pgs', 'text-anchor': 'middle' });
        sub.textContent = `A${c.g - 1}:${c.c.actions}`; svg.append(sub);
        const ti = mk('title', {}); ti.textContent = t(`actions ${c.c.actions}, propositions ${c.c.propositions}, mutex pairs ${c.c.mutexes}`, `azioni ${c.c.actions}, proposizioni ${c.c.propositions}, coppie mutex ${c.c.mutexes}`); sub.append(ti);
      }
      F.forEach((f, r) => svg.append(mk('circle', { cx: x, cy: top + r * rh, r: 4.2, class: 'pgd' + (on.has(r) ? ' on' : '') + (on.has(r) && goal.has(r) ? ' goal' : '') })));
    });
    S.box.replaceChildren(svg);
    const c = cols[cols.length - 1].c;
    S.stat.textContent = c ? t(`level ${cols.length - 1}: ${c.propositions} propositions, ${c.actions} actions, ${c.mutexes} mutex pairs`, `livello ${cols.length - 1}: ${c.propositions} proposizioni, ${c.actions} azioni, ${c.mutexes} coppie mutex`)
      : t('level 0: the initial state', 'livello 0: lo stato iniziale');
    S.cap.textContent = t('GraphPlan builds no search tree but a planning graph, level by level: a column Pi is a level of propositions, a filled dot a fluent that can hold there (gold the fluents of the goal), and between two columns the count of the actions Ai that can run (with their mutex pairs, in the tooltip and the line below). Once every goal fluent appears with no mutex between them, the plan is extracted backward from the last level; the trace gives the counts of the actions and mutexes, not their lists.',
      'GraphPlan non costruisce un albero di ricerca ma un grafo di pianificazione, livello per livello: una colonna Pi è un livello di proposizioni, un punto pieno un fluente che lì può valere (in oro i fluenti dell\'obiettivo), e fra due colonne il numero delle azioni Ai che possono essere eseguite (con le loro coppie mutex, nel suggerimento e nella riga sotto). Quando ogni fluente dell\'obiettivo compare senza mutex fra loro, il piano si estrae all\'indietro dall\'ultimo livello; la traccia dà i numeri delle azioni e dei mutex, non i loro elenchi.');
  };
  return p;
}

// ---------------------------------------------------------------- AC-3
function domainsPanel(box, tr, rep) {
  const S = shell(box, 'doms'), inst = tr.header.instance, k = inst.colours.length, nv = inst.vertices.length;
  // the values left in all the domains after each event
  const gone = new Uint8Array(nv * k + 1), left = [];
  let n = nv * k;
  for (const e of tr.events) { for (const l of e.lits || []) if (l < 0 && !gone[-l]) { gone[-l] = 1; n--; } left.push(n); }
  const p = { el: S.fig, k: -1 };
  p.draw = kk => {
    p.k = kk;
    const { g, W, H } = canvasIn(S.box, 150), pad = { l: 8, r: 8, t: 8, b: 52 };
    const accent = css('--accent'), lilac = css('--accent-2'), ink = css('--ink'), soft = css('--ink-soft'), gold = css('--gold'), rule = css('--rule');
    const e = kk > 0 ? tr.events[kk - 1] : null, hot = new Set((e && e.lits || []).map(l => Math.floor((Math.abs(l) - 1) / k)));
    const bw = (W - pad.l - pad.r) / nv, bh = H - pad.t - pad.b;
    for (let v = 0; v < nv; v++) {
      let c = 0;
      for (let j = 0; j < k; j++) if (rep.val[v * k + j + 1] >= 0) c++;
      g.fillStyle = rule; g.fillRect(pad.l + v * bw + bw * 0.1, pad.t, bw * 0.8, bh);
      g.fillStyle = hot.has(v) ? ink : c === 1 ? gold : c === 0 ? (css('--tree-bad') || '#c0281e') : lilac;
      g.fillRect(pad.l + v * bw + bw * 0.1, pad.t + bh * (1 - c / k), bw * 0.8, bh * c / k);
    }
    // the values left in all, over the events
    const y0 = H - 40, sh = 30;
    g.fillStyle = soft; g.textAlign = 'left';
    const tot = nv * k, lo = Math.min(...left, tot);
    g.save(); g.translate(0, y0);
    series(g, W, sh, left.map(v => v - lo), kk, accent, tot - lo, { l: pad.l, r: pad.r, t: 2, b: 2 });
    g.restore();
    g.fillText(t('values left in all', 'valori rimasti in tutto'), pad.l, H - 5);
    const cur = kk > 0 ? left[kk - 1] : tot;
    S.stat.textContent = t(`values left ${cur} of ${tot} · solved variables gold`, `valori rimasti ${cur} su ${tot} · variabili risolte in oro`);
    S.cap.textContent = t('AC-3 makes no decision, so it builds no tree: it only removes the values that no value of a neighbor supports. A bar per variable, as tall as the values left in its domain (gold when one is left), ink for the domains this event shrinks, and under them the values left in all. The trace gives the values removed but not the arc (X, Y) that removed them, so the queue of arcs cannot be drawn; a field "arc" on each propagate event would allow it.',
      'AC-3 non prende decisioni, quindi non costruisce un albero: toglie soltanto i valori che nessun valore di un vicino sostiene. Una barra per variabile, alta quanto i valori rimasti nel suo dominio (in oro quando ne resta uno), color inchiostro per i domini che questo evento riduce, e sotto i valori rimasti in tutto. La traccia dà i valori tolti ma non l\'arco (X, Y) che li ha tolti, quindi la coda degli archi non si può disegnare; un campo "arc" su ogni evento propagate lo permetterebbe.');
  };
  return p;
}

// ---------------------------------------------------------------- local search
function localPanel(box, tr) {
  const S = shell(box, 'ltraj'), sr = localSeries(tr), p = { el: S.fig, k: -1 };
  const minc = sr && sr.kind === 'conflicted';
  p.draw = k => {
    p.k = k;
    S.cap.textContent = minc
      ? t('Min-conflicts keeps one complete assignment and changes one variable per step, so it builds no tree: the line is the number of variables in conflict after each step, as the trace gives it (none while the first assignment is being made), and the dot the current step.',
        'Min-conflicts tiene un solo assegnamento completo e cambia una variabile a ogni passo, quindi non costruisce un albero: la linea è il numero delle variabili in conflitto dopo ogni passo, come lo dà la traccia (nessuna mentre si fa il primo assegnamento), e il punto il passo corrente.')
      : t('WalkSAT keeps one complete assignment and flips one variable per step, so it builds no tree: the line is the number of clauses of the CNF left unsatisfied after each flip (each distinct clause counted once), computed in the page from the assignment of the trace, and the dot the current step.',
        'WalkSAT tiene un solo assegnamento completo e inverte una variabile a ogni passo, quindi non costruisce un albero: la linea è il numero delle clausole della CNF lasciate insoddisfatte dopo ogni inversione (ogni clausola distinta contata una volta), calcolato nella pagina dall\'assegnamento della traccia, e il punto il passo corrente.');
    if (!sr) { S.stat.textContent = ''; return; }
    const { g, W, H } = canvasIn(S.box, 120), pad = { l: 34, r: 10, t: 10, b: 16 };
    const ymax = Math.max(1, ...sr.y.filter(v => v !== null));
    g.strokeStyle = css('--rule'); g.lineWidth = 1; g.strokeRect(pad.l - 0.5, pad.t - 0.5, W - pad.l - pad.r + 1, H - pad.t - pad.b + 1);
    g.fillStyle = css('--ink-soft'); g.textAlign = 'right';
    g.fillText(String(ymax), pad.l - 4, pad.t); g.fillText('0', pad.l - 4, H - pad.b);
    g.textAlign = 'left'; g.fillText(t('steps →', 'passi →'), pad.l, H - 4);
    const lastPt = series(g, W, H, sr.y, k, css('--accent'), ymax, pad);
    let v = null;
    for (let i = Math.min(k, sr.y.length) - 1; i >= 0; i--) if (sr.y[i] !== null) { v = sr.y[i]; break; }
    if (lastPt) { g.fillStyle = css('--ink'); g.beginPath(); g.arc(lastPt[0], lastPt[1], 4, 0, 7); g.fill(); }
    S.stat.textContent = v === null ? t('the first assignment is not complete yet', 'il primo assegnamento non è ancora completo')
      : minc ? t(`variables in conflict ${v}`, `variabili in conflitto ${v}`) : t(`unsatisfied clauses ${v}`, `clausole insoddisfatte ${v}`);
  };
  return p;
}

// ---------------------------------------------------------------- MILP bound
function boundPanel(box, tr) {
  const S = shell(box, 'btraj'), ev = tr.events, p = { el: S.fig, k: -1 };
  const lb = ev.map(e => (typeof e.lb === 'number' ? e.lb : null)), ub = ev.map(e => (typeof e.ub === 'number' ? e.ub : null));
  const all = lb.concat(ub).filter(v => v !== null), lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  p.draw = k => {
    p.k = k;
    const { g, W, H } = canvasIn(S.box, 120), pad = { l: 34, r: 10, t: 10, b: 16 };
    g.strokeStyle = css('--rule'); g.lineWidth = 1; g.strokeRect(pad.l - 0.5, pad.t - 0.5, W - pad.l - pad.r + 1, H - pad.t - pad.b + 1);
    g.fillStyle = css('--ink-soft'); g.textAlign = 'right';
    g.fillText(String(fmt(hi)), pad.l - 4, pad.t); g.fillText(String(fmt(lo)), pad.l - 4, H - pad.b);
    g.textAlign = 'left'; g.fillText(t('events →', 'eventi →'), pad.l, H - 4);
    series(g, W, H, ub.map(v => (v === null ? null : v - lo)), k, css('--gold'), hi - lo, pad);
    series(g, W, H, lb.map(v => (v === null ? null : v - lo)), k, css('--accent'), hi - lo, pad, [4, 3]);
    S.stat.textContent = '';
    S.cap.textContent = t('HiGHS reports no tree through its callback, only its bound (dashed, from below) and its incumbent (gold, from above); the two lines close on the optimum.',
      'HiGHS non riporta un albero attraverso la sua callback, ma solo il suo bound (tratteggiato, dal basso) e la miglior soluzione (in oro, dall\'alto); le due linee si chiudono sull\'ottimo.');
  };
  return p;
}

// the panel of a lane, in the element panel, or null for a lane drawn
// elsewhere (the tree of a branch-and-bound, by tree.js)
export function makePanel(panel, tr, rep) {
  const h = tr.header, pd = h.solver.paradigm, cfg = h.solver.config;
  let p = null;
  if (pd === 'heuristic search') p = cfg && cfg.algorithm === 'graphplan' ? planGraphPanel(panel, tr) : searchPanel(panel, tr);
  else if (pd === 'local search') p = localPanel(panel, tr);
  else if (pd === 'milp') p = boundPanel(panel, tr);
  else if (pd === 'csp' && cfg === 'ac3') p = domainsPanel(panel, tr, rep);
  else if (pd === 'csp' || pd === 'sat') p = decisionPanel(panel, tr);
  // a CSP or SAT lane may also show its constraint or implication graph (graphs.js)
  if (p && (pd === 'csp' || pd === 'sat')) p = withGraph(panel, p, tr, rep);
  if (p) {
    LIVE.add(p);
    // a lane that changes width (the window, the number of lanes) draws again
    let w = 0;
    new ResizeObserver(() => { const b = p.el.querySelector('.sbox'), nw = b ? b.clientWidth : 0; if (nw && nw !== w) { w = nw; if (p.k >= 0) p.draw(p.k); } }).observe(p.el);
  }
  return p;
}
