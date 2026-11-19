// The permutation puzzles played in the lane "You" (play.js): the pancakes,
// on PancakeView of stacks.js, whose flip and spatula the moves of the reader
// reuse, and TopSpin, on TopSpinView. A click on a pancake slides the spatula
// under it and flips it with all the pancakes above; on TopSpin a click on a
// token outside the turnstile turns the ring to bring it in, and a click on
// a token inside reverses the tokens there. The gold ticks and bars are the
// gaps and the breakpoints of the heuristic, as in the other lanes. The end
// is compared with the cost of the solutions that the searches proved
// optimal (optimum() and against(), which the Towers of Hanoi and the cube
// use as well).

import * as THREE from 'three';
import { PancakeView, TopSpinView } from './stacks.js';
import { names, pathHint, pathReplay } from './play.js';

const gaps = x => x.reduce((s, v, p) => s + (Math.abs(v - (p + 1 < x.length ? x[p + 1] : x.length)) !== 1 ? 1 : 0), 0);
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const plural = (k, one, many) => (k === 1 ? one : many);

// the least cost of a solution that a search proved optimal, and by whom
export function optimum(ctx) {
  let best = null;
  for (const L of ctx.results()) {
    const r = L.result;
    if (!r || r.status !== 'optimal' || typeof r.cost !== 'number') continue;
    if (!best || r.cost < best.cost) best = { cost: r.cost, by: [L.name] };
    else if (r.cost === best.cost && !best.by.includes(L.name)) best.by.push(L.name);
  }
  return best;
}
// a solution of n moves against the optimum opt, u the names of the moves
// [en one, en many, it one, it many]
export function against(n, opt, u) {
  if (!opt) return ['No lane holds a solution proved optimal to compare with.', 'Nessuna corsia ha una soluzione dimostrata ottima con cui confrontarla.'];
  if (n <= opt.cost) return [`It is the optimum, which ${names(opt.by, 'and')} found.`, `È l'ottimo, trovato da ${names(opt.by, 'e')}.`];
  return [`The optimum, which ${names(opt.by, 'and')} found, is ${opt.cost} ${plural(opt.cost, u[0], u[1])}: ${n - opt.cost} more than needed.`,
    `L'ottimo, trovato da ${names(opt.by, 'e')}, è di ${opt.cost} ${plural(opt.cost, u[2], u[3])}: ${n - opt.cost} in più del necessario.`];
}

export class PancakePlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.N = inst.start.length; this.ctx = ctx;
    this.view = new PancakeView(box, inst);
    // a lower camera than in the other lanes, so that a small pancake under
    // a larger one still shows a band of its side to click
    this.view.S.aim([0, -2.5, 0.45], [0, 0, 0.29]);
    this.view.items.forEach((it, tok) => { it.m.userData.play = tok; });
    // PancakeView builds again on a change of theme: the picks go with it
    const build = this.view.build.bind(this.view);
    this.view.build = () => { build(); this.view.items.forEach((it, tok) => { it.m.userData.play = tok; }); };
    this.moveName = ['flips', 'ribaltamenti'];
    this.help = ['A click on a pancake slides the spatula under it and flips it with all those above; the arrow keys move the spatula and Enter flips.',
      'Un clic su una frittella vi infila sotto la spatola e la ribalta insieme a tutte quelle sopra; le frecce spostano la spatola e Invio ribalta.'];
  }
  reset() {
    this.x = this.inst.start.slice(); this.before = null; this.cur = null; this.flips = 0;
    this.hover(null);
    this.view.show(this.x, null);
  }
  counters() { return [['gaps', 'salti', gaps(this.x)]]; }
  targets() { return this.view.items.map(it => it.m); }
  // the pancake picked, and the flip of the pancakes from the top down to it
  actionAt(tok) { return { k: this.x.indexOf(tok) + 1 }; }
  // points on the front of the pancake at position k - 1, as PancakeView sizes it
  where(a) {
    const [, z] = this.view.at(a.k - 1), r = 0.06 + 0.36 * (this.x[a.k - 1] + 1) / this.N;
    return [-0.6, -0.3, 0, 0.3, 0.6].flatMap(f => [0.45, 0.2, -0.2, -0.4].map(h => new THREE.Vector3(f * r, -Math.sqrt(1 - f * f) * r * 0.99, z + h * this.view.dh)));
  }
  // the least cost of a solution that a search proved optimal, and by whom
  optimum() { return optimum(this.ctx); }
  act({ k }) {
    const N = this.N;
    if (!(k >= 1 && k <= N)) return null;
    if (k === 1) return { say: ['Flipping the top pancake alone changes nothing: slide the spatula under a lower one.',
      'Ribaltare da sola la frittella in cima non cambia niente: infila la spatola sotto una più in basso.'] };
    const g0 = gaps(this.x), prev = this.x;
    this.x = [...prev.slice(0, k).reverse(), ...prev.slice(k)];
    const back = same(this.x, this.before);
    this.before = prev;
    this.hover(null);
    this.view.show(this.x, null);
    const g = gaps(this.x), d = g - g0;
    const dg = d < 0 ? [plural(-d, 'one gap fewer', `${-d} gaps fewer`), plural(-d, 'un salto in meno', `${-d} salti in meno`)]
      : d > 0 ? [plural(d, 'one gap more', `${d} gaps more`), plural(d, 'un salto in più', `${d} salti in più`)]
      : ['as many gaps as before', 'tanti salti quanti prima'];
    const opt = this.optimum(), done = this.x.every((v, i) => v === i), n = ++this.flips;
    if (done) {
      const cmp = !opt ? ['No lane holds a solution proved optimal to compare with.', 'Nessuna corsia ha una soluzione dimostrata ottima con cui confrontarla.']
        : n === opt.cost ? [`It is the optimum, which ${names(opt.by, 'and')} found.`, `È l'ottimo, trovato da ${names(opt.by, 'e')}.`]
        : [`The optimum, which ${names(opt.by, 'and')} found, is ${opt.cost} flips: ${n - opt.cost} more than needed.`,
          `L'ottimo, trovato da ${names(opt.by, 'e')}, è di ${opt.cost} ribaltamenti: ${n - opt.cost} in più del necessario.`];
      return { moved: true, mistake: back, solved: true, say: [`Sorted in ${n} ${plural(n, 'flip', 'flips')}. ${cmp[0]}`, `Ordinata in ${n} ${plural(n, 'ribaltamento', 'ribaltamenti')}. ${cmp[1]}`] };
    }
    const say = back
      ? [`You flip the top ${k} pancakes, which undoes the flip before: the stack is back where it was.`,
        `Ribalti le ${k} frittelle in cima, e questo annulla il ribaltamento di prima: la pila torna com'era.`]
      : [`You flip the top ${k} pancakes: ${dg[0]}, ${g} left (gold ticks).`, `Ribalti le ${k} frittelle in cima: ${dg[1]}, ne restano ${g} (tacche dorate).`];
    if (opt && n >= opt.cost) {
      say[0] += ` The optimum is ${opt.cost} flips.`;
      say[1] += ` L'ottimo è di ${opt.cost} ribaltamenti.`;
    }
    return { moved: true, mistake: back, say };
  }
  // the flip that a would make: the spatula peeks in under the pancake, the
  // block above it lit
  hover(a) {
    const v = this.view, P = v.S.colors;
    this.over = a && a.k >= 2 ? a : null;
    // the flip of a hint, while the pointer shows no other
    const o = this.over || this.hl;
    const tint = P.gold.clone().multiplyScalar(this.over ? 0.35 : 0.55);
    this.x.forEach((tok, pos) => v.items[tok].m.material.emissive.copy(o && pos < o.k ? tint : new THREE.Color(0, 0, 0)));
    if (!v.toolOn) {
      v.tool.visible = !!o;
      if (o) v.tool.position.set(0.34, 0, v.dh * (this.N - o.k));
    }
  }
  // undo, hint and replay (play.js)
  snap() { return { x: this.x.slice(), before: this.before && this.before.slice(), flips: this.flips }; }
  restore(s) {
    this.x = s.x.slice(); this.before = s.before && s.before.slice(); this.flips = s.flips; this.cur = null;
    this.hover(null);
    this.view.show(this.x, null);
  }
  // the number of pancakes flipped from x to y
  flipOf(x, y) { for (let k = 2; k <= x.length; k++) if (same([...x.slice(0, k).reverse(), ...x.slice(k)], y)) return k; return 0; }
  flipName(k) { return [`flip the top ${k}`, `ribalta le ${k} in cima`]; }
  label(s0, s1) { return this.flipName(this.flipOf(s0.x, s1.x)); }
  paths() { return { ctx: this.ctx, key: s => s.x.join(','), pkey: p => p.join(','), pname: (p, q) => this.flipName(this.flipOf(p, q)) }; }
  hint(o) {
    return pathHint({ ...this.paths(), step: (s, p) => {
      const k = this.flipOf(s.x, p);
      this.hl = { k };
      this.hover(null);
      return Object.assign([`flip the top ${k} pancakes, the spatula under the ${k}th from the top`, `ribalta le ${k} frittelle in cima, con la spatola sotto la ${k}ª dall'alto`], { acts: [{ k }] });
    } }, o);
  }
  unhint() { if (this.hl) { this.hl = null; if (this.x) this.hover(this.over); } }
  replay(states) { return pathReplay(this.paths(), states); }
  key(e) {
    const c = this.cur || { k: 2 }, N = this.N;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      this.cur = { k: Math.max(1, Math.min(N, c.k + (e.key === 'ArrowDown' ? 1 : -1))) };
      this.hover(this.cur);
      return true;
    }
    if (e.key === 'Enter' || e.key === ' ') { this.cur = c; return { ...c }; }
    return null;
  }
}

// the breakpoints of a ring: the neighbors whose numbers are not consecutive
// (N - 1 and 0 are), as the gold bars of TopSpinView
const breaks = x => x.reduce((s, p, i) => { const q = x[(i + 1) % x.length], N = x.length; return s + (q !== (p + 1) % N && p !== (q + 1) % N ? 1 : 0); }, 0);
const ring = x => x.join(' ');

export class TopSpinPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.N = inst.start.length; this.K = inst.turnstile || 4; this.ctx = ctx;
    this.view = new TopSpinView(box, inst);
    // the turnstile of the reader (gold, always shown) and the place where a
    // click would turn it (fainter), as the arc that TopSpinView draws for
    // a move of the path; TopSpinView builds again on a change of theme
    const build = this.view.build.bind(this.view);
    this.view.build = () => { build(); this.decorate(); };
    this.decorate();
    // the turnstile turns to its new place in about 0.3 s
    const frame = this.view.frame.bind(this.view);
    this.view.frame = dt => { frame(dt); this.tick(dt); };
    this.moveName = ['moves', 'mosse'];
    this.help = ['A click on a token outside the turnstile turns the ring to bring it in, a click on a token inside reverses the tokens there; the arrow keys turn the ring and Enter reverses.',
      'Un clic su un gettone fuori dal tornello gira l\'anello fino a portarlo dentro, un clic su un gettone dentro rovescia i gettoni che vi stanno; le frecce girano l\'anello e Invio rovescia.'];
  }
  decorate() {
    const v = this.view, P = v.S.colors, span = 2 * Math.PI * (this.K - 1) / this.N;
    const arc = op => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(v.R, 0.12, 8, 48, span + 0.5),
        new THREE.MeshStandardMaterial({ color: P.gold, transparent: true, opacity: op, depthWrite: false }));
      m.position.z = 0.02;
      v.S.content.add(m);
      return m;
    };
    this.gate = arc(0.45); this.ghost = arc(0.28); this.ghost.visible = false;
    v.items.forEach((it, tok) => { it.m.userData.play = tok; });
    if (this.x) { this.gateA = this.gateTo; this.hover(this.over); }
  }
  // the angle of the turnstile at the window from position i
  arcAngle(i) { return this.view.angle(i) - 0.25; }
  tick(dt) {
    let d = this.gateTo - this.gateA;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    this.gateA = Math.abs(d) < 1e-3 ? this.gateTo : this.gateA + d * Math.min(1, dt * 12);
    this.gate.rotation.z = this.gateA;
    // the arc of the path, drawn while a move is under way, takes its place
    this.gate.visible = !this.view.toolOn;
  }
  setGate(i, still) {
    this.i = (i % this.N + this.N) % this.N;
    this.gateTo = this.arcAngle(this.i);
    if (still || matchMedia('(prefers-reduced-motion: reduce)').matches) this.gateA = this.gateTo;
    this.gate.rotation.z = this.gateA;
  }
  reset() {
    this.x = this.inst.start.slice(); this.before = null; this.cur = null; this.err = null; this.n = 0;
    // the turnstile over the front of the ring, where the moves are seen best
    this.setGate(this.N - Math.floor(this.K / 2), true);
    this.hover(null);
    this.view.show(this.x.slice(), null);
  }
  counters() { return [['breakpoints', 'rotture', breaks(this.x)]]; }
  targets() { return this.view.items.map(it => it.m); }
  inside(p) { return (p - this.i + this.N) % this.N < this.K; }
  window(i = this.i) { return Array.from({ length: this.K }, (_, o) => this.x[(i + o) % this.N]); }
  // a token inside the turnstile: the move; outside: the shorter turn of the
  // ring that brings it in (at the near end of the turnstile)
  actionAt(tok) {
    const N = this.N, K = this.K, p = this.x.indexOf(tok), o = (p - this.i + N) % N;
    if (o < K) return { flip: this.i };
    return { go: o - K + 1 <= N - o ? (this.i + o - K + 1) % N : p };
  }
  // points on the cap of the tokens whose click is a
  where(a) {
    const v = this.view, out = [];
    this.x.forEach((tok, p) => {
      const b = this.actionAt(tok);
      if (b.flip !== a.flip || b.go !== a.go) return;
      const m = v.items[tok].m;
      for (const [dx, dy] of [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]]) out.push(m.localToWorld(new THREE.Vector3(dx, 0.041, dy)));
    });
    return out;
  }
  act(a) {
    const N = this.N, K = this.K;
    this.err = null;
    if (a.go !== undefined) {
      if (!(a.go >= 0 && a.go < N)) return null;
      this.setGate(a.go);
      this.hover(null);
      const w = ring(this.window());
      return { say: [`The ring turns: the turnstile now holds ${w}; a click on one of them, or Enter, reverses them.`,
        `L'anello gira: ora nel tornello ci sono ${w}; un clic su uno di questi, o Invio, li rovescia.`] };
    }
    if (!(a.flip >= 0 && a.flip < N)) return null;
    this.setGate(a.flip);
    const prev = this.x, b0 = breaks(prev), w0 = ring(this.window());
    this.x = prev.slice();
    for (let o = 0; o < K; o++) this.x[(a.flip + o) % N] = prev[(a.flip + K - 1 - o) % N];
    const back = same(this.x, this.before);
    this.before = prev;
    const n = ++this.n, b = breaks(this.x), d = b - b0, w = ring(this.window());
    if (back) this.err = this.window();
    this.hover(null);
    this.view.show(this.x.slice(), null);
    const opt = optimum(this.ctx);
    if (this.x.every((v, p) => this.x[(p + 1) % N] === (v + 1) % N)) {
      const cmp = against(n, opt, ['move', 'moves', 'mossa', 'mosse']);
      return { moved: true, mistake: back, solved: true,
        say: [`Sorted in ${n} ${plural(n, 'move', 'moves')}. ${cmp[0]}`, `Ordinato in ${n} ${plural(n, 'mossa', 'mosse')}. ${cmp[1]}`] };
    }
    const db = d < 0 ? [plural(-d, 'one breakpoint fewer', `${-d} breakpoints fewer`), plural(-d, 'un punto di rottura in meno', `${-d} punti di rottura in meno`)]
      : d > 0 ? [plural(d, 'one breakpoint more', `${d} breakpoints more`), plural(d, 'un punto di rottura in più', `${d} punti di rottura in più`)]
      : ['as many breakpoints as before', 'tanti punti di rottura quanti prima'];
    const say = back
      ? [`You reverse ${w0} into ${w}, which undoes the move before: the ring is back where it was (red).`,
        `Rovesci ${w0} in ${w}, e questo annulla la mossa di prima: l'anello torna com'era (in rosso).`]
      : b === 0
        ? [`You reverse ${w0} into ${w}: no breakpoint is left, but the ring reads backwards; the numbers must grow along the ring, as 0 1 2 ...`,
          `Rovesci ${w0} in ${w}: non resta nessun punto di rottura, ma l'anello si legge al contrario; i numeri devono crescere lungo l'anello, come 0 1 2 ...`]
        : [`You reverse ${w0} into ${w}: ${db[0]}, ${b} left (gold bars).`, `Rovesci ${w0} in ${w}: ${db[1]}, ne restano ${b} (barre dorate).`];
    if (opt && n >= opt.cost) {
      say[0] += ` The optimum is ${opt.cost} moves.`;
      say[1] += ` L'ottimo è di ${opt.cost} mosse.`;
    }
    return { moved: true, mistake: back, say };
  }
  // what a would do: the tokens a move reverses lit in gold, or the place
  // where the turnstile would go; the tokens of a move that undid the one
  // before stay red until the next action
  hover(a) {
    const v = this.view, P = v.S.colors;
    this.over = a || null;
    // the move of a hint, while the pointer shows no other
    if (!a && this.hl) a = this.hl;
    const lit = new Set(a && a.flip !== undefined ? this.window(a.flip) : []), red = new Set(this.err || []);
    const gold = P.gold.clone().multiplyScalar(0.45), rose = P.red.clone(), none = new THREE.Color(0, 0, 0);
    v.items.forEach((it, tok) => it.m.material.forEach(m => m.emissive.copy(lit.has(tok) ? gold : red.has(tok) ? rose : none)));
    const go = a && a.go !== undefined ? a.go : a && a === this.hl && a.flip !== this.i ? a.flip : undefined;
    this.ghost.visible = go !== undefined;
    if (this.ghost.visible) this.ghost.rotation.z = this.arcAngle(go);
  }
  // undo, hint and replay (play.js)
  snap() { return { x: this.x.slice(), before: this.before && this.before.slice(), n: this.n, i: this.i }; }
  restore(s) {
    this.x = s.x.slice(); this.before = s.before && s.before.slice(); this.n = s.n; this.err = null; this.cur = null;
    this.setGate(s.i);
    this.hover(null);
    this.view.show(this.x.slice(), null);
  }
  // the position of the turnstile whose reversal turns x into y
  revOf(x, y) {
    const N = this.N, K = this.K;
    for (let p = 0; p < N; p++) {
      const z = x.slice();
      for (let o = 0; o < K; o++) z[(p + o) % N] = x[(p + K - 1 - o) % N];
      if (same(z, y)) return p;
    }
    return -1;
  }
  revName(x, p) {
    const w = ring(Array.from({ length: this.K }, (_, o) => x[(p + o) % this.N]));
    return [`reverse ${w}`, `rovescia ${w}`];
  }
  label(s0, s1) { return this.revName(s0.x, this.revOf(s0.x, s1.x)); }
  paths() { return { ctx: this.ctx, key: s => s.x.join(','), pkey: p => p.join(','), pname: (p, q) => this.revName(p, this.revOf(p, q)) }; }
  hint(o) {
    return pathHint({ ...this.paths(), step: (s, p) => {
      const q = this.revOf(s.x, p), w = this.revName(s.x, q);
      this.hl = { flip: q };
      this.hover(null);
      return Object.assign(q === this.i ? [w[0] + ', the tokens in the turnstile', w[1] + ', i gettoni nel tornello']
        : [`turn the ring to bring ${w[0].slice(8)} into the turnstile (the faint arc), then ${w[0]}`, `gira l'anello per portare ${w[1].slice(10)} nel tornello (l'arco tenue), poi ${w[1]}`],
      { acts: q === this.i ? [{ flip: q }] : [{ go: q }, { flip: q }] });
    } }, o);
  }
  unhint() { if (this.hl) { this.hl = null; if (this.x) this.hover(this.over); } }
  replay(states) { return pathReplay(this.paths(), states); }
  key(e) {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (d) return { go: (this.i + d + this.N) % this.N };
    if (e.key === 'Enter' || e.key === ' ') return { flip: this.i };
    return null;
  }
}
