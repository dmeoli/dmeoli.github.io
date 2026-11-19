// The boards of the CSPs played in the lane "You" (play.js). The n queens,
// on the chessboard of QueensView (column ci the variable, row rj its
// value, as in the other lanes): a click on a cell puts a queen there or
// takes it back, and a queen that would attack another is refused, its
// cell, the queen it attacks and the cells between them framed in red. Map
// coloring, on BoardView: a click on a region gives it the next color that
// no neighbor has, a click on a peg that color, and a color that a neighbor
// has is refused with the neighbor named. Sudoku, on SudokuView: a cell is
// picked and then filled with a digit, and a digit that its row, column or
// box holds is refused.

import * as THREE from 'three';
import { label } from '../stage3d.js';
import { QueensView, SudokuView, Marks } from './cells.js';
import { BoardView } from './view3d.js';
import { names } from './play.js';

// QueensView with the names of the columns (on the far side) and of the rows,
// so that the event line can be read on it
class PlayQueensView extends QueensView {
  // the camera a little farther than in the other lanes, to frame the names
  constructor(box, inst) { super(box, inst); this.S.aim([0, -1.5, 2.65], [0, 0.02, 0]); }
  build() {
    super.build();
    const { S, n, u } = this, P = S.colors, size = Math.min(0.075, u * 0.5), e = n * u / 2 + size * 0.9;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.at(i, i), c = label(`c${i + 1}`, P.soft, size), r = label(`r${i + 1}`, P.soft, size);
      c.position.set(x, e, 0.01); r.position.set(-e - size * 0.5, y, 0.01);
      S.content.add(c, r);
    }
    this.tiles.forEach((m, k) => { m.userData.play = k; });
    this.queens.forEach((q, i) => { q.g.userData.play = -1 - i; });
  }
}

const cell = (i, j) => `c${i + 1}, r${j + 1}`;

export class QueensPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.n = inst.vertices.length; this.ctx = ctx;
    this.view = new PlayQueensView(box, inst);
    this.help = ['A click on a cell puts a queen there or takes it back; the arrow keys move a gold frame and Enter plays its cell.',
      'Un clic su una cella vi mette una regina o la ritira; le frecce spostano una cornice dorata e Invio gioca la sua cella.'];
    this.options = [{ id: 'hint', en: 'show the cells a queen would attack', it: 'mostra le celle che una regina attaccherebbe', on: true }];
  }
  reset() { this.q = new Array(this.n).fill(-1); this.err = []; this.hot = new Set(); this.cur = null; this.over = null; this.show(); }
  counters() { return [['queens', 'regine', `${this.q.filter(r => r >= 0).length} / ${this.n}`]]; }
  targets() { return [...this.view.tiles, ...this.view.queens.map(q => q.g).filter(g => g.visible)]; }
  // a tile k = j n + i, or a queen -1 - i on its cell
  actionAt(p) {
    if (p >= 0) return { i: p % this.n, j: Math.floor(p / this.n) };
    const i = -1 - p;
    return this.q[i] >= 0 ? { i, j: this.q[i] } : null;
  }
  where(a) { const [x, y] = this.view.at(a.i, a.j); return new THREE.Vector3(x, y, this.view.u * 0.1); }
  // how the queen at (k, r) attacks the cell (i, j), if it does
  line(i, j, k, r) {
    if (k === i) return ['the column', 'la colonna'];
    if (r === j) return ['the row', 'la riga'];
    if (Math.abs(k - i) === Math.abs(r - j)) return ['a diagonal', 'una diagonale'];
    return null;
  }
  // the cells strictly between (i, j) and (k, r), on a line of attack
  between(i, j, k, r) {
    const di = Math.sign(k - i), dj = Math.sign(r - j), out = [];
    for (let a = i + di, b = j + dj; a !== k || b !== r; a += di, b += dj) out.push([a, b]);
    return out;
  }
  attackers(i, j) {
    const out = [];
    this.q.forEach((r, k) => { if (r >= 0 && !(k === i && r === j) && this.line(i, j, k, r)) out.push(k); });
    // the nearest first
    return out.sort((a, b) => Math.max(Math.abs(a - i), Math.abs(this.q[a] - j)) - Math.max(Math.abs(b - i), Math.abs(this.q[b] - j)));
  }
  act({ i, j }) {
    const { n, q } = this;
    this.err = []; this.hot = new Set();
    let say;
    if (q[i] === j) {
      q[i] = -1;
      say = [`You take back the queen at ${cell(i, j)}.`, `Ritiri la regina in ${cell(i, j)}.`];
    } else {
      const att = this.attackers(i, j);
      if (att.length) {
        // refused: the cell tried, the queens it would attack and the lines between, in red
        this.err.push({ v: i, j, kind: 'hot' });
        for (const k of att) {
          this.hot.add(this.inst.vertices[k]);
          this.err.push({ v: k, j: q[k], kind: 'hot' });
          for (const [a, b] of this.between(i, j, k, q[k])) this.err.push({ v: a, j: b, kind: 'hot' });
        }
        const k = att[0], ln = this.line(i, j, k, q[k]);
        const more = att.length > 1 ? [` and ${att.length - 1} more`, ` e altre ${att.length - 1}`] : ['', ''];
        this.show();
        return { mistake: true, say: [
          `Refused: a queen at ${cell(i, j)} would attack the queen at ${cell(k, q[k])}${more[0]} along ${ln[0]} (red).`,
          `Rifiutata: una regina in ${cell(i, j)} attaccherebbe la regina in ${cell(k, q[k])}${more[1]} lungo ${ln[1]} (in rosso).`] };
      }
      q[i] = j;
      const k = q.filter(r => r >= 0).length;
      say = [`A queen at ${cell(i, j)}, attacking no other: ${k} of ${n} placed.`,
        `Una regina in ${cell(i, j)}, che non ne attacca altre: ${k} su ${n} posate.`];
      if (k === n) { this.show(); return { moved: true, solved: true, say: this.verdict() }; }
    }
    // a column left with no safe row: the reader must take a queen back
    const dead = [];
    for (let c = 0; c < n; c++) if (q[c] < 0 && Array.from({ length: n }, (_, r) => r).every(r => this.attackers(c, r).length)) dead.push(c);
    if (dead.length) {
      const cs = dead.slice(0, 3).map(c => `c${c + 1}`).join(', ') + (dead.length > 3 ? '...' : '');
      say = [say[0] + ` No safe row is left in ${dead.length > 1 ? 'columns' : 'column'} ${cs}: some queen must be taken back.`,
        say[1] + ` Non resta nessuna riga sicura ${dead.length > 1 ? 'nelle colonne' : 'nella colonna'} ${cs}: qualche regina va ritirata.`];
      for (const c of dead) this.err.push({ v: c, j: -1, kind: 'undo' });
    }
    this.show();
    return { moved: true, say };
  }
  // the end: the placement compared with the solutions of the solver lanes
  verdict() {
    const same = [];
    for (const L of this.ctx.results()) {
      const r = L.result, h = L.header;
      if (!r || !/^(sat|optimal|feasible)$/.test(r.status)) continue;
      let rows = null;
      if (r.solution) rows = h.instance.vertices.map(v => h.instance.colours.indexOf(r.solution[v]));
      else if (r.model && h.encoding) {
        rows = new Array(this.n).fill(-1);
        for (const l of r.model) {
          const m = /^c(\d+)_r(\d+)$/.exec(h.encoding.symbols[l - 1] || '');
          if (m) rows[+m[1] - 1] = +m[2] - 1;
        }
      }
      if (rows && rows.every((v, i) => v === this.q[i])) same.push(L.name);
    }
    const head = [`Solved: ${this.n} queens, and none attacks another.`, `Risolto: ${this.n} regine, e nessuna ne attacca un'altra.`];
    return same.length
      ? [`${head[0]} It is the placement that ${names(same, 'and')} found.`, `${head[1]} È la disposizione trovata da ${names(same, 'e')}.`]
      : [`${head[0]} The solver lanes found other placements.`, `${head[1]} Le corsie dei solutori hanno trovato altre disposizioni.`];
  }
  // the hint of the cell under the pointer or the cursor: a gold frame on it
  // and, if asked, a grey one on each cell a queen there would attack (red
  // on a queen it would attack)
  hover(a) { this.over = a; this.show(); }
  key(e) {
    const n = this.n, c = this.cur || { i: 0, j: 0 };
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { this.cur = { i: (c.i + d[0] + n) % n, j: (c.j + d[1] + n) % n }; this.over = this.cur; this.show(); return true; }
    if (e.key === 'Enter' || e.key === ' ') { this.cur = c; return { ...c }; }
    return null;
  }
  show() {
    const { n, q } = this, focus = [...this.err], a = this.over || this.cur;
    if (a) {
      focus.push({ v: a.i, j: a.j, kind: 'decide' });
      if (this.opt && this.opt.hint && q[a.i] !== a.j) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if ((i !== a.i || j !== a.j) && this.line(i, j, a.i, a.j)) focus.push({ v: i, j, kind: q[i] === j ? 'hot' : 'undo' });
      }
    }
    const solved = q.every(r => r >= 0) && !this.err.length;
    if (solved) q.forEach((r, i) => focus.push({ v: i, j: r, kind: 'decide' }));
    const all = (1 << Math.min(30, n)) - 1;
    this.view.show(this.inst.vertices.map((id, i) => ({ id, colour: q[i], mask: all })), this.hot, focus);
  }
}

// ------------------------------------------------------------------ shared
// the value of each variable in the result of a solver lane: its solution,
// or the true literals of its model named by the encoding (`<var>_<value>`)
export function solutionOf(L, values) {
  const r = L.result, h = L.header;
  if (!r || !/^(sat|optimal|feasible)$/.test(r.status)) return null;
  if (r.solution) return r.solution;
  if (!r.model || !h.encoding || !h.encoding.symbols) return null;
  const out = {}, vals = new Set(values);
  for (const l of r.model) {
    const s = h.encoding.symbols[l - 1] || '', k = s.lastIndexOf('_');
    if (k > 0 && vals.has(s.slice(k + 1))) out[s.slice(0, k)] = s.slice(k + 1);
  }
  return out;
}
// who found a solution: the names of one or two lanes, or how many lanes
// (the names of the solvers are long, and the event line is short)
export function foundBy(same, n) {
  if (same.length > 2) return same.length === n ? [`all ${n} solver lanes`, `tutte le ${n} corsie dei solutori`]
    : [`${same.length} of the ${n} solver lanes`, `${same.length} delle ${n} corsie dei solutori`];
  return [names(same, 'and'), names(same, 'e')];
}
const digitTex = (fg, bg, text) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
  g.fillStyle = fg; g.font = '500 60px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 48, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
const hex = c => '#' + c.getHexString();

// ------------------------------------------------------------ map coloring
const CNAME = { R: ['red', 'rosso'], G: ['green', 'verde'], B: ['blue', 'blu'], Y: ['yellow', 'giallo'] };

// BoardView with the picks: the body of a region (or the disc of a vertex)
// and each of its pegs; the vertices of a graph take their names
class PlayBoardView extends BoardView {
  build() {
    super.build();
    const P = this.S.colors;
    for (const [id, it] of this.items) {
      it.body.userData.play = { v: id, c: 'next' };
      // the borders are lines, which a ray hits within a whole unit: not picked
      it.body.traverse(o => { if (o !== it.body) o.raycast = () => {}; });
      it.pegs.forEach((p, j) => { p.userData.play = { v: id, c: j }; });
      if (it.graph && this.items.size <= 40) {
        const l = label(id, P.ink, 0.06);
        l.position.set(0, it.size * 2.6, it.size);
        it.g.add(l);
      }
    }
    // the name of the region under the pointer, where the map has none
    this.named = !!this.map && Object.keys(this.map.regions).length <= 25 || this.items.size <= 40;
    this.tip = new THREE.Group();
    this.S.content.add(this.tip);
  }
}

export class ColoringPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.ids = inst.vertices; this.k = inst.colours.length;
    this.nb = new Map(this.ids.map(v => [v, []]));
    for (const [a, b] of inst.edges) { this.nb.get(a).push(b); this.nb.get(b).push(a); }
    // a map draws from maps.json, which the page has already fetched: the
    // view starts empty and builds again once the map is here
    const isMap = !inst.xy;
    this.view = new PlayBoardView(box, inst, isMap ? { regions: {} } : null);
    this.ready = !isMap ? Promise.resolve() : fetch('assets/arena/maps.json').then(r => r.json()).then(m => {
      const map = m.maps[inst.id];
      if (!map) return;
      map.id = inst.id;
      this.view.map = map;
      this.view.build();
      this.show();
    });
    // a map has regions, a planar graph vertices
    this.unit = isMap ? ['region', 'regione', 'regions', 'regioni'] : ['vertex', 'vertice', 'vertices', 'vertici'];
    this.help = isMap
      ? ['A click on a region gives it the next color that no neighbor has (a click on one of its pegs, that color); the arrow keys move a gold frame, Enter, the digits or R, G, B, Y color its region, and Delete clears it.',
        'Un clic su una regione le dà il colore seguente che nessun vicino ha (un clic su uno dei suoi pioli, quel colore); le frecce spostano una cornice dorata, Invio, le cifre o R, G, B, Y colorano la sua regione, e Canc la svuota.']
      : ['A click on a vertex gives it the next color that no neighbor has (a click on one of its pegs, that color); the arrow keys move a gold frame, Enter, the digits or R, G, B, Y color its vertex, and Delete clears it.',
        'Un clic su un vertice gli dà il colore seguente che nessun vicino ha (un clic su uno dei suoi pioli, quel colore); le frecce spostano una cornice dorata, Invio, le cifre o R, G, B, Y colorano il suo vertice, e Canc lo svuota.'];
    this.options = [{ id: 'hint', en: 'shrink the colors a neighbor already has', it: 'rimpicciolisci i colori che un vicino ha già', on: true }];
  }
  name(j) { return CNAME[this.inst.colours[j]] || [this.inst.colours[j], this.inst.colours[j]]; }
  reset() { this.col = new Map(this.ids.map(v => [v, -1])); this.before = null; this.err = []; this.hot = new Set(); this.cur = null; this.over = null; this.show(); }
  // the minimum sum coloring, when a lane solves it: color j costs j
  minsum() { return this.ctx.results().some(L => L.header.encoding && L.header.encoding.form === 'wcnf'); }
  sum() { let s = 0; for (const c of this.col.values()) if (c > 0) s += c; return s; }
  counters() {
    const n = [...this.col.values()].filter(c => c >= 0).length, out = [[this.unit[2], this.unit[3], `${n} / ${this.ids.length}`]];
    if (this.minsum()) out.push(['color sum', 'somma dei colori', this.sum()]);
    return out;
  }
  targets() { return [...this.view.items.values()].flatMap(it => [it.body, ...it.pegs]); }
  actionAt(p) { return p ? { ...p } : null; }
  where(a) {
    const it = this.view.items.get(a.v);
    if (!it) return new THREE.Vector3();
    const g = it.g.position;
    if (a.c !== 'next') {
      const p = it.pegs[a.c];
      this.view.S.scene.updateMatrixWorld();
      return p.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, it.size * 0.4 * p.scale.z));
    }
    // the body around the pegs, off them and off the name above them
    const s = it.graph ? it.size * 1.2 : it.size;
    return [[0, -1.6], [0, -2.5], [2.6, 0], [-2.6, 0], [1.8, -1.8], [-1.8, -1.8], [0, -4], [3.5, 1.5], [-3.5, 1.5], [0, 4]].map(([dx, dy]) =>
      new THREE.Vector3(g.x + dx * s, g.y + dy * s, it.h));
  }
  // the neighbors of v that have color j
  clash(v, j) { return this.nb.get(v).filter(u => this.col.get(u) === j); }
  free(v) { return Array.from({ length: this.k }, (_, j) => j).filter(j => !this.clash(v, j).length); }
  key0() { return [...this.col.entries()].map(e => e[1]).join(','); }
  act({ v, c }) {
    if (!this.col.has(v)) return null;
    const cur = this.col.get(v), vi = this.ids.indexOf(v);
    this.err = []; this.hot = new Set();
    let to = c;
    if (c === 'next') {
      // the next color, in the order of the pegs, that no neighbor has, and
      // after the last one the region cleared
      const ok = this.free(v).filter(j => j !== cur);
      if (!ok.length && cur < 0) {
        const per = Array.from({ length: this.k }, (_, j) => [j, this.clash(v, j)[0]]);
        for (const [, u] of per) { this.hot.add(u); this.err.push({ v: this.ids.indexOf(u), j: -1, kind: 'hot' }); }
        this.hot.add(v); this.err.push({ v: vi, j: -1, kind: 'hot' });
        this.show();
        const list = l => names(per.map(([j, u]) => `${u} ${this.name(j)[l]}`), l ? 'e' : 'and');
        return { mistake: true, say: [`Refused: no color is left for ${v}, since its neighbors have them all (${list(0)}, red frames). Some neighbor must change first.`,
          `Rifiutata: per ${v} non resta nessun colore, perché i suoi vicini li hanno tutti (${list(1)}, cornici rosse). Prima va cambiato qualche vicino.`] };
      }
      to = ok.find(j => j > cur);
      if (to === undefined) to = cur >= 0 ? -1 : ok[0];
    } else if (c === cur) to = -1;
    if (to >= 0) {
      const u = this.clash(v, to);
      if (u.length) {
        this.hot.add(v); this.err.push({ v: vi, j: -1, kind: 'hot' });
        for (const w of u) { this.hot.add(w); this.err.push({ v: this.ids.indexOf(w), j: -1, kind: 'hot' }); }
        this.show();
        const [en, it] = this.name(to), who = l => names(u, l);
        return { mistake: true, say: [
          `Refused: ${v} cannot take ${en}, since ${u.length > 1 ? 'its neighbors' : 'its neighbor'} ${who('and')} ${u.length > 1 ? 'have' : 'has'} it already (red frames).`,
          `Rifiutata: ${v} non può prendere il ${it}, perché ${u.length > 1 ? 'i vicini' : 'il vicino'} ${who('e')} ${u.length > 1 ? 'lo hanno' : 'lo ha'} già (cornici rosse).`] };
      }
    }
    const prev = this.key0();
    this.col.set(v, to);
    const back = this.key0() === this.before;
    this.before = prev;
    let say = to >= 0 ? [`${v} takes ${this.name(to)[0]}.`, `${v} prende il ${this.name(to)[1]}.`] : [`You clear ${v}.`, `Svuoti ${v}.`];
    if (back) say = [say[0] + ' This undoes the move before: the map is back where it was.', say[1] + ' Questo annulla la mossa di prima: la mappa torna com\'era.'];
    const done = [...this.col.values()].every(x => x >= 0);
    if (done) { this.show(); return { moved: true, mistake: back, solved: true, say: this.verdict() }; }
    // a region left with no color: a neighbor must change
    const dead = this.ids.filter(u => this.col.get(u) < 0 && !this.free(u).length);
    if (dead.length) {
      const cs = dead.slice(0, 3).join(', ') + (dead.length > 3 ? '...' : '');
      const proof = this.ctx.results().some(L => /^(unsat|infeasible)$/.test(L.result.status) && !(L.header.encoding && L.header.encoding.form === 'wcnf'))
        ? [' (The solver lanes proved that no coloring with these colors exists.)', ' (Le corsie dei solutori hanno dimostrato che non esiste una colorazione con questi colori.)'] : ['', ''];
      say = [say[0] + ` No color is left for ${cs}: some neighbor must change.${proof[0]}`, say[1] + ` Per ${cs} non resta nessun colore: qualche vicino va cambiato.${proof[1]}`];
      for (const u of dead) this.err.push({ v: this.ids.indexOf(u), j: -1, kind: 'undo' });
    }
    if (this.minsum() && to > 0) { say[0] += ` Color sum ${this.sum()}.`; say[1] += ` Somma dei colori ${this.sum()}.`; }
    this.show();
    return { moved: true, mistake: back, say };
  }
  // the end: the coloring compared with the solutions of the solver lanes
  // and, on the minimum sum coloring, its sum with the optimum
  verdict() {
    const same = [];
    let best = null;
    for (const L of this.ctx.results()) {
      const s = solutionOf(L, this.inst.colours);
      if (s && this.ids.every(v => s[v] === this.inst.colours[this.col.get(v)])) same.push(L.name);
      const r = L.result;
      if (L.header.encoding && L.header.encoding.form === 'wcnf' && r.status === 'optimal' && typeof r.cost === 'number') {
        if (!best || r.cost < best.cost) best = { cost: r.cost, by: [L.name] };
        else if (r.cost === best.cost) best.by.push(L.name);
      }
    }
    const s = this.sum(), w = foundBy(same, this.ctx.results().length);
    let en = 'Colored, with no two neighbors alike', it = 'Colorata, senza due vicini dello stesso colore';
    if (same.length) { en += `: the coloring that ${w[0]} found.`; it += `: è la colorazione trovata da ${w[1]}.`; }
    else { en += '; the solver lanes found other colorings.'; it += '; le corsie dei solutori ne hanno trovate altre.'; }
    if (best) {
      const by = [names(best.by, 'and'), names(best.by, 'e')], told = best.by.every(x => same.includes(x));
      if (s === best.cost) { en += ` Its color sum, ${s}, is the least${told ? '' : `, as ${by[0]} proved`}.`; it += ` La sua somma dei colori, ${s}, è la minima${told ? '' : `, come ha dimostrato ${by[1]}`}.`; }
      else { en += ` Its color sum is ${s}; the least, which ${by[0]} proved, is ${best.cost}.`; it += ` La sua somma dei colori è ${s}; la minima, dimostrata da ${by[1]}, è ${best.cost}.`; }
    }
    return [en, it];
  }
  hover(a) { this.over = a; this.show(); }
  key(e) {
    const n = this.ids.length, i = this.cur ? this.ids.indexOf(this.cur.v) : -1;
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (d) { const k = i < 0 ? 0 : (i + d + n) % n; this.cur = { v: this.ids[k], c: 'next' }; this.over = this.cur; this.show(); return true; }
    if (!this.cur) this.cur = { v: this.ids[0], c: 'next' };
    const v = this.cur.v;
    if (e.key === 'Enter' || e.key === ' ') return { v, c: 'next' };
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') return this.col.get(v) >= 0 ? { v, c: this.col.get(v) } : null;
    const j = /^[1-9]$/.test(e.key) ? +e.key - 1 : this.inst.colours.indexOf(e.key.toUpperCase());
    if (j >= 0 && j < this.k) return { v, c: j };
    return null;
  }
  // the regions with their colors; the pegs of the colors a neighbor has
  // shrink (with the hint); the region under the pointer or the cursor in a
  // gold frame, and the peg of the color a click would give it raised
  show() {
    const all = (1 << this.k) - 1, hint = this.opt ? this.opt.hint : true;
    const board = this.ids.map(id => {
      let mask = all;
      if (hint) { mask = 0; for (const j of this.free(id)) mask |= 1 << j; }
      return { id, colour: this.col.get(id), mask };
    });
    const focus = [...this.err], a = this.over || this.cur;
    if (a && this.col.has(a.v)) focus.push({ v: this.ids.indexOf(a.v), j: -1, kind: 'decide' });
    this.view.show(board, this.hot, focus);
    if (a && this.view.items.has(a.v)) {
      const cur = this.col.get(a.v), ok = this.free(a.v).filter(j => j !== cur);
      const to = a.c === 'next' ? (ok.find(j => j > cur) ?? (cur >= 0 ? -1 : ok[0])) : a.c;
      if (to !== undefined && to >= 0) this.view.items.get(a.v).pegs[to].scale.setScalar(1.6);
    }
    const tip = this.view.tip;
    while (tip.children.length) tip.remove(tip.children[0]);
    if (a && !this.view.named && this.view.items.has(a.v)) {
      const it = this.view.items.get(a.v), l = label(a.v, this.view.S.colors.ink, 0.07);
      l.position.set(it.g.position.x, it.g.position.y + it.size * 2.2, it.target + 0.06);
      tip.add(l);
    }
  }
}

// ------------------------------------------------------------------ Sudoku
const rc = i => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`;
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3, row = [], col = [], box = [];
  for (let k = 0; k < 9; k++) {
    if (r * 9 + k !== i) row.push(r * 9 + k);
    if (k * 9 + c !== i) col.push(k * 9 + c);
    const b = (br + Math.floor(k / 3)) * 9 + bc + k % 3;
    if (b !== i) box.push(b);
  }
  return { row, col, box };
});

// SudokuView with the picks of the cells and, under the board, a palette of
// the nine digits and a key that clears a cell
class PlaySudokuView extends SudokuView {
  constructor(box, inst) { super(box, inst); this.S.aim([0, -1.75, 2.95], [0, -0.1, 0]); }
  build() {
    super.build();
    const { S } = this, P = S.colors, u = this.u, w = u * 0.86;
    this.cells.forEach((it, i) => { it.m.userData.play = { sel: i }; });
    const ink = hex(P.ink), paper = hex(P.lilac);
    this.ptex = { on: [], off: [] };
    const geo = new THREE.BoxGeometry(w, w, u * 0.25);
    this.pal = [];
    for (let d = 1; d <= 10; d++) {
      const text = d < 10 ? String(d) : '×';
      this.ptex.on.push(digitTex(ink, paper, text));
      this.ptex.off.push(digitTex(hex(P.soft), hex(P.ground), text));
      const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.7 }), top = new THREE.MeshStandardMaterial({ map: this.ptex.on[d - 1], roughness: 0.7 });
      const m = new THREE.Mesh(geo, [side, side, side, side, top, side]);
      const x = (d - 5.5) * u, y = -4.5 * u - 0.03 - u * 1.05;
      m.position.set(x, y, u * 0.125);
      m.userData.play = { d: d % 10 };
      S.content.add(m);
      this.pal.push({ m, top, side, x, y });
    }
    this.pmarks = new Marks(S, u * 0.26);
  }
  frame(dt) { super.frame(dt); if (this.pmarks) this.pmarks.frame(dt); }
}

export class SudokuPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.ids = inst.vertices;
    const g = (inst.givens || '').replace(/[^\d.]/g, '');
    this.given = Array.from({ length: 81 }, (_, i) => (/[1-9]/.test(g[i]) ? +g[i] - 1 : -1));
    this.view = new PlaySudokuView(box, inst);
    this.help = ['A click on a cell picks it, then a digit typed or clicked under the board fills it (× or Delete clears it); the arrow keys move the pick. The dark cells are the givens and stay as they are.',
      'Un clic su una cella la sceglie, poi una cifra digitata o cliccata sotto la tavola la riempie (× o Canc la svuota); le frecce spostano la scelta. Le celle scure sono i dati del problema e restano come sono.'];
    this.options = [{ id: 'hint', en: 'show the candidates left', it: 'mostra i candidati rimasti', on: true }];
  }
  reset() { this.g = this.given.slice(); this.before = null; this.err = []; this.hot = new Set(); this.sel = null; this.over = null; this.show(); }
  filled() { return this.g.filter(v => v >= 0).length; }
  counters() { return [['cells', 'celle', `${this.filled()} / 81`]]; }
  targets() { return [...this.view.cells.map(c => c.m), ...this.view.pal.map(p => p.m)]; }
  actionAt(p) { return p ? { ...p } : null; }
  where(a) {
    const v = this.view;
    if (a.sel !== undefined) { const c = v.cells[a.sel]; return [[0, 0], [0.25, -0.25], [-0.25, 0.25]].map(([dx, dy]) => new THREE.Vector3(c.x + dx * v.u, c.y + dy * v.u, c.h)); }
    const p = v.pal[(a.d + 9) % 10];
    return new THREE.Vector3(p.x, p.y, v.u * 0.25);
  }
  // the digits (0..8) that a peer of i already holds
  used(i) { const s = new Set(); const P = PEERS[i]; for (const k of [...P.row, ...P.col, ...P.box]) if (this.g[k] >= 0) s.add(this.g[k]); return s; }
  key0() { return this.g.join(','); }
  act(a) {
    this.err = []; this.hot = new Set();
    if (a.sel !== undefined) {
      this.sel = a.sel;
      this.show();
      const i = a.sel;
      if (this.given[i] >= 0) return { say: [`${rc(i)} holds a given of the puzzle, ${this.given[i] + 1}, which stays as it is.`, `${rc(i)} contiene un dato del problema, ${this.given[i] + 1}, che resta com'è.`] };
      return { say: [`${rc(i)} picked: type a digit, or click one under the board.`, `Scelta ${rc(i)}: digita una cifra, o cliccane una sotto la tavola.`] };
    }
    const i = a.i !== undefined ? a.i : this.sel, d = a.d;
    if (i === null || i === undefined) return { say: ['Pick a cell first, with a click or the arrow keys.', 'Prima scegli una cella, con un clic o con le frecce.'] };
    this.sel = i;
    if (this.given[i] >= 0) { this.show(); return { say: [`${rc(i)} is a given of the puzzle and cannot change.`, `${rc(i)} è un dato del problema e non si può cambiare.`] }; }
    const cur = this.g[i], to = d >= 1 ? d - 1 : -1;
    if (to === cur) { this.show(); return { say: to >= 0 ? [`${rc(i)} already holds ${d}.`, `${rc(i)} contiene già ${d}.`] : [`${rc(i)} is already empty.`, `${rc(i)} è già vuota.`] }; }
    if (to >= 0) {
      const P = PEERS[i], units = [['row', 'riga', P.row], ['column', 'colonna', P.col], ['box', 'riquadro', P.box]];
      const hits = units.map(([en, it, ks]) => [en, it, ks.filter(k => this.g[k] === to)]).filter(x => x[2].length);
      if (hits.length) {
        this.hot.add(this.ids[i]); this.err.push({ v: i, kind: 'hot' });
        for (const [, , ks] of hits) for (const k of ks) { this.hot.add(this.ids[k]); this.err.push({ v: k, kind: 'hot' }); }
        this.show();
        const [en, it, ks] = hits[0], r = Math.floor(i / 9) + 1, c = (i % 9) + 1;
        const where = en === 'row' ? [`row ${r}`, `nella riga ${r}`] : en === 'column' ? [`column ${c}`, `nella colonna ${c}`] : ['its 3×3 box', 'nel suo riquadro 3×3'];
        return { mistake: true, say: [`Refused: ${d} is already in ${where[0]}, at ${rc(ks[0])} (red).`, `Rifiutato: il ${d} c'è già ${where[1]}, in ${rc(ks[0])} (in rosso).`] };
      }
    }
    const prev = this.key0();
    this.g[i] = to;
    const back = this.key0() === this.before;
    this.before = prev;
    const n = this.filled();
    let say = to >= 0 ? [`${d} in ${rc(i)}: ${n} of 81 cells filled.`, `${d} in ${rc(i)}: ${n} celle piene su 81.`] : [`You clear ${rc(i)}.`, `Svuoti ${rc(i)}.`];
    if (back) say = [say[0] + ' This undoes the move before: the grid is back where it was.', say[1] + ' Questo annulla la mossa di prima: la griglia torna com\'era.'];
    if (n === 81) { this.show(); return { moved: true, mistake: back, solved: true, say: this.verdict() }; }
    // a cell left with no digit: some digit must be taken back
    const dead = [];
    for (let k = 0; k < 81; k++) if (this.g[k] < 0 && this.used(k).size === 9) dead.push(k);
    if (dead.length) {
      const cs = dead.slice(0, 3).map(rc).join(', ') + (dead.length > 3 ? '...' : '');
      say = [say[0] + ` No digit is left for ${cs}: some digit must be taken back.`, say[1] + ` Per ${cs} non resta nessuna cifra: qualche cifra va ritirata.`];
      for (const k of dead) this.err.push({ v: k, kind: 'undo' });
    }
    this.show();
    return { moved: true, mistake: back, say };
  }
  verdict() {
    const same = [];
    for (const L of this.ctx.results()) {
      const s = solutionOf(L, this.inst.colours);
      if (s && this.ids.every((id, i) => s[id] === String(this.g[i] + 1))) same.push(L.name);
    }
    const head = ['Solved: every row, column and box holds the nine digits.', 'Risolto: ogni riga, colonna e riquadro contiene le nove cifre.'];
    const w = foundBy(same, this.ctx.results().length);
    return same.length ? [`${head[0]} It is the solution that ${w[0]} found.`, `${head[1]} È la soluzione trovata da ${w[1]}.`]
      : [`${head[0]} No solver lane holds a complete solution to compare with.`, `${head[1]} Nessuna corsia dei solutori ha una soluzione completa con cui confrontarla.`];
  }
  hover(a) { this.over = a; this.show(); }
  key(e) {
    const c = this.sel === null ? 0 : this.sel, r = Math.floor(c / 9), k = c % 9;
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (d) { this.sel = ((r + d[0] + 9) % 9) * 9 + (k + d[1] + 9) % 9; this.over = null; this.show(); return true; }
    if (/^[1-9]$/.test(e.key)) return { i: c, d: +e.key };
    if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') return { i: c, d: 0 };
    return null;
  }
  // the grid; with the hint, the pegs of the digits a peer holds shrink and
  // so do their keys in the palette; the cell picked in an ink frame, the
  // cell or the key under the pointer in a gold one
  show() {
    const v = this.view, hint = this.opt ? this.opt.hint : true, P = v.S.colors;
    const board = this.ids.map((id, i) => {
      let mask = 511;
      if (hint && this.g[i] < 0) for (const d of this.used(i)) mask &= ~(1 << d);
      return { id, colour: this.g[i], mask };
    });
    const focus = [...this.err];
    if (this.sel !== null) focus.push({ v: this.sel, kind: 'prop' });
    const a = this.over, pf = [];
    if (a && a.sel !== undefined) focus.push({ v: a.sel, kind: 'decide' });
    if (a && a.d !== undefined) pf.push({ v: (a.d + 9) % 10, kind: 'decide' });
    v.show(board, this.hot, focus);
    const used = this.sel !== null && hint && this.given[this.sel] < 0 ? this.used(this.sel) : new Set();
    v.pal.forEach((p, k) => { const off = k < 9 && used.has(k); p.top.map = (off ? v.ptex.off : v.ptex.on)[k]; p.side.color.copy(off ? P.ground : P.lilac); });
    v.pmarks.show(pf, k => { const p = v.pal[k]; return p ? [p.x, p.y, v.u * 0.95, v.u * 0.95] : null; });
  }
}
