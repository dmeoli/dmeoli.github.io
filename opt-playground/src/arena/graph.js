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
      this.cities.set(c, { m, h: 0.02, target: 0.02, x, y, name: l, card: null, text: '', lead: null });
    }
    // the option "show h / g / f" puts in place of the name of each city a
    // card of two lines, the name and "h · f" (made again with the theme)
    this.hl = true; this.sig = '';
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
    this.labels();
  }
  // hOf: city -> h (null for a lane with no heuristic); fmap: city -> f
  setHeur(on, hOf, fmap) { this.hon = on; this.hOf = hOf; this.fmap = fmap; this.labels(); }
  labels() {
    if (!this.hl) return;
    const P = this.S.colors;
    for (const [c, it] of this.cities) {
      it.name.visible = !this.hon;
      if (!this.hon) { if (it.card) it.card.visible = false; if (it.lead) it.lead.visible = false; continue; }
      const h = this.hOf ? this.hOf(c) : null, f = this.fmap ? this.fmap.get(c) : undefined;
      const vals = [h !== null ? 'h ' + h : '', f !== undefined ? 'f ' + (+(+f).toPrecision(6)) : ''].filter(Boolean).join(' · ');
      if (!it.card || it.text !== vals) {
        if (it.card) { this.S.content.remove(it.card); it.card.material.map.dispose(); it.card.material.dispose(); }
        it.card = card(c, vals, P); it.text = vals;
        this.S.content.add(it.card);
      }
      it.card.visible = true;
    }
    this.sig = '';
    this.layout();
  }
  // the cards placed on the screen: each takes the first spot around its
  // city, below, above, beside, then farther away, that overlaps no card
  // already placed and no city; a card away from its city gets a leader
  // line. Run again when the camera, the size or the heights change.
  layout() {
    if (!this.hon) return;
    const S = this.S, cam = S.camera, el = S.renderer.domElement, W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    cam.updateMatrixWorld();
    const scr = v => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z]; };
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const its = [...this.cities.entries()].filter(([, it]) => it.card);
    // the screen rectangle of each city (its cylinder from base to top)
    const obs = new Map();
    for (const [c, it] of its) {
      const b = scr(new THREE.Vector3(it.x, it.y, 0)), t = scr(new THREE.Vector3(it.x, it.y, it.h));
      const px = Math.hypot(...scr(new THREE.Vector3(it.x, it.y, 0).addScaledVector(right, 0.042)).slice(0, 2).map((v, i) => v - b[i]));
      obs.set(c, { x0: Math.min(b[0], t[0]) - px, x1: Math.max(b[0], t[0]) + px, y0: Math.min(b[1], t[1]) - px, y1: Math.max(b[1], t[1]) + px, b, t, k: px / 0.042 });
    }
    const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const placed = [];
    // the cities expanded first, then from the top of the screen down
    its.sort((a, b) => (+!!b[1].text.includes('f ') - +!!a[1].text.includes('f ')) || obs.get(a[0]).b[1] - obs.get(b[0]).b[1]);
    for (const [c, it] of its) {
      const o = obs.get(c), w = it.card.scale.x * o.k, h = it.card.scale.y * o.k, g = 3;
      const cx = (o.x0 + o.x1) / 2, spots = [];
      for (const r of [1, 1.9, 2.8]) {
        const dy = (h / 2 + g) * r, dx = (w / 2 + g) * r;
        spots.push([cx, o.y1 + dy - (r - 1) * h / 2], [cx, o.y0 - dy + (r - 1) * h / 2], [o.x1 + dx, o.b[1]], [o.x0 - dx, o.b[1]],
          [o.x1 + dx * 0.7, o.y1 + dy * 0.7], [o.x0 - dx * 0.7, o.y1 + dy * 0.7], [o.x1 + dx * 0.7, o.y0 - dy * 0.7], [o.x0 - dx * 0.7, o.y0 - dy * 0.7]);
      }
      let best = null;
      spots.forEach(([x, y], i) => {
        const R = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
        let bad = placed.reduce((s, q) => s + area(R, q), 0);
        for (const [d, q] of obs) bad += area(R, q) * (d === c ? 2 : 1);
        bad += (Math.max(0, -R.x0) + Math.max(0, R.x1 - W) + Math.max(0, -R.y0) + Math.max(0, R.y1 - H)) * h * 4;
        const score = bad + i * 0.01;
        if (!best || score < best.score) best = { score, x, y, R, far: i >= 8 };
        });
      placed.push(best.R);
      const at = new THREE.Vector3(best.x / W * 2 - 1, 1 - best.y / H * 2, o.b[2]).unproject(cam);
      it.card.position.copy(at);
      // a leader line from the city to the nearest point of a card set apart
      if (best.far) {
        const px = Math.max(best.R.x0, Math.min(o.b[0], best.R.x1)), py = Math.max(best.R.y0, Math.min(o.b[1], best.R.y1));
        const q = new THREE.Vector3(px / W * 2 - 1, 1 - py / H * 2, o.b[2]).unproject(cam);
        if (!it.lead) {
          it.lead = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: this.S.colors.soft, depthTest: false, transparent: true }));
          it.lead.renderOrder = 9; this.S.content.add(it.lead);
        }
        it.lead.geometry.setFromPoints([new THREE.Vector3(it.x, it.y, 0.01), q]);
        it.lead.visible = true;
      } else if (it.lead) it.lead.visible = false;
    }
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
    this.labels();
  }
  place() { for (const it of this.cities.values()) it.m.scale.z = it.h; }
  frame(dt) {
    let moving = false;
    if (this.ring && this.ringA < 1) { this.ringA = Math.min(1, this.ringA + dt / 0.35); this.ring.material.opacity = this.ringA; }
    for (const it of this.cities.values()) if (Math.abs(it.h - it.target) > 1e-4) { it.h += (it.target - it.h) * Math.min(1, dt * 6); moving = true; }
    if (moving) this.place();
    if (this.hon) {
      const el = this.S.renderer.domElement, c = this.S.camera.position;
      const sig = `${el.clientWidth},${el.clientHeight},${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)},${moving}`;
      if (sig !== this.sig || moving) { this.sig = sig; this.layout(); }
    }
  }
}

// the card of a city: its name, and under it the values of the heuristic,
// on a plate of the color of the panel, drawn over the 3D objects
function card(name, vals, P) {
  const fs = 48, pad = 10, cv = document.createElement('canvas'), g = cv.getContext('2d');
  const f1 = `500 ${fs}px "IBM Plex Mono", monospace`, f2 = `${Math.round(fs * 0.9)}px "IBM Plex Mono", monospace`;
  g.font = f1; let w = g.measureText(name).width;
  g.font = f2; if (vals) w = Math.max(w, g.measureText(vals).width);
  const lines = vals ? 2 : 1;
  cv.width = Math.ceil(w) + pad * 2; cv.height = Math.ceil(fs * 1.15 * lines) + pad;
  const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff';
  g.globalAlpha = 0.95; g.fillStyle = panel;
  g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 12); g.fill(); g.globalAlpha = 1;
  g.textBaseline = 'top';
  g.font = f1; g.fillStyle = '#' + P.ink.getHexString(); g.fillText(name, pad, pad / 2 + 2);
  if (vals) { g.font = f2; g.fillStyle = '#' + P.soft.getHexString(); g.fillText(vals, pad, pad / 2 + fs * 1.15 + 2); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  const hgt = 0.05 * lines + 0.012;
  sp.scale.set(hgt * cv.width / cv.height, hgt, 1); sp.renderOrder = 10;
  return sp;
}
