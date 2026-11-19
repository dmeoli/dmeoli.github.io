// The boards of the permutation puzzles of PBeFS in the arena: the state
// expanded while the search runs (the plate or the track taking the color
// of the worker that expands), and the states of the solution path, which
// TraceSearch writes in its result, once the search ends. PancakeView
// stacks the pancakes, the largest at the bottom of the goal; a flip of
// the path shows the spatula under the block it turns, and the block turns
// over on a half circle. TopSpinView sets the tokens on a ring; a move of
// the path shows the turnstile over the 4 tokens it reverses, and the
// tokens travel along the ring. Between two states expanded one after the
// other, which in general are not one move apart, the pieces just slide to
// their new places. Nothing is solved here.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';
import { WORKERS } from './search.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t >= 1 ? 1 : 1 - (1 - t) ** 2);

// a state x: the token (or pancake) at each position, from 0
class StackBase {
  constructor(box, inst, cam, target = [0, 0, 0.3]) {
    this.inst = inst; this.N = inst.start.length;
    this.S = stage3d(box, { camera: cam, target, aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  show(x, w) {
    const prev = this.last && this.last[0];
    this.last = [x, w];
    if (!x) return;
    const still = reduced();
    // the move from the state shown before, if x is one move away from it
    // (the same state shown again keeps the move under way)
    const same = prev && prev.length === x.length && prev.every((v, i) => v === x[i]);
    if (!same) {
      this.move = prev && !still ? this.moveOf(prev, x) : null;
      if (this.move) this.moveT = 0;
    }
    x.forEach((tok, pos) => {
      const it = this.items[tok], to = this.at(pos);
      if (!it.to || it.to.some((v, i) => v !== to[i])) {
        it.from = it.to && !still ? this.pos(it) : to;
        it.to = to; it.t = still || !it.from ? 1 : 0;
      } else if (it.t >= 1) it.from = to;
    });
    // a move starts every piece from its place in the state before, even if
    // the last tween did not end (e.g. while the board was off screen)
    if (this.move && !same) prev.forEach((tok, pos) => {
      const it = this.items[tok];
      it.from = this.at(pos);
      it.t = it.from.every((v, i) => v === it.to[i]) ? 1 : 0;
    });
    const P = this.S.colors;
    this.baseMat.color.set(w === null || w === undefined ? '#' + P.rule.getHexString() : WORKERS[w % WORKERS.length]);
    this.place();
  }
  pos(it) {
    const e = ease(it.t), f = it.from || it.to;
    return f.map((v, i) => v + (it.to[i] - v) * e);
  }
  // a move lasts about 0.7 s: the tool (spatula, turnstile) shows first,
  // then the pieces move
  frame(dt) {
    let moving = false;
    if (this.move && this.moveT < 1) { this.moveT = Math.min(1, this.moveT + dt * 1.5); moving = true; }
    const go = !this.move || this.moveT > 0.25;
    if (go) for (const it of this.items) if (it.t < 1) { it.t = Math.min(1, it.t + dt * 2); moving = true; }
    if (moving || this.toolOn) this.place();
  }
}

export class PancakeView extends StackBase {
  constructor(box, inst) { super(box, inst, [0, -2.5, 0.65]); }
  build() {
    const { S, N } = this, P = S.colors;
    clear(S.content);
    this.dh = Math.min(0.06, 0.62 / N);
    this.baseMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.85 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 64), this.baseMat);
    plate.rotation.x = Math.PI / 2; plate.position.z = -0.02;
    S.content.add(plate);
    // the spatula, shown under the block that a flip of the path turns
    this.tool = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.36),
      new THREE.MeshStandardMaterial({ color: P.gold, metalness: 0.3, roughness: 0.4 }));
    blade.position.x = -0.05;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: P.ink }));
    handle.rotation.z = Math.PI / 2; handle.position.x = 0.45;
    this.tool.add(blade, handle);
    this.tool.rotation.x = Math.PI / 2;
    this.tool.visible = false;
    S.content.add(this.tool);
    this.items = [];
    for (let k = 0; k < N; k++) {
      const r = 0.06 + 0.36 * (k + 1) / N;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, this.dh * 0.82, 48),
        new THREE.MeshStandardMaterial({ color: P.lilac.clone().lerp(P.accent, k / Math.max(1, N - 1)), roughness: 0.55 }));
      m.rotation.x = Math.PI / 2;
      S.content.add(m);
      this.items.push({ m, to: null, t: 1 });
    }
    // the gaps of the heuristic: a gold tick, on both sides of the stack, at
    // each pair of neighbors whose sizes are not consecutive (the plate
    // counting as the pancake N under the largest)
    this.gapMat = new THREE.MeshStandardMaterial({ color: P.gold, emissive: P.gold, emissiveIntensity: 0.35 });
    this.ticks = [];
    for (let pos = 0; pos < N; pos++) {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, this.dh * 0.22), this.gapMat);
        t.position.set(sx * 0.5, 0, 0);
        g.add(t);
      }
      g.position.z = this.dh * (N - pos - 1);
      g.visible = false;
      S.content.add(g);
      this.ticks.push(g);
    }
    this.show(...(this.last || [this.inst.start, null]));
  }
  // position 0 is the top of the stack
  at(pos) { return [0, this.dh * (this.N - pos - 0.5)]; }
  // the flip of the k pancakes at the top that turns a into b, if any
  moveOf(a, b) {
    let k = 0;
    while (k < a.length && a[k] === b[k]) k++;
    if (k === a.length) return null;
    let j = a.length;
    while (a[j - 1] === b[j - 1]) j--;
    // a and b differ in the positions k to j - 1: a flip of j moves position 0
    if (k !== 0) return null;
    for (let i = 0; i < j; i++) if (a[i] !== b[j - 1 - i]) return null;
    return { k: j };
  }
  // a flip turns the pancakes above the spatula as one block about the
  // middle of their heights, each pancake sweeping out on a half circle and
  // tilting with the block; between states that are not one flip apart the
  // pancakes slide to their places
  place() {
    const fl = this.move;
    this.toolOn = !!fl && this.moveT < 1;
    this.tool.visible = this.toolOn;
    if (this.toolOn) {
      // in from the right, under the block, then out when the block lands
      const inT = Math.min(1, this.moveT / 0.25), out = Math.max(0, (this.moveT - 0.85) / 0.15);
      this.tool.position.set(0.6 * (1 - ease(inT)) + 0.6 * out, 0, this.dh * (this.N - fl.k));
    }
    for (const it of this.items) {
      const f = it.from || it.to, e = ease(it.t), d = (f[1] - it.to[1]) / 2, a = Math.PI * e;
      const moving = !!fl && it.t < 1 && Math.abs(d) > 1e-6;
      const x = f[0] * (1 - e) + (moving ? d * Math.sin(a) * 1.6 : 0);
      const z = moving ? (f[1] + it.to[1]) / 2 + d * Math.cos(a) : this.pos(it)[1];
      it.m.position.set(x, 0, z);
      it.m.rotation.order = 'YXZ';     // the tilt about the horizontal axis of the view
      it.m.rotation.set(Math.PI / 2, moving ? a : 0, 0);
    }
    // the ticks under each pancake, shown once the pancakes have landed
    const x = this.last && this.last[0], still = this.items.every(it => it.t >= 1);
    this.ticks.forEach((g, pos) => {
      const below = pos + 1 < this.N ? x[pos + 1] : this.N;
      g.visible = !!x && still && Math.abs(x[pos] - below) !== 1;
    });
  }
}

export class TopSpinView extends StackBase {
  constructor(box, inst) { super(box, inst, [0, -2.2, 1.7], [0, -0.08, 0]); }
  build() {
    const { S, N } = this, P = S.colors, K = this.inst.turnstile || 4;
    clear(S.content);
    this.R = 0.62;
    this.baseMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.85 });
    const track = new THREE.Mesh(new THREE.TorusGeometry(this.R, 0.05, 12, 96), this.baseMat);
    S.content.add(track);
    // the turnstile: an arc over K positions, shown over the tokens that a
    // move of the path reverses
    const span = 2 * Math.PI * (K - 1) / N;
    this.arcMat = new THREE.MeshStandardMaterial({ color: P.gold, transparent: true, opacity: 0.55 });
    this.tool = new THREE.Mesh(new THREE.TorusGeometry(this.R, 0.12, 8, 48, span + 0.5), this.arcMat);
    this.tool.position.z = 0.02;
    this.tool.visible = false;
    S.content.add(this.tool);
    const ink = '#ffffff';
    this.items = [];
    for (let k = 0; k < N; k++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      const g = cv.getContext('2d');
      g.fillStyle = '#' + P.lilac.clone().lerp(P.accent, k / Math.max(1, N - 1)).getHexString(); g.fillRect(0, 0, 96, 96);
      g.fillStyle = ink; g.font = '500 54px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k), 48, 50);
      // 6 and 9 underlined, since a token is seen from every side
      if (k === 6 || k === 9) g.fillRect(30, 76, 36, 6);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 32),
        [new THREE.MeshStandardMaterial({ color: P.accent2 }), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ color: P.accent2 })]);
      // the cap up, its number upright as seen from the front (the top of
      // the canvas lies along the local x of the cylinder, turned to +y)
      m.rotation.set(Math.PI / 2, 0, Math.PI / 2, 'ZYX');
      S.content.add(m);
      this.items.push({ m, to: null, t: 1 });
    }
    // the breakpoints of the heuristic: a gold bar across the track between
    // two neighbors that are not consecutive (11 and 0 are)
    const gold = new THREE.MeshStandardMaterial({ color: P.gold, emissive: P.gold, emissiveIntensity: 0.35 });
    this.ticks = [];
    for (let pos = 0; pos < N; pos++) {
      const a = this.angle(pos + 0.5), b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.03), gold);
      b.position.set(this.R * Math.cos(a), this.R * Math.sin(a), 0.07);
      b.rotation.z = a;
      b.visible = false;
      S.content.add(b);
      this.ticks.push(b);
    }
    this.show(...(this.last || [this.inst.start, null]));
  }
  // position 0 at the front, facing the viewer
  angle(pos) { return -Math.PI / 2 + 2 * Math.PI * pos / this.N; }
  at(pos) { return [pos]; }
  // the move i (the K tokens from position i on, around the ring, reversed)
  // that turns a into b, if any
  moveOf(a, b) {
    const N = a.length, K = this.inst.turnstile || 4;
    for (let i = 0; i < N; i++) {
      let ok = true;
      for (let p = 0; p < N && ok; p++) {
        const o = (p - i + N) % N;
        ok = b[p] === (o < K ? a[(i + K - 1 - o) % N] : a[p]);
      }
      if (ok) return { i, K };
    }
    return null;
  }
  // in a move the tokens of the turnstile cross it along the ring, lifted;
  // between states that are not one move apart they slide along the
  // shorter arc
  place() {
    const mv = this.move, N = this.N;
    this.toolOn = !!mv && this.moveT < 1;
    this.tool.visible = this.toolOn;
    if (this.toolOn) {
      this.tool.rotation.z = this.angle(mv.i) - 0.25;
      this.arcMat.opacity = 0.55 * Math.min(1, this.moveT / 0.2) * Math.min(1, (1 - this.moveT) / 0.15);
    }
    for (const it of this.items) {
      const f = it.from || it.to, e = ease(it.t);
      let d = it.to[0] - f[0];
      if (mv) {
        // inside the turnstile: the way through it, not around the ring
        const o0 = (f[0] - mv.i + N) % N;
        d = o0 < mv.K ? (mv.K - 1 - 2 * o0) : 0;
      } else if (Math.abs(d) > N / 2) d -= Math.sign(d) * N;
      const p = f[0] + d * e, a = this.angle(p);
      const lift = it.t < 1 && d ? Math.sin(Math.PI * e) * 0.18 : 0;
      it.m.position.set(this.R * Math.cos(a), this.R * Math.sin(a), 0.06 + lift);
    }
    const x = this.last && this.last[0], still = this.items.every(it => it.t >= 1);
    this.ticks.forEach((b, pos) => {
      const p = x && x[pos], q = x && x[(pos + 1) % N];
      b.visible = !!x && still && q !== (p + 1) % N && p !== (q + 1) % N;
    });
  }
}
