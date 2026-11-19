// The mode "predict" of the arena and of the two-player games (the level
// "responding" of the taxonomy of engagement of Naps et al., 2002): when it
// is on, Step (and Play) halts each lane on the state before the event it is
// about to apply and asks the reader a question about that event, with 2 to
// 4 choices drawn from the trace; the answer is marked right or wrong, with
// the reason in one line, and then the event is applied. A question is asked
// only when the trace and what the page shows settle its answer exactly
// (the next state of A* by f, the value a propagation rules out, the
// variable that MRV picks, a node pruned by its bound, the value a node of
// minimax backs up, a cutoff of alpha-beta, the move finally chosen); other
// events pass without one. Each lane keeps its score, right over asked.

import { bi } from '../i18n.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const B = ([en, it]) => bi(esc(en), esc(it));
// a fixed shuffle of the choices, so that the answer has no fixed place
const shuffle = (a, seed) => {
  a = a.slice();
  let s = (seed * 2654435761) >>> 0;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ---------------------------------------------------------------- the toggle and the boxes
export class Predict {
  // host: the element of the controls where the checkbox goes
  constructor(host) {
    this.on = false;
    this.pend = new Map();   // lane -> { q, apply }
    const lab = document.createElement('label');
    lab.className = 'predictopt';
    lab.innerHTML = `<input type="checkbox" id="predict"><span>${bi('predict', 'prevedi')}</span>`;
    host.append(lab);
    this.box = lab.querySelector('input');
    this.box.onchange = () => {
      this.on = this.box.checked;
      document.body.classList.toggle('predicting', this.on);
      if (!this.on) for (const L of [...this.pend.keys()]) this.answer(L, -1);
      if (this.onToggle) this.onToggle(this.on);
    };
  }
  // the box of the questions of a lane, at the top of its panel
  attach(L, panel, note) {
    const d = document.createElement('div');
    d.className = 'pq';
    d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<p class="pqs"></p><p class="pqq"></p><div class="pqc"></div><p class="pqr"></p>`;
    panel.prepend(d);
    L.pq = { el: d, right: 0, asked: 0, note };
    this.score(L);
  }
  score(L) {
    const p = L.pq;
    if (!p) return;
    p.el.querySelector('.pqs').innerHTML = p.note && !p.asked
      ? B(p.note)
      : bi(`predictions right: <b>${p.right} / ${p.asked}</b>`, `previsioni giuste: <b>${p.right} / ${p.asked}</b>`);
  }
  pending(L) { return this.pend.get(L); }
  // asks q in lane L; apply() is called once it is answered (or dropped)
  pose(L, q, seed, apply) {
    const p = L.pq;
    if (!p) { apply(); return; }
    this.pend.set(L, { q, apply, k: seed });
    p.el.classList.add('asking');
    p.el.classList.remove('right', 'wrong');
    p.el.querySelector('.pqq').innerHTML = B(q.q);
    p.el.querySelector('.pqr').innerHTML = '';
    const cs = shuffle(q.choices, seed);
    const box = p.el.querySelector('.pqc');
    box.innerHTML = cs.map((c, i) => `<button type="button" data-i="${i}">${B(c.label)}</button>`).join('');
    box.querySelectorAll('button').forEach((b, i) => { b.onclick = () => this.answer(L, i, cs); });
  }
  // the reader picks choice i (-1: the question is dropped, unscored)
  answer(L, i, cs) {
    const pd = this.pend.get(L);
    if (!pd) return;
    this.pend.delete(L);
    const p = L.pq, el = p.el;
    el.classList.remove('asking');
    if (i >= 0) {
      const ok = cs[i].right;
      p.asked++; if (ok) p.right++;
      el.classList.add(ok ? 'right' : 'wrong');
      el.querySelectorAll('.pqc button').forEach((b, j) => {
        b.disabled = true;
        if (cs[j].right) b.classList.add('ok');
        else if (j === i) b.classList.add('no');
      });
      el.querySelector('.pqr').innerHTML = (ok ? bi('Right. ', 'Giusto. ') : bi('Not this one. ', 'Non è questa. ')) + B(pd.q.why);
    } else {
      el.querySelector('.pqq').innerHTML = '';
      el.querySelector('.pqc').innerHTML = '';
      el.querySelector('.pqr').innerHTML = '';
      el.classList.remove('right', 'wrong');
    }
    this.score(L);
    pd.apply();
  }
  // drops the question of a lane, if any, without scoring it
  drop(L) { if (this.pend.has(L)) this.answer(L, -1); }
  clear(L) {   // forgets the last verdict, for a lane that moves on
    if (!L.pq || this.pend.has(L)) return;
    const el = L.pq.el;
    el.classList.remove('right', 'wrong');
    for (const s of ['.pqq', '.pqc', '.pqr']) el.querySelector(s).innerHTML = '';
  }
}

// ---------------------------------------------------------------- the questions of the arena
const litName = (sym, l) => {
  const s = sym[Math.abs(l) - 1] || String(Math.abs(l)), i = s.lastIndexOf('_');
  return i < 0 ? s : s.slice(0, i) + ' = ' + s.slice(i + 1);
};
// a choice
const C = (en, it, right) => ({ label: [en, it], right: !!right });

// why the solvers of the arena cannot be asked about, or null (tr a trace)
export function arenaNote(tr) {
  const h = tr.header, id = String(h.solver.id || '').replace(/-\d+$/, ''), alg = h.solver.config && h.solver.config.algorithm;
  if (id === 'aima-minconf' || id === 'aima-walksat') return ['no questions in this lane: a local search picks its variable at random', 'nessuna domanda in questa corsia: una ricerca locale sceglie la sua variabile a caso'];
  if (id === 'highs') return ['no questions in this lane: the trace of HiGHS has only its bounds', 'nessuna domanda in questa corsia: la traccia di HiGHS ha solo i suoi bound'];
  if (h.solver.paradigm !== 'heuristic search') return null;
  if (h.workers > 1) return ['no questions in this lane: each worker pops from its own frontier, which the page does not show', 'nessuna domanda in questa corsia: ogni worker estrae dalla sua frontiera, che la pagina non mostra'];
  if (h.game === 'romania' && /^(astar|ucs|greedy)$/.test(alg)) return null;
  if (alg === 'astar' && tr.events.some(e => e.frontier)) return null;
  return ['no questions in this lane: the page does not show what settles its next step', 'nessuna domanda in questa corsia: la pagina non mostra ciò che decide il suo prossimo passo'];
}

// the question about event e of lane L, whose replay stands just before it,
// or null; game is the data-game of the page
export function arenaQuestion(L, e, game) {
  if (!e) return null;
  const h = L.tr.header, rep = L.rep;
  if (h.solver.paradigm === 'heuristic search') return searchQ(L, e, game);
  if (e.type === 'node') return nodeQ(e);
  if (!rep.val) return null;
  const id = String(h.solver.id || '').replace(/-\d+$/, ''), sym = h.encoding ? h.encoding.symbols : [];
  if (e.type === 'propagate' && !/^(given|random start|pure)$/.test(e.reason || '')) return propQ(rep, e, sym, id);
  if (e.type === 'decide' && /^aima-bt-/.test(id) && e.lit > 0) return mrvQ(rep, e, sym);
  return null;
}

// which value a propagation rules out (or sets)
function propQ(rep, e, sym, id) {
  const lits = e.lits || [], touched = new Set(lits.map(Math.abs)), k = rep.k, val = rep.val;
  const open = l => l >= 1 && l < val.length && val[l] === 0;
  const neg = lits.filter(l => l < 0 && open(-l)), pos = lits.filter(l => l > 0 && open(l));
  let ans, others, en, it;
  const why = {
    'aima-bt-fc': ['forward checking removes, from each unassigned neighbor of the variable just set, the values in conflict with it; the other choices stay possible.', 'il forward checking toglie, a ogni vicino non assegnato della variabile appena fissata, i valori in conflitto con essa; le altre scelte restano possibili.'],
    'aima-bt-mac': ['MAC runs AC-3 from the arcs into the variable just set, and drops each value with no compatible value left at the other end of an arc; the other choices keep one.', 'MAC esegue AC-3 a partire dagli archi verso la variabile appena fissata, e toglie ogni valore che non ha più un valore compatibile all\'altro capo di un arco; le altre scelte ne hanno ancora uno.'],
    'aima-ac3': ['REVISE drops a value when no value of the other end of the arc is compatible with it; the other choices still have one.', 'REVISE toglie un valore quando nessun valore dell\'altro capo dell\'arco è compatibile con esso; le altre scelte ne hanno ancora uno.'],
    'aima-gac': ['GAC keeps a value only if some tuple of the constraint that satisfies it remains; the other choices still have one.', 'GAC tiene un valore solo se resta una tupla del vincolo che lo soddisfa; le altre scelte ne hanno ancora una.'] }[id]
    || ['a clause whose other literals are all false forces its last literal (unit propagation); no clause forces the other choices yet.', 'una clausola con tutti gli altri letterali falsi impone il suo ultimo letterale (propagazione unitaria); nessuna clausola impone ancora le altre scelte.'];
  const v = l => Math.floor((Math.abs(l) - 1) / k);
  // values that stay open after the event, first those of the variables it touches
  const stay = () => {
    const vs = [...new Set(lits.map(v))], out = [];
    for (const x of vs) for (let j = 0; j < k; j++) { const l = x * k + j + 1; if (open(l) && !touched.has(l)) out.push(l); }
    return out;
  };
  if (neg.length) {
    ans = -neg[0]; others = stay();
    en = 'The solver propagates now. Which of these values does it rule out?'; it = 'Il solutore ora propaga. Quale di questi valori esclude?';
  } else if (pos.length) {
    ans = pos[0]; others = [];
    for (let j = 0; j < k; j++) { const l = v(ans) * k + j + 1; if (l !== ans && open(l) && !lits.includes(l)) others.push(l); }
    en = 'The solver propagates now. Which value does it set?'; it = 'Il solutore ora propaga. Quale valore fissa?';
  } else return null;
  if (!others.length) return null;
  const pick = others.slice(0, 3);
  const choices = [C(litName(sym, ans), litName(sym, ans), true), ...pick.map(l => C(litName(sym, l), litName(sym, l), false))];
  const a = litName(sym, ans);
  return { q: [en, it], choices, why: [`${neg.length ? 'It rules out' : 'It sets'} ${a}: ${why[0]}`, `${neg.length ? 'Esclude' : 'Fissa'} ${a}: ${why[1]}`] };
}

// which variable MRV picks: the chosen one and unassigned ones with strictly more values left
function mrvQ(rep, e, sym) {
  const k = rep.k, val = rep.val, n = Math.floor((val.length - 1) / k);
  const left = x => { let c = 0; for (let j = 0; j < k; j++) if (val[x * k + j + 1] >= 0) c++; return c; };
  const done = new Set(rep.decs.map(d => Math.floor((Math.abs(d.lit) - 1) / k)));
  const v = Math.floor((e.lit - 1) / k), lv = left(v);
  if (done.has(v) || lv < 1) return null;
  const cand = [];
  for (let x = 0; x < n; x++) if (x !== v && !done.has(x)) {
    const c = left(x);
    if (c < lv) return null;           // the trace does not follow MRV here as the page shows it
    if (c > lv) cand.push([x, c]);
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const pick = [cand[0], cand[Math.floor(cand.length / 2)], cand.at(-1)].filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i).slice(0, 3);
  const name = x => rep.verts[x];
  const lab = (x, c) => C(`${name(x)} (${c} value${c > 1 ? 's' : ''} left)`, `${name(x)} (${c} valor${c > 1 ? 'i' : 'e'} rimast${c > 1 ? 'i' : 'o'})`, x === v);
  return { q: ['Which variable does SELECT-UNASSIGNED-VARIABLE pick next, by MRV?', 'Quale variabile sceglie ora SELECT-UNASSIGNED-VARIABLE, con MRV?'],
    choices: [lab(v, lv), ...pick.map(([x, c]) => lab(x, c))],
    why: [`${name(v)}: MRV picks an unassigned variable with the fewest values left (${lv}), and the others offered have more.`,
      `${name(v)}: MRV sceglie una variabile non assegnata con il minor numero di valori rimasti (${lv}), e le altre proposte ne hanno di più.`] };
}

// a node of the branch and bound of the knapsack: pruned by its bound or not
function nodeQ(e) {
  if (typeof e.bound !== 'number' || typeof e.ub !== 'number' || !/^(pruned|branched)$/.test(e.status)) return null;
  const le = e.bound <= e.ub + 1e-9;
  if (le !== (e.status === 'pruned')) return null;   // another worker's incumbent decided it
  const b = +e.bound.toFixed(1), u = +e.ub.toFixed(1);
  return { q: [`A node at depth ${e.depth} has bound ${b}, and the incumbent is ${u}. Is the node pruned?`,
    `Un nodo alla profondità ${e.depth} ha bound ${b}, e la miglior soluzione vale ${u}. Il nodo viene potato?`],
    choices: [C('yes, pruned', 'sì, potato', le), C('no, branched on', 'no, si ramifica', !le)],
    why: le ? [`its bound ${b} does not beat the incumbent ${u}, so nothing below it can be better.`, `il suo bound ${b} non supera la miglior soluzione ${u}, quindi nulla sotto di esso può essere migliore.`]
      : [`its bound ${b} beats the incumbent ${u}, so a better solution may lie below it.`, `il suo bound ${b} supera la miglior soluzione ${u}, quindi sotto di esso può esserci una soluzione migliore.`] };
}

// the searches: the f of the next state of A* from the strip of the
// frontier, or the next city of Romania from the map
function searchQ(L, e, game) {
  if (e.type !== 'expand') return null;
  const h = L.tr.header, rep = L.rep, alg = h.solver.config && h.solver.config.algorithm;
  if (h.workers > 1) return null;
  if (game === 'romania') return romaniaQ(L, e, alg);
  if (alg !== 'astar' || !rep.frontier || !rep.last || rep.last.type !== 'expand') return null;
  if (e.n.expanded !== rep.last.n.expanded + 1) return null;
  const fs = [...new Set(rep.frontier.filter(([, c]) => c > 0).map(([f]) => f))].sort((a, b) => a - b);
  if (fs.length < 2 || fs[0] !== e.f) return null;
  const ch = fs.slice(0, 4);
  return { q: ['The strip shows the frontier by f. What is the f of the state that A* expands next?', 'La striscia mostra la frontiera per f. Quanto vale f dello stato che A* espande ora?'],
    choices: ch.map(f => C(`f = ${f}`, `f = ${f}`, f === e.f)),
    why: [`f = ${e.f}: A* pops from the frontier a state of least f = g + h.`, `f = ${e.f}: A* estrae dalla frontiera uno stato di f = g + h minima.`] };
}
// the frontier of best-first graph search on the map, from the cities
// expanded so far: g by the roads, h the straight-line distance (as
// aima-python computes it from the coordinates), f by the algorithm
function romaniaQ(L, e, alg) {
  if (!/^(astar|ucs|greedy)$/.test(alg)) return null;
  const inst = L.tr.header.instance, nodes = inst.nodes, goal = inst.goal;
  const hOf = c => Math.trunc(Math.hypot(nodes[c][0] - nodes[goal][0], nodes[c][1] - nodes[goal][1]));
  const adj = new Map();
  for (const [a, b, w] of inst.edges) { (adj.get(a) || adj.set(a, []).get(a)).push([b, w]); (adj.get(b) || adj.set(b, []).get(b)).push([a, w]); }
  const city = x => Object.entries(x.set || {}).find(([, v]) => v[0] === 'e');
  const done = new Map(), front = new Map();
  for (let i = 0; i < L.rep.pos; i++) {
    const x = L.tr.events[i];
    if (x.type !== 'expand') continue;
    const c = city(x); if (!c) return null;
    done.set(c[0], x.g); front.delete(c[0]);
    for (const [d, w] of adj.get(c[0]) || []) if (!done.has(d)) { const g = x.g + w; if (!front.has(d) || g < front.get(d)) front.set(d, g); }
  }
  const c = city(e); if (!c || !front.has(c[0])) return null;
  const key = (d, g) => (alg === 'ucs' ? g : alg === 'greedy' ? hOf(d) : g + hOf(d));
  const all = [...front].map(([d, g]) => ({ d, g, h: hOf(d), f: key(d, g) })).sort((a, b) => a.f - b.f);
  const ans = all.find(x => x.d === c[0]);
  if (ans.f !== key(c[0], e.g) || all[0].d !== ans.d || (all[1] && all[1].f === ans.f)) return null;
  const rest = all.filter(x => x.d !== ans.d).slice(0, 3);
  if (!rest.length) return null;
  const nm = { astar: 'A*', ucs: ['uniform-cost search', 'la ricerca a costo uniforme'], greedy: ['greedy best-first search', 'la ricerca greedy'] }[alg];
  const N = Array.isArray(nm) ? nm : [nm, nm];
  const lab = x => (alg === 'ucs' ? `${x.d}, g = ${x.g}` : alg === 'greedy' ? `${x.d}, h = ${x.h}` : `${x.d}, f = ${x.g} + ${x.h} = ${x.f}`);
  const what = alg === 'ucs' ? ['least g, the length of road from Arad', 'g minima, la strada percorsa da Arad'] : alg === 'greedy' ? ['least h, the straight-line distance to Bucharest', 'h minima, la distanza in linea d\'aria da Bucarest']
    : ['least f = g + h, road so far plus straight-line distance to Bucharest', 'f = g + h minima, strada percorsa più distanza in linea d\'aria da Bucarest'];
  return { q: [`Which city of the frontier does ${N[0]} expand next?`, `Quale città della frontiera espande ora ${N[1]}?`],
    choices: [ans, ...rest].map(x => C(lab(x), lab(x), x === ans)),
    why: [`${ans.d}: it has the ${what[0]}.`, `${ans.d}: ha ${what[1]}.`] };
}

// ---------------------------------------------------------------- the two-player games
const fmtv = v => (v === Infinity ? '+∞' : v === -Infinity ? '−∞' : v > 0 ? '+' + v : v < 0 ? '−' + -v : '0');
// the question about event k of a replay R of aima.games, standing at k - 1
export function gameQuestion(R, k, cellName, c4) {
  const e = R.events[k];
  if (!e || k < 1) return null;
  // a move or a node in words: a cell of tic-tac-toe, a column of connect four
  const N2 = m => (c4 ? [`column ${m[1]}`, `colonna ${m[1]}`] : [cellName(false, m), cellName(false, m)]);
  const nm = m => N2(m)[0], nmi = m => N2(m)[1];
  if (R.kind === 'mcts') {
    if (e.type !== 'choose') return null;
    const ch = e.children.slice().sort((a, b) => b[2] - a[2]);
    if (ch.length < 2 || ch[0][2] === ch[1][2]) return null;
    const pick = ch.slice(0, 4);
    return { q: ['The iterations are over. Which move does Monte Carlo tree search play?', 'Le iterazioni sono finite. Quale mossa gioca la ricerca Monte Carlo?'],
      choices: pick.map(c => C(`${nm(c[1])} (${c[2]} visits)`, `${nmi(c[1])} (${c[2]} visite)`, c === ch[0])),
      why: [`${nm(ch[0][1])}: the move with the most playouts, ${ch[0][2]}.`, `${nmi(ch[0][1])}: la mossa con più simulazioni, ${ch[0][2]}.`] };
  }
  const N = R.nodes;
  if (e.type === 'choose') {
    const kids = N.get(0).kids.map(id => N.get(id)).filter(n => n.t1 < k);
    const best = Math.max(...kids.map(n => n.v)), top = kids.filter(n => n.v === best);
    if (kids.length < 2 || top.length !== 1 || !same(top[0].move, e.move)) return null;
    const pick = [top[0], ...kids.filter(n => n !== top[0]).slice(0, 3)];
    return { q: ['Every move of the root has its value. Which move is chosen?', 'Ogni mossa della radice ha il suo valore. Quale mossa viene scelta?'],
      choices: pick.map(n => C(`${nm(n.move)} (${fmtv(n.v)})`, `${nmi(n.move)} (${fmtv(n.v)})`, n === top[0])),
      why: [`${nm(top[0].move)}: the move of greatest value for the side to move, ${fmtv(best)}.`, `${nmi(top[0].move)}: la mossa di valore massimo per chi muove, ${fmtv(best)}.`] };
  }
  // a cutoff of alpha-beta: after a child of P returns, does P stop?
  const prev = R.events[k - 1];
  if (R.ab && prev && (prev.type === 'value' || prev.type === 'leaf')) {
    const c = N.get(prev.id), P = c && N.get(c.parent);
    if (P && P.id !== 0) {
      const cut = e.type === 'value' && e.id === P.id && P.pruned && P.pruned.length;
      const next = e.type === 'enter' || e.type === 'leaf' ? N.get(e.id) : null;
      const goesOn = next && next.parent === P.id;
      if (cut || goesOn) {
        const v = R.bound(P, k - 1), lim = P.max ? P.beta : P.alpha, test = P.max ? v >= lim : v <= lim;
        if (test === !!cut && isFinite(lim)) {
          const who = P.max ? ['MAX', 'β', '≥'] : ['MIN', 'α', '≤'];
          return { q: [`A child of the ${who[0]} node ${c4 ? 'in' : 'at'} ${nm(P.move)} (depth ${P.depth}) returns ${fmtv(c.v)}; the node's ${who[1]} is ${fmtv(lim)}. Does alpha-beta prune the moves left?`,
            `Un figlio del nodo ${who[0]} ${c4 ? 'nella' : 'in'} ${nmi(P.move)} (profondità ${P.depth}) riporta ${fmtv(c.v)}; ${who[1]} del nodo vale ${fmtv(lim)}. Alfa-beta pota le mosse rimaste?`],
            choices: [C('yes, prune them', 'sì, le pota', cut), C('no, try the next move', 'no, prova la mossa successiva', !cut)],
            why: cut ? [`v = ${fmtv(v)} ${who[2]} ${who[1]} = ${fmtv(lim)}: the player above would never let the game come here.`, `v = ${fmtv(v)} ${who[2]} ${who[1]} = ${fmtv(lim)}: il giocatore sopra non lascerebbe mai arrivare qui la partita.`]
              : [`v = ${fmtv(v)} is not ${who[2]} ${who[1]} = ${fmtv(lim)}, so the node may still matter and the search goes on.`, `v = ${fmtv(v)} non è ${who[2]} ${who[1]} = ${fmtv(lim)}, quindi il nodo può ancora contare e la ricerca prosegue.`] };
        }
      }
    }
  }
  // the value a node backs up, from its children done
  if (e.type === 'value' && !(R.ab && N.get(e.id).pruned)) {
    const n = N.get(e.id), kids = n.kids.map(id => N.get(id)).filter(c => c.t1 < k);
    if (!kids.length) return null;
    const v = R.bound(n, k - 1);
    if (v !== n.v) return null;
    const vals = [...new Set([...kids.map(c => c.v), ...(c4 ? [] : [-1, 0, 1])])].sort((a, b) => a - b);
    if (vals.length < 2) return null;
    const pick = vals.length > 4 ? [...new Set([v, vals[0], vals.at(-1), vals[1]])] : vals;
    return { q: [`Every child of the ${n.max ? 'MAX' : 'MIN'} node ${c4 ? 'in' : 'at'} ${nm(n.move)} (depth ${n.depth}) is done. Which value does it back up?`,
      `Ogni figlio del nodo ${n.max ? 'MAX' : 'MIN'} ${c4 ? 'nella' : 'in'} ${nmi(n.move)} (profondità ${n.depth}) è concluso. Quale valore riporta?`],
      choices: pick.sort((a, b) => a - b).map(x => C(fmtv(x), fmtv(x), x === v)),
      why: [`${fmtv(v)}: a ${n.max ? 'MAX node takes the largest' : 'MIN node takes the smallest'} value of its children.`,
        `${fmtv(v)}: un nodo ${n.max ? 'MAX prende il valore massimo' : 'MIN prende il valore minimo'} dei suoi figli.`] };
  }
  return null;
}
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
export const gameNote = R => (R.kind === 'mcts' ? ['questions only on the final choice: the iterations follow random playouts', 'domande solo sulla scelta finale: le iterazioni seguono simulazioni casuali'] : null);
