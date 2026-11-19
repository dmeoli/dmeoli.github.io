// The search games played in the lane "You" (play.js): the sliding-tile
// puzzles on PuzzleView and the grid on GridView (search.js), and the road
// map of Romania on GraphView (graph.js), each with the picks of the reader
// and the frames of Marks (cells.js) added. A move is checked against the
// rules of the game only (a tile next to the blank, a free cell next to the
// current one, a road from the current city), and the end is compared with
// the cost of the solutions that the searches proved optimal.

import * as THREE from 'three';
import { label } from '../stage3d.js';
import { PuzzleView, GridView } from './search.js';
import { GraphView } from './graph.js';
import { Marks } from './cells.js';
import { names, pathHint, pathReplay } from './play.js';

const plural = (k, one, many) => (k === 1 ? one : many);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(2));

// the least cost of a solution that a search proved optimal, and by whom;
// skip(header) leaves out the lanes whose optimality is not that of the cost
export function optimum(ctx, skip = () => false) {
  let best = null;
  for (const L of ctx.results()) {
    const r = L.result;
    if (!r || r.status !== 'optimal' || typeof r.cost !== 'number' || skip(L.header)) continue;
    if (!best || r.cost < best.cost - 1e-3) best = { cost: r.cost, by: [L.name] };
    else if (Math.abs(r.cost - best.cost) < 1e-3 && !best.by.includes(L.name)) best.by.push(L.name);
  }
  return best;
}
// the lanes whose solution path is the walk of the reader (eq: two steps alike)
function samePath(ctx, walk, eq = (a, b) => a === b) {
  const out = [];
  for (const L of ctx.results()) {
    const p = L.result && L.result.path;
    if (Array.isArray(p) && p.length === walk.length && p.every((s, i) => eq(s, walk[i])) && !out.includes(L.name)) out.push(L.name);
  }
  return out;
}
// the sentence of the end: cost n against the optimum, in both languages
function endWords(n, opt, same, unit) {
  const [u1, u2] = unit.map(u => (u ? ' ' + u : ''));
  const tail = same.length ? [` It is the solution that ${names(same, 'and')} found.`, ` È la soluzione trovata da ${names(same, 'e')}.`] : ['', ''];
  if (!opt) return [`No lane holds a solution proved optimal to compare with.${tail[0]}`, `Nessuna corsia ha una soluzione dimostrata ottima con cui confrontarla.${tail[1]}`];
  if (Math.abs(n - opt.cost) < 1e-3) return same.length
    ? [`It is the optimum, along the same path that ${names(same, 'and')} found.`, `È l'ottimo, lungo lo stesso cammino trovato da ${names(same, 'e')}.`]
    : [`It is the optimum, which ${names(opt.by, 'and')} found.`, `È l'ottimo, trovato da ${names(opt.by, 'e')}.`];
  return [`The optimum, which ${names(opt.by, 'and')} found, is ${fmt(opt.cost)}${u1}: ${fmt(n - opt.cost)} more than needed.${tail[0]}`,
    `L'ottimo, trovato da ${names(opt.by, 'e')}, è di ${fmt(opt.cost)}${u2}: ${fmt(n - opt.cost)} in più del necessario.${tail[1]}`];
}
// the marks of a view, made again with the scene on a change of theme or of
// language, and fading in with the frames of the view
function withMarks(view, z) {
  const build = view.build.bind(view), frame = view.frame.bind(view);
  view.marks = new Marks(view.S, z);
  view.build = () => { build(); view.marks = new Marks(view.S, z); if (view.after) view.after(); };
  view.frame = dt => { frame(dt); view.marks.frame(dt); if (view.tick) view.tick(dt); };
}

// ---------------------------------------------------------------- puzzle

const DIRS = { ArrowUp: -2, ArrowDown: 2, ArrowLeft: -1, ArrowRight: 1, w: -2, s: 2, a: -1, d: 1 };
const WAY = { '-1': ['left', 'a sinistra'], 1: ['right', 'a destra'], '-2': ['up', 'in su'], 2: ['down', 'in giù'] };

export class PuzzlePlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.side = inst.side;
    this.view = new PuzzleView(box, inst);
    const u = 1.6 / this.side;
    withMarks(this.view, u * 0.34);
    this.view.after = () => { this.tag(); this.show(); };
    this.tag();
    this.moveName = ['slides', 'scorrimenti'];
    this.help = ['A click on a tile next to the blank slides it there; the arrow keys move the blank, sliding the tile that is on that side of it.',
      'Un clic su una tessera accanto al vuoto la fa scorrere nel vuoto; le frecce spostano il vuoto, facendo scorrere la tessera che sta da quel lato.'];
    this.options = [{ id: 'hint', en: 'frame the tiles that can slide', it: 'incornicia le tessere che possono scorrere', on: true }];
  }
  tag() { for (const [k, it] of this.view.tiles) it.m.userData.play = k; }
  reset() {
    this.x = this.inst.board.slice(); this.walk = [this.x.slice()]; this.prevBlank = -1;
    this.err = []; this.over = null; this.n = 0;
    this.view.show(this.x, null);
    this.show();
  }
  rc(c) { return [Math.floor(c / this.side), c % this.side]; }
  // the step from the cell of a tile to the blank: -1 left, 1 right, -2 up, 2 down, or 0
  step(c, b) {
    const [r1, c1] = this.rc(c), [r2, c2] = this.rc(b);
    if (r1 === r2 && Math.abs(c1 - c2) === 1) return c2 - c1;
    if (c1 === c2 && Math.abs(r1 - r2) === 1) return 2 * (r2 - r1);
    return 0;
  }
  movable() { const b = this.x.indexOf(0); return this.x.map((k, c) => (k && this.step(c, b) ? k : 0)).filter(Boolean); }
  manhattan() {
    let s = 0;
    this.x.forEach((k, c) => {
      if (!k) return;
      const [r1, c1] = this.rc(c), [r2, c2] = this.rc(this.inst.goal.indexOf(k));
      s += Math.abs(r1 - r2) + Math.abs(c1 - c2);
    });
    return s;
  }
  counters() {
    const o = optimum(this.ctx);
    return [['Manhattan', 'Manhattan', this.manhattan()], ['optimum', 'ottimo', o ? o.cost : '–']];
  }
  targets() { return [...this.view.tiles.values()].map(it => it.m); }
  actionAt(k) { return { k }; }
  where(a) {
    const it = this.view.tiles.get(a.k);
    return it ? new THREE.Vector3(it.m.position.x, it.m.position.y, it.m.position.z * 2) : new THREE.Vector3();
  }
  act(a) {
    this.err = [];
    if (a.edge) {
      const w = WAY[a.edge];
      this.show();
      return { say: [`The blank cannot move ${w[0]}: it is on the edge of the board.`, `Il vuoto non può spostarsi ${w[1]}: è sul bordo della tavola.`] };
    }
    const { k } = a, c = this.x.indexOf(k), b = this.x.indexOf(0);
    if (!(k >= 1) || c < 0) return null;
    const d = this.step(c, b);
    if (!d) {
      // refused: the tile and the blank in red, the tiles that could slide in the say
      this.err = [{ v: c, kind: 'hot' }, { v: b, kind: 'hot' }];
      const can = this.movable().sort((p, q) => p - q);
      this.show();
      return { mistake: true, say: [`Refused: tile ${k} is not next to the blank (both in red), and only ${names(can, 'or')} can slide.`,
        `Rifiutata: la tessera ${k} non è accanto al vuoto (entrambi in rosso), e possono scorrere solo ${names(can, 'o')}.`] };
    }
    const h0 = this.manhattan();
    this.x[b] = k; this.x[c] = 0;
    const back = this.prevBlank === c;     // the tile goes back where it came from
    this.prevBlank = b;
    this.walk.push(this.x.slice());
    this.over = null;
    this.view.show(this.x, null);
    this.show();
    const n = ++this.n, h = this.manhattan(), w = WAY[d], opt = optimum(this.ctx);
    if (this.x.every((v, i) => v === this.inst.goal[i])) {
      const same = samePath(this.ctx, this.walk, (p, q) => p.length === q.length && p.every((v, i) => v === q[i]));
      const e = endWords(n, opt, same, ['moves', 'mosse']);
      return { moved: true, mistake: back, solved: true, say: [`Solved in ${n} ${plural(n, 'move', 'moves')}. ${e[0]}`, `Risolto in ${n} ${plural(n, 'mossa', 'mosse')}. ${e[1]}`] };
    }
    const dh = h - h0;
    const say = back
      ? [`Tile ${k} slides ${w[0]} and undoes the move before: the board is back where it was.`,
        `La tessera ${k} scorre ${w[1]} e annulla la mossa di prima: la tavola torna com'era.`]
      : [`Tile ${k} slides ${w[0]}: the Manhattan distance ${dh < 0 ? 'drops' : 'rises'} to ${h}.`,
        `La tessera ${k} scorre ${w[1]}: la distanza di Manhattan ${dh < 0 ? 'scende' : 'sale'} a ${h}.`];
    if (opt && n >= opt.cost) { say[0] += ` The optimum is ${opt.cost} moves.`; say[1] += ` L'ottimo è di ${opt.cost} mosse.`; }
    return { moved: true, mistake: back, say };
  }
  hover(a) { this.over = a && a.k ? a : null; this.show(); }
  // undo, hint and replay (play.js)
  snap() { return { x: this.x.slice(), walk: this.walk.map(w => w.slice()), prevBlank: this.prevBlank, n: this.n }; }
  restore(s) {
    this.x = s.x.slice(); this.walk = s.walk.map(w => w.slice()); this.prevBlank = s.prevBlank; this.n = s.n;
    this.err = []; this.over = null;
    this.view.show(this.x, null);
    this.show();
  }
  key0(s) { return s.x.join(','); }
  pkey(p) { return p.join(','); }
  // the tile that slides from x to y, and where
  slide(x, y) {
    const k = x[y.indexOf(0)], w = WAY[this.step(x.indexOf(k), y.indexOf(k))] || ['', ''];
    return { k, w };
  }
  label(s0, s1) { const { k, w } = this.slide(s0.x, s1.x); return [`tile ${k} ${w[0]}`, `tessera ${k} ${w[1]}`]; }
  pname(p, q) { const { k, w } = this.slide(p, q); return [`tile ${k} ${w[0]}`, `tessera ${k} ${w[1]}`]; }
  hint(o) { return pathHint({ ctx: this.ctx, key: s => this.key0(s), pkey: p => this.pkey(p), step: (s, p) => {
    const { k, w } = this.slide(s.x, p);
    this.hl = [{ v: s.x.indexOf(k), kind: 'decide' }, { v: s.x.indexOf(0), kind: 'decide' }];
    this.show();
    return Object.assign([`slide tile ${k} ${w[0]}`, `fai scorrere la tessera ${k} ${w[1]}`], { acts: [{ k }] });
  } }, o); }
  unhint() { if (this.hl) { this.hl = null; this.show(); } }
  replay(states) { return pathReplay({ ctx: this.ctx, key: s => this.key0(s), pkey: p => this.pkey(p), pname: (p, q) => this.pname(p, q) }, states); }
  key(e) {
    const d = DIRS[e.key];
    if (!d) return null;
    // the blank moves by d: the tile on that side slides into it
    const b = this.x.indexOf(0), [r, c] = this.rc(b), s = this.side;
    const to = d === -2 ? (r > 0 ? b - s : -1) : d === 2 ? (r < s - 1 ? b + s : -1) : d === -1 ? (c > 0 ? b - 1 : -1) : (c < s - 1 ? b + 1 : -1);
    return to < 0 ? { edge: d } : { k: this.x[to] };
  }
  // the frames: red the cells of a refusal, gold the tile under the pointer
  // with the blank it would slide to (grey if it cannot), ink the tiles that
  // can slide (the hint)
  show() {
    const focus = [...this.err, ...(this.hl || [])], b = this.x.indexOf(0);
    if (this.opt && this.opt.hint) for (const k of this.movable()) focus.push({ v: this.x.indexOf(k), kind: 'prop' });
    if (this.over) {
      const c = this.x.indexOf(this.over.k), ok = this.step(c, b) !== 0;
      focus.push({ v: c, kind: ok ? 'decide' : 'undo' });
      if (ok) focus.push({ v: b, kind: 'decide' });
    }
    const u = 1.6 / this.side;
    this.view.marks.show(focus, v => { const [x, y] = this.view.cell(v); return [x, y, u * 0.96, u * 0.96]; });
  }
}

// ---------------------------------------------------------------- grid

const SQ2 = Math.SQRT2;
// the moves of the keys: [dx, dy]
const GKEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1], q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1] };

// GridView with a frame that glides to the cell of the reader over the top
// of the cells, and a camera that follows it (an option of the game)
class PlayGridView extends GridView {
  show(set, cur = null, force = false) {
    const was = this.pin && this.pin.visible ? this.pin.position.clone() : null;
    super.show(set, cur, force);
    if (cur === null) return;
    this.pinTo = this.pin.position.clone();
    this.pinTo.z = this.u * 2.75;
    if (was && !force && !reduced()) this.pin.position.copy(was);
    else this.pin.position.copy(this.pinTo);
  }
  frame(dt) {
    super.frame(dt);
    if (this.pinTo && this.pin.position.distanceTo(this.pinTo) > 1e-5) this.pin.position.lerp(this.pinTo, Math.min(1, dt * 7));
  }
  pos(c) { const W = this.inst.width, H = this.inst.height; return [(c % W - (W - 1) / 2) * this.u, ((H - 1) / 2 - Math.floor(c / W)) * this.u]; }
}

export class GridPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.W = inst.width; this.H = inst.height; this.moves8 = (inst.moves || 8) === 8;
    this.view = new PlayGridView(box, inst);
    withMarks(this.view, 0);
    this.view.after = () => { this.tag(); this.show(true); };
    this.view.tick = dt => this.follow(dt);
    this.tag();
    this.home = { pos: this.view.S.camera.position.clone(), target: this.view.S.controls.target.clone() };
    this.moveName = ['steps', 'passi'];
    this.help = this.moves8
      ? ['A click on one of the 8 cells around yours walks there (a diagonal costs √2 and may not cut a blocked corner); the arrow keys walk straight, Home, PgUp, End and PgDn (or q, e, z, c) diagonally.',
        'Un clic su una delle 8 celle attorno alla tua ti porta lì (una diagonale costa √2 e non può tagliare l\'angolo di una cella bloccata); le frecce camminano dritto, Home, PgSu, Fine e PgGiù (o q, e, z, c) in diagonale.']
      : ['A click on one of the 4 cells next to yours walks there; the arrow keys do the same.',
        'Un clic su una delle 4 celle accanto alla tua ti porta lì; le frecce fanno lo stesso.'];
    this.options = [{ id: 'hint', en: 'raise the cells you can step to', it: 'alza le celle dove puoi passare', on: true },
      { id: 'follow', en: 'follow you with the camera', it: 'segui il cammino con la camera', on: true }];
  }
  tag() { this.view.mesh.userData.play = 'cell'; }
  reset() {
    this.pos = this.inst.start; this.walk = [this.pos]; this.cost = 0; this.err = []; this.over = null; this.cur = null;
    this.followed = null;
    this.show(true);
  }
  xy(c) { return [c % this.W, Math.floor(c / this.W)]; }
  name(c) { const [x, y] = this.xy(c); return `c${x + 1}, r${y + 1}`; }
  free(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H && this.inst.rows[y][x] !== '@'; }
  // why the step from the cell of the reader to c is not allowed, or null
  why(c) {
    const [x0, y0] = this.xy(this.pos), [x, y] = this.xy(c), dx = x - x0, dy = y - y0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1 || (!this.moves8 && dx && dy)) return { far: true };
    if (!this.free(x, y)) return { wall: true };
    if (dx && dy) {
      const cut = [[x0 + dx, y0], [x0, y0 + dy]].filter(([a, b]) => !this.free(a, b)).map(([a, b]) => b * this.W + a);
      if (cut.length) return { corner: cut };
    }
    return null;
  }
  steps() {
    const out = [], [x0, y0] = this.xy(this.pos);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < this.W && y < this.H && !this.why(y * this.W + x)) out.push(y * this.W + x);
    }
    return out;
  }
  octile(c) {
    const [x, y] = this.xy(c), [gx, gy] = this.xy(this.inst.goal), dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return this.moves8 ? Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy) : dx + dy;
  }
  counters() {
    const o = optimum(this.ctx);
    return [['cost', 'costo', fmt(this.cost)], [this.moves8 ? 'octile' : 'Manhattan', this.moves8 ? 'ottile' : 'Manhattan', fmt(this.octile(this.pos))],
      ['optimum', 'ottimo', o ? fmt(o.cost) : '–']];
  }
  targets() { return [this.view.mesh]; }
  actionAt(p, hit) { return hit && hit.instanceId !== undefined ? { c: hit.instanceId } : null; }
  where(a) { const [x, y] = this.view.pos(a.c); return new THREE.Vector3(x, y, this.view.h[a.c]); }
  act(a) {
    this.err = [];
    if (a.edge) { this.show(); return { say: ['That is the edge of the grid.', 'Lì finisce la griglia.'] }; }
    const { c } = a;
    if (!(c >= 0 && c < this.W * this.H)) return null;
    if (c === this.pos) { this.show(); return { say: [`You are at ${this.name(c)} already.`, `Sei già in ${this.name(c)}.`] }; }
    const no = this.why(c);
    if (no) {
      this.err.push({ v: c, kind: 'hot' });
      let say;
      if (no.far) say = [`Refused: ${this.name(c)} (red) is not next to your cell ${this.name(this.pos)}; a step goes to one of the ${this.moves8 ? 8 : 4} cells around it.`,
        `Rifiutato: ${this.name(c)} (in rosso) non è accanto alla tua cella ${this.name(this.pos)}; un passo va in una delle ${this.moves8 ? 8 : 4} celle attorno.`];
      else if (no.wall) say = [`Refused: ${this.name(c)} is blocked (red).`, `Rifiutato: ${this.name(c)} è bloccata (in rosso).`];
      else {
        for (const k of no.corner) this.err.push({ v: k, kind: 'hot' });
        say = [`Refused: the diagonal to ${this.name(c)} would cut the corner of the blocked ${plural(no.corner.length, 'cell', 'cells')} ${names(no.corner.map(k => this.name(k)), 'and')} (red).`,
          `Rifiutato: la diagonale verso ${this.name(c)} taglierebbe l'angolo ${plural(no.corner.length, 'della cella bloccata', 'delle celle bloccate')} ${names(no.corner.map(k => this.name(k)), 'e')} (in rosso).`];
      }
      this.show();
      return { mistake: true, say };
    }
    const [x0, y0] = this.xy(this.pos), [x, y] = this.xy(c), diag = x !== x0 && y !== y0, step = diag ? SQ2 : 1;
    const back = this.walk.length > 1 && this.walk[this.walk.length - 2] === c;
    this.pos = c; this.walk.push(c); this.cost += step;
    this.over = null;
    this.show();
    const opt = optimum(this.ctx), n = this.walk.length - 1;
    if (c === this.inst.goal) {
      const e = endWords(this.cost, opt, samePath(this.ctx, this.walk), ['', '']);
      return { moved: true, mistake: back, solved: true, say: [`At the goal in ${n} ${plural(n, 'step', 'steps')}, at cost ${fmt(this.cost)}. ${e[0]}`,
        `All'obiettivo in ${n} ${plural(n, 'passo', 'passi')}, con costo ${fmt(this.cost)}. ${e[1]}`] };
    }
    const say = back
      ? [`You step back to ${this.name(c)}, which undoes the step before (and costs ${fmt(step)} all the same).`,
        `Torni in ${this.name(c)}, e questo annulla il passo di prima (e costa comunque ${fmt(step)}).`]
      : [`You step ${diag ? 'diagonally ' : ''}to ${this.name(c)}, at cost ${diag ? '√2' : '1'}: ${fmt(this.cost)} so far, and the goal is at least ${fmt(this.octile(c))} away.`,
        `Passi ${diag ? 'in diagonale ' : ''}in ${this.name(c)}, con costo ${diag ? '√2' : '1'}: ${fmt(this.cost)} finora, e l'obiettivo dista almeno ${fmt(this.octile(c))}.`];
    if (!this.steps().length) { say[0] += ' No free cell is left around you.'; say[1] += ' Attorno a te non resta nessuna cella libera.'; }
    return { moved: true, mistake: back, say };
  }
  hover(a) { this.over = a && a.c !== undefined ? a : null; this.show(); }
  // undo, hint and replay (play.js)
  snap() { return { pos: this.pos, walk: this.walk.slice(), cost: this.cost }; }
  restore(s) { this.pos = s.pos; this.walk = s.walk.slice(); this.cost = s.cost; this.err = []; this.over = null; this.show(); }
  move(c0, c) {
    const [x0, y0] = this.xy(c0), [x, y] = this.xy(c), d = x !== x0 && y !== y0;
    return [`${d ? 'diagonally ' : ''}to ${this.name(c)}`, `${d ? 'in diagonale ' : ''}in ${this.name(c)}`];
  }
  label(s0, s1) { return this.move(s0.pos, s1.pos); }
  paths() { return { ctx: this.ctx, key: s => String(s.pos), pkey: p => String(p), pname: (p, q) => this.move(p, q) }; }
  hint(o) {
    return pathHint({ ...this.paths(), step: (s, p) => {
      this.hl = [{ v: p, kind: 'decide' }];
      this.show();
      const m = this.move(s.pos, p);
      return Object.assign([`step ${m[0]}`, `passa ${m[1]}`], { acts: [{ c: p }] });
    } }, o);
  }
  unhint() { if (this.hl) { this.hl = null; this.show(); } }
  replay(states) { return pathReplay(this.paths(), states); }
  key(e) {
    const d = GKEYS[e.key];
    if (d) {
      if (!this.moves8 && d[0] && d[1]) return null;
      const [x, y] = this.xy(this.pos), nx = x + d[0], ny = y + d[1];
      return nx < 0 || ny < 0 || nx >= this.W || ny >= this.H ? { edge: true } : { c: ny * this.W + nx };
    }
    return null;
  }
  // the walk in gold, the cells the reader can step to raised (the hint), the
  // frame on the cell of the reader; red the cells of a refusal, gold the
  // cell under the pointer when a step goes there, grey when not
  show(force = false) {
    const set = new Map(), v = this.view;
    if (this.opt && this.opt.hint && this.pos !== this.inst.goal) for (const c of this.steps()) set.set(String(c), 'o');
    for (const c of this.walk) set.set(String(c), 'p');
    v.show(set, this.pos, force);
    const focus = [...this.err, ...(this.hl || [])];
    if (this.over && this.over.c !== this.pos) focus.push({ v: this.over.c, kind: this.why(this.over.c) ? 'undo' : 'decide' });
    v.marks.show(focus, c => { const [x, y] = v.pos(c); return [x, y, v.u * 0.98, v.u * 0.98, v.th[c] + v.u * 0.05]; });
  }
  // the camera glides with the reader, close enough to click a cell, until
  // the option is turned off (back to the whole grid)
  follow(dt) {
    const S = this.view.S, on = !!(this.opt && this.opt.follow);
    if (!on) {
      if (this.followed) { S.camera.position.copy(this.home.pos); S.controls.target.copy(this.home.target); S.controls.update(); this.followed = null; }
      return;
    }
    const [x, y] = this.view.pos(this.pos), want = new THREE.Vector3(x, y, 0);
    if (!this.followed) {
      // a view of about 20 cells around the reader
      const d = Math.max(0.35, this.view.u * 24);
      S.controls.target.copy(want); S.camera.position.set(x, y - d * 0.62, d * 0.85); S.controls.update();
      this.followed = true;
      return;
    }
    const step = want.clone().sub(S.controls.target);
    if (step.lengthSq() < 1e-10) return;
    step.multiplyScalar(reduced() ? 1 : Math.min(1, dt * 5));
    S.controls.target.add(step); S.camera.position.add(step);
  }
}

// ---------------------------------------------------------------- Romania

// GraphView with the length of each road at its middle, so that the reader
// can add them up
class PlayGraphView extends GraphView {
  build() {
    super.build();
    const P = this.S.colors;
    for (const [a, b, d] of this.inst.edges) {
      const A = this.at(a), B = this.at(b), l = label(String(d), P.soft, 0.034);
      l.position.set((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 0.03);
      this.S.content.add(l);
    }
  }
}

export class RomaniaPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx;
    this.roads = new Map();
    for (const c of Object.keys(inst.nodes)) this.roads.set(c, new Map());
    for (const [a, b, d] of inst.edges) { this.roads.get(a).set(b, d); this.roads.get(b).set(a, d); }
    this.view = new PlayGraphView(box, inst);
    withMarks(this.view, 0);
    this.view.after = () => { this.tag(); this.show(); };
    this.tag();
    this.moveName = ['roads', 'strade'];
    this.help = ['A click on a city joined by a road to yours drives there (the number on a road is its length); the arrow keys choose among the roads out of your city and Enter drives.',
      'Un clic su una città unita alla tua da una strada ti porta lì (il numero su una strada è la sua lunghezza); le frecce scelgono fra le strade che escono dalla tua città e Invio ti fa partire.'];
    this.options = [{ id: 'hint', en: 'raise the cities you can drive to', it: 'alza le città dove puoi andare', on: true }];
  }
  tag() { for (const [c, it] of this.view.cities) it.m.userData.play = c; }
  reset() { this.at = this.inst.start; this.walk = [this.at]; this.dist = 0; this.err = []; this.over = null; this.cur = null; this.show(); }
  // breadth-first search is optimal in the number of roads, not in their length
  best() { return optimum(this.ctx, h => /^(bfs|breadth)/.test((h.solver.config || {}).algorithm || '')); }
  counters() {
    const o = this.best();
    return [['distance', 'distanza', this.dist], ['optimum', 'ottimo', o ? o.cost : '–']];
  }
  targets() { return [...this.view.cities.values()].map(it => it.m); }
  actionAt(c) { return { c }; }
  where(a) { const [x, y] = this.view.at(a.c), it = this.view.cities.get(a.c); return new THREE.Vector3(x, y, it ? it.h : 0); }
  near() { return [...this.roads.get(this.at).keys()].sort(); }
  act({ c }) {
    this.err = [];
    if (!this.roads.has(c)) return null;
    if (c === this.at) { this.show(); return { say: [`You are in ${c} already.`, `Sei già a ${c}.`] }; }
    const d = this.roads.get(this.at).get(c);
    if (d === undefined) {
      this.err.push({ v: c, kind: 'hot' });
      this.show();
      return { mistake: true, say: [`Refused: no road joins ${this.at} and ${c} (red); from ${this.at} the roads go to ${names(this.near(), 'and')}.`,
        `Rifiutato: nessuna strada unisce ${this.at} e ${c} (in rosso); da ${this.at} le strade vanno a ${names(this.near(), 'e')}.`] };
    }
    const back = this.walk.length > 1 && this.walk[this.walk.length - 2] === c, again = !back && this.walk.includes(c);
    const from = this.at;
    this.at = c; this.walk.push(c); this.dist += d; this.over = null; this.cur = null;
    this.show();
    const opt = this.best(), n = this.walk.length - 1;
    if (c === this.inst.goal) {
      const e = endWords(this.dist, opt, samePath(this.ctx, this.walk), ['km', 'km']);
      return { moved: true, mistake: back, solved: true, say: [`In ${c} after ${n} ${plural(n, 'road', 'roads')} and ${this.dist} km. ${e[0]}`,
        `A ${c} dopo ${n} ${plural(n, 'strada', 'strade')} e ${this.dist} km. ${e[1]}`] };
    }
    const say = back
      ? [`You drive back to ${c}, which undoes the road before and adds ${d} km all the same: ${this.dist} km so far.`,
        `Torni a ${c}, e questo annulla la strada di prima e aggiunge comunque ${d} km: ${this.dist} km finora.`]
      : [`From ${from} to ${c}, ${d} km: ${this.dist} km so far.${again ? ` You have been in ${c} before, so the route has a loop.` : ''}`,
        `Da ${from} a ${c}, ${d} km: ${this.dist} km finora.${again ? ` Eri già passato da ${c}, quindi il percorso fa un giro chiuso.` : ''}`];
    if (opt && this.dist >= opt.cost) { say[0] += ` The optimum is ${opt.cost} km.`; say[1] += ` L'ottimo è di ${opt.cost} km.`; }
    return { moved: true, mistake: back, say };
  }
  hover(a) { this.over = a; this.show(); }
  // undo, hint and replay (play.js)
  snap() { return { at: this.at, walk: this.walk.slice(), dist: this.dist }; }
  restore(s) { this.at = s.at; this.walk = s.walk.slice(); this.dist = s.dist; this.err = []; this.over = null; this.cur = null; this.show(); }
  drive(a, b) { const d = this.roads.get(a).get(b); return [`to ${b}, ${d} km`, `a ${b}, ${d} km`]; }
  label(s0, s1) { return this.drive(s0.at, s1.at); }
  paths() {
    return { ctx: this.ctx, skip: h => /^(bfs|breadth)/.test((h.solver.config || {}).algorithm || ''), key: s => s.at, pkey: p => p,
      pname: (p, q) => this.drive(p, q) };
  }
  hint(o) {
    return pathHint({ ...this.paths(), step: (s, p) => {
      this.hl = [{ v: p, kind: 'decide' }];
      this.show();
      const d = this.drive(s.at, p);
      return Object.assign([`drive ${d[0]}`, `vai ${d[1]}`], { acts: [{ c: p }] });
    } }, o);
  }
  unhint() { if (this.hl) { this.hl = null; this.show(); } }
  replay(states) { return pathReplay(this.paths(), states); }
  key(e) {
    const ns = this.near();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      const i = this.cur ? ns.indexOf(this.cur.c) : -1, s = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      this.cur = { c: ns[(i + s + ns.length) % ns.length] };
      this.over = this.cur; this.show();
      return true;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.cur) return { ...this.cur };
    return null;
  }
  // the route in gold, the cities one can drive to raised (the hint), the
  // ring on the city of the reader; red a refusal, gold the city under the
  // pointer or the cursor when a road goes there, grey when not
  show() {
    const set = new Map(), v = this.view;
    if (this.opt && this.opt.hint && this.at !== this.inst.goal) for (const c of this.near()) set.set(c, 'e0');
    for (const c of this.walk) set.set(c, 'p');
    v.show(set, this.at);
    const focus = [...this.err, ...(this.hl || [])];
    if (this.over && this.over.c !== this.at) focus.push({ v: this.over.c, kind: this.roads.get(this.at).has(this.over.c) ? 'decide' : 'undo' });
    v.marks.show(focus, c => { const [x, y] = v.at(c), it = v.cities.get(c); return [x, y, 0.13, 0.13, (it ? it.target : 0.02) + 0.004]; });
  }
}
