// The boards of the CSPs of the arena that SMS++ solves on their CNF, the
// queens and Sudoku: the state of a lane is that of the colouring (for each
// variable its value, or -1, and the values still possible, from the
// literals of the trace through Replay.board()), drawn as a chessboard whose
// columns are the variables and rows the values, or as the 81 cells of a
// Sudoku with their candidates. Nothing is solved here.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const RED = new THREE.Color('#c0281e');

function digit(text, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
  g.fillStyle = fg; g.font = '500 60px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 48, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the n queens: column i is the variable, row j its value; a queen stands on
// the cell of the value set, a cell whose value has been excluded sinks and
// darkens, and the columns of a conflict glow red
export class QueensView {
  constructor(box, inst) {
    this.inst = inst; this.n = inst.vertices.length;
    this.S = stage3d(box, { camera: [0, -1.2, 2.2], target: [0, 0.1, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, n } = this, P = S.colors, u = 1.7 / n;
    clear(S.content);
    this.u = u;
    const at = (i, j) => [(i - (n - 1) / 2) * u, ((n - 1) / 2 - j) * u];
    const light = P.lilac.clone().lerp(P.ground, 0.55), dark = P.lilac.clone().lerp(P.accent2, 0.25);
    this.cols = { light, dark, off: P.rule.clone().lerp(P.soft, 0.35) };
    const tgeo = new THREE.BoxGeometry(u * 0.98, u * 0.98, u * 0.2);
    this.tiles = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ color: (i + j) % 2 ? dark : light, roughness: 0.8 }));
      const [x, y] = at(i, j);
      m.position.set(x, y, 0);
      m.userData.base = (i + j) % 2 ? dark : light;
      S.content.add(m);
      this.tiles.push(m);
    }
    // a queen per column, shown on the row of its value
    const qmat = () => new THREE.MeshStandardMaterial({ color: P.accent, roughness: 0.45, emissive: new THREE.Color(0, 0, 0) });
    this.queens = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(), mat = qmat();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.2, u * 0.32, u * 0.7, 20), mat);
      body.rotation.x = Math.PI / 2; body.position.z = u * 0.45;
      const head = new THREE.Mesh(new THREE.SphereGeometry(u * 0.2, 20, 12), mat);
      head.position.z = u * 0.92;
      g.add(body, head);
      g.visible = false;
      S.content.add(g);
      this.queens.push({ g, mat, s: 0, target: 0 });
    }
    this.at = at;
    if (this.last) this.show(...this.last);
  }
  // board: from Replay.board(); hot: the variables of a conflict
  show(board, hot) {
    this.last = [board, hot];
    const { n } = this, P = this.S.colors, still = reduced();
    board.forEach((b, i) => {
      for (let j = 0; j < n; j++) {
        const m = this.tiles[j * n + i], on = (b.mask >> j) & 1;
        m.material.color.copy(on ? m.userData.base : this.cols.off);
        m.position.z = on ? 0 : -this.u * 0.08;
      }
      const q = this.queens[i];
      let row = b.colour, s = b.colour >= 0 ? 1 : 0;
      if (b.colour < 0 && b.frac) {     // a point of a relaxation: the queen at its largest share, scaled by it
        let best = -1, f = 0;
        b.frac.forEach((v, j) => { if (v > f) { f = v; best = j; } });
        if (best >= 0 && f > 1e-6) { row = best; s = f; }
      }
      if (row >= 0) { const [x, y] = this.at(i, row); q.g.position.set(x, y, 0); }
      q.target = s; if (still) q.s = s;
      q.mat.emissive.copy(hot.has(b.id) ? RED : new THREE.Color(0, 0, 0)).multiplyScalar(0.6);
      q.mat.color.copy(b.colour >= 0 ? P.accent : P.accent2);
    });
    this.place();
  }
  place() {
    for (const q of this.queens) { q.g.visible = q.s > 0.02; q.g.scale.set(1, 1, Math.max(0.02, q.s)); }
  }
  frame(dt) {
    let moving = false;
    for (const q of this.queens) if (Math.abs(q.s - q.target) > 1e-3) { q.s += (q.target - q.s) * Math.min(1, dt * 10); moving = true; }
    if (moving) this.place();
  }
}

// Sudoku: a cell whose digit is set rises with the digit on top (dark for a
// given of the puzzle, light for one the solver set), an open cell shows its
// nine candidates as pegs, an excluded candidate shrinks, and the cells of a
// conflict glow red
export class SudokuView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.2, 2.2], target: [0, 0.1, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors, u = 0.18, gap = 0.03;
    clear(S.content);
    this.u = u;
    const at = (r, c) => [(c - 4) * u + (Math.floor(c / 3) - 1) * gap, (4 - r) * u - (Math.floor(r / 3) - 1) * gap];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(9 * u + 4 * gap, 9 * u + 4 * gap, 0.03),
      new THREE.MeshStandardMaterial({ color: P.soft, roughness: 0.9 }));
    plate.position.z = -0.02;
    S.content.add(plate);
    const ink = '#' + P.ink.getHexString(), paper = '#' + P.lilac.getHexString();
    const given = '#' + P.accent.getHexString();
    this.tex = { set: [...'123456789'].map(d => digit(d, ink, paper)), given: [...'123456789'].map(d => digit(d, '#ffffff', given)) };
    const cgeo = new THREE.BoxGeometry(u * 0.92, u * 0.92, 1);
    cgeo.translate(0, 0, 0.5);
    const pgeo = new THREE.BoxGeometry(u * 0.22, u * 0.22, u * 0.14);
    pgeo.translate(0, 0, u * 0.07);
    this.cells = [];
    const hues = n => new THREE.Color().setHSL(0.76 - n * 0.06, 0.45, 0.55);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const [x, y] = at(r, c), i = r * 9 + c;
      const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.7, emissive: new THREE.Color(0, 0, 0) });
      const top = new THREE.MeshStandardMaterial({ map: this.tex.set[0], roughness: 0.7 });
      const m = new THREE.Mesh(cgeo, [side, side, side, side, top, side]);
      m.position.set(x, y, 0);
      S.content.add(m);
      const pegs = [];
      for (let d = 0; d < 9; d++) {
        const p = new THREE.Mesh(pgeo, new THREE.MeshStandardMaterial({ color: hues(d), roughness: 0.6 }));
        p.position.set(x + (d % 3 - 1) * u * 0.29, y + (1 - Math.floor(d / 3)) * u * 0.29, 0);
        S.content.add(p);
        pegs.push(p);
      }
      this.cells.push({ m, side, top, pegs, h: 0.02, target: 0.02, given: inst.givens && /[1-9]/.test(inst.givens.replace(/[^\d.]/g, '')[i]) });
    }
    if (this.last) this.show(...this.last);
  }
  show(board, hot) {
    this.last = [board, hot];
    const P = this.S.colors, still = reduced(), u = this.u;
    board.forEach((b, i) => {
      const it = this.cells[i];
      const set = b.colour >= 0;
      it.target = set ? u * 0.55 : 0.02;
      if (still) it.h = it.target;
      if (set) { it.top.map = (it.given ? this.tex.given : this.tex.set)[b.colour]; it.top.needsUpdate = true; }
      it.side.color.copy(set && it.given ? P.accent : P.lilac);
      it.side.emissive.copy(hot.has(b.id) ? RED : new THREE.Color(0, 0, 0)).multiplyScalar(0.6);
      it.pegs.forEach((p, d) => { const on = (b.mask >> d) & 1; p.visible = !set; p.scale.setScalar(on ? 1 : 0.35); });
    });
    this.place();
  }
  place() {
    for (const it of this.cells) {
      it.m.scale.z = it.h;
      it.m.visible = it.h > 0.03;
    }
  }
  frame(dt) {
    let moving = false;
    for (const it of this.cells) if (Math.abs(it.h - it.target) > 1e-4) { it.h += (it.target - it.h) * Math.min(1, dt * 10); moving = true; }
    if (moving) this.place();
  }
}
