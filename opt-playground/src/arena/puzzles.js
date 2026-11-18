// The boards of the CSPs of aima-python with constraints on more than two
// variables (Kakuro, cryptarithmetic, the crossword) and of the zebra
// puzzle. The state of a lane is that of Replay.board(): for each variable
// its value (or -1) and the values still possible. Nothing is solved here.
//
// CellGridView draws the layout of the instance (inst.cells, a list of
// [row, column, what]): a variable is a cell that rises with its value on
// top once it is set, and shows the values still possible as pegs while it
// is open; a clue of Kakuro is a dark tile with its two sums; a text is a
// sign of the sum (+, =). A variable may stand in several cells, as a
// letter of a cryptarithmetic problem does. ZebraView draws the zebra
// puzzle as the grid of the five groups of attributes by the five houses:
// in each cell the attributes of the group that may still stand in that
// house, as pegs, and the one that does, risen with its name.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const RED = new THREE.Color('#c0281e');

function label(text, fg, bg, w = 128, h = 128) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = Math.round(h * 0.62);
  g.font = `500 ${size}px "IBM Plex Mono", monospace`;
  while (g.measureText(text).width > w * 0.92 && size > 10) { size -= 2; g.font = `500 ${size}px "IBM Plex Mono", monospace`; }
  g.fillText(text, w / 2, h * 0.54);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the clue of Kakuro: the sum down under the diagonal, the sum right above it
function clue(down, right, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = fg; g.lineWidth = 3;
  g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.stroke();
  g.fillStyle = fg; g.font = '500 44px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (down !== null) g.fillText(String(down), 40, 92);
  if (right !== null) g.fillText(String(right), 90, 38);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hue = (d, k) => new THREE.Color().setHSL(0.76 - (d / Math.max(1, k - 1)) * 0.5, 0.45, 0.55);

export class CellGridView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.35, 2.55], target: [0, 0.04, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors, k = inst.colours.length;
    clear(S.content);
    const c0 = Math.min(0, ...inst.cells.map(c => c[1]));
    const cols = inst.cols - c0, rows = inst.rows;
    const u = Math.min(1.7 / cols, 1.35 / rows);
    this.u = u;
    const at = (r, c) => [(c - c0 - (cols - 1) / 2) * u, ((rows - 1) / 2 - r) * u];
    const ink = '#' + P.ink.getHexString(), paper = '#' + P.lilac.getHexString();
    const show = v => (inst.kind === 'crossword' ? v.toUpperCase() : v);
    this.tex = inst.colours.map(v => label(show(v), ink, paper));
    const cgeo = new THREE.BoxGeometry(u * 0.92, u * 0.92, 1);
    cgeo.translate(0, 0, 0.5);
    // the pegs of the values, in a grid of gx by gy under the cell
    const gx = Math.ceil(Math.sqrt(k)), gy = Math.ceil(k / gx), ps = 0.8 / Math.max(gx, gy);
    const pgeo = new THREE.BoxGeometry(u * ps * 0.75, u * ps * 0.75, u * 0.12);
    pgeo.translate(0, 0, u * 0.06);
    const used = new Set();
    this.vars = inst.vertices.map(() => []);
    for (const [r, c, what] of inst.cells) {
      // the sign = of a cryptarithm stands on the row of the rule; it is drawn
      // beside the sum, under it
      const [x, y] = at(what === '=' ? r + 1 : r, c);
      used.add(r + ',' + c);
      if (typeof what === 'number') {
        const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.7, emissive: new THREE.Color(0, 0, 0) });
        const top = new THREE.MeshStandardMaterial({ map: this.tex[0], roughness: 0.7 });
        const m = new THREE.Mesh(cgeo, [side, side, side, side, top, side]);
        m.position.set(x, y, 0);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(u * 0.96, u * 0.96, 0.012), new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 }));
        plate.position.set(x, y, -0.008);
        S.content.add(m, plate);
        const pegs = [];
        for (let d = 0; d < k; d++) {
          const p = new THREE.Mesh(pgeo, new THREE.MeshStandardMaterial({ color: hue(d, k), roughness: 0.6 }));
          p.position.set(x + ((d % gx) - (gx - 1) / 2) * u * ps, y + ((gy - 1) / 2 - Math.floor(d / gx)) * u * ps, 0);
          S.content.add(p);
          pegs.push(p);
        }
        this.vars[what].push({ m, side, top, pegs, h: 0.02, target: 0.02 });
      } else if (Array.isArray(what)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(u * 0.96, u * 0.96, u * 0.12),
          [0, 1, 2, 3, 4, 5].map(f => new THREE.MeshStandardMaterial(f === 4 ? { map: clue(what[0], what[1], '#ffffff', '#' + P.accent2.getHexString()) } : { color: P.accent2 })));
        m.position.set(x, y, u * 0.06);
        S.content.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(u * 0.9, u * 0.9), new THREE.MeshBasicMaterial({ map: label(what, ink, null), transparent: true }));
        m.position.set(x, y, 0.01);
        S.content.add(m);
      }
    }
    // the blocked cells of a grid; the rule over the sum of a cryptarithm
    if (inst.kind !== 'crypto') {
      // darker than the ground in both themes (the soft ink is light in the dark one)
      const block = P.ground.getHSL({}).l < 0.5 ? P.ground.clone().multiplyScalar(0.55) : P.soft;
      for (let r = 0; r < rows; r++) for (let c = 0; c < inst.cols; c++) {
        if (used.has(r + ',' + c)) continue;
        const [x, y] = at(r, c);
        const m = new THREE.Mesh(new THREE.BoxGeometry(u * 0.96, u * 0.96, u * 0.12), new THREE.MeshStandardMaterial({ color: block, roughness: 0.9 }));
        m.position.set(x, y, u * 0.06);
        S.content.add(m);
      }
    } else {
      const [, y] = at(inst.words.length, 0), w = cols * u;
      const rule = new THREE.Mesh(new THREE.BoxGeometry(w, u * 0.05, u * 0.03), new THREE.MeshStandardMaterial({ color: P.ink }));
      rule.position.set(0, y, 0.01);
      S.content.add(rule);
    }
    if (this.last) this.show(...this.last);
  }
  show(board, hot) {
    this.last = [board, hot];
    const still = reduced(), u = this.u, P = this.S.colors;
    board.forEach((b, i) => {
      const set = b.colour >= 0;
      for (const it of this.vars[i]) {
        it.target = set ? u * 0.5 : 0.02;
        if (still) it.h = it.target;
        if (set) { it.top.map = this.tex[b.colour]; it.top.needsUpdate = true; }
        it.side.color.copy(P.lilac);
        it.side.emissive.copy(hot.has(b.id) ? RED : new THREE.Color(0, 0, 0)).multiplyScalar(0.6);
        it.pegs.forEach((p, d) => { const on = (b.mask >> d) & 1; p.visible = !set && !!on; });
      }
    });
    this.place();
  }
  place() {
    for (const cells of this.vars) for (const it of cells) { it.m.scale.z = it.h; it.m.visible = it.h > 0.03; }
  }
  frame(dt) {
    let moving = false;
    for (const cells of this.vars) for (const it of cells) if (Math.abs(it.h - it.target) > 1e-4) { it.h += (it.target - it.h) * Math.min(1, dt * 6); moving = true; }
    if (moving) this.place();
  }
}

// the zebra puzzle: rows are the five groups of attributes (colours, pets,
// drinks, nationalities, smokes), columns the five houses
export class ZebraView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.3, 2.4], target: [0, 0.04, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors;
    clear(S.content);
    const G = inst.groups, H = inst.colours.length, u = 1.62 / H, v = 1.3 / G.length;
    this.u = u;
    const ink = '#' + P.ink.getHexString(), paper = '#' + P.lilac.getHexString();
    const at = (g, h) => [(h - (H - 1) / 2) * u, ((G.length - 1) / 2 - g) * v];
    this.index = new Map(inst.vertices.map((x, i) => [x, i]));
    this.where = inst.vertices.map(() => null);   // group and place in the group of each variable
    G.forEach((grp, g) => grp.forEach((a, j) => { this.where[this.index.get(a)] = [g, j]; }));
    this.cells = [];
    const pgeo = new THREE.BoxGeometry(u * 0.14, u * 0.14, u * 0.12);
    pgeo.translate(0, 0, u * 0.06);
    const bgeo = new THREE.BoxGeometry(u * 0.9, v * 0.8, 1);
    bgeo.translate(0, 0, 0.5);
    G.forEach((grp, g) => {
      const row = [];
      for (let h = 0; h < H; h++) {
        const [x, y] = at(g, h);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(u * 0.96, v * 0.9, 0.012), new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 }));
        plate.position.set(x, y, -0.008);
        S.content.add(plate);
        const pegs = grp.map((_, j) => {
          const p = new THREE.Mesh(pgeo, new THREE.MeshStandardMaterial({ color: hue(j, grp.length), roughness: 0.6 }));
          p.position.set(x + (j - (grp.length - 1) / 2) * u * 0.18, y, 0);
          S.content.add(p);
          return p;
        });
        const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.7, emissive: new THREE.Color(0, 0, 0) });
        const top = new THREE.MeshStandardMaterial({ roughness: 0.7 });
        const m = new THREE.Mesh(bgeo, [side, side, side, side, top, side]);
        m.position.set(x, y, 0);
        m.visible = false;
        S.content.add(m);
        row.push({ pegs, m, side, top, who: -1, h: 0.02, target: 0.02 });
      }
      this.cells.push(row);
    });
    this.tex = inst.vertices.map(a => label(a, ink, paper, 256, 128));
    if (this.last) this.show(...this.last);
  }
  show(board, hot) {
    this.last = [board, hot];
    const still = reduced(), u = this.u, P = this.S.colors;
    for (const row of this.cells) for (const c of row) { c.who = -1; c.pegs.forEach(p => { p.visible = false; }); c.hot = false; }
    board.forEach((b, i) => {
      const [g, j] = this.where[i];
      this.cells[g].forEach((c, h) => {
        if (b.colour === h) { c.who = i; c.hot = hot.has(b.id); }
        if (b.colour < 0 && ((b.mask >> h) & 1)) c.pegs[j].visible = true;
      });
    });
    for (const row of this.cells) for (const c of row) {
      c.target = c.who >= 0 ? u * 0.35 : 0.02;
      if (still) c.h = c.target;
      if (c.who >= 0) { c.top.map = this.tex[c.who]; c.top.needsUpdate = true; }
      c.side.color.copy(P.lilac);
      c.side.emissive.copy(c.hot ? RED : new THREE.Color(0, 0, 0)).multiplyScalar(0.6);
    }
    this.place();
  }
  place() {
    for (const row of this.cells) for (const c of row) { c.m.scale.z = c.h; c.m.visible = c.h > 0.03; }
  }
  frame(dt) {
    let moving = false;
    for (const row of this.cells) for (const c of row) if (Math.abs(c.h - c.target) > 1e-4) { c.h += (c.target - c.h) * Math.min(1, dt * 6); moving = true; }
    if (moving) this.place();
  }
}
