// The board of the 0-1 knapsack in the arena: one block per item, in the
// order of the branching (by profit over weight), its height the weight and
// its colour the profit over weight; the items that the current node of the
// branch-and-bound takes rise onto the gold strip of the knapsack, those it
// leaves out sink and fade, the free ones stand in between, and the bar in
// front fills with the weight taken against the capacity. Nothing is solved
// here: the node is that of the trace (Replay.board()).

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class KnapsackView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.9, 1.5], target: [0, 0.05, 0.2], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors, n = inst.p.length;
    clear(S.content);
    const W = 1.8, u = W / n, wmax = Math.max(...inst.w);
    const ratio = inst.p.map((p, i) => p / inst.w[i]), rmin = Math.min(...ratio), rmax = Math.max(...ratio);
    this.u = u;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9b23a'), roughness: 0.6 }));
    strip.position.set(0, 0.36, -0.01);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 }));
    floor.position.set(0, -0.3, -0.01);
    S.content.add(strip, floor);
    this.items = inst.p.map((p, i) => {
      const t = (ratio[i] - rmin) / Math.max(1e-9, rmax - rmin);
      const mat = new THREE.MeshStandardMaterial({ color: P.lilac.clone().lerp(P.accent, t), roughness: 0.55, transparent: true, opacity: 1 });
      const g = new THREE.BoxGeometry(u * 0.8, u * 0.8, 0.7 * inst.w[i] / wmax);
      g.translate(0, 0, 0.35 * inst.w[i] / wmax);
      const m = new THREE.Mesh(g, mat);
      S.content.add(m);
      return { m, mat, base: mat.color.clone(), y: 0.03, z: 0, ty: 0.03, tz: 0, x: (i - (n - 1) / 2) * u };
    });
    // the bar of the weight taken, in front, against the capacity
    const track = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: P.rule }));
    track.position.set(0, -0.5, 0);
    this.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.03), new THREE.MeshStandardMaterial({ color: P.accent }));
    this.fill.position.set(0, -0.5, 0.01);
    S.content.add(track, this.fill);
    this.W = W;
    if (this.last) this.show(...this.last);
    else this.show(inst.vertices.map(v => ({ id: v, colour: -1, mask: 3 })), new Set());
  }
  show(board) {
    this.last = [board, new Set()];
    const still = reduced(), P = this.S.colors;
    let wt = 0;
    board.forEach((b, i) => {
      const it = this.items[i];
      if (b.colour === 1) { it.ty = 0.36; it.tz = 0; wt += this.inst.w[i]; } else if (b.colour === 0) { it.ty = -0.3; it.tz = -0.1; } else { it.ty = 0.03; it.tz = 0; }
      it.mat.color.copy(b.colour === 0 ? it.base.clone().lerp(P.rule, 0.7) : it.base);
      it.mat.opacity = b.colour === 0 ? 0.55 : 1;
      if (still) { it.y = it.ty; it.z = it.tz; }
    });
    const f = Math.min(1, wt / this.inst.cap);
    this.fill.scale.x = Math.max(0.001, f * this.W);
    this.fill.position.x = -this.W / 2 + f * this.W / 2;
    this.place();
  }
  place() { for (const it of this.items) it.m.position.set(it.x, it.y, it.z); }
  frame(dt) {
    let moving = false;
    for (const it of this.items) {
      if (Math.abs(it.y - it.ty) + Math.abs(it.z - it.tz) > 1e-4) {
        const k = Math.min(1, dt * 5);
        it.y += (it.ty - it.y) * k; it.z += (it.tz - it.z) * k; moving = true;
      }
    }
    if (moving) this.place();
  }
}
