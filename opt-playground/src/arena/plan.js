// The board of a planning problem: one tile per fluent of the problem, with
// its name, in rows; a tile rises when the fluent is true in the state that
// the trace shows (a state expanded by a forward search, a subgoal of a
// backward search, the propositions of a level of the planning graph), and
// the fluents of the goal stand on a gold base. Nothing is solved here: the
// tiles change only as the trace says.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function face(text, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 44;
  g.font = `500 ${size}px "IBM Plex Mono", monospace`;
  while (g.measureText(text).width > 236 && size > 16) { size -= 2; g.font = `500 ${size}px "IBM Plex Mono", monospace`; }
  g.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PlanView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.2, 1.95], target: [0, 0.06, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors, n = inst.fluents.length;
    clear(S.content);
    const cols = Math.ceil(Math.sqrt(n * 1.2)), rows = Math.ceil(n / cols);
    const w = 1.7 / cols, h = Math.min(w * 0.6, 1.25 / rows);
    const goal = new Set(inst.goal);
    const ink = '#' + P.ink.getHexString(), paper = '#' + P.lilac.getHexString(), on = '#' + P.accent.getHexString();
    this.tiles = [];
    inst.fluents.forEach((f, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c - (cols - 1) / 2) * w, y = ((rows - 1) / 2 - r) * h * 1.25;
      if (goal.has(i)) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 1.15, 0.012), new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9b23a') }));
        base.position.set(x, y, -0.006);
        S.content.add(base);
      }
      const side = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.6 });
      const tex = [face(f, ink, paper), face(f, '#ffffff', on)];
      const top = new THREE.MeshStandardMaterial({ map: tex[0], roughness: 0.6 });
      const geo = new THREE.BoxGeometry(w * 0.9, h * 0.9, 1);
      geo.translate(0, 0, 0.5);
      const m = new THREE.Mesh(geo, [side, side, side, side, top, side]);
      m.position.set(x, y, 0);
      S.content.add(m);
      this.tiles.push({ m, side, top, tex, on: false, z: 0.02, target: 0.02 });
    });
    this.place();
    if (this.last) this.show(...this.last);
    else this.show(inst.initial, null);
  }
  // x: the indices of the fluents that are true
  show(x) {
    this.last = [x];
    if (!x) return;
    const P = this.S.colors, set = new Set(x), still = reduced();
    this.tiles.forEach((it, i) => {
      const on = set.has(i);
      it.target = on ? 0.12 : 0.02;
      if (still) it.z = it.target;
      if (on !== it.on) {
        it.on = on;
        it.top.map = it.tex[on ? 1 : 0]; it.top.needsUpdate = true;
        it.side.color.copy(on ? P.accent : P.lilac);
      }
    });
    this.place();
  }
  place() { for (const it of this.tiles) it.m.scale.z = it.z; }
  frame(dt) {
    let moving = false;
    for (const it of this.tiles) if (Math.abs(it.z - it.target) > 1e-4) { it.z += (it.target - it.z) * Math.min(1, dt * 6); moving = true; }
    if (moving) this.place();
  }
}
