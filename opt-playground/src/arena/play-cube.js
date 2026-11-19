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
    this.goldF = frame(P.gold); this.redF = frame(P.red);
    v.stickers.forEach((m, k) => { m.userData.play = k; });
    if (this.f) { this.hover(this.over); this.mark(this.redF, this.err); }
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
  turn(f, q) {
    const p = this.perm[f];
    let x = this.f.split('');
    for (let r = 0; r < q; r++) { const y = x.slice(); p.forEach((to, k) => { y[to] = x[k]; }); x = y; }
    this.f = x.join('');
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
