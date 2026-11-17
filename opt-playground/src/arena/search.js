// The lanes of the search games of the arena (the sliding-tile puzzles and
// grid pathfinding), whose traces come from PBeFS through
// tools/pbefs_to_arena.py: the replay of the events into the state of the
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
      this.tiles.set(k, { m, side: side_, topMat, top, at: null, to: null, home: false });
    }
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
    this.place();
  }
  place() {
    for (const it of this.tiles.values()) if (it.at) it.m.position.set(it.at[0], it.at[1], it.m.position.z);
  }
  frame(dt) {
    let moving = false;
    for (const it of this.tiles.values()) {
      if (!it.at || !it.to) continue;
      const dx = it.to[0] - it.at[0], dy = it.to[1] - it.at[1];
      if (Math.abs(dx) + Math.abs(dy) > 1e-4) {
        const a = Math.min(1, dt * 14);
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
      onTheme: () => this.build(), onFrame: () => {} });
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
    const set = this.lastSet; this.lastSet = null;
    if (set) this.show(set);
  }
  paint(c, v, force) {
    if (!force && this.cur[c] === v) return false;
    this.cur[c] = v;
    const { inst, u } = this, W = inst.width, H = inst.height, x = c % W, y = Math.floor(c / W);
    let h = u * 0.25, col = this.cols.free;
    if (this.blocked[c]) { h = u * 2.2; col = this.cols.wall; }
    else if (v === 'p') { h = u * 2.4; col = this.cols.path; }
    else if (v && v[0] === 'e') { h = u * 1.3; col = new THREE.Color(WORKERS[+v.slice(1) % WORKERS.length]); }
    else if (v === 'o') { h = u * 0.6; col = this.cols.open; }
    const m = new THREE.Matrix4().makeScale(1, 1, h);
    m.setPosition((x - (W - 1) / 2) * u, ((H - 1) / 2 - y) * u, 0);
    this.mesh.setMatrixAt(c, m);
    this.mesh.setColorAt(c, col);
    return true;
  }
  // set: the cells by index (as strings) to o, e<worker> or p
  show(set) {
    this.lastSet = set;
    const n = this.inst.width * this.inst.height;
    let changed = false;
    for (let c = 0; c < n; c++) changed = this.paint(c, set.get(String(c)) || '') || changed;
    if (changed) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
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
  const mark = (f, col, lab) => {
    if (typeof f !== 'number') return;
    g.fillStyle = col; g.fillRect(X(f) - 1, 4, 2, 24);
    g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
    g.fillText(lab, Math.min(W - 40, X(f) + 3), 23);
  };
  const e = rep.last;
  if (rep.threshold !== null) mark(rep.threshold, css('--gold') || '#6c5920', t('bound ', 'soglia ') + rep.threshold);
  if (e && e.type === 'expand') mark(e.f, css('--ink') || '#2e2040', 'f ' + e.f);
  g.fillStyle = css('--ink-soft') || '#5f4b76'; g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
  g.fillText(String(lo), 4, 0); const s = String(hi); g.fillText(s, W - 4 - g.measureText(s).width, 0);
}
