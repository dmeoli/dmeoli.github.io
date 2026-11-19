// The Towers of Hanoi played in the lane "You" (play.js), on HanoiView of
// hanoi.js: a click on a peg lifts its top disk above it, a click on another
// peg drops the disk there, along the arc of the other lanes. A disk on a
// smaller one is refused, the two disks framed in red; moving the disk just
// moved again (back where it was, or on to a third peg, which one move would
// have done) counts as a mistake. The end is compared with the optimum that
// the searches proved.

import * as THREE from 'three';
import { HanoiView } from './hanoi.js';
import { optimum, against } from './play-stacks.js';

const plural = (k, one, many) => (k === 1 ? one : many);

export class HanoiPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.D = inst.disks; this.ctx = ctx;
    this.goal = inst.goal ? inst.goal[0] : 3;
    this.view = new HanoiView(box, inst);
    const build = this.view.build.bind(this.view);
    this.view.build = () => { build(); this.decorate(); };
    this.decorate();
    this.help = ['A click on a peg lifts its top disk, a click on another peg drops it there; the digits 1 to 4 do the same, and so do the arrow keys with Enter.',
      'Un clic su un piolo ne solleva il disco in cima, un clic su un altro piolo ve lo posa; lo stesso fanno le cifre da 1 a 4, e le frecce con Invio.'];
    this.options = [{ id: 'hint', en: 'show where it fits', it: 'mostra dove sta', on: false }];
  }
  // a column around each peg, the target of the pointer, shown faintly in
  // gold under the pointer (and, with the hint, where the disk lifted fits)
  decorate() {
    const v = this.view, P = v.S.colors, h = v.dh * (this.D + 3);
    this.cols = [0, 1, 2, 3].map(p => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(v.gap * 0.47, v.gap * 0.47, h, 32),
        new THREE.MeshStandardMaterial({ color: P.gold, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = Math.PI / 2;
      m.position.set(v.px(p), 0, h / 2);
      m.userData.play = p;
      v.S.content.add(m);
      return m;
    });
    // where the disk held would land: a gold ghost of it on the peg under the
    // pointer, and, with the hint, a fainter one on every peg where it fits
    this.ghosts = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, v.dh * 0.86, 40),
        new THREE.MeshStandardMaterial({ color: P.gold, emissive: P.gold, emissiveIntensity: 0.4, transparent: true, opacity: 0.5, depthWrite: false }));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      v.S.content.add(m);
      return m;
    });
    if (this.x) { if (this.held !== null) this.lift(); this.hover(this.over); }
  }
  reset() {
    this.x = this.inst.start.slice(); this.held = null; this.last = null; this.cur = null; this.err = []; this.n = 0;
    this.view.show(this.x.slice(), null);
    this.hover(null);
  }
  top(p) { for (let d = 0; d < this.D; d++) if (this.x[d] === p) return d; return -1; }
  fits(p) { const e = this.top(p); return p !== this.held && (e < 0 || e > this.top(this.held)); }
  counters() {
    return [['on peg 4', 'sul piolo 4', `${this.x.filter(p => p === this.goal).length} / ${this.D}`]];
  }
  targets() { return this.cols; }
  actionAt(p) { return { peg: p }; }
  where(a) {
    const v = this.view;
    // points up the axis of the column (its local y), from the base up
    return [0.4, 1, 2, 4].map(k => this.cols[a.peg].localToWorld(new THREE.Vector3(0, -v.dh * (this.D + 3) / 2 + v.dh * k, 0)));
  }
  // the disk held above its peg, as the tween of HanoiView moves the others
  lift() {
    const v = this.view, d = this.top(this.held), it = v.disks[d];
    it.from = v.pos(it); it.to = [v.px(this.held), v.dh * (this.D + 1.6)];
    it.t = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
    v.place();
  }
  act({ peg }) {
    if (!(peg >= 0 && peg < 4)) return null;
    const P = peg + 1, opt = optimum(this.ctx);
    this.err = [];
    if (this.held === null) {
      const d = this.top(peg);
      if (d < 0) { this.hover(null); return { say: [`Peg ${P} is empty: lift a disk from a peg that has one.`, `Il piolo ${P} è vuoto: solleva un disco da un piolo che ne ha.`] }; }
      this.held = peg;
      this.lift();
      this.hover(null);
      return { say: [`You lift disk ${d + 1} from peg ${P}: a click on the peg where it goes drops it there.`,
        `Sollevi il disco ${d + 1} dal piolo ${P}: un clic sul piolo dove va lo posa lì.`] };
    }
    const from = this.held, d = this.top(from), F = from + 1;
    if (peg === from) {
      this.held = null;
      this.view.show(this.x.slice(), null);
      this.hover(null);
      return { say: [`You put disk ${d + 1} back on peg ${P}.`, `Rimetti il disco ${d + 1} sul piolo ${P}.`] };
    }
    const e = this.top(peg);
    if (e >= 0 && e < d) {
      // refused: the disk stays lifted, so that another peg can be chosen
      this.err = [d, e];
      this.hover(null);
      return { mistake: true, say: [`Refused: disk ${d + 1} cannot go on disk ${e + 1} of peg ${P}, which is smaller (red).`,
        `Rifiutata: il disco ${d + 1} non può andare sul disco ${e + 1} del piolo ${P}, che è più piccolo (in rosso).`] };
    }
    const prev = this.last;
    this.x[d] = peg; this.held = null; this.last = { d, from, to: peg };
    const n = ++this.n;
    this.view.show(this.x.slice(), null);
    let mistake = false, say = [`You move disk ${d + 1} from peg ${F} to peg ${P}.`, `Sposti il disco ${d + 1} dal piolo ${F} al piolo ${P}.`];
    if (prev && prev.d === d) {
      mistake = true; this.err = [d];
      say = peg === prev.from
        ? [`You move disk ${d + 1} from peg ${F} back to peg ${P}, which undoes the move before (red).`,
          `Riporti il disco ${d + 1} dal piolo ${F} al piolo ${P}, e questo annulla la mossa di prima (in rosso).`]
        : [`You move disk ${d + 1} again, from peg ${F} to peg ${P}: one move from peg ${prev.from + 1} to peg ${P} would have done (red).`,
          `Sposti di nuovo il disco ${d + 1}, dal piolo ${F} al piolo ${P}: sarebbe bastata una mossa dal piolo ${prev.from + 1} al piolo ${P} (in rosso).`];
    }
    this.hover(null);
    if (this.x.every(p => p === this.goal)) {
      const cmp = against(n, opt, ['move', 'moves', 'mossa', 'mosse']);
      return { moved: true, mistake, solved: true, say: [`Solved in ${n} ${plural(n, 'move', 'moves')}. ${cmp[0]}`, `Risolto in ${n} ${plural(n, 'mossa', 'mosse')}. ${cmp[1]}`] };
    }
    if (opt && n >= opt.cost) { say[0] += ` The optimum is ${opt.cost} moves.`; say[1] += ` L'ottimo è di ${opt.cost} mosse.`; }
    return { moved: true, mistake, say };
  }
  // the peg under the pointer in gold, with the disk a click would lift (or
  // the disk held); the pegs where the held disk fits, with the hint; the
  // disks of a mistake in red until the next action
  hover(a) {
    const v = this.view, P = v.S.colors;
    this.over = a || null;
    const gold = P.gold.clone().multiplyScalar(0.5), rose = P.red.clone(), none = new THREE.Color(0, 0, 0);
    const lit = new Set();
    if (this.held !== null) lit.add(this.top(this.held));
    else if (a) { const d = this.top(a.peg); if (d >= 0) lit.add(d); }
    v.disks.forEach((it, d) => it.m.material.emissive.copy(this.err.includes(d) ? rose : lit.has(d) ? gold : none));
    this.cols.forEach((m, p) => {
      const on = a && a.peg === p, fit = this.opt && this.opt.hint && this.held !== null && this.fits(p);
      m.material.opacity = on && this.held === null ? 0.1 : 0;
      const g = this.ghosts[p], show = this.held !== null && p !== this.held && (on || fit);
      g.visible = show;
      if (show) {
        const d = this.top(this.held), r = 0.06 + 0.14 * (d + 1) / this.D, n = this.x.filter((q, e) => q === p).length;
        g.scale.set(r, 1, r);
        g.position.set(v.px(p), 0, v.dh * (n + 0.5));
        g.material.opacity = on ? 0.55 : 0.25;
        g.material.color.copy(on && !this.fits(p) ? P.red : P.gold);
        g.material.emissive.copy(g.material.color);
      }
    });
  }
  key(e) {
    if (/^[1-4]$/.test(e.key)) { this.cur = { peg: +e.key - 1 }; this.hover(this.cur); return { ...this.cur }; }
    const c = this.cur || { peg: this.held !== null ? this.held : 0 };
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) { this.cur = { peg: (c.peg + d + 4) % 4 }; this.hover(this.cur); return true; }
    if (e.key === 'Enter' || e.key === ' ') { this.cur = c; return { ...c }; }
    return null;
  }
}
