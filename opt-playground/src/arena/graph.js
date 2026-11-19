// The board of a search on a road map (the map of Romania of aima-python):
// the cities at their coordinates, the roads between them, a city rising in
// the colour of the search when it is expanded and in gold when it is on the
// solution path; the start and the goal are marked by a cone. Nothing is
// solved here: the cities change only as the trace says.

import * as THREE from 'three';
import { stage3d, rod, clear, label } from '../stage3d.js';
import { onLang } from '../i18n.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const GOLD = '#d9b23a';

export class GraphView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.6, 1.75], target: [0, 0.02, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
    onLang(() => this.build());
  }
  build() {
    const { S, inst } = this, P = S.colors;
    clear(S.content);
    const xy = Object.values(inst.nodes), xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const k = 1.45 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    this.at = c => [(inst.nodes[c][0] - cx) * k, (inst.nodes[c][1] - cy) * k];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.03), new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 }));
    plate.position.z = -0.016;
    S.content.add(plate);
    const rm = new THREE.MeshStandardMaterial({ color: P.soft, roughness: 0.8 });
    for (const [a, b] of inst.edges) {
      const A = this.at(a), B = this.at(b);
      S.content.add(rod([A[0], A[1], 0.004], [B[0], B[1], 0.004], 0.006, rm));
    }
    this.cities = new Map();
    const geo = new THREE.CylinderGeometry(0.042, 0.042, 1, 24);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, 0.5);
    for (const c of Object.keys(inst.nodes)) {
      const [x, y] = this.at(c);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.6 }));
      m.position.set(x, y, 0);
      S.content.add(m);
      const l = label(c, P.ink, 0.05);
      l.position.set(x, y - 0.075, 0.02);
      S.content.add(l);
      this.cities.set(c, { m, h: 0.02, target: 0.02 });
    }
    for (const [c, col] of [[inst.start, P.accent], [inst.goal, new THREE.Color(GOLD)]]) {
      const [x, y] = this.at(c);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 16), new THREE.MeshStandardMaterial({ color: col }));
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(x, y, 0.36);
      S.content.add(cone);
    }
    // a ring around the city that the search expands at this event
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.011, 8, 40), new THREE.MeshBasicMaterial({ color: P.ink, transparent: true }));
    this.ring.visible = false;
    S.content.add(this.ring);
    this.place();
    if (this.lastSet) this.show(this.lastSet, this.cur);
  }
  // set: the cities to e<worker> (expanded) or p (on the path); cur: the
  // city expanded at this event, or null
  show(set, cur = null) {
    this.lastSet = set; this.cur = cur;
    this.ring.visible = !!cur && this.cities.has(cur);
    if (this.ring.visible) { const [x, y] = this.at(cur); this.ring.position.set(x, y, 0.004); this.ringA = reduced() ? 1 : 0; this.ring.material.opacity = this.ringA; }
    const P = this.S.colors, still = reduced();
    for (const [c, it] of this.cities) {
      const v = set.get(c) || '';
      it.target = v === 'p' ? 0.26 : v ? 0.16 : 0.02;
      it.m.material.color.copy(v === 'p' ? new THREE.Color(GOLD) : v ? P.accent : P.lilac);
      if (still) it.h = it.target;
    }
    this.place();
  }
  place() { for (const it of this.cities.values()) it.m.scale.z = it.h; }
  frame(dt) {
    let moving = false;
    if (this.ring && this.ringA < 1) { this.ringA = Math.min(1, this.ringA + dt / 0.35); this.ring.material.opacity = this.ringA; }
    for (const it of this.cities.values()) if (Math.abs(it.h - it.target) > 1e-4) { it.h += (it.target - it.h) * Math.min(1, dt * 6); moving = true; }
    if (moving) this.place();
  }
}
