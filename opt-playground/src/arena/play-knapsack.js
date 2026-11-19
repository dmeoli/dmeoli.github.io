// The 0-1 knapsack played in the lane "You" (play.js), on KnapsackView of
// knapsack.js: a click on an item puts it into the knapsack (it rises onto
// the gold strip and the bar in front fills with its weight) or takes it
// out; an item that would exceed the capacity is refused, framed in red,
// and the part of its weight beyond the capacity is drawn in red past the
// end of the bar. The reader ends with a click on the tile ✓ (or the key
// D), and the end comes by itself when no item left fits; the value is then
// compared with the optimum that the solver lanes proved.

import * as THREE from 'three';
import { label } from '../stage3d.js';
import { t } from '../i18n.js';
import { KnapsackView } from './knapsack.js';
import { names } from './play.js';
import { solutionOf } from './play-cells.js';

const plural = (k, one, many) => (k === 1 ? one : many);

function tileTex(text, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 100px "IBM Plex Mono", monospace';
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// KnapsackView with the items to pick, the tile ✓ that closes the
// knapsack, the capacity written at the end of the bar, a segment of the
// bar that shows what a move would add or take away, and the name of the
// item under the pointer
class PlayKnapsackView extends KnapsackView {
  build() {
    super.build();
    const { S, inst, W } = this, P = S.colors;
    this.items.forEach((it, i) => { it.m.userData.play = { i }; });
    const face = new THREE.MeshStandardMaterial({ map: tileTex('✓', '#' + P.ink.getHexString(), '#' + P.lilac.getHexString()), roughness: 0.7, emissive: new THREE.Color(0, 0, 0) });
    const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.7, emissive: new THREE.Color(0, 0, 0) });
    this.done = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), [side, side, side, side, face, side]);
    this.done.position.set(W / 2 - 0.25, -0.72, 0.025);
    this.done.userData.play = { done: true };
    this.doneMats = [face, side];
    const cap = label(String(inst.cap), P.soft, 0.06);
    cap.position.set(W / 2 - 0.08, -0.6, 0.01);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: P.gold, transparent: true, opacity: 0.75 }));
    this.ghost.visible = false;
    // the end of the capacity, a tick across the bar
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: P.ink }));
    tick.position.set(W / 2, -0.5, 0.02);
    S.content.add(this.done, cap, this.ghost, tick);
    this.tag = null;
    if (this.preview) this.showPreview(...this.preview);
  }
  // a segment of the bar from weight a to weight b, in the colour of kind
  // (gold: added, red: beyond the capacity, soft: taken away), the item i
  // named above it, the tile ✓ lit
  showPreview(seg, i, lit) {
    this.preview = [seg, i, lit];
    const { W, S } = this, P = S.colors, cap = this.inst.cap;
    if (!this.ghost) return;
    if (seg) {
      const a = Math.min(seg.a, seg.b) / cap * W, b = Math.min(1.06 * W, Math.max(seg.a, seg.b) / cap * W);
      this.ghost.material.color.copy(seg.kind === 'hot' ? P.red : seg.kind === 'undo' ? P.soft : P.gold);
      this.ghost.scale.x = Math.max(0.002, b - a);
      this.ghost.position.set(-W / 2 + (a + b) / 2, -0.5, 0.025);
      this.ghost.visible = true;
    } else this.ghost.visible = false;
    if (this.tag) { S.content.remove(this.tag); this.tag.material.map.dispose(); this.tag = null; }
    if (i !== null && i !== undefined) {
      const it = this.items[i], { p, w } = this.inst;
      this.tag = label(t(`${this.inst.vertices[i]}: profit ${p[i]}, weight ${w[i]}`, `${this.inst.vertices[i]}: profitto ${p[i]}, peso ${w[i]}`), P.ink, 0.065);
      const half = this.tag.scale.x / 2;
      this.tag.position.set(Math.max(-W / 2 + half, Math.min(W / 2 - half, it.x)), it.ty, it.tz + it.hgt + 0.12);
      S.content.add(this.tag);
    }
    const glow = lit ? P.gold.clone().multiplyScalar(0.45) : new THREE.Color(0, 0, 0);
    this.doneMats.forEach(m => m.emissive.copy(glow));
  }
}

export class KnapsackPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx; this.n = inst.p.length;
    this.view = new PlayKnapsackView(box, inst);
    // a little farther than in the other lanes, to frame the tile ✓
    this.view.S.aim([0, -2.45, 1.95], [0, -0.1, 0.12]);
    this.moveName = ['moves', 'mosse'];
    this.panelButtons = [{ id: 'done', en: 'Close the knapsack', it: 'Chiudi lo zaino' }];
    this.button = () => ({ done: true });
    this.help = ['A click on an item puts it into the knapsack or takes it out, and a click on ✓ or on the button closes the knapsack; the arrow keys move a gold frame, Enter plays its item and D closes.',
      'Un clic su un oggetto lo mette nello zaino o lo toglie, e un clic su ✓ o sul pulsante chiude lo zaino; le frecce spostano una cornice dorata, Invio gioca il suo oggetto e D chiude.'];
    this.options = [{ id: 'fits', en: 'frame the items that still fit', it: 'incornicia gli oggetti che entrano ancora', on: false }];
  }
  reset() { this.inn = new Array(this.n).fill(false); this.cur = null; this.over = null; this.err = []; this.prevKey = null; this.show(); }
  weight() { return this.inn.reduce((s, b, i) => s + (b ? this.inst.w[i] : 0), 0); }
  value() { return this.inn.reduce((s, b, i) => s + (b ? this.inst.p[i] : 0), 0); }
  free() { return this.inst.cap - this.weight(); }
  fitting() { const f = this.free(); return this.inn.map((b, i) => i).filter(i => !this.inn[i] && this.inst.w[i] <= f); }
  counters() {
    return [['value', 'valore', this.value()], ['weight', 'peso', `${this.weight()} / ${this.inst.cap}`],
      ['items', 'oggetti', `${this.inn.filter(Boolean).length} / ${this.n}`]];
  }
  targets() { return [...this.view.items.map(it => it.m), this.view.done]; }
  actionAt(p) { return p.done ? { done: true } : { i: p.i }; }
  where(a) {
    if (a.done) return this.view.done.position.clone().setZ(0.05);
    const it = this.view.items[a.i], u = this.view.u;
    return [0.5, 0.75, 0.25, 0.95].map(h => new THREE.Vector3(it.x, it.y - u * 0.4, it.z + it.hgt * h)).concat([new THREE.Vector3(it.x, it.y, it.z + it.hgt)]);
  }
  // the optimum that a lane proved, and by whom
  optimum() {
    let best = null;
    for (const L of this.ctx.results()) {
      const r = L.result;
      if (!r || r.status !== 'optimal' || typeof r.cost !== 'number') continue;
      if (!best || r.cost > best.cost) best = { cost: r.cost, by: [L.name] };
      else if (r.cost === best.cost && !best.by.includes(L.name)) best.by.push(L.name);
    }
    return best;
  }
  verdict(head) {
    const V = this.value(), opt = this.optimum(), pc = (100 * V / (opt ? opt.cost : 1)).toFixed(1);
    const cmp = !opt ? ['No lane holds a proved optimum to compare with.', 'Nessuna corsia ha un ottimo dimostrato con cui confrontarlo.']
      : V >= opt.cost ? [`It is the optimum, found by ${names(opt.by, 'and')}.`, `È l'ottimo, trovato da ${names(opt.by, 'e')}.`]
      : [`The optimum, found by ${names(opt.by, 'and')}, is ${opt.cost}: ${opt.cost - V} more (you reach ${pc}% of it).`,
        `L'ottimo, trovato da ${names(opt.by, 'e')}, è ${opt.cost}: ${opt.cost - V} in più (ne raggiungi il ${pc.replace('.', ',')}%).`];
    return [`${head[0]} Final value ${V}. ${cmp[0]}`, `${head[1]} Valore finale ${V}. ${cmp[1]}`];
  }

  act(a) {
    const { inst } = this, before = this.inn.join(',');
    this.err = [];
    if (a.done) {
      const f = this.fitting();
      const head = f.length
        ? [`Knapsack closed while ${f.length} ${plural(f.length, 'item still fits', 'items still fit')}.`, `Zaino chiuso mentre ${f.length} ${plural(f.length, 'oggetto entra', 'oggetti entrano')} ancora.`]
        : ['Knapsack closed.', 'Zaino chiuso.'];
      this.show();
      return { solved: true, say: this.verdict(head) };
    }
    const i = a.i, name = inst.vertices[i], w = inst.w[i], p = inst.p[i];
    if (!(i >= 0 && i < this.n)) return null;
    let say;
    if (this.inn[i]) {
      this.inn[i] = false;
      say = [`You take ${name} out (profit ${p}, weight ${w}): value ${this.value()}, weight ${this.weight()} of ${inst.cap}.`,
        `Togli ${name} (profitto ${p}, peso ${w}): valore ${this.value()}, peso ${this.weight()} su ${inst.cap}.`];
    } else {
      const f = this.free();
      if (w > f) {
        this.err = [{ v: i, j: -1, kind: 'hot' }];
        this.show({ a: this.weight(), b: this.weight() + w, kind: 'hot' });
        return { mistake: true, say: [`Refused: ${name} weighs ${w} and only ${f} of the capacity is left, so it would exceed it by ${w - f} (red).`,
          `Rifiutato: ${name} pesa ${w} e restano solo ${f} di capacità, quindi la supererebbe di ${w - f} (in rosso).`] };
      }
      this.inn[i] = true;
      say = [`You take ${name} (profit ${p}, weight ${w}): value ${this.value()}, weight ${this.weight()} of ${inst.cap}.`,
        `Prendi ${name} (profitto ${p}, peso ${w}): valore ${this.value()}, peso ${this.weight()} su ${inst.cap}.`];
    }
    const r = { moved: true, say };
    if (this.inn.join(',') === this.prevKey) {
      r.mistake = true;
      say[0] += ' This undoes your previous move.'; say[1] += ' Questo annulla la tua mossa precedente.';
    }
    this.prevKey = before;
    const left = this.inn.map((b, k) => k).filter(k => !this.inn[k]);
    if (this.inn[i] && left.length && !this.fitting().length) {
      const m = Math.min(...left.map(k => inst.w[k]));
      r.solved = true;
      r.say = this.verdict([`You take ${name}, and nothing else fits (${this.free()} free, the lightest item left weighs ${m}).`,
        `Prendi ${name}, e non entra più niente (${this.free()} liberi, l'oggetto più leggero rimasto pesa ${m}).`]);
    } else if (!left.length) {
      r.solved = true;
      r.say = this.verdict([`You take ${name}: every item is in.`, `Prendi ${name}: tutti gli oggetti sono dentro.`]);
    }
    this.over = null;
    this.show();
    return r;
  }
  // undo, hint and replay (play.js)
  snap() { return { inn: this.inn.slice(), prevKey: this.prevKey }; }
  restore(s) { this.inn = s.inn.slice(); this.prevKey = s.prevKey; this.err = []; this.over = null; this.show(); }
  label(s0, s1) {
    const i = s1.inn.findIndex((b, k) => b !== s0.inn[k]), name = this.inst.vertices[i];
    return s1.inn[i] ? [`take ${name}`, `prendi ${name}`] : [`take ${name} out`, `togli ${name}`];
  }
  // the items of an optimum that a lane recorded (as x, as solution, the
  // items from 0, as items, or as a solution or model of the variables), or
  // null for traces that record its value only
  optSet() {
    for (const L of this.ctx.results()) {
      const r = L.result;
      if (!r || r.status !== 'optimal') continue;
      let take = null;
      if (Array.isArray(r.x) && r.x.length === this.n) take = r.x.map(Boolean);
      else if (Array.isArray(r.solution) && r.solution.every(Number.isInteger)) take = this.inst.vertices.map((v, i) => r.solution.includes(i));
      else if (Array.isArray(r.items)) take = this.inst.vertices.map((v, i) => r.items.includes(v) || r.items.includes(i));
      else { const s = solutionOf(L, this.inst.colours); if (s && Object.keys(s).length) take = this.inst.vertices.map(v => s[v] === 'in'); }
      if (take) return { by: L.name, take };
    }
    return null;
  }
  hint() {
    const O = this.optSet(), { inst } = this, opt = this.optimum();
    if (!O) {
      const v = opt ? [` (${opt.cost})`, ` (${opt.cost})`] : ['', ''];
      return { say: [`The traces record the value of the optimum${v[0]}, not the items it takes, so there is no item of it to suggest; the option "frame the items that still fit" shows which can still go in.`,
        `Le tracce registrano il valore dell'ottimo${v[1]}, non gli oggetti che prende, quindi non c'è un suo oggetto da suggerire; l'opzione "incornicia gli oggetti che entrano ancora" mostra quali possono ancora entrare.`] };
    }
    const extra = this.inn.map((b, i) => (b && !O.take[i] ? i : -1)).filter(i => i >= 0);
    if (extra.length) {
      this.hl = extra.map(i => ({ v: i, j: -1, kind: 'hot' }));
      this.show();
      const ns = extra.map(i => inst.vertices[i]);
      return { say: [`Your knapsack holds ${names(ns, 'and')}, which the optimum of ${O.by} leaves out (red): take ${extra.length > 1 ? 'them' : 'it'} out first.`,
        `Il tuo zaino contiene ${names(ns, 'e')}, che l'ottimo di ${O.by} lascia fuori (in rosso): prima ${extra.length > 1 ? 'toglili' : 'toglilo'}.`] };
    }
    const i = O.take.findIndex((b, k) => b && !this.inn[k] && inst.w[k] <= this.free());
    if (i < 0) return { say: ['Every item of the optimum is in: close the knapsack.', 'Ogni oggetto dell\'ottimo è dentro: chiudi lo zaino.'] };
    this.hl = [{ v: i, j: -1, kind: 'decide' }];
    this.show();
    return { shown: true, say: [`Hint (gold): take ${inst.vertices[i]} (profit ${inst.p[i]}, weight ${inst.w[i]}), an item of the optimum of ${O.by} that is not in yet and fits.`,
      `Suggerimento (in oro): prendi ${inst.vertices[i]} (profitto ${inst.p[i]}, peso ${inst.w[i]}), un oggetto dell'ottimo di ${O.by} che non è ancora dentro ed entra.`] };
  }
  unhint() { if (this.hl) { this.hl = null; this.show(); } }
  replay(states) {
    const O = this.optSet();
    if (!O) return { by: null, rows: [], first: 0, note: ['The traces record the value of the optimum, not its items, so no lane move can stand beside yours.', 'Le tracce registrano il valore dell\'ottimo, non i suoi oggetti, quindi nessuna mossa di una corsia può stare accanto alle tue.'] };
    let first = 0;
    const { vertices: V, p } = this.inst;
    const rows = states.slice(1).map((s, k) => {
      const i = s.inn.findIndex((b, j) => b !== states[k].inn[j]), name = V[i];
      if (!first && s.inn[i] && !O.take[i]) first = k + 1;
      return O.take[i] ? [`${name} is in the optimum`, `${name} è nell'ottimo`] : [`${name} is not`, `${name} non c'è`];
    });
    // after your moves, the items of the optimum that your knapsack lacks
    const end = states[states.length - 1].inn;
    for (let i = 0; i < this.n; i++) if (O.take[i] && !end[i]) rows.push([`${V[i]}: in the optimum, not in yours`, `${V[i]}: nell'ottimo, non nel tuo`]);
    const its = V.filter((v, i) => O.take[i]), val = p.reduce((a, q, i) => a + (O.take[i] ? q : 0), 0);
    return { by: [O.by, O.by], rows, first, note: [`The optimum of ${O.by} takes ${names(its, 'and')}, of value ${val}.`, `L'ottimo di ${O.by} prende ${names(its, 'e')}, di valore ${val}.`] };
  }
  // what a would do: its item framed in gold and named, the bar extended
  // by its weight (red beyond the capacity) or shortened by it
  hover(a) { this.over = a; this.show(); }
  show(seg = null) {
    const { inst } = this, focus = [...this.err, ...(this.hl || [])], a = this.over || (this.cur !== null ? { i: this.cur } : null), wt = this.weight();
    if (this.opt && this.opt.fits) for (const i of this.fitting()) focus.push({ v: i, j: -1, kind: 'undo' });
    let named = null;
    if (a && a.i !== undefined) {
      focus.push({ v: a.i, j: -1, kind: 'decide' });
      named = a.i;
      if (!seg) {
        const w = inst.w[a.i];
        seg = this.inn[a.i] ? { a: wt - w, b: wt, kind: 'undo' } : { a: wt, b: wt + w, kind: wt + w > inst.cap ? 'hot' : 'decide' };
      }
    }
    if (!named && this.err.length) named = this.err[0].v;
    this.view.show(inst.vertices.map((id, i) => ({ id, colour: this.inn[i] ? 1 : -1, mask: 3 })), new Set(), focus);
    this.view.showPreview(seg, named, !!(a && a.done));
  }
  key(e) {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (d) {
      this.cur = this.cur === null ? (d > 0 ? 0 : this.n - 1) : (this.cur + d + this.n) % this.n;
      this.over = null; this.err = []; this.show(); return true;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.cur !== null) return { i: this.cur };
    if (e.key === 'd' || e.key === 'D') return { done: true };
    return null;
  }
}
