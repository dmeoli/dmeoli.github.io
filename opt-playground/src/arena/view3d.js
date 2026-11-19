// The board of a lane in 3D: the regions of a map extruded as a relief
// (assets/arena/maps.json), or a random planar graph as discs and rods; a
// region rises and takes its colour when the trace assigns it, the pegs on
// it are the colours still possible, and the regions of a conflict flash.

import * as THREE from 'three';
import { stage3d, rod, clear, label } from '../stage3d.js';
import { t, onLang } from '../i18n.js';
import { Marks } from './cells.js';

export const HUES = { R: '#c2453d', G: '#4f9a5a', B: '#3f6fb5', Y: '#d9b23a' };
const LOW = 0.05, HIGH = 0.15;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// the outer ring and the holes of a polygon as a THREE.Shape
function toShape(poly) {
  const sh = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of poly.slice(1)) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return sh;
}

export class BoardView {
  // box: an element; inst: the instance of the trace; map: its entry of
  // maps.json, or null for a graph drawn from inst.xy
  constructor(box, inst, map) {
    this.inst = inst; this.map = map;
    this.S = stage3d(box, { camera: [0, -1.85, 1.9], target: [0, -0.12, 0], aspect: 0.72,
      onTheme: () => this.paint(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.items = new Map();    // vertex -> { body, pegs, h, target, hot }
    this.flash = 0;
    this.build();
    onLang(() => this.build());
  }
  build() {
    const { S, inst, map } = this, P = S.colors;
    clear(S.content);
    this.items.clear();
    const k = inst.colours.length, inI = new Set(inst.vertices);
    const mk = () => new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.85, metalness: 0 });
    const peg = (x, y, size) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      const pegs = inst.colours.map((c, j) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size * 0.8),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(HUES[c] || '#888'), roughness: 0.6 }));
        m.position.set((j - (k - 1) / 2) * size * 1.35, 0, size * 0.4);
        g.add(m);
        return m;
      });
      S.content.add(g);
      return { g, pegs, size };
    };
    if (map) {
      const n = Object.keys(map.regions).length, size = n > 30 ? 0.016 : n > 12 ? 0.024 : 0.04;
      for (const [id, r] of Object.entries(map.regions)) {
        const geo = new THREE.ExtrudeGeometry(r.polygons.map(toShape), { depth: 1, bevelEnabled: false });
        const body = new THREE.Mesh(geo, mk());
        const line = new THREE.Group();
        const lm = new THREE.LineBasicMaterial({ color: P.ground, transparent: true, opacity: 0.8 });
        for (const poly of r.polygons) {
          const pts = poly[0].map(([x, y]) => new THREE.Vector3(x, y, 1.002));
          line.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lm));
        }
        body.add(line);
        S.content.add(body);
        if (!inI.has(id)) {      // a region the instance leaves out
          body.material.transparent = true; body.material.opacity = 0.35;
          body.scale.z = LOW * 0.5;
          const l = label(t('not in the instance', 'fuori dall\'istanza'), P.soft, 0.05);
          l.position.set(r.label[0], r.label[1] - 0.06, 0.08);
          S.content.add(l);
          continue;
        }
        const p = peg(r.label[0], r.label[1], size);
        if (n <= 25) {
          const l = label(id, P.ink, 0.045);
          l.position.set(0, size * 1.8, size * 1.2);
          p.g.add(l);
        }
        this.items.set(id, { body, ...p, h: LOW, target: LOW, hot: false });
      }
    } else {
      const xy = new Map(inst.vertices.map((v, i) => [v, inst.xy[i]]));
      const em = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 });
      for (const [a, b] of inst.edges) {
        const A = xy.get(a), B = xy.get(b);
        S.content.add(rod([A[0] * 0.95, A[1] * 0.95, 0.01], [B[0] * 0.95, B[1] * 0.95, 0.01], 0.006, em));
      }
      const r = Math.min(0.08, 0.55 / Math.sqrt(inst.vertices.length));
      for (const v of inst.vertices) {
        const [x, y] = xy.get(v);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 28), mk());
        body.rotation.x = Math.PI / 2;
        body.position.set(x * 0.95, y * 0.95, 0);
        // the cylinder stands on the plane: its unit height is scaled
        body.geometry.translate(0, 0.5, 0);
        S.content.add(body);
        const p = peg(x * 0.95, y * 0.95, r * 0.42);
        this.items.set(v, { body, ...p, h: LOW, target: LOW, hot: false, graph: true });
      }
    }
    this.marks = new Marks(S);
    this.ids = inst.vertices;
    if (this.last) this.show(...this.last);
  }
  // board: from Replay.board(); hot: the vertices of a conflict; focus: from
  // Replay.focus(), a frame around the pegs of each vertex it names
  show(board, hot, focus = []) {
    this.last = [board, hot, focus];
    const P = this.S.colors, cols = this.inst.colours, still = reduced();
    for (const b of board) {
      const it = this.items.get(b.id);
      if (!it) continue;
      const m = it.body.material;
      if (b.colour >= 0) m.color.set(HUES[cols[b.colour]] || '#888');
      else if (b.frac && b.frac.some(f => f > 1e-6)) {     // a point of a relaxation: the colours mixed
        const c = new THREE.Color(0, 0, 0); let s = 0;
        b.frac.forEach((f, j) => { if (f > 0) { c.add(new THREE.Color(HUES[cols[j]]).multiplyScalar(f)); s += f; } });
        m.color.copy(c.multiplyScalar(1 / Math.max(s, 1e-9)));
      } else m.color.copy(P.lilac);
      it.target = b.colour >= 0 ? HIGH : LOW;
      if (still) it.h = it.target;
      it.pegs.forEach((p, j) => {
        const on = (b.mask >> j) & 1;
        p.scale.setScalar(on ? 1 : 0.45);
        p.material.color.set(on ? (HUES[cols[j]] || '#888') : '#' + P.rule.getHexString());
      });
      it.hot = hot.has(b.id);
      if (!it.hot) m.emissive.setRGB(0, 0, 0);
    }
    this.flash = hot.size ? 1e-3 : 0;
    this.place();
    const k = cols.length;
    this.marks.show(focus, v => {
      const it = this.items.get(this.ids[v]);
      if (!it) return null;
      const s = it.size;
      return [it.g.position.x, it.g.position.y, s * (1.35 * k + 0.6), s * 2.2, it.target + 0.004];
    });
  }
  paint() { this.build(); }
  place() {
    for (const it of this.items.values()) {
      if (it.graph) it.body.scale.set(1, it.h, 1);
      else it.body.scale.z = it.h;
      it.g.position.z = it.h + 0.002;
    }
  }
  frame(dt) {
    const still = reduced();
    let moving = false;
    if (this.marks) this.marks.frame(dt);
    for (const it of this.items.values()) {
      if (Math.abs(it.h - it.target) > 1e-4) { it.h += (it.target - it.h) * Math.min(1, dt * 6); moving = true; }
      if (it.hot) {
        // red, pulsing for a moment, or steady when motion is reduced
        const a = still ? 0.55 : 0.55 * (0.5 + 0.5 * Math.cos(this.flash * 18)) * Math.max(0, 1 - this.flash / 1.2);
        it.body.material.emissive.setRGB(a, 0.02, 0.02);
      }
    }
    if (this.flash > 0 && !still) this.flash += dt;
    if (moving) this.place();
  }
}
