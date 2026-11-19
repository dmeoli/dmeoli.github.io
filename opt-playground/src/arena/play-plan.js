// The planning problems played in the lane "You" (play.js), on PlanView
// (plan.js) with the frames of Marks (cells.js) added. The reader applies
// the actions of the problem, listed under the board, from the initial
// state; an action whose preconditions do not hold is refused, and the
// fluents that fail are framed in red. The actions are those of the
// problems of aima.planning, grounded here on the objects of the problem
// (the instance of a trace names its problem and its fluents only); the end
// is compared with the shortest plan that the searches proved.

import { PlanView } from './plan.js';
import { Marks } from './cells.js';
import { names } from './play.js';
import { bi } from '../i18n.js';

const plural = (k, one, many) => (k === 1 ? one : many);
const atom = (p, ...a) => `${p}(${a.join(', ')})`;

// the actions of the problems of aima.planning, grounded: { name, pre,
// not (preconditions that must be false), add, del }, fluents by name
const DOMAINS = {
  three_block_tower() {
    const B = ['A', 'B', 'C'], out = [];
    for (const b of B) for (const x of [...B, 'Table']) for (const y of B) {
      if (b === x || b === y || x === y) continue;
      out.push({ name: atom('Move', b, x, y), pre: [atom('On', b, x), atom('Clear', b), atom('Clear', y)],
        add: [atom('On', b, y), atom('Clear', x)], del: [atom('On', b, x), atom('Clear', y)] });
    }
    for (const b of B) for (const x of B) if (b !== x) {
      out.push({ name: atom('MoveToTable', b, x), pre: [atom('On', b, x), atom('Clear', b)],
        add: [atom('On', b, 'Table'), atom('Clear', x)], del: [atom('On', b, x)] });
    }
    return out;
  },
  spare_tire() {
    const T = ['Flat', 'Spare'], out = [];
    for (const o of T) for (const l of ['Axle', 'Trunk', 'Flat', 'Spare']) if (l !== o) {
      out.push({ name: atom('Remove', o, l), pre: [atom('At', o, l)], add: [atom('At', o, 'Ground')], del: [atom('At', o, l)] });
    }
    for (const o of T) out.push({ name: atom('PutOn', o, 'Axle'), pre: [atom('At', o, 'Ground')], not: [atom('At', 'Flat', 'Axle')],
      add: [atom('At', o, 'Axle')], del: [atom('At', o, 'Ground')] });
    out.push({ name: 'LeaveOvernight', pre: [], add: [], del: T.flatMap(o => ['Ground', 'Axle', 'Trunk'].map(l => atom('At', o, l))) });
    return out;
  },
  air_cargo() {
    const C = ['C1', 'C2'], P = ['P1', 'P2'], A = ['JFK', 'SFO'], out = [];
    for (const c of C) for (const p of P) for (const a of A) {
      out.push({ name: atom('Load', c, p, a), pre: [atom('At', c, a), atom('At', p, a)], add: [atom('In', c, p)], del: [atom('At', c, a)] });
    }
    for (const c of C) for (const p of P) for (const a of A) {
      out.push({ name: atom('Unload', c, p, a), pre: [atom('In', c, p), atom('At', p, a)], add: [atom('At', c, a)], del: [atom('In', c, p)] });
    }
    for (const p of P) for (const f of A) for (const to of A) if (f !== to) {
      out.push({ name: atom('Fly', p, f, to), pre: [atom('At', p, f)], add: [atom('At', p, to)], del: [atom('At', p, f)] });
    }
    return out;
  },
};

// PlanView with frames on its tiles, made again with the scene
class PlayPlanView extends PlanView {
  build() {
    super.build();
    this.marks = new Marks(this.S, 0);
    if (this.after) this.after();
  }
  frame(dt) { super.frame(dt); if (this.marks) this.marks.frame(dt); }
}

export class PlanningPlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx;
    this.idx = new Map(inst.fluents.map((f, i) => [f, i]));
    const make = DOMAINS[inst.problem];
    // a fluent that the instance does not list is false in every state
    this.actions = make ? make().map(a => ({ ...a, pre: a.pre.map(f => this.idx.get(f) ?? -1), not: (a.not || []).map(f => this.idx.get(f) ?? -1),
      add: a.add.map(f => this.idx.get(f)).filter(i => i !== undefined), del: a.del.map(f => this.idx.get(f)).filter(i => i !== undefined) })) : [];
    this.view = new PlayPlanView(box, inst);
    this.view.after = () => this.show();
    this.moveName = ['actions', 'azioni'];
    this.help = ['A click on an action of the list applies it to your state (passing the pointer over it shows on the board what it needs and what it changes); with the board in focus the arrow keys run through the list and Enter applies.',
      'Un clic su un\'azione della lista la applica al tuo stato (passando col puntatore sopra un\'azione, la tavola mostra cosa richiede e cosa cambia); con la tavola attiva le frecce scorrono la lista e Invio applica.'];
    this.options = [{ id: 'hint', en: 'dim the actions that cannot be applied', it: 'attenua le azioni non applicabili', on: true }];
    // the list of the actions, under the board, in the panel of the lane:
    // one row per action schema, its name once and a button per grounding
    this.list = document.createElement('div');
    this.list.className = 'playacts';
    this.list.style.cssText = 'margin-top:.3em;font-size:.72em;font-family:"IBM Plex Mono",monospace';
    this.cap = document.createElement('p');
    this.cap.style.cssText = 'margin:.6em 0 0;font-size:.85em;color:var(--ink-soft)';
    this.cap.innerHTML = bi('Actions of the problem (a click applies one)', 'Azioni del problema (un clic ne applica una)');
    const rows = new Map();
    this.buttons = this.actions.map((a, i) => {
      const m = /^(\w+)(\(.*\))?$/.exec(a.name), head = m[1];
      if (!rows.has(head)) {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex;flex-wrap:wrap;gap:.25em;align-items:center;margin:.3em 0';
        const h = document.createElement('span');
        h.textContent = head; h.style.cssText = 'color:var(--ink-soft);margin-right:.2em';
        r.append(h); this.list.append(r); rows.set(head, r);
      }
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = m[2] || head; b.title = a.name; b.dataset.act = i;
      b.setAttribute('aria-label', a.name);
      b.style.cssText = 'font:inherit;padding:.1em .3em;border-radius:4px;white-space:nowrap;cursor:pointer;background:var(--panel, transparent);color:var(--ink);border:1px solid var(--rule)';
      b.onclick = () => this.send({ i });
      b.onmouseenter = b.onfocus = () => this.hover({ i });
      b.onmouseleave = b.onblur = () => this.hover(null);
      rows.get(head).append(b);
      return b;
    });
    this.box = box;
  }
  // a click on the list goes through the keys of the board, so that the
  // lane counts it as any other move
  send(a) {
    this.pending = a;
    this.view.S.renderer.domElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    this.pending = null;
  }
  reset() {
    const panel = this.box.parentElement && this.box.parentElement.querySelector('.panel');
    if (panel && !panel.contains(this.list)) panel.append(this.cap, this.list);
    this.x = new Set(this.inst.initial); this.before = null; this.plan = []; this.err = []; this.over = null; this.cur = null;
    this.view.show([...this.x]);
    this.show();
  }
  fl(i) { return i >= 0 ? this.inst.fluents[i] : '?'; }
  missing(a) { return { pre: a.pre.filter(i => !this.x.has(i)), not: a.not.filter(i => i >= 0 && this.x.has(i)) }; }
  can(a) { const m = this.missing(a); return !m.pre.length && !m.not.length; }
  apply(a) { const y = new Set(this.x); for (const i of a.add) y.add(i); for (const i of a.del) if (!a.add.includes(i)) y.delete(i); return y; }
  goals() { return this.inst.goal.filter(i => this.x.has(i)).length; }
  best() {
    let best = null;
    for (const L of this.ctx.results()) {
      const r = L.result;
      if (!r || r.status !== 'optimal' || typeof r.cost !== 'number') continue;
      if (!best || r.cost < best.cost) best = { cost: r.cost, by: [L.name] };
      else if (r.cost === best.cost && !best.by.includes(L.name)) best.by.push(L.name);
    }
    return best;
  }
  counters() {
    const o = this.best();
    return [['goals', 'obiettivi', `${this.goals()} / ${this.inst.goal.length}`], ['applicable', 'applicabili', this.actions.filter(a => this.can(a)).length],
      ['optimum', 'ottimo', o ? o.cost : '–']];
  }
  targets() { return []; }
  actionAt() { return null; }
  where() { return this.view.tiles[0] ? this.view.tiles[0].m.position.clone() : null; }
  act({ i }) {
    const a = this.actions[i];
    if (!a) return null;
    this.err = [];
    const m = this.missing(a);
    if (m.pre.length || m.not.length) {
      for (const k of [...m.pre, ...m.not]) if (k >= 0) this.err.push({ v: k, kind: 'hot' });
      const en = [], it = [];
      if (m.pre.length) {
        const f = m.pre.map(k => this.fl(k));
        en.push(`${names(f, 'and')}, which ${plural(f.length, 'is', 'are')} false now`);
        it.push(`${names(f, 'e')}, ${plural(f.length, 'che ora è falso', 'che ora sono falsi')}`);
      }
      if (m.not.length) {
        const f = m.not.map(k => this.fl(k));
        en.push(`${names(f, 'and')} to be false, and ${plural(f.length, 'it is', 'they are')} true`);
        it.push(`che ${names(f, 'e')} ${plural(f.length, 'sia falso, e invece è vero', 'siano falsi, e invece sono veri')}`);
      }
      this.show();
      return { mistake: true, say: [`Refused: ${a.name} needs ${en.join(', and ')} (red).`, `Rifiutata: ${a.name} richiede ${it.join(', e ')} (in rosso).`] };
    }
    const y = this.apply(a), same = (p, q) => p && q && p.size === q.size && [...p].every(v => q.has(v));
    if (same(y, this.x)) { this.show(); return { say: [`${a.name} changes nothing in this state.`, `${a.name} non cambia niente in questo stato.`] }; }
    const back = same(y, this.before);
    const on = a.add.filter(k => !this.x.has(k)), off = a.del.filter(k => this.x.has(k) && !a.add.includes(k));
    this.before = this.x; this.x = y; this.plan.push(a.name); this.over = null;
    this.view.show([...this.x]);
    this.show();
    const n = this.plan.length, opt = this.best();
    if (this.inst.goal.every(k => this.x.has(k))) {
      const sameAs = this.ctx.results().filter(L => L.result && Array.isArray(L.result.moves) && L.result.moves.length === n && L.result.moves.every((s, j) => s === this.plan[j])).map(L => L.name);
      const cmp = !opt ? ['No lane holds a plan proved shortest to compare with.', 'Nessuna corsia ha un piano dimostrato più corto con cui confrontarlo.']
        : n === opt.cost ? (sameAs.length
          ? [`It is a shortest plan, the very one that ${names(sameAs, 'and')} found.`, `È un piano di lunghezza minima, proprio quello trovato da ${names(sameAs, 'e')}.`]
          : [`It is as short as the plan that ${names(opt.by, 'and')} proved shortest.`, `È corto quanto il piano che ${names(opt.by, 'e')} ha dimostrato più corto.`])
        : [`The shortest plan, which ${names(opt.by, 'and')} found, has ${opt.cost} actions: ${n - opt.cost} more than needed.`,
          `Il piano più corto, trovato da ${names(opt.by, 'e')}, ha ${opt.cost} azioni: ${n - opt.cost} in più del necessario.`];
      return { moved: true, mistake: back, solved: true, say: [`The goal holds after ${n} ${plural(n, 'action', 'actions')}. ${cmp[0]}`,
        `L'obiettivo vale dopo ${n} ${plural(n, 'azione', 'azioni')}. ${cmp[1]}`] };
    }
    const fx = (xs, a1, a2) => (xs.length ? [`${names(xs.map(k => this.fl(k)), 'and')} ${a1}`, `${names(xs.map(k => this.fl(k)), 'e')} ${a2}`] : null);
    const parts = [fx(on, plural(on.length, 'becomes true', 'become true'), plural(on.length, 'diventa vero', 'diventano veri')),
      fx(off, plural(off.length, 'becomes false', 'become false'), plural(off.length, 'diventa falso', 'diventano falsi'))].filter(Boolean);
    const g = this.goals(), G = this.inst.goal.length;
    const say = back
      ? [`${a.name} undoes the action before: the state is back where it was.`, `${a.name} annulla l'azione di prima: lo stato torna com'era.`]
      : [`${a.name}: ${parts.map(p => p[0]).join(', and ')}; ${g} of ${G} goals hold.`, `${a.name}: ${parts.map(p => p[1]).join(', e ')}; valgono ${g} obiettivi su ${G}.`];
    if (opt && n >= opt.cost) { say[0] += ` The shortest plan has ${opt.cost} actions.`; say[1] += ` Il piano più corto ha ${opt.cost} azioni.`; }
    return { moved: true, mistake: back, say };
  }
  hover(a) { this.over = a; this.show(); }
  key(e) {
    if (this.pending && e.key === 'Enter') return this.pending;
    const n = this.actions.length;
    if (!n) return null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      const s = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      this.cur = { i: this.cur ? (this.cur.i + s + n) % n : (s > 0 ? 0 : n - 1) };
      this.over = this.cur; this.show();
      return true;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.cur) return { ...this.cur };
    return null;
  }
  // the board: red the fluents of a refusal; for the action under the
  // pointer or the cursor, gold the fluents it makes true, grey those it
  // makes false, or red the preconditions that fail. The list: the
  // applicable actions in the accent, the others dimmed (the hint), the
  // action under the cursor outlined
  show() {
    const focus = [...this.err], a = this.over && this.actions[this.over.i];
    if (a) {
      if (this.can(a)) {
        for (const k of a.add) if (!this.x.has(k)) focus.push({ v: k, kind: 'decide' });
        for (const k of a.del) if (this.x.has(k) && !a.add.includes(k)) focus.push({ v: k, kind: 'undo' });
      } else {
        const m = this.missing(a);
        for (const k of [...m.pre, ...m.not]) if (k >= 0) focus.push({ v: k, kind: 'hot' });
      }
    }
    const v = this.view;
    v.marks.show(focus, i => {
      const it = v.tiles[i];
      if (!it) return null;
      const p = it.m.geometry.parameters;
      return [it.m.position.x, it.m.position.y, p.width * 1.06, p.height * 1.12, it.target + 0.004];
    });
    const dim = this.opt && this.opt.hint;
    this.buttons.forEach((b, i) => {
      const ok = this.can(this.actions[i]), cur = this.cur && this.cur.i === i;
      b.style.opacity = dim && !ok ? '0.45' : '1';
      b.style.borderColor = cur ? 'var(--gold)' : dim && ok ? 'var(--accent)' : 'var(--rule)';
      b.style.boxShadow = cur ? '0 0 0 1px var(--gold)' : 'none';
    });
  }
}
