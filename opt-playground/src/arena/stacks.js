// The boards of the permutation puzzles of PBeFS in the arena, whose states
// the trace names by their hashes: the start is shown while the search runs
// (the base taking the colour of the worker that expands), and the states
// of the solution path, which TraceSearch writes in its result, once the
// search ends. PancakeView stacks the pancakes, the largest N - 1 at the
// bottom of the goal, each flip turning the pancakes above its spatula;
// TopSpinView sets the tokens on a ring, with the turnstile of the first
// four positions, each move reversing the tokens inside it. Nothing is
// solved here.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';
import { WORKERS } from './search.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t >= 1 ? 1 : 1 - (1 - t) ** 2);

// a state x: the token (or pancake) at each position, from 0
class StackBase {
  constructor(box, inst, cam) {
    this.inst = inst; this.N = inst.start.length;
    this.S = stage3d(box, { camera: cam, target: [0, 0, 0.3], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  show(x, w) {
    this.last = [x, w];
    if (!x) return;
    const still = reduced();
    x.forEach((tok, pos) => {
      const it = this.items[tok], to = this.at(pos);
      if (!it.to || it.to.some((v, i) => v !== to[i])) {
        it.from = it.to && !still ? this.pos(it) : to;
        it.to = to; it.t = still || !it.from ? 1 : 0;
      }
    });
    const P = this.S.colors;
    this.baseMat.color.set(w === null || w === undefined ? '#' + P.rule.getHexString() : WORKERS[w % WORKERS.length]);
    this.place();
  }
  pos(it) {
    const e = ease(it.t), f = it.from || it.to;
    return f.map((v, i) => v + (it.to[i] - v) * e);
  }
  frame(dt) {
    let moving = false;
    for (const it of this.items) if (it.t < 1) { it.t = Math.min(1, it.t + dt * 3); moving = true; }
    if (moving) this.place();
  }
}

export class PancakeView extends StackBase {
  constructor(box, inst) { super(box, inst, [0, -2.7, 1.7]); }
  build() {
    const { S, N } = this, P = S.colors;
    clear(S.content);
    this.dh = Math.min(0.06, 0.62 / N);
    this.baseMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.85 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 64), this.baseMat);
    plate.rotation.x = Math.PI / 2; plate.position.z = -0.02;
    S.content.add(plate);
    this.items = [];
    for (let k = 0; k < N; k++) {
      const r = 0.08 + 0.32 * (k + 1) / N;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, this.dh * 0.82, 48),
        new THREE.MeshStandardMaterial({ color: P.lilac.clone().lerp(P.accent, k / Math.max(1, N - 1)), roughness: 0.55 }));
      m.rotation.x = Math.PI / 2;
      S.content.add(m);
      this.items.push({ m, to: null, t: 1 });
    }
    this.show(...(this.last || [this.inst.start, null]));
  }
  // position 0 is the top of the stack
  at(pos) { return [0, this.dh * (this.N - pos - 0.5)]; }
  place() { for (const it of this.items) { const [x, z] = this.pos(it); it.m.position.set(x, 0, z); } }
}

export class TopSpinView extends StackBase {
  constructor(box, inst) { super(box, inst, [0, -1.9, 1.6]); }
  build() {
    const { S, N } = this, P = S.colors, K = this.inst.turnstile || 4;
    clear(S.content);
    this.R = 0.62;
    this.baseMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.85 });
    const track = new THREE.Mesh(new THREE.TorusGeometry(this.R, 0.05, 12, 96), this.baseMat);
    S.content.add(track);
    // the turnstile over the positions 0 to K - 1
    const a0 = this.angle(0), a1 = this.angle(K - 1);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(this.R, 0.11, 8, 48, Math.abs(a1 - a0) + 0.5),
      new THREE.MeshStandardMaterial({ color: P.gold, transparent: true, opacity: 0.45 }));
    arc.rotation.z = Math.min(a0, a1) - 0.25;
    arc.position.z = 0.02;
    S.content.add(arc);
    const ink = '#ffffff';
    this.items = [];
    for (let k = 0; k < N; k++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      const g = cv.getContext('2d');
      g.fillStyle = '#' + P.lilac.clone().lerp(P.accent, k / Math.max(1, N - 1)).getHexString(); g.fillRect(0, 0, 96, 96);
      g.fillStyle = ink; g.font = '500 54px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k), 48, 52);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 32),
        [new THREE.MeshStandardMaterial({ color: P.accent2 }), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ color: P.accent2 })]);
      m.rotation.x = Math.PI / 2;
      S.content.add(m);
      this.items.push({ m, to: null, t: 1 });
    }
    this.show(...(this.last || [this.inst.start, null]));
  }
  // the turnstile (positions 0 to K - 1) at the front, facing the viewer
  angle(pos) { return -Math.PI / 2 + 2 * Math.PI * (pos - ((this.inst.turnstile || 4) - 1) / 2) / this.N; }
  at(pos) { return [pos]; }
  // the tokens move along the ring, lifted while they move
  place() {
    for (const it of this.items) {
      const f = it.from || it.to, e = ease(it.t), p = f[0] + (it.to[0] - f[0]) * e, a = this.angle(p);
      const lift = it.t < 1 && f[0] !== it.to[0] ? Math.sin(Math.PI * e) * 0.18 : 0;
      it.m.position.set(this.R * Math.cos(a), this.R * Math.sin(a), 0.06 + lift);
    }
  }
}
