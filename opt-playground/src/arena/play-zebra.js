// The zebra puzzle played in the lane "You" (play.js), on the grid of
// ZebraView (puzzles.js): the rows are the five groups of attributes, the
// columns the five houses. A click on a cell puts there the next attribute
// of its row that no rule rules out (a click on a peg, that attribute); a
// placement that breaks a clue of the puzzle, or puts an attribute in two
// houses or two attributes of a group in one house, is refused, and the
// clue is quoted. The clues are those of Zebra() in aima.csp, which the
// instance does not carry.

import * as THREE from 'three';
import { label } from '../stage3d.js';
import { ZebraView } from './puzzles.js';
import { names } from './play.js';
import { t, onLang } from '../i18n.js';
import { solutionOf, foundBy } from './play-cells.js';

const GROUPS = [['colors', 'colori', 'color', 'colore'], ['pets', 'animali', 'pet', 'animale'], ['drinks', 'bevande', 'drink', 'bevanda'],
  ['nationalities', 'nazionalità', 'nationality', 'nazionalità'], ['smokes', 'sigarette', 'brand of smokes', 'marca di sigarette']];

// the clues of aima.csp.Zebra: two attributes and the relation of their
// houses (a, b numbered from 1), or one attribute and its house
const SAME = (a, b) => a === b, NEXT = (a, b) => Math.abs(a - b) === 1;
const CLUES = [
  ['Englishman', 'Red', SAME, 'The Englishman lives in the red house.', 'L\'inglese abita nella casa rossa.'],
  ['Spaniard', 'Dog', SAME, 'The Spaniard owns the dog.', 'Lo spagnolo ha il cane.'],
  ['Kools', 'Yellow', SAME, 'Kools are smoked in the yellow house.', 'Nella casa gialla si fumano le Kools.'],
  ['Chesterfields', 'Fox', NEXT, 'The man who smokes Chesterfields lives next to the man with the fox.', 'Chi fuma Chesterfield abita accanto a chi ha la volpe.'],
  ['Norwegian', 'Blue', NEXT, 'The Norwegian lives next to the blue house.', 'Il norvegese abita accanto alla casa blu.'],
  ['Winston', 'Snails', SAME, 'The Winston smoker owns snails.', 'Chi fuma Winston ha le lumache.'],
  ['LuckyStrike', 'OJ', SAME, 'The Lucky Strike smoker drinks orange juice.', 'Chi fuma Lucky Strike beve succo d\'arancia.'],
  ['Ukrainian', 'Tea', SAME, 'The Ukrainian drinks tea.', 'L\'ucraino beve tè.'],
  ['Japanese', 'Parliaments', SAME, 'The Japanese smokes Parliaments.', 'Il giapponese fuma Parliament.'],
  ['Kools', 'Horse', NEXT, 'Kools are smoked in the house next to the house where the horse is kept.', 'Le Kools si fumano nella casa accanto a quella del cavallo.'],
  ['Coffee', 'Green', SAME, 'Coffee is drunk in the green house.', 'Nella casa verde si beve caffè.'],
  ['Green', 'Ivory', (a, b) => a === b + 1, 'The green house is immediately to the right of the ivory house.', 'La casa verde è subito a destra di quella avorio.']];
const FIXED = [['Norwegian', 1, 'The Norwegian lives in the first house.', 'Il norvegese abita nella prima casa.'],
  ['Milk', 3, 'Milk is drunk in the middle house.', 'Nella casa di mezzo si beve latte.']];

// ZebraView with the picks of the cells and of the pegs, the numbers of the
// houses over the columns and, under the grid, the legend of one row: its
// attributes with the color of their pegs and the digit of their key
class PlayZebraView extends ZebraView {
  constructor(box, inst) { super(box, inst); this.S.aim([0, -1.25, 2.3], [0, -0.1, 0]); }
  build() {
    super.build();
    const { S, inst, v } = this, P = S.colors, H = inst.colours.length;
    this.cells.forEach((row, g) => row.forEach((c, h) => {
      c.m.userData.play = { g, h, j: 'next' };
      c.pegs.forEach((p, j) => { p.userData.play = { g, h, j }; });
    }));
    for (let h = 0; h < H; h++) {
      const l = label(String(h + 1), P.soft, 0.06);
      l.position.set(this.cells[0][h].x, this.cells[0][0].y + v * 0.62, 0.01);
      S.content.add(l);
    }
    this.leg = new THREE.Group();
    // the name of the attribute that a click would place, over its cell
    this.tip = new THREE.Group();
    S.content.add(this.leg, this.tip);
    this.legRow = -1;
  }
  // the legend of row g, in two lines under the grid, sized to its width
  legend(g, name) {
    if (g === this.legRow && name === this.legName) return;
    this.legRow = g; this.legName = name;
    while (this.leg.children.length) this.leg.remove(this.leg.children[0]);
    const P = this.S.colors, grp = this.inst.groups[g], u = this.u, W = u * grp.length;
    const y0 = this.cells[this.cells.length - 1][0].y - this.v * 0.75;
    const lines = [[`${name}:`, ...grp.slice(0, 3).map((a, j) => [j, a])], grp.slice(3).map((a, j) => [j + 3, a])];
    const size = 0.06;
    const built = lines.map(items => items.map(it => {
      const l = label(typeof it === 'string' ? it : `${it[0] + 1} ${it[1]}`, typeof it === 'string' ? P.soft : P.ink, size);
      return { l, w: l.scale.x + (typeof it === 'string' ? 0.03 : 0.07), j: typeof it === 'string' ? -1 : it[0] };
    }));
    const k = Math.min(1, W / Math.max(...built.map(b => b.reduce((s, x) => s + x.w, 0))));
    built.forEach((items, r) => {
      let x = -items.reduce((s, it) => s + it.w, 0) * k / 2;
      const y = y0 - r * size * 1.35 * k;
      for (const it of items) {
        it.l.scale.multiplyScalar(k);
        it.l.center.set(0, 0.5);
        if (it.j >= 0) {
          const sw = new THREE.Mesh(new THREE.BoxGeometry(0.03 * k, 0.03 * k, 0.01), this.cells[g][0].pegs[it.j].material);
          sw.position.set(x + 0.02 * k, y, 0.005);
          this.leg.add(sw);
          it.l.position.set(x + 0.045 * k, y, 0.01);
        } else it.l.position.set(x, y, 0.01);
        this.leg.add(it.l);
        x += it.w * k;
      }
    });
  }
}

export class ZebraPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.ids = inst.vertices; this.G = inst.groups; this.H = inst.colours.length;
    this.idx = new Map(this.ids.map((a, i) => [a, i]));
    this.grp = new Map();
    this.G.forEach((grp, g) => grp.forEach((a, j) => this.grp.set(a, [g, j])));
    this.view = new PlayZebraView(box, inst);
    onLang(() => this.show());
    this.help = ['A click on a cell puts there the next attribute of its row that no rule rules out (a click on one of its pegs, that attribute); the arrow keys move a gold frame, Enter, the digits 1 to 5 or Delete act on its cell. The legend under the grid names the attributes of the row in use.',
      'Un clic su una cella vi mette il prossimo attributo della sua riga che nessuna regola esclude (un clic su uno dei suoi pioli, quell\'attributo); le frecce spostano una cornice dorata, Invio, le cifre da 1 a 5 o Canc agiscono sulla sua cella. La legenda sotto la griglia nomina gli attributi della riga in uso.'];
    this.options = [{ id: 'hint', en: 'show only the attributes no rule rules out', it: 'mostra solo gli attributi che nessuna regola esclude', on: true }];
  }
  reset() { this.house = this.ids.map(() => -1); this.before = null; this.err = []; this.hot = new Set(); this.cur = null; this.over = null; this.show(); }
  placed() { return this.house.filter(h => h >= 0).length; }
  counters() { return [['placed', 'posati', `${this.placed()} / ${this.ids.length}`]]; }
  targets() { return this.view.cells.flatMap(row => row.flatMap(c => [c.m, ...c.pegs.filter(p => p.visible)])); }
  actionAt(p) { return p ? { ...p } : null; }
  where(a) {
    const c = this.view.cells[a.g][a.h], u = this.view.u, v = this.view.v;
    if (a.j !== 'next' && a.j >= 0) return c.pegs[a.j].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, u * 0.12));
    return [[0, 0.28], [0, -0.28], [0.3, 0.3], [-0.3, -0.3], [0, 0]].map(([dx, dy]) => new THREE.Vector3(c.x + dx * u, c.y + dy * v, c.h));
  }
  occupant(g, h) { return this.G[g].find(a => this.house[this.idx.get(a)] === h); }
  // the first rule that attribute a in house h (0-based) would break, with
  // the attributes it involves: [en, it, others]
  broken(a, h) {
    const [g] = this.grp.get(a), occ = this.occupant(g, h), [gen, git, one, uno] = GROUPS[g];
    if (occ && occ !== a) return [`house ${h + 1} already has ${occ}, and each house has one ${one}`, `la casa ${h + 1} ha già ${occ}, e ogni casa ha un solo attributo fra i ${git}`, [occ]];
    const at = this.house[this.idx.get(a)];
    if (at >= 0 && at !== h) return [`${a} already stands in house ${at + 1}, and each of the ${gen} stands in one house`, `${a} sta già nella casa ${at + 1}, e ciascuno dei ${git} sta in una sola casa`, [a]];
    for (const [x, n, en, it] of FIXED) if (x === a && h + 1 !== n) return [`it breaks the clue "${en}"`, `viola l'indizio "${it}"`, []];
    for (const [x, y, rel, en, it] of CLUES) {
      if (x !== a && y !== a) continue;
      const b = x === a ? y : x, hb = this.house[this.idx.get(b)];
      if (hb < 0) continue;
      const ok = x === a ? rel(h + 1, hb + 1) : rel(hb + 1, h + 1);
      if (!ok) return [`it breaks the clue "${en}"`, `viola l'indizio "${it}"`, [b], `${b} is in house ${hb + 1}; `, `${b} è nella casa ${hb + 1}; `];
    }
    return null;
  }
  // the attributes of row g that may go in house h
  allowed(g, h) { return this.G[g].filter(a => !this.broken(a, h)); }
  key0() { return this.house.join(','); }
  // the attribute that a click on cell (g, h) would place, or null for the
  // cell cleared, or undefined when nothing may go there
  next(g, h) {
    const occ = this.occupant(g, h), ok = this.G[g].filter(a => a === occ || !this.brokenIgnoring(a, h, occ));
    const j0 = occ ? this.G[g].indexOf(occ) : -1, after = ok.map(a => this.G[g].indexOf(a)).filter(j => j > j0 && this.G[g][j] !== occ);
    if (after.length) return this.G[g][after[0]];
    if (occ) return null;
    return undefined;
  }
  // as broken, with the attribute that the cell holds taken out first
  brokenIgnoring(a, h, occ) {
    if (!occ) return this.broken(a, h);
    const k = this.idx.get(occ), was = this.house[k];
    this.house[k] = -1;
    const r = this.broken(a, h);
    this.house[k] = was;
    return r;
  }
  act({ g, h, j }) {
    this.err = []; this.hot = new Set();
    this.cur = { g, h, j: 'next' };
    const occ = this.occupant(g, h), grp = this.G[g];
    let a;
    if (j === 'next') {
      a = this.next(g, h);
      if (a === undefined) {
        this.err.push({ v: this.idx.get(grp[0]), j: -1, kind: 'hot' });
        this.show();
        return { mistake: true, say: [`Refused: no attribute of the ${GROUPS[g][0]} may go in house ${h + 1}, since each would break a rule; some placement must be taken back.`,
          `Rifiutata: nessun attributo fra i ${GROUPS[g][1]} può andare nella casa ${h + 1}, perché ciascuno violerebbe una regola; qualche attributo va ritirato.`] };
      }
    } else a = j >= 0 ? grp[j] : null;
    if (a === occ) a = null;          // the attribute of the cell, picked again: taken back
    if (a === null && !occ) return { say: [`House ${h + 1} has no attribute of the ${GROUPS[g][0]} yet.`, `La casa ${h + 1} non ha ancora un attributo fra i ${GROUPS[g][1]}.`] };
    if (a) {
      const why = j === 'next' ? this.brokenIgnoring(a, h, occ) : this.broken(a, h);
      if (why) {
        const k = this.idx.get(a);
        this.err.push({ v: k, j: h, kind: 'hot' });
        for (const b of why[2]) { const kb = this.idx.get(b); this.hot.add(b); this.err.push({ v: kb, j: this.house[kb], kind: 'hot' }); }
        this.show();
        return { mistake: true, say: [`Refused: ${a} in house ${h + 1}: ${why[0]} (${why[3] || ''}red frames).`, `Rifiutato: ${a} nella casa ${h + 1}: ${why[1]} (${why[4] || ''}cornici rosse).`] };
      }
    }
    const prev = this.key0();
    if (occ) this.house[this.idx.get(occ)] = -1;
    if (a) this.house[this.idx.get(a)] = h;
    const back = this.key0() === this.before;
    this.before = prev;
    const n = this.placed();
    let say = a ? [`${a} in house ${h + 1}: ${n} of 25 placed.`, `${a} nella casa ${h + 1}: posati ${n} su 25.`] : [`You take ${occ} back from house ${h + 1}.`, `Ritiri ${occ} dalla casa ${h + 1}.`];
    if (back) say = [say[0] + ' This undoes the move before: the grid is back where it was.', say[1] + ' Questo annulla la mossa di prima: la griglia torna com\'era.'];
    if (n === this.ids.length) { this.show(); return { moved: true, mistake: back, solved: true, say: this.verdict() }; }
    // a cell that no attribute may fill any more
    const dead = [];
    this.G.forEach((grp2, g2) => { for (let h2 = 0; h2 < this.H; h2++) if (!this.occupant(g2, h2) && !this.allowed(g2, h2).length) dead.push([g2, h2]); });
    if (dead.length) {
      const [g2, h2] = dead[0];
      say = [say[0] + ` No attribute of the ${GROUPS[g2][0]} may go in house ${h2 + 1} any more: some placement must be taken back.`,
        say[1] + ` Nella casa ${h2 + 1} non può più andare nessun attributo fra i ${GROUPS[g2][1]}: qualche attributo va ritirato.`];
      for (const [g3, h3] of dead) this.err.push({ v: this.idx.get(this.G[g3][0]), j: h3, kind: 'undo' });
    }
    this.show();
    return { moved: true, mistake: back, say };
  }
  verdict() {
    const same = [];
    for (const L of this.ctx.results()) {
      const s = solutionOf(L, this.inst.colours);
      if (s && this.ids.every((a, k) => s[a] === String(this.house[k] + 1))) same.push(L.name);
    }
    const hz = this.house[this.idx.get('Zebra')], hw = this.house[this.idx.get('Water')];
    const who = h => this.G[3].find(a => this.house[this.idx.get(a)] === h);
    let en = `Solved: the ${who(hz)} owns the zebra, and the ${who(hw)} drinks water.`, it = `Risolto: la zebra è di ${who(hz)}, e ${who(hw)} beve acqua.`;
    if (same.length) { const w = foundBy(same, this.ctx.results().length); en += ` It is the solution that ${w[0]} found.`; it += ` È la soluzione trovata da ${w[1]}.`; }
    else { en += ' No solver lane holds a complete solution to compare with.'; it += ' Nessuna corsia dei solutori ha una soluzione completa con cui confrontarla.'; }
    return [en, it];
  }
  hover(a) { this.over = a; this.show(); }
  key(e) {
    const c = this.cur || { g: 0, h: 0 };
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (d) { this.cur = { g: (c.g + d[0] + this.G.length) % this.G.length, h: (c.h + d[1] + this.H) % this.H, j: 'next' }; this.over = this.cur; this.show(); return true; }
    this.cur = { ...c, j: 'next' };
    if (e.key === 'Enter' || e.key === ' ') return { g: c.g, h: c.h, j: 'next' };
    if (/^[1-9]$/.test(e.key) && +e.key <= this.G[c.g].length) return { g: c.g, h: c.h, j: +e.key - 1 };
    if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') { const o = this.occupant(c.g, c.h); return o ? { g: c.g, h: c.h, j: this.G[c.g].indexOf(o) } : null; }
    return null;
  }
  // the grid; with the hint, a cell shows as pegs only the attributes no
  // rule rules out; the cell under the pointer or the cursor in a gold
  // frame, with the name of what a click would place over it
  show() {
    const v = this.view, hint = this.opt ? this.opt.hint : true, P = v.S.colors;
    const board = this.ids.map((id, k) => {
      const [g] = this.grp.get(id);
      let mask = 0;
      for (let h = 0; h < this.H; h++) if (!hint || (!this.occupant(g, h) && !this.broken(id, h))) mask |= 1 << h;
      return { id, colour: this.house[k], mask };
    });
    const focus = [...this.err], a = this.over || this.cur;
    if (a) focus.push({ v: this.idx.get(this.G[a.g][0]), j: a.h, kind: 'decide' });
    v.show(board, this.hot, focus);
    const lg = a ? a.g : 0;
    v.legend(lg, t(GROUPS[lg][0], GROUPS[lg][1]));
    // ZebraView frames the cell of the group of v: any attribute of the row will do
    while (v.tip.children.length) v.tip.remove(v.tip.children[0]);
    if (a) {
      const occ = this.occupant(a.g, a.h);
      let what = a.j === 'next' ? this.next(a.g, a.h) : a.j >= 0 ? this.G[a.g][a.j] : null;
      if (what === occ) what = null;
      const text = what ? what : what === null && occ ? '×' : '';
      if (text) {
        const c = v.cells[a.g][a.h], l = label(text, P.ink, 0.075);
        l.position.set(c.x, c.y + v.v * 0.12, c.target + 0.12);
        v.tip.add(l);
      }
    }
  }
}
