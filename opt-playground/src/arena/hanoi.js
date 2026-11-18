// The board of the Towers of Hanoi in the arena: four pegs on a base, the
// disks stacked on the peg of the state of the trace (x, the peg of each
// disk, 0 the smallest), moving there along an arc when the state changes;
// the base takes the colour of the worker that expands the state. Nothing is
// solved here: the states are those of the trace.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';
import { WORKERS } from './search.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class HanoiView {
  constructor(box, inst) {
    this.inst = inst; this.D = inst.disks;
    this.S = stage3d(box, { camera: [0, -2.35, 1.35], target: [0, 0, 0.3], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, D } = this, P = S.colors;
    clear(S.content);
    this.gap = 0.46; this.dh = Math.min(0.07, 0.62 / D);
    this.baseMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(this.gap * 4, 0.5, 0.06), this.baseMat);
    base.position.z = -0.03;
    S.content.add(base);
    const pm = new THREE.MeshStandardMaterial({ color: P.soft, roughness: 0.6 });
    for (let p = 0; p < 4; p++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, this.dh * (D + 1.5), 12), pm);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(this.px(p), 0, this.dh * (D + 1.5) / 2);
      S.content.add(rod);
    }
    // the goal peg is marked by a ring on the base
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 8, 48), new THREE.MeshStandardMaterial({ color: P.gold }));
    ring.position.set(this.px(3), 0, 0.003);
    S.content.add(ring);
    this.disks = [];
    for (let d = 0; d < D; d++) {
      const r = 0.06 + 0.14 * (d + 1) / D;
      const col = P.lilac.clone().lerp(P.accent, d / Math.max(1, D - 1));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, this.dh * 0.86, 40),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
      m.rotation.x = Math.PI / 2;
      S.content.add(m);
      this.disks.push({ m, at: null, to: null, t: 1 });
    }
    if (this.last) this.show(...this.last);
    else this.show(this.inst.start, null);
  }
  px(p) { return (p - 1.5) * this.gap; }
  // x: the peg of each disk; w: the worker, or null
  show(x, w) {
    this.last = [x, w];
    if (!x) return;
    const still = reduced(), h = [0, 0, 0, 0];
    for (let d = this.D - 1; d >= 0; d--) {        // the largest at the bottom
      const p = x[d], it = this.disks[d], to = [this.px(p), this.dh * (h[p]++ + 0.5)];
      if (!it.to || it.to[0] !== to[0] || it.to[1] !== to[1]) {
        it.from = it.to && !still ? this.pos(it) : to;
        it.to = to; it.t = still || !it.at ? 1 : 0;
        if (!it.at) it.at = to;
      }
    }
    const P = this.S.colors;
    this.baseMat.color.set(w === null || w === undefined ? '#' + P.rule.getHexString() : WORKERS[w % WORKERS.length]);
    this.place();
  }
  // the position of a disk along its arc, lifted above the pegs while moving
  pos(it) {
    const e = it.t >= 1 ? 1 : 1 - (1 - it.t) ** 2, f = it.from || it.to;
    const lift = it.t < 1 && f[0] !== it.to[0] ? Math.sin(Math.PI * e) * this.dh * (this.D + 2) : 0;
    return [f[0] + (it.to[0] - f[0]) * e, f[1] + (it.to[1] - f[1]) * e + lift];
  }
  place() {
    for (const it of this.disks) { const [x, z] = this.pos(it); it.m.position.set(x, 0, z); }
  }
  frame(dt) {
    let moving = false;
    for (const it of this.disks) if (it.t < 1) { it.t = Math.min(1, it.t + dt * 1.8); moving = true; }
    if (moving) this.place();
  }
}
