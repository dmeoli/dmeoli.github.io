// The board of the cube in the arena: 27 cubies with the 54 facelets of a
// state of the trace (the letters U, R, F, D, L, B of Kociemba, which
// tools/pbefs_to_games.py decodes from the cubies of PBeFS), drawn with R on
// +x, B on +y and U on +z; along the solution path the layer of each move
// starts turned back by the move and turns into place, so that the cube is
// seen making the move. Nothing is solved here: the states and the moves are
// those of the trace.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';
import { WORKERS } from './search.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// the colours of the faces, as the cube is usually sold
const FACE = { U: '#f2f0ea', R: '#c2453d', F: '#3f9a5a', D: '#e3c02f', L: '#e07b26', B: '#3f6fb5' };
const NORMAL = { U: [0, 0, 1], D: [0, 0, -1], F: [0, -1, 0], B: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0] };

// the cell and the outward normal of the facelet k (the same map as _place
// in tools/pbefs_to_games.py, which checks the moves against it)
function place(k) {
  const f = 'URFDLB'[Math.floor(k / 9)], r = Math.floor(k % 9 / 3), c = k % 3;
  return { U: [[c - 1, 1 - r, 1], NORMAL.U], D: [[c - 1, r - 1, -1], NORMAL.D], F: [[c - 1, -1, 1 - r], NORMAL.F],
    B: [[1 - c, 1, 1 - r], NORMAL.B], R: [[1, c - 1, 1 - r], NORMAL.R], L: [[-1, 1 - c, 1 - r], NORMAL.L] }[f];
}
// the angle of a move about the outward normal of its face: clockwise seen
// from outside is a negative turn
const ANGLE = { '': -Math.PI / 2, '2': Math.PI, "'": Math.PI / 2 };

export class CubeView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [1.8, -2.4, 1.7], target: [0, 0, -0.16], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.anim = null;
    this.build();
  }
  build() {
    this.shown = false;     // new stickers take their colors at once
    const { S } = this, P = S.colors, u = 0.36;
    clear(S.content);
    this.u = u;
    this.cubies = [];
    const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1a24'), roughness: 0.55 });
    const cgeo = new THREE.BoxGeometry(u * 0.96, u * 0.96, u * 0.96);
    const sgeo = new THREE.BoxGeometry(u * 0.8, u * 0.8, u * 0.03);
    const at = new Map();
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const g = new THREE.Group();
      g.position.set(x * u, y * u, z * u);
      g.add(new THREE.Mesh(cgeo, body));
      g.userData.cell = [x, y, z];
      S.content.add(g);
      this.cubies.push(g);
      at.set(`${x},${y},${z}`, g);
    }
    // a sticker per facelet, on the face of its cubie
    this.stickers = [];
    for (let k = 0; k < 54; k++) {
      const [p, n] = place(k), g = at.get(p.join(','));
      const m = new THREE.Mesh(sgeo, new THREE.MeshStandardMaterial({ roughness: 0.45 }));
      m.position.set(n[0] * u * 0.49, n[1] * u * 0.49, n[2] * u * 0.49);
      if (n[0]) m.rotation.y = Math.PI / 2;     // the thin side of the sticker along the normal
      else if (n[1]) m.rotation.x = Math.PI / 2;
      g.add(m);
      this.stickers.push(m);
    }
    // the plate under the cube, in the colour of the worker that expands
    this.plateMat = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(u * 2.6, u * 2.6, 0.04, 48), this.plateMat);
    plate.rotation.x = Math.PI / 2;
    plate.position.z = -u * 1.5 - 0.1;
    S.content.add(plate);
    this.anim = null;
    if (this.lastShow) this.show(...this.lastShow, null);
    else this.show(this.inst.facelets, null, null);
  }
  // x: the 54 facelets; w: the worker, or null; move: the move that led to x,
  // to be shown turning, or null
  show(x, w, move) {
    this.lastShow = [x, w];
    if (!x) return;
    this.finish();
    // a turn of the path recolors at once (the layer turns into place);
    // between two states expanded, which are in general several moves
    // apart, the stickers that change fade to their new color in 0.4 s
    const fade = !move && !reduced() && this.shown;
    this.fades = [];
    for (let k = 0; k < 54; k++) {
      const mat = this.stickers[k].material, to = new THREE.Color(FACE[x[k]] || '#888');
      if (fade && !mat.color.equals(to)) this.fades.push({ mat, from: mat.color.clone(), to, t: 0 });
      else mat.color.copy(to);
    }
    this.shown = true;
    const P = this.S.colors;
    this.plateMat.color.set(w === null || w === undefined ? '#' + P.rule.getHexString() : WORKERS[w % WORKERS.length]);
    if (!move || reduced()) return;
    const n = NORMAL[move[0]], a = ANGLE[move.slice(1)];
    if (!n || a === undefined) return;
    const pivot = new THREE.Group(), axis = new THREE.Vector3(...n);
    this.S.content.add(pivot);
    for (const g of this.cubies) {
      const c = g.userData.cell;
      if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] === 1) pivot.attach(g);
    }
    this.anim = { pivot, axis, from: -a, t: 0 };
    pivot.setRotationFromAxisAngle(axis, -a);
  }
  // ends a turn at once, its layer back among the cubies
  finish() {
    const A = this.anim;
    if (!A) return;
    A.pivot.setRotationFromAxisAngle(A.axis, 0);
    A.pivot.updateMatrixWorld(true);
    for (const g of [...A.pivot.children]) this.S.content.attach(g);
    this.S.content.remove(A.pivot);
    this.anim = null;
  }
  frame(dt) {
    if (this.fades && this.fades.length) {
      for (const f of this.fades) { f.t = Math.min(1, f.t + dt / 0.4); f.mat.color.copy(f.from).lerp(f.to, f.t); }
      if (this.fades.every(f => f.t >= 1)) this.fades = [];
    }
    const A = this.anim;
    if (!A) return;
    A.t = Math.min(1, A.t + dt * 2);
    const e = 1 - (1 - A.t) ** 3;
    A.pivot.setRotationFromAxisAngle(A.axis, A.from * (1 - e));
    if (A.t >= 1) this.finish();
  }
}
