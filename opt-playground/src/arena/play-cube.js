// The cube played in the lane "You" (play.js), on CubeView of cube.js: a
// click on a face turns it a quarter clockwise (as seen facing it), with
// Shift counterclockwise, and the keys U D L R F B do the same; the layer
// turns into place as in the other lanes. A turn that cancels the turns of
// the same face just before counts as a mistake, its layer framed in red.
// The length of the reader's solution is counted in the half-turn metric
// of the searches (consecutive turns of one face make one move) and the end
// compared with the optimum that they proved.

import * as THREE from 'three';
import { CubeView } from './cube.js';
import { optimum, against } from './play-stacks.js';
import { pathHint, pathReplay, lanePaths } from './play.js';

const FACES = 'URFDLB';
const NORMAL = { U: [0, 0, 1], D: [0, 0, -1], F: [0, -1, 0], B: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0] };
const NAME = { U: ['up', 'superiore'], D: ['down', 'inferiore'], F: ['front', 'frontale'], B: ['back', 'posteriore'], R: ['right', 'destra'], L: ['left', 'sinistra'] };
const plural = (k, one, many) => (k === 1 ? one : many);
const key = v => v.map(c => Math.round(c * 2)).join(',');
// the name of a move: the face, then ' for counterclockwise and 2 for a half turn
const notation = (f, q) => f + (q === 2 ? '2' : q === 3 ? "'" : '');

export class CubePlay {
  constructor(box, inst, ctx) {
    this.inst = inst; this.ctx = ctx;
    this.view = new CubeView(box, inst);
    this.perm = this.perms();
    const build = this.view.build.bind(this.view);
    this.view.build = () => { build(); this.decorate(); };
    this.decorate();
    // Shift with the click turns counterclockwise: the pointer events of
    // the board reach these listeners before those of the lane
    const cv = this.view.S.renderer.domElement;
    for (const t of ['pointerdown', 'pointermove']) cv.addEventListener(t, e => { this.shift = e.shiftKey; });
    this.moveName = ['turns', 'giri'];
    this.help = ['A click on a face turns it a quarter clockwise, as seen facing it, and with Shift counterclockwise; the keys U D L R F B do the same, with Shift counterclockwise. The length counts the moves of the half-turn metric, as the searches do, two turns of the same face in a row making one move. Drag to see the other faces.',
      'Un clic su una faccia la gira di un quarto in senso orario, guardandola di fronte, e con Maiuscolo in senso antiorario; i tasti U D L R F B fanno lo stesso, con Maiuscolo in senso antiorario. La lunghezza conta le mosse nella metrica dei mezzi giri, come fanno le ricerche: due giri di fila della stessa faccia fanno una mossa sola. Trascina per vedere le altre facce.'];
  }
  // where each facelet goes in a clockwise quarter turn of each face: the
  // stickers of CubeView, at their cubie plus half the normal, turned about
  // the normal of the face by -90 degrees (CubeView turns the same way)
  perms() {
    const v = this.view, at = this.view.stickers.map(m => {
      const c = m.parent.userData.cell, n = m.position.clone().divideScalar(v.u * 0.49);
      return new THREE.Vector3(...c).addScaledVector(n, 0.5);
    });
    const idx = new Map(at.map((p, k) => [key(p.toArray()), k]));
    const out = {};
    for (const f of FACES) {
      const n = new THREE.Vector3(...NORMAL[f]), q = new THREE.Quaternion().setFromAxisAngle(n, -Math.PI / 2);
      out[f] = at.map((p, k) => (Math.round(p.dot(n)) >= 1 ? idx.get(key(p.clone().applyQuaternion(q).toArray())) : k));
    }
    return out;
  }
  // the frame of the layer under the pointer (gold) and of a mistake (red)
  decorate() {
    const v = this.view, P = v.S.colors, u = v.u;
    // the 12 edges of a box around the layer, as bars thick enough to see
    const frame = col => {
      const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: col }), a = u * 1.56, c = u * 0.56, w = 0.018;
      for (const [sx, sy, sz] of [[2 * a, w, w], [w, 2 * a, w], [w, w, 2 * c]]) for (const i of [-1, 1]) for (const j of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        b.position.set(sx > w ? 0 : i * a, sy > w ? 0 : (sx > w ? i : j) * a, sz > w ? 0 : j * c);
        g.add(b);
      }
      g.visible = false;
      v.S.content.add(g);
      return g;
    };
    this.goldF = frame(P.gold); this.redF = frame(P.red); this.hintF = frame(P.gold);
    v.stickers.forEach((m, k) => { m.userData.play = k; });
    if (this.f) { this.hover(this.over); this.mark(this.redF, this.err); this.mark(this.hintF, this.hl && this.hl.face); }
  }
  mark(g, f) {
    g.visible = !!f;
    if (!f) return;
    const n = new THREE.Vector3(...NORMAL[f]);
    g.position.copy(n).multiplyScalar(this.view.u);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }
  reset() {
    this.f = this.inst.facelets; this.seq = []; this.err = null; this.shift = false;
    this.view.show(this.f, null, null);
    this.mark(this.redF, null);
    this.hover(null);
  }
  turn(f, q) { this.f = this.turned(this.f, f, q); }
  turned(s, f, q) {
    const p = this.perm[f];
    let x = s.split('');
    for (let r = 0; r < q; r++) { const y = x.slice(); p.forEach((to, k) => { y[to] = x[k]; }); x = y; }
    return x.join('');
  }
  // the turn (face and quarters) that takes the facelets a to b, or null
  turnOf(a, b) {
    for (const f of FACES) for (const q of [1, 2, 3]) if (this.turned(a, f, q) === b) return { f, q };
    return null;
  }
  turnName(m) {
    if (!m) return ['several turns', 'più giri'];
    const [en, it] = NAME[m.f], d = m.q === 2 ? ['twice', 'due volte'] : m.q === 3 ? ['counterclockwise', 'in senso antiorario'] : ['clockwise', 'in senso orario'];
    return [`${notation(m.f, m.q)}, the ${en} face ${d[0]}`, `${notation(m.f, m.q)}, la faccia ${it} ${d[1]}`];
  }
  // undo, hint and replay (play.js)
  snap() { return { f: this.f, seq: this.seq.map(o => ({ ...o })) }; }
  // back to s, the layer turning back when one turn takes the cube there
  restore(s) {
    const m = s.f === this.f ? null : this.turnOf(this.f, s.f);
    this.f = s.f; this.seq = s.seq.map(o => ({ ...o })); this.err = null;
    this.mark(this.redF, null);
    this.view.show(this.f, null, m ? notation(m.f, m.q) : null);
    this.hover(null);
  }
  label(s0, s1) { return this.turnName(this.turnOf(s0.f, s1.f)); }
  paths() {
    return { ctx: this.ctx, key: s => s.f, pkey: p => p,
      pname: (p, q, L, i) => (L.moves && L.moves[i] ? this.turnName({ f: L.moves[i][0], q: L.moves[i][1] === '2' ? 2 : L.moves[i][1] === "'" ? 3 : 1 }) : this.turnName(this.turnOf(p, q))) };
  }
  // in the middle of a move (F of F2): the state before the turns of the
  // last face lies on a path whose next move turns that face, and the hint
  // turns it the quarters that are missing
  partial(s, L) {
    const last = s.seq[s.seq.length - 1];
    if (!last) return null;
    const b = this.turned(s.f, last.f, 4 - last.q), i = L.path.indexOf(b);
    if (i < 0 || i + 1 >= L.path.length) return null;
    const q = [1, 2, 3].find(r => this.turned(b, last.f, r) === L.path[i + 1]);
    return q ? { i, f: last.f, q: (q - last.q + 4) % 4 } : null;
  }
  hint(o) {
    const s = o.states[o.states.length - 1], P = lanePaths(this.ctx);
    if (!P.some(L => L.path.includes(s.f))) for (const L of P) {
      const h = this.partial(s, L);
      if (!h || !h.q) continue;
      const n = this.turnName(h);
      this.hl = { face: h.f };
      this.mark(this.hintF, h.f);
      return { shown: true, acts: h.q === 2 ? [{ face: h.f, ccw: false }, { face: h.f, ccw: false }] : [{ face: h.f, ccw: h.q === 3 }],
        say: [`Hint (gold): turn ${n[0]}, which completes move ${h.i + 1} of the ${L.path.length - 1} of the optimal path of ${L.by}.`,
          `Suggerimento (in oro): gira ${n[1]}, che completa la mossa ${h.i + 1} delle ${L.path.length - 1} del cammino ottimo di ${L.by}.`] };
    }
    return pathHint({ ...this.paths(), step: (s, p) => {
      const m = this.turnOf(s.f, p);
      this.hl = m ? { face: m.f } : null;
      this.mark(this.hintF, m && m.f);
      const n = this.turnName(m), k = m && m.q === 2 ? [' (two clicks)', ' (due clic)'] : m && m.q === 3 ? [' (a click with Shift)', ' (un clic con Maiuscolo)'] : ['', ''];
      const acts = !m ? [] : m.q === 2 ? [{ face: m.f, ccw: false }, { face: m.f, ccw: false }] : [{ face: m.f, ccw: m.q === 3 }];
      return Object.assign([`turn ${n[0]}${k[0]}`, `gira ${n[1]}${k[1]}`], { acts });
    } }, o);
  }
  unhint() { if (this.hl) { this.hl = null; this.mark(this.hintF, null); } }
  // the clicks of the reader against the moves of the half-turn metric of
  // the path: click k belongs to move m (the length of the reader's
  // sequence after it), and differs when its state is neither the state m
  // of the path nor a part of the turn of move m (the same face)
  replay(states) {
    const P = lanePaths(this.ctx);
    if (!P.length) return pathReplay(this.paths(), states);
    const off = (L, k) => { const s = states[k], m = s.seq.length, h = this.partial(s, L); return !(L.path[m] === s.f || (h && h.i === m - 1)); };
    const firstOff = L => { for (let k = 1; k < states.length; k++) if (off(L, k)) return k; return 0; };
    const L = P.reduce((a, b) => { const fa = firstOff(a), fb = firstOff(b); return (fa === 0 ? Infinity : fa) >= (fb === 0 ? Infinity : fb) ? a : b; });
    const name = (m) => (L.moves && L.moves[m - 1] ? this.turnName({ f: L.moves[m - 1][0], q: L.moves[m - 1][1] === '2' ? 2 : L.moves[m - 1][1] === "'" ? 3 : 1 }) : null);
    const rows = states.slice(1).map(s => (s.seq.length ? name(s.seq.length) : null));
    return { by: [L.by, L.by], rows, first: firstOff(L),
      note: [`Its path is optimal, ${L.path.length - 1} moves of the half-turn metric; beside each of your turns, the move of it that the turn belongs to.`,
        `Il suo cammino è ottimo, di ${L.path.length - 1} mosse nella metrica dei mezzi giri; accanto a ogni tuo giro, la sua mossa a cui il giro appartiene.`] };
  }
  faces() { let k = 0; for (let i = 0; i < 6; i++) if (/^(.)\1{8}$/.test(this.f.slice(9 * i, 9 * i + 9))) k++; return k; }
  counters() {
    return [['length', 'lunghezza', this.seq.length], ['faces done', 'facce fatte', `${this.faces()} / 6`]];
  }
  targets() { return this.view.stickers; }
  actionAt(k) { return { face: FACES[Math.floor(k / 9)], ccw: !!this.shift }; }
  // the stickers of the face, the center first
  where(a) {
    const i = FACES.indexOf(a.face) * 9;
    return [4, 0, 2, 6, 8, 1, 3, 5, 7].map(k => this.view.stickers[i + k].getWorldPosition(new THREE.Vector3()));
  }
  act({ face, ccw }) {
    if (!NORMAL[face]) return null;
    const d = ccw ? 3 : 1;
    this.turn(face, d);
    // the turns in the half-turn metric: a turn of the face of the last move
    // merges with it, and a sum of 0 cancels it
    const last = this.seq[this.seq.length - 1];
    let undo = false;
    if (last && last.f === face) {
      last.q = (last.q + d) % 4;
      if (!last.q) { this.seq.pop(); undo = true; }
    } else this.seq.push({ f: face, q: d });
    this.err = undo ? face : null;
    this.mark(this.redF, this.err);
    this.view.show(this.f, null, notation(face, d));
    this.hover(null);
    const [en, it] = NAME[face], m = this.seq.length, opt = optimum(this.ctx);
    const dir = ccw ? ['counterclockwise', 'in senso antiorario'] : ['clockwise', 'in senso orario'];
    if (this.f === 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB') {
      const cmp = against(m, opt, ['move', 'moves', 'mossa', 'mosse']);
      return { moved: true, mistake: undo, solved: true, say: [`Solved in ${m} ${plural(m, 'move', 'moves')} of the half-turn metric. ${cmp[0]}`,
        `Risolto in ${m} ${plural(m, 'mossa', 'mosse')} nella metrica dei mezzi giri. ${cmp[1]}`] };
    }
    const say = undo
      ? [`You turn the ${en} face (${face}) ${dir[0]}, which cancels its turns just before: the cube is back where it was (red).`,
        `Giri la faccia ${it} (${face}) ${dir[1]}, e questo annulla i suoi giri appena fatti: il cubo torna com'era (in rosso).`]
      : [`You turn the ${en} face (${face}) ${dir[0]}: ${m} ${plural(m, 'move', 'moves')} so far, ${this.faces()} of 6 faces done.`,
        `Giri la faccia ${it} (${face}) ${dir[1]}: ${m} ${plural(m, 'mossa', 'mosse')} finora, ${this.faces()} facce su 6 fatte.`];
    if (opt && m >= opt.cost) { say[0] += ` The optimum is ${opt.cost} moves.`; say[1] += ` L'ottimo è di ${opt.cost} mosse.`; }
    return { moved: true, mistake: undo, say };
  }
  hover(a) {
    this.over = a || null;
    this.mark(this.goldF, a && a.face);
  }
  key(e) {
    const f = e.key.toUpperCase();
    if (e.ctrlKey || e.metaKey || e.altKey || f.length !== 1 || !NORMAL[f]) return null;
    return { face: f, ccw: e.shiftKey };
  }
}
