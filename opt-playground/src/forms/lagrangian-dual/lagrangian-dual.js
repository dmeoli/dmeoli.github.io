// The Lagrangian dual as a polyhedral roof: one facet per point of the
// knapsack that is the cheapest somewhere, the trial points of a bundle
// method on it, its model (the minimum of the cuts collected) as a
// translucent roof above, the dual optimum; a preview of the printed relief
// and the download panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { inst, cuts, L, bundle, cutsAt, dualOpt, primalOpt, Lmin, solid, fileName } from './model.js';

const $ = id => document.getElementById(id);
// #...&frame=1 makes the view as tall as the window (for the thumbnails)
const FRAME = /(^|[#&])frame=1/.test(location.hash);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const S = 80, RELIEF = 30, BASE = 3, sc = inst.lmax / S;
const state = { algo: 'proximal', t: 0.25, gamma: 0.3, k: 99, model: true, preview: false };
const zOf = v => BASE + Math.max(0, (v - Lmin) / (dualOpt.value - Lmin) * RELIEF);

// the state in the address (src/print/state.js): a link restores the scene
const SPEC = {
  algo: { def: 'proximal', values: ['proximal', 'level', 'kelley'] }, t: { def: 0.25, min: 0.05, max: 3 },
  k: { def: 99, min: 0, max: 99, int: true }, model: { def: true }, preview: { def: false },
};
function readHash() { Object.assign(state, readState(SPEC)); }
const flat = () => ({ algo: state.algo, t: state.t, k: state.k, model: state.model, preview: state.preview });
const writeHash = () => writeState(SPEC, flat());

let renderer, scene, camera, controls, group, dirty = true, steps;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  camera.position.set(S * 0.5 + 95, S * 0.5 - 120, 150);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(S / 2, S / 2, 16);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50406a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-0.6, -1.2, 2); scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5); back.position.set(1, 1, 0.6); scene.add(back);
  const resize = () => {
    const w = stage.clientWidth, h = FRAME ? Math.round(innerHeight * 1.1) : Math.round(Math.min(w * 0.66, 540));
    renderer.setSize(w, h, false); camera.aspect = w / h; if (FRAME) camera.zoom = 0.98; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (controls.update()) dirty = true; if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// the region of the box where cut k is the lowest of the set B: the box
// clipped by the half-planes cut_k <= cut_j (Sutherland-Hodgman)
function region(k, B) {
  let poly = [[0, 0], [inst.lmax, 0], [inst.lmax, inst.lmax], [0, inst.lmax]];
  for (const j of B) {
    if (j === k) continue;
    // (k - j)(l) <= 0
    const a = k.slope[0] - j.slope[0], b = k.slope[1] - j.slope[1], c = k.value - j.value;
    const f = p => a * p[0] + b * p[1] + c, out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
      if (fp <= 1e-12) out.push(p);
      if ((fp < -1e-12 && fq > 1e-12) || (fp > 1e-12 && fq < -1e-12)) { const s = fp / (fp - fq); out.push([p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])]); }
    }
    poly = out;
    if (poly.length < 3) return null;
  }
  return poly;
}

// the facets of min over B as triangles, one colour per facet
function roof(B, colorOf, lift = 0) {
  const pos = [], col = [];
  B.forEach((k, n) => {
    const poly = region(k, B);
    if (!poly) return;
    const c = colorOf(k, n), P = poly.map(p => [p[0] / sc, p[1] / sc, zOf(k.value + k.slope[0] * p[0] + k.slope[1] * p[1]) + lift]);
    for (let i = 1; i < P.length - 1; i++) for (const q of [P[0], P[i], P[i + 1]]) { pos.push(...q); col.push(c.r, c.g, c.b); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// the four walls of the solid under the boundary of the box, and the floor
function walls() {
  const pos = [], N = 240, lm = inst.lmax;
  const sides = [[[0, 0], [lm, 0]], [[lm, 0], [lm, lm]], [[lm, lm], [0, lm]], [[0, lm], [0, 0]]];
  for (const [a, b] of sides) for (let i = 0; i < N; i++) {
    const p = [0, 1].map(d => a[d] + (b[d] - a[d]) * i / N), q = [0, 1].map(d => a[d] + (b[d] - a[d]) * (i + 1) / N);
    const P = [p[0] / sc, p[1] / sc], Q = [q[0] / sc, q[1] / sc], zp = zOf(L(p)), zq = zOf(L(q));
    pos.push(P[0], P[1], 0, Q[0], Q[1], 0, Q[0], Q[1], zq, P[0], P[1], 0, Q[0], Q[1], zq, P[0], P[1], zp);
  }
  pos.push(0, 0, 0, S, S, 0, S, 0, 0, 0, 0, 0, 0, S, 0, S, S, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

function clear() {
  if (!group) return;
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.remove(group);
}

const ball = (r, c, p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), c); m.position.set(...p); return m; };
const at = l => [l[0] / sc, l[1] / sc, zOf(L(l))];

function draw() {
  clear();
  group = new THREE.Group(); scene.add(group);
  const accent = new THREE.Color(css('--accent')), lilac = new THREE.Color(css('--lilac')), a2 = new THREE.Color(css('--accent-2'));
  const gold = new THREE.Color(css('--gold')), ground = new THREE.Color(css('--ground'));
  const k = Math.min(state.k, steps.length - 1);
  if (state.preview) {
    const m = solid({ algo: state.algo, t: state.t, gamma: state.gamma, k, size: S, relief: RELIEF, base: BASE, cell: 0.6 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55 })));
  } else {
    // the facets in shades between lilac and the second accent, the walls plain
    const shade = (_, n) => lilac.clone().lerp(accent, 0.1 + ((n * 0.618) % 1) * 0.6);
    const live = cuts.filter(c => region(c, cuts));
    group.add(new THREE.Mesh(roof(live, shade), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide })));
    group.add(new THREE.Mesh(walls(), new THREE.MeshStandardMaterial({ color: lilac.clone().lerp(ground, 0.6), roughness: 0.9, side: THREE.DoubleSide })));
    // the ridges of the roof
    const edges = new THREE.EdgesGeometry(roof(live, shade, 0.05), 1);
    group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55 })));
    if (state.model) {
      const B = cutsAt(steps, k);
      const mg = roof(B, () => gold, 0.08);
      group.add(new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.28, roughness: 0.5, side: THREE.DoubleSide, depthWrite: false, flatShading: true })));
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(mg, 1), new THREE.LineBasicMaterial({ color: gold, transparent: true, opacity: 0.85 })));
    }
  }
  // the trial points (gold: serious, light: null) and the path between them
  const gm = new THREE.MeshStandardMaterial({ color: gold, roughness: 0.35, metalness: 0.2 });
  const nm = new THREE.MeshStandardMaterial({ color: ground, roughness: 0.5 });
  const pts = [];
  for (let s = 0; s <= k; s++) {
    const p = at(steps[s].lam); p[2] += 0.6; pts.push(new THREE.Vector3(...p));
    group.add(ball(s === k ? 2.2 : 1.5, steps[s].serious ? gm : nm, p));
  }
  if (pts.length > 1) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: gold })));
  const o = at(dualOpt.lam); o[2] += 2;
  const om = new THREE.Mesh(new THREE.OctahedronGeometry(2.8), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }));
  om.position.set(...o); group.add(om);
  dirty = true;
}

const f2 = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));
function stats() {
  const k = Math.min(state.k, steps.length - 1), s = steps[k];
  const best = Math.max(...steps.slice(0, k + 1).map(q => q.value));
  $('kout').textContent = `${k}/${steps.length - 1}`;
  $('stats').innerHTML = [
    [t('trial point', 'punto di prova'), `(${f2(s.lam[0])}, ${f2(s.lam[1])})`],
    ['L', f2(s.value) + (k ? (s.serious ? t(' serious', ' serio') : t(' null', ' nullo')) : '')],
    [t('best', 'migliore'), f2(best)],
    [t('cuts', 'tagli'), s.nb],
    ['max L', f2(dualOpt.value)],
    [t('integer optimum', 'ottimo intero'), f2(primalOpt.value)],
  ].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
}

function recompute() {
  steps = bundle({ algo: state.algo, t: state.t, gamma: state.gamma });
  state.k = Math.min(state.k, steps.length - 1);
  $('tbox').hidden = state.algo !== 'proximal';
  draw(); stats(); writeHash();
}

let timer = null;
function stop() { if (timer) { clearInterval(timer); timer = null; } $('play').innerHTML = $('play').dataset.play; }
function play() {
  if (timer) return stop();
  if (state.k >= steps.length - 1) state.k = 0;
  $('play').innerHTML = $('play').dataset.pause;
  timer = setInterval(() => {
    if (state.k >= steps.length - 1) return stop();
    state.k++; draw(); stats(); writeHash();
  }, 700);
}

// the options of the selects in both languages
const OPTS = {
  algo: { proximal: ['proximal bundle', 'bundle prossimale'], level: ['level bundle', 'bundle di livello'], kelley: ['Kelley (cutting planes)', 'Kelley (piani di taglio)'] },
};
const optNames = () => { for (const [id, m] of Object.entries(OPTS)) for (const o of $(id).options) if (m[o.value]) o.textContent = t(...m[o.value]); };

function init() {
  readHash();
  optNames(); onLang(optNames);
  setup();
  $('algo').value = state.algo; $('t').value = state.t; $('tout').textContent = state.t;
  $('model').checked = state.model; $('preview').checked = state.preview;
  $('play').dataset.play = $('play').innerHTML;
  $('play').dataset.pause = `<span data-l="en">Pause</span><span data-l="it" lang="it">Pausa</span>`;
  $('algo').addEventListener('change', e => { stop(); state.algo = e.target.value; state.k = 0; recompute(); });
  $('t').addEventListener('input', e => { stop(); state.t = +e.target.value; $('tout').textContent = state.t; recompute(); });
  $('model').addEventListener('change', e => { state.model = e.target.checked; draw(); writeHash(); });
  $('preview').addEventListener('change', e => { state.preview = e.target.checked; draw(); writeHash(); });
  $('reset').addEventListener('click', () => { stop(); state.k = 0; draw(); stats(); writeHash(); });
  $('step').addEventListener('click', () => { stop(); state.k = Math.min(steps.length - 1, state.k + 1); draw(); stats(); writeHash(); });
  $('play').addEventListener('click', play);
  recompute();
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'side of the square', it: 'lato del quadrato' } },
    fields: [
      { key: 'relief', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 30, min: 5, max: 80, step: 1 },
      { key: 'surface', type: 'select', label: { en: 'surface', it: 'superficie' }, value: 'dual',
        options: [{ value: 'dual', en: 'dual function L', it: 'funzione duale L' }, { value: 'model', en: 'bundle model at this step', it: 'modello del bundle a questo passo' }] },
      { key: 'path', type: 'check', label: { en: 'engrave the path', it: 'incidi il cammino' }, value: true },
      { key: 'base', label: { en: 'base, mm', it: 'base, mm' }, value: 3, min: 1, max: 10, step: 0.5 },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid',
      args: o => [{ algo: state.algo, t: state.t, gamma: state.gamma, k: state.k, ...o }] },
    name: o => fileName({ algo: state.algo, ...o }),
    head: 'binary STL, millimetres, a Lagrangian dual function',
    object: 'Lagrangian dual',
    share: () => shareUrl(SPEC, flat()),
  });
  onLang(stats);
  onTheme(draw);
}

init();
