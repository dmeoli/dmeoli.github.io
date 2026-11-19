// The boards of the two-player games in 3D: tic-tac-toe on a flat grid of
// 3 by 3 cells, connect four upright, 7 columns of 6 rows. A board shows a
// position as a list of pieces, each of a kind: 'base' (the position the
// search starts from), 'path' (the moves the search is trying, see-through),
// 'playout' (the random moves of a playout of the tree search, small and
// faint), 'chosen' (the move chosen, ringed in gold) and 'you' (a move of
// the lane "You"). A piece that appears grows (a cross or a ring) or drops
// down its column (a disc) in about 0.45 s; the cell of the move under way
// is ringed. X is in the accent of the theme, O in its gold.

import * as THREE from 'three';
import { stage3d, clear, label, rod } from '../stage3d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t >= 1 ? 1 : 1 - (1 - t) ** 2);
export const COLS = 'abcdefg';
// the name of a move: the cell of tic-tac-toe (column letter, row from the top), the column of connect four
export const cellName = (c4, [x, y]) => (c4 ? String(y) : COLS[y - 1] + x);

export class GameBoard {
  constructor(box, kind) {
    this.c4 = kind === 'connect4';
    this.h = this.c4 ? 6 : 3; this.v = this.c4 ? 7 : 3;
    this.U = this.c4 ? 0.5 : 1;
    this.S = stage3d(box, this.c4
      ? { camera: [0, -6.4, 2.6], target: [0, 0, 1.45], aspect: 0.86, onTheme: () => this.build(), onFrame: dt => this.frame(dt) }
      : { camera: [0, -3.9, 4.3], target: [0, -0.3, 0], aspect: 0.86, onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.pieces = new Map();
    this.spec = { pieces: [] };
    this.build();
  }
  // the centre of a cell in the scene
  at(x, y) {
    const U = this.U;
    if (this.c4) return [(y - 4) * U, 0, (this.h - x) * U + U / 2 + 0.05];
    return [(y - 2) * U, (2 - x) * U, 0];
  }
  build() {
    const { S, U } = this, P = S.colors;
    clear(S.content);
    this.pieces.clear();
    const ground = new THREE.MeshStandardMaterial({ color: P.ground, roughness: 0.9 });
    const line = new THREE.MeshStandardMaterial({ color: P.soft, roughness: 0.8 });
    this.targets = [];
    const pick = new THREE.MeshBasicMaterial({ visible: false });
    if (this.c4) {
      const w = this.v * U + 0.2, hgt = this.h * U + 0.2;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, hgt), new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9, transparent: true, opacity: 0.75 }));
      back.position.set(0, 0.11, hgt / 2 - 0.05);
      S.content.add(back);
      for (let y = 0; y <= this.v; y++) S.content.add(rod([(y - 3.5) * U, 0.07, 0.05], [(y - 3.5) * U, 0.07, this.h * U + 0.05], 0.012, line));
      S.content.add(rod([-3.5 * U - 0.1, 0.07, 0.05], [3.5 * U + 0.1, 0.07, 0.05], 0.02, line));
      for (let y = 1; y <= this.v; y++) {
        const l = label(String(y), P.soft, 0.17);
        l.position.set((y - 4) * U, 0, this.h * U + 0.32);
        S.content.add(l);
        const col = new THREE.Mesh(new THREE.BoxGeometry(U, 0.3, this.h * U + 0.5), pick);
        col.position.set((y - 4) * U, 0, (this.h * U + 0.5) / 2);
        col.userData.col = y;
        S.content.add(col); this.targets.push(col);
      }
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(3 * U + 0.2, 3 * U + 0.2, 0.06), ground);
      base.position.z = -0.04;
      S.content.add(base);
      for (const s of [-0.5, 0.5]) {
        S.content.add(rod([s * U, -1.5 * U, 0.005], [s * U, 1.5 * U, 0.005], 0.018, line));
        S.content.add(rod([-1.5 * U, s * U, 0.005], [1.5 * U, s * U, 0.005], 0.018, line));
      }
      for (let i = 1; i <= 3; i++) {
        const c = label(COLS[i - 1], P.soft, 0.2);
        c.position.set((i - 2) * U, -1.5 * U - 0.3, 0);
        const r = label(String(i), P.soft, 0.2);
        r.position.set(-1.5 * U - 0.3, (2 - i) * U, 0);
        S.content.add(c, r);
        for (let j = 1; j <= 3; j++) {
          const cell = new THREE.Mesh(new THREE.BoxGeometry(U * 0.96, U * 0.96, 0.1), pick);
          cell.position.set(...this.at(i, j));
          cell.userData.cell = [i, j];
          S.content.add(cell); this.targets.push(cell);
        }
      }
    }
    // the ring on the cell of the move under way, and the one of the hover
    this.hot = this.ring(P.ink, 0.5); this.gold = this.ring(P.gold, 0.56); this.hover = this.ring(P.accent2, 0.46);
    this.show(this.spec, true);
  }
  ring(color, r) {
    const U = this.U;
    const g = new THREE.Mesh(new THREE.TorusGeometry(r * U * (this.c4 ? 0.95 : 0.9), 0.022, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    g.renderOrder = 5;
    if (this.c4) g.rotation.x = Math.PI / 2;
    g.visible = false;
    this.S.content.add(g);
    return g;
  }
  piece(p, kind) {
    const P = this.S.colors, U = this.U;
    const color = p === 'X' ? P.accent : P.gold;
    const op = kind === 'path' ? 0.5 : kind === 'playout' ? 0.32 : 1;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, transparent: op < 1, opacity: op });
    const g = new THREE.Group();
    if (this.c4) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 28), mat);
      g.add(d);
      if (p === 'O') { // a second mark besides the color: a hole in the gold discs
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.11, 18), new THREE.MeshBasicMaterial({ color: P.ground, transparent: op < 1, opacity: op }));
        g.add(hole);
      }
    } else if (p === 'X') {
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.66 * U, 0.13 * U, 0.12), mat);
        b.rotation.z = a; b.position.z = 0.07;
        g.add(b);
      }
    } else {
      const o = new THREE.Mesh(new THREE.TorusGeometry(0.25 * U, 0.065 * U, 14, 40), mat);
      o.position.z = 0.07;
      g.add(o);
    }
    if (kind === 'playout') g.scale.setScalar(0.62);
    g.userData.scale = kind === 'playout' ? 0.62 : 1;
    return g;
  }
  // spec: { pieces: [{ x, y, p, kind }], hot: [x, y] | null, chosen: [x, y] | null }
  show(spec, rebuild = false) {
    this.spec = spec;
    const still = reduced() || rebuild;
    const want = new Map(spec.pieces.map(q => [q.x + ',' + q.y, q]));
    for (const [k, it] of this.pieces) {
      const q = want.get(k);
      if (!q || q.p !== it.p || q.kind !== it.kind) { this.S.content.remove(it.g); this.pieces.delete(k); }
    }
    for (const [k, q] of want) {
      if (this.pieces.has(k)) continue;
      const g = this.piece(q.p, q.kind), to = this.at(q.x, q.y);
      // a piece the board already showed in another kind (a move tried, then
      // chosen) changes in place; a new one grows or drops
      const known = this.prev && this.prev.has(k) && this.prev.get(k).p === q.p;
      const it = { g, p: q.p, kind: q.kind, to, t: still || known || q.kind === 'base' ? 1 : 0 };
      this.pieces.set(k, it);
      this.S.content.add(g);
      this.place(it);
    }
    this.prev = new Map([...want].map(([k, q]) => [k, { p: q.p }]));
    const put = (ring, c) => {
      ring.visible = !!c;
      if (c) { const p = this.at(...c); ring.position.set(p[0], this.c4 ? p[1] - 0.09 : p[1], this.c4 ? p[2] : 0.16); }
    };
    put(this.hot, spec.chosen ? null : spec.hot);
    put(this.gold, spec.chosen);
  }
  setHover(c) {
    this.hover.visible = !!c;
    if (c) { const p = this.at(...c); this.hover.position.set(p[0], this.c4 ? p[1] - 0.09 : p[1], this.c4 ? p[2] : 0.16); }
  }
  place(it) {
    const e = ease(it.t), [x, y, z] = it.to, s = it.g.userData.scale;
    if (this.c4) {
      const top = this.h * this.U + 0.5;
      it.g.position.set(x, y, top + (z - top) * e);
      it.g.scale.setScalar(s);
    } else {
      it.g.position.set(x, y, z);
      it.g.scale.setScalar(s * Math.max(0.001, e));
    }
  }
  frame(dt) {
    for (const it of this.pieces.values()) if (it.t < 1) { it.t = Math.min(1, it.t + dt / 0.45); this.place(it); }
    if (this.gold.visible && !reduced()) { this.gt = (this.gt || 0) + dt; this.gold.scale.setScalar(1 + 0.06 * Math.sin(this.gt * 3)); }
  }
}
