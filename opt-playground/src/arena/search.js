// The lanes of the search games of the arena (the sliding-tile puzzles and
// grid pathfinding), whose traces come from PBeFS through
// tools/pbefs_to_games.py: the replay of the events into the state of the
// board, and the board in 3D (the tiles sliding to the state being
// expanded, or the cells of the grid rising as they are expanded, coloured
// by worker), with the strip of the frontier under it. Nothing is solved
// here: the boards change only as the traces say.

import * as THREE from 'three';
import { stage3d, clear } from '../stage3d.js';
import { t } from '../i18n.js';

// one colour per worker of a parallel search
export const WORKERS = ['#7338a8', '#2f8f83', '#c47a1c', '#3f6fb5', '#b2456e', '#5f8a2d', '#8a6d3b', '#4b4b9a'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// the state of a search lane after the first k events
export class SearchReplay {
  constructor(trace) {
    this.tr = trace;
    const ev = trace.events;
    this.nsearch = ev.findIndex(e => e.type === 'path');
    if (this.nsearch < 0) this.nsearch = ev.length;
    // the range of f over the trace, for the strip of the frontier
    let lo = Infinity, hi = -Infinity;
    for (const e of ev) {
      for (const [f] of e.frontier || []) { lo = Math.min(lo, f); hi = Math.max(hi, f); }
      for (const v of [e.f, e.type === 'threshold' ? e.g : undefined]) if (typeof v === 'number') { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    this.frange = lo <= hi ? [lo, hi] : [0, 1];
    this.work = ev.length ? (ev[this.nsearch - 1] || ev[0]).n.expanded : 0;
    this.snaps = [];
    this.reset();
  }
  reset() {
    this.pos = 0; this.n = {}; this.last = null; this.x = null; this.set = new Map();
    this.frontier = null; this.threshold = null; this.incumbent = null; this.w = null;
    this.by = new Map(); this.prevExp = 0; this.flows = null; this.pathI = -1;
  }
  apply(e) {
    this.last = e;
    if (e.type === 'expand') {
      const d = (e.n.expanded || 0) - this.prevExp;
      this.prevExp = e.n.expanded || 0;
      this.by.set(e.w, (this.by.get(e.w) || 0) + d);
      this.w = e.w;
      this.frontier = e.frontier || this.frontier;
      this.flows = e.flows || null;
    } else this.flows = null;
    if (e.type === 'threshold') this.threshold = e.g;
    if (e.type === 'solution') this.incumbent = e.cost;
    if (e.type === 'path') this.pathI = e.i;
    if (e.n) this.n = e.n;
    if (e.x) this.x = e.x;
    if (e.set) for (const [a, b] of Object.entries(e.set)) this.set.set(a, b);
  }
  snapshot() {
    return { pos: this.pos, n: this.n, last: this.last, x: this.x, set: new Map(this.set), frontier: this.frontier,
      threshold: this.threshold, incumbent: this.incumbent, w: this.w, by: new Map(this.by), prevExp: this.prevExp,
      flows: this.flows, pathI: this.pathI };
  }
  seek(k) {
    const ev = this.tr.events;
    k = Math.max(0, Math.min(k, ev.length));
    if (k < this.pos) {
      const s = this.snaps.filter(s => s.pos <= k).pop();
      if (s) Object.assign(this, { ...s, set: new Map(s.set), by: new Map(s.by) });
      else this.reset();
    }
    while (this.pos < k) {
      this.apply(ev[this.pos++]);
      if (this.pos % 128 === 0 && !this.snaps.some(s => s.pos === this.pos)) this.snaps.push(this.snapshot());
    }
    return this;
  }
  // the index of the first event past w expansions
  atWork(w) {
    const ev = this.tr.events;
    let lo = 0, hi = this.nsearch;
    while (lo < hi) { const m = (lo + hi) >> 1; if ((ev[m].n.expanded || 0) <= w) lo = m + 1; else hi = m; }
    return lo;
  }
}

// a texture with the number of a tile
function face(text, fg, bg) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.font = '500 70px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the board of a sliding-tile puzzle: the tiles slide to the cells of the
// state of the event, a tile in its goal cell is dark, the frame takes the
// colour of the worker that expanded the state
export class PuzzleView {
  constructor(box, inst) {
    this.inst = inst; this.side = inst.side;
    this.S = stage3d(box, { camera: [0, -2.15, 2.45], target: [0, 0.05, 0], aspect: 0.72,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  cell(c) {
    const s = this.side, u = 1.6 / s;
    return [(c % s - (s - 1) / 2) * u, ((s - 1) / 2 - Math.floor(c / s)) * u];
  }
  build() {
    const { S, side } = this, P = S.colors, u = 1.6 / side;
    clear(S.content);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.6 + 0.12, 1.6 + 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.9 }));
    plate.position.z = -0.03;
    S.content.add(plate);
    this.frameMat = new THREE.MeshStandardMaterial({ color: P.soft, roughness: 0.7 });
    const fw = 0.05, L = 1.6 + 0.12 + fw * 2;
    for (const [x, y, w, h] of [[0, L / 2 - fw / 2, L, fw], [0, -L / 2 + fw / 2, L, fw], [L / 2 - fw / 2, 0, fw, L], [-L / 2 + fw / 2, 0, fw, L]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), this.frameMat);
      m.position.set(x, y, 0.0);
      S.content.add(m);
    }
    this.tiles = new Map();
    const geo = new THREE.BoxGeometry(u * 0.92, u * 0.92, u * 0.32);
    const ink = '#' + P.ink.getHexString(), paper = '#' + P.lilac.getHexString();
    const home = '#' + P.accent.getHexString(), white = '#ffffff';
    for (let k = 1; k < side * side; k++) {
      const side_ = new THREE.MeshStandardMaterial({ color: P.lilac, roughness: 0.6 });
      const top = [face(String(k), ink, paper), face(String(k), white, home)];
      const topMat = new THREE.MeshStandardMaterial({ map: top[0], roughness: 0.6 });
      const m = new THREE.Mesh(geo, [side_, side_, side_, side_, topMat, side_]);
      m.position.z = u * 0.16;
      S.content.add(m);
      // the term of the heuristic of this tile, on a badge at its corner
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      badge.scale.set(u * 0.36, u * 0.36, 1); badge.renderOrder = 10; badge.visible = false;
      S.content.add(badge);
      this.tiles.set(k, { m, side: side_, topMat, top, at: null, to: null, home: false, badge, bv: null });
    }
    this.badges = new Map();
    if (this.lastShow) this.show(...this.lastShow);
    else this.show(this.inst.board, null);
  }
  // x: the tiles by cell; w: the worker, or null
  show(x, w) {
    this.lastShow = [x, w];
    if (!x) return;
    const P = this.S.colors, still = reduced();
    x.forEach((k, c) => {
      if (!k) return;
      const it = this.tiles.get(k), [px, py] = this.cell(c);
      it.to = [px, py];
      if (!it.at || still) it.at = [px, py];
      const home = k === this.inst.goal[c];
      if (home !== it.home) {
        it.home = home;
        it.topMat.map = it.top[home ? 1 : 0]; it.topMat.needsUpdate = true;
        it.side.color.copy(home ? P.accent2 : P.lilac);
      }
    });
    this.frameMat.color.set(w === null || w === undefined ? '#' + P.soft.getHexString() : WORKERS[w % WORKERS.length]);
    this.terms();
    this.place();
  }
  // the option "show h / g / f": mode 'manhattan' or 'misplaced', or null
  setHeur(mode) { this.hmode = mode; this.terms(); this.place(); }
  terms() {
    const x = this.lastShow && this.lastShow[0];
    if (!x || !this.tiles) return;
    const v = this.hmode ? tileTerms(x, this.inst.goal, this.side, this.hmode === 'misplaced') : null;
    x.forEach((k, c) => {
      if (!k) return;
      const it = this.tiles.get(k);
      it.badge.visible = !!v;
      if (v && it.bv !== v[c]) { it.bv = v[c]; it.badge.material.map = this.badgeTex(v[c]); it.badge.material.needsUpdate = true; }
    });
  }
  // a round badge with a number, in the colors of the theme
  badgeTex(n) {
    if (this.badges.has(n)) return this.badges.get(n);
    const P = this.S.colors, cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    g.beginPath(); g.arc(48, 48, 42, 0, 2 * Math.PI);
    g.fillStyle = n ? '#' + P.ink.getHexString() : '#' + P.ground.getHexString(); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#' + P.accent2.getHexString(); g.stroke();
    g.fillStyle = n ? '#' + P.ground.getHexString() : '#' + P.soft.getHexString();
    g.font = '600 54px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 48, 52);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.badges.set(n, tex);
    return tex;
  }
  place() {
    const u = 1.6 / this.side;
    for (const it of this.tiles.values()) if (it.at) {
      it.m.position.set(it.at[0], it.at[1], it.m.position.z);
      it.badge.position.set(it.at[0] + u * 0.3, it.at[1] + u * 0.3, u * 0.5);
    }
  }
  frame(dt) {
    let moving = false;
    for (const it of this.tiles.values()) {
      if (!it.at || !it.to) continue;
      const dx = it.to[0] - it.at[0], dy = it.to[1] - it.at[1];
      if (Math.abs(dx) + Math.abs(dy) > 1e-4) {
        const a = Math.min(1, dt * 6);
        it.at = [it.at[0] + dx * a, it.at[1] + dy * a]; moving = true;
      }
    }
    if (moving) this.place();
  }
}

// the board of grid pathfinding: one block per cell, the blocked cells tall
// and dark, the cells generated light, those expanded raised in the colour
// of their worker, the cells of the solution path in gold on top
export class GridView {
  constructor(box, inst) {
    this.inst = inst;
    this.S = stage3d(box, { camera: [0, -1.95, 2.1], target: [0, 0.05, 0], aspect: 0.8,
      onTheme: () => this.build(), onFrame: dt => this.frame(dt) });
    this.S.controls.enableDamping = !reduced();
    this.build();
  }
  build() {
    const { S, inst } = this, P = S.colors, W = inst.width, H = inst.height, u = 1.7 / Math.max(W, H);
    clear(S.content);
    this.u = u;
    const n = W * H, geo = new THREE.BoxGeometry(u * 0.94, u * 0.94, 1);
    geo.translate(0, 0, 0.5);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    this.mesh = mesh; this.blocked = new Uint8Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.blocked[y * W + x] = inst.rows[y][x] === '@' ? 1 : 0;
    this.cols = { free: P.ground.clone().lerp(P.rule, 0.5), wall: P.soft.clone().lerp(P.ground, 0.45), open: P.lilac.clone(), path: new THREE.Color('#d9b23a') };
    this.cur = new Array(n).fill('');
    this.heurColors();
    // the height of each cell, and the height it rises or sinks to
    this.h = new Float32Array(n); this.th = new Float32Array(n); this.moving = new Set();
    for (let c = 0; c < n; c++) this.paint(c, '', true);
    S.content.add(mesh);
    const mk = (c, col) => {
      const x = c % W, y = Math.floor(c / W);
      const m = new THREE.Mesh(new THREE.ConeGeometry(u * 0.9, u * 3, 16), new THREE.MeshStandardMaterial({ color: col }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x - (W - 1) / 2) * u, ((H - 1) / 2 - y) * u, u * 4);
      S.content.add(m);
    };
    mk(inst.start, P.accent); mk(inst.goal, new THREE.Color('#d9b23a'));
    // a frame around the cell that the search expands at this event
    const fm = new THREE.MeshBasicMaterial({ color: P.ink });
    this.pin = new THREE.Group();
    for (const [x, y, w, h] of [[0, 1.5, 4, 1], [0, -1.5, 4, 1], [1.5, 0, 1, 4], [-1.5, 0, 1, 4]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * u * 0.5, h * u * 0.5, u * 0.3), fm);
      b.position.set(x * u * 0.5, y * u * 0.5, 0);
      this.pin.add(b);
    }
    this.pin.visible = false;
    S.content.add(this.pin);
    const set = this.lastSet; this.lastSet = null;
    if (set) this.show(set, this.curCell, true);     // a new theme: the cells at their heights at once
  }
  paint(c, v, force) {
    if (!force && this.cur[c] === v) return false;
    this.cur[c] = v;
    const { u } = this;
    let h = u * 0.25, col = this.cols.free;
    if (this.blocked[c]) { h = u * 2.2; col = this.cols.wall; }
    else if (v === 'p') { h = u * 2.4; col = this.cols.path; }
    else if (v && v[0] === 'e') { h = u * 1.3; col = new THREE.Color(WORKERS[+v.slice(1) % WORKERS.length]); }
    else if (v === 'o') { h = u * 0.6; col = this.cols.open; }
    this.th[c] = h;
    if (force || reduced()) { this.h[c] = h; this.moving.delete(c); this.lift(c); } else this.moving.add(c);
    this.mesh.setColorAt(c, this.hon ? this.heurColor(c, v, col) : col);
    return true;
  }
  // the option "show h / g / f": the free cells not yet expanded shaded by
  // h, the octile distance to the goal as PBeFS defines it (zero for a lane
  // with no heuristic), the expanded cells by the band of their f as the
  // trace records it (fmap: cell -> f; bands of step from lo), grey where
  // the trace does not give it
  heurColors() {
    const css = n => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888888');
    this.hc = { hlo: css('--heur-lo'), hhi: css('--heur-hi'), flo: css('--fband-lo'), fhi: css('--fband-hi'), none: css('--heur-none') };
    const { inst } = this, W = inst.width, gx = inst.goal % W, gy = Math.floor(inst.goal / W), n = W * inst.height;
    this.hv = new Float32Array(n); this.hmax = 0;
    for (let c = 0; c < n; c++) {
      const dx = Math.abs(c % W - gx), dy = Math.abs(Math.floor(c / W) - gy);
      this.hv[c] = octile(dx, dy);
      if (!this.blocked[c]) this.hmax = Math.max(this.hmax, this.hv[c]);
    }
  }
  heurColor(c, v, col) {
    const H = this.heur || {};
    if (this.blocked[c] || v === 'p') return col;
    if (v && v[0] === 'e') {
      const f = H.fmap && H.fmap.get(String(c));
      if (f === undefined) return this.hc.none;
      const nb = Math.max(1, Math.floor((H.hi - H.lo) / H.step) + 1), b = Math.min(nb - 1, Math.max(0, Math.floor((f - H.lo) / H.step + 1e-9)));
      return this.hc.flo.clone().lerp(this.hc.fhi, nb > 1 ? b / (nb - 1) : 0);
    }
    if (H.zero) return col;
    return this.hc.hlo.clone().lerp(this.hc.hhi, this.hmax ? this.hv[c] / this.hmax : 0);
  }
  setHeur(on, heur) {
    this.hon = on; this.heur = heur;
    if (this.lastSet) this.recolor();
  }
  recolor() {
    const n = this.inst.width * this.inst.height;
    for (let c = 0; c < n; c++) {
      const v = this.cur[c];
      let col = this.cols.free;
      if (this.blocked[c]) col = this.cols.wall;
      else if (v === 'p') col = this.cols.path;
      else if (v && v[0] === 'e') col = new THREE.Color(WORKERS[+v.slice(1) % WORKERS.length]);
      else if (v === 'o') col = this.cols.open;
      this.mesh.setColorAt(c, this.hon ? this.heurColor(c, v, col) : col);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  lift(c) {
    const { inst, u } = this, W = inst.width, H = inst.height, x = c % W, y = Math.floor(c / W);
    const m = new THREE.Matrix4().makeScale(1, 1, this.h[c]);
    m.setPosition((x - (W - 1) / 2) * u, ((H - 1) / 2 - y) * u, 0);
    this.mesh.setMatrixAt(c, m);
  }
  // the cells rise or sink to their height in about half a second
  frame(dt) {
    if (!this.moving.size) return;
    const a = Math.min(1, dt * 6);
    for (const c of this.moving) {
      this.h[c] += (this.th[c] - this.h[c]) * a;
      if (Math.abs(this.th[c] - this.h[c]) < 1e-4) { this.h[c] = this.th[c]; this.moving.delete(c); }
      this.lift(c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // set: the cells by index (as strings) to o, e<worker> or p; cur: the
  // cell expanded at this event, or null
  show(set, cur = null, force = false) {
    this.lastSet = set; this.curCell = cur;
    const W = this.inst.width, H = this.inst.height, u = this.u;
    this.pin.visible = cur !== null;
    if (cur !== null) { const c = +cur; this.pin.position.set((c % W - (W - 1) / 2) * u, ((H - 1) / 2 - Math.floor(c / W)) * u, u * 1.4); }
    const n = this.inst.width * this.inst.height;
    let changed = false;
    for (let c = 0; c < n; c++) changed = this.paint(c, set.get(String(c)) || '', force) || changed;
    if (changed) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    // the f of a cell can change when the search expands it again
    if (this.hon) this.recolor();
  }
}

// the octile distance of PBeFS (Grid.h): 8 moves, the diagonal costing the
// square root of 2
export const octile = (dx, dy) => Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);

// the heuristic of a lane as its trace header names it, and whether the
// lane searches with none (h = 0: breadth-first, uniform cost, GraphPlan)
export function heurOf(tr) {
  const c = tr.header.solver.config || {};
  return { name: c.heuristic || '', alg: c.algorithm || '', zero: !c.heuristic };
}
// the places (cells of a grid, cities of a map) of the expand events of a
// trace with their f, in the order of the events: one per event, the one
// the event expands; in a trace of a parallel search, whose events carry
// several cells, the cell of the worker of the event whose h equals the h
// of the event, when it is the only one
export function placesF(tr) {
  const h = tr.header, out = [], W = h.instance.width;
  const gx = W ? h.instance.goal % W : 0, gy = W ? Math.floor(h.instance.goal / W) : 0;
  tr.events.forEach((e, i) => {
    if (e.type !== 'expand' || !e.set) return;
    let at = Object.entries(e.set).filter(([, v]) => v[0] === 'e').map(([k]) => k);
    if (at.length > 1 && h.game === 'grid') at = at.filter(k => e.set[k] === 'e' + e.w && Math.abs(octile(Math.abs(+k % W - gx), Math.abs(Math.floor(+k / W) - gy)) - e.h) < 1e-6);
    if (at.length === 1) out.push({ i, place: at[0], f: e.f, g: e.g });
  });
  return out;
}
// the f of each place after the first k events (the last expansion wins)
export function fAt(list, k) {
  const m = new Map();
  for (const x of list) { if (x.i >= k) break; m.set(x.place, x.f); }
  return m;
}
// a round step that cuts [lo, hi] into about n bands
export function niceStep(span, n = 6) {
  const raw = Math.max(span, 1e-9) / n, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
}

// the per-tile terms of the heuristic of a sliding puzzle: the Manhattan
// distance of each tile to its goal cell (h2 of PBeFS), or 1 for each cell
// whose content differs from the goal, the blank included (the misplaced
// tiles of aima-python, EightPuzzle.h)
export function tileTerms(x, goal, side, misplaced) {
  const pos = new Map(goal.map((t, i) => [t, i]));
  return x.map((t, i) => {
    if (misplaced) return t !== goal[i] ? 1 : 0;
    if (!t) return 0;
    const j = pos.get(t);
    return Math.abs(Math.floor(i / side) - Math.floor(j / side)) + Math.abs(i % side - j % side);
  });
}

// the strip of the frontier: the states in OPEN by f, darker where more; the
// f of the state expanded marked, and for IDA* the threshold
export function drawStrip(cv, rep) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 300, H = 34;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const [lo, hi] = rep.frange, span = Math.max(1, hi - lo), X = f => 4 + (W - 8) * (f - lo) / span;
  g.fillStyle = css('--rule') || '#d4c9e6'; g.fillRect(4, 10, W - 8, 12);
  const fr = rep.frontier || [], mx = Math.max(1, ...fr.map(([, c]) => c));
  const bw = Math.max(2, (W - 8) / (span + 1));
  for (const [f, c] of fr) {
    g.globalAlpha = 0.15 + 0.85 * Math.log1p(c) / Math.log1p(mx);
    g.fillStyle = css('--accent') || '#7338a8';
    g.fillRect(X(f) - bw / 2, 10, bw, 12);
  }
  g.globalAlpha = 1;
  // the label of a mark on its right, or on its left (left), kept inside the strip
  const mark = (f, col, lab, left) => {
    if (typeof f !== 'number') return;
    g.fillStyle = col; g.fillRect(X(f) - 1, 4, 2, 24);
    g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
    const w = g.measureText(lab).width;
    g.fillText(lab, Math.max(0, Math.min(W - w, left ? X(f) - 6 - w : X(f) + 5)), 23);
  };
  const e = rep.last;
  if (rep.threshold !== null) mark(rep.threshold, css('--gold') || '#6c5920', t('threshold ', 'soglia ') + rep.threshold, true);
  if (e && e.type === 'expand') mark(e.f, css('--ink') || '#2e2040', 'f ' + e.f);
  g.fillStyle = css('--ink-soft') || '#5f4b76'; g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
  g.fillText(String(lo), 4, 0); const s = String(hi); g.fillText(s, W - 4 - g.measureText(s).width, 0);
}
