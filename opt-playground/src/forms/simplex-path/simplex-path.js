// The simplex on a polytope: the polytope of the chosen LP in three.js, its
// edges, the path of the simplex from the origin to the optimum (gold), the
// objective as an arrow from the optimum with the optimal level plane, a
// replay of the pivots, the printed solid as a preview, the download panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { presets, layout, solid, fileName, varName } from './model.js';

const $ = id => document.getElementById(id);
// #...&frame=1 makes the view as tall as the window (for the thumbnails)
const FRAME = /(^|[#&])frame=1/.test(location.hash);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const S = 80;   // the view shows the polytope at 80 mm
const state = { preset: 'klee', rule: 'dantzig', c: [...presets.klee.c], style: 'solid', preview: false, k: Infinity };

// the state in the address (src/print/state.js): a link restores the scene
const SPEC = {
  preset: { def: 'klee', values: Object.keys(presets) }, rule: { def: 'dantzig', values: ['dantzig', 'bland', 'steepest'] },
  c1: { def: 4, min: -5, max: 8 }, c2: { def: 3, min: -5, max: 8 }, c3: { def: 2, min: -5, max: 8 },
  style: { def: 'solid', values: ['solid', 'struts'] }, preview: { def: false },
};
function readHash() {
  const q = readState(SPEC);
  Object.assign(state, { preset: q.preset, rule: q.rule, c: [q.c1, q.c2, q.c3], style: q.style, preview: q.preview });
}
const flat = () => ({ preset: state.preset, rule: state.rule, c1: state.c[0], c2: state.c[1], c3: state.c[2], style: state.style, preview: state.preview });
const writeHash = () => writeState(SPEC, flat());

let renderer, scene, camera, controls, group, dirty = true, L, walk = null, shownK = -1;
const still = matchMedia('(prefers-reduced-motion: reduce)');
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  camera.position.set(S * 2.75, -S * 1.75, S * 1.95);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(S * 0.56, S / 2, S * (FRAME ? 0.47 : 0.5));
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50406a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(1, -1.4, 2.2); scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.5); back.position.set(-1, 1, 0.5); scene.add(back);
  const resize = () => {
    const w = stage.clientWidth, h = FRAME ? Math.round(innerHeight * 1.1) : Math.round(Math.min(w * 0.72, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h; if (FRAME) camera.zoom = 1.1; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => {
    if (controls.update()) dirty = true;
    // the pivot just made: the point runs along its edge in 0.6 s, the gold rod behind it
    if (walk) {
      const u = Math.min(1, (performance.now() - walk.t0) / 600), e = u * u * (3 - 2 * u);
      const p = walk.a.clone().lerp(walk.b, e);
      walk.ball.position.copy(p);
      walk.rod.scale.set(1, Math.max(1e-3, e), 1);
      walk.rod.position.copy(walk.a).lerp(walk.b, e / 2);
      if (u >= 1) walk = null;
      dirty = true;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.05, ...o });
const V3 = a => new THREE.Vector3(...a);
function cylinderBetween(a, b, r, material) {
  const A = V3(a), B = V3(b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), 18, 1);
  const m = new THREE.Mesh(g, material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function clear() {
  if (!group) return;
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.remove(group);
}

function draw() {
  clear();
  group = new THREE.Group(); scene.add(group);
  const { poly, idx, mm } = L, P = poly.V.map(mm);
  const accent = css('--accent'), gold = css('--gold'), lilac = css('--lilac'), ink = css('--ink-soft');
  const k = Math.min(state.k, idx.length - 1);
  if (state.preview) {
    const m = solid({ preset: state.preset, rule: state.rule, c: state.c, style: state.style, size: S, tube: 1.6, cells: 90 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeVertexNormals();
    // the solid is on the bed, centred: back to the frame of the polytope
    const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    const lo = [0, 0, 0].map((_, d) => Math.min(...P.map(p => p[d])));
    const hiP = [0, 0, 0].map((_, d) => Math.max(...P.map(p => p[d])));
    g.translate((lo[0] + hiP[0]) / 2 - (box.min.x + box.max.x) / 2, (lo[1] + hiP[1]) / 2 - (box.min.y + box.max.y) / 2, -box.min.z);
    // the path and its balls in gold, the rest in the accent
    const pos = g.attributes.position.array, col = new Float32Array(pos.length);
    const A = new THREE.Color(accent), Gd = new THREE.Color(gold), segs = [];
    for (let s = 1; s < idx.length; s++) segs.push([P[idx[s - 1]], P[idx[s]]]);
    const ends = [P[idx[0]], P[idx.at(-1)]];
    for (let v = 0; v < pos.length; v += 3) {
      const q = [pos[v], pos[v + 1], pos[v + 2]];
      let d = Infinity;
      for (const [a, b] of segs) {
        const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
        const tt = Math.max(0, Math.min(1, (w[0] * e[0] + w[1] * e[1] + w[2] * e[2]) / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2)));
        d = Math.min(d, Math.hypot(w[0] - tt * e[0], w[1] - tt * e[1], w[2] - tt * e[2]) - 1.6);
      }
      for (const a of ends) d = Math.min(d, Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]) - 3.1);
      const c = d < 0.35 ? Gd : A;
      col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(g, mat(0xffffff, { roughness: 0.5, vertexColors: true })));
  } else {
    // the faces, translucent, and the edges
    const hull = new ConvexGeometry(P.map(V3));
    group.add(new THREE.Mesh(hull, mat(lilac, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, flatShading: true })));
    const em = mat(ink, { roughness: 0.8 });
    for (const [i, j] of poly.edges) group.add(cylinderBetween(P[i], P[j], 0.45, em));
    const vg = new THREE.SphereGeometry(1.1, 16, 12);
    for (const p of P) { const s = new THREE.Mesh(vg, em); s.position.set(...p); group.add(s); }
    // the path up to step k
    const gm = mat(gold, { roughness: 0.35, metalness: 0.2 });
    let last = null;
    for (let s = 1; s <= k; s++) { last = cylinderBetween(P[idx[s - 1]], P[idx[s]], 1.6, gm); group.add(last); }
    const pg = new THREE.SphereGeometry(2.0, 20, 14);
    for (let s = 0; s <= k; s++) { const b = new THREE.Mesh(pg, gm); b.position.set(...P[idx[s]]); group.add(b); }
    const cur = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), gm); cur.position.set(...P[idx[k]]); group.add(cur);
    // a ring around the current vertex, so that the eye finds the point that moved
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.5, 10, 40), mat(gold, { roughness: 0.35 }));
    ring.position.set(...P[idx[k]]); ring.lookAt(camera.position); group.add(ring);
    if (k === shownK + 1 && k > 0 && last && !still.matches) {
      walk = { t0: performance.now(), a: V3(P[idx[k - 1]]), b: V3(P[idx[k]]), ball: cur, rod: last };
      cur.position.copy(walk.a); last.scale.set(1, 1e-3, 1);
    }
  }
  shownK = k;
  // the optimum, the arrow of c and the optimal level plane
  const opt = P[idx.at(-1)], dir = V3(L.dir);
  const om = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), mat(accent)); om.position.set(...opt); group.add(om);
  const arrow = new THREE.ArrowHelper(dir, V3(opt), 24, new THREE.Color(accent), 7, 3.6);
  arrow.line.material.linewidth = 2; group.add(arrow);
  if (!state.preview) {
    const plane = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    plane.position.set(...opt); plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); group.add(plane);
  }
  dirty = true;
}

function table() {
  const { run, idx } = L, steps = run.steps, rows = [];
  const fmt = v => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));
  const k = Math.min(state.k, idx.length - 1);
  let vi = 0;
  steps.forEach((s, i) => {
    const moved = i === 0 || !s.degenerate;
    if (i > 0 && moved) vi++;
    const piv = i === 0 ? t('start: the slack basis', 'inizio: la base delle variabili di scarto')
      : `${varName(s.enter)} ${t('enters', 'entra')}, ${varName(s.leave)} ${t('leaves', 'esce')}${s.degenerate ? t(' (degenerate)', ' (degenere)') : ''}`;
    rows.push(`<tr class="${vi === k ? 'on' : ''}${vi > k ? ' later' : ''}"><td>${i}</td><td>(${s.x.map(fmt).join(', ')})</td><td>${fmt(s.z)}</td><td>${piv}</td></tr>`);
  });
  $('steps').innerHTML = `<thead><tr><th>${t('pivot', 'pivot')}</th><th>x</th><th>z</th><th>${t('basis change', 'cambio di base')}</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  const nv = idx.length, z = steps.at(-1).z;
  const status = run.status === 'optimal' ? t('optimal', 'ottimo') : run.status === 'unbounded' ? t('unbounded', 'illimitato') : t('stopped', 'fermato');
  $('summary').textContent = t(
    `${nv} of ${L.poly.V.length} vertices visited, ${steps.length - 1} pivots, ${status} at z = ${fmt(z)}.`,
    `${nv} vertici visitati su ${L.poly.V.length}, ${steps.length - 1} pivot, ${status} con z = ${fmt(z)}.`);
  $('kout').textContent = `${k}/${nv - 1}`;
  // the move to vertex k in words: the pivots that brought the point there
  // (vis[i] is the vertex reached by pivot i; degenerate pivots do not move)
  const vis = [];
  steps.forEach((st, i) => vis.push(i === 0 ? 0 : vis[i - 1] + (st.degenerate ? 0 : 1)));
  const here = steps.filter((_, i) => i > 0 && vis[i] === k), from = steps[vis.lastIndexOf(k - 1)];
  let ev;
  if (k === 0) ev = t('Start at the origin, where every slack is in the basis and z = 0. Press Step: each step is one pivot to an adjacent vertex.',
    "Si parte dall'origine, dove tutte le variabili di scarto sono in base e z = 0. Premi Passo: ogni passo è un pivot verso un vertice adiacente.");
  else {
    const mv = here[0], n = steps.indexOf(mv), at = `(${mv.x.map(fmt).join(', ')})`;
    ev = t(`Pivot ${n}: ${varName(mv.enter)} enters the basis and ${varName(mv.leave)} leaves, so the point runs along the gold edge to ${at} and z rises from ${fmt(from.z)} to ${fmt(mv.z)}`,
      `Pivot ${n}: ${varName(mv.enter)} entra in base ed esce ${varName(mv.leave)}, quindi il punto corre lungo lo spigolo dorato fino a ${at} e z sale da ${fmt(from.z)} a ${fmt(mv.z)}`);
    if (here.length > 1) ev += t(`; then ${here.length - 1} degenerate pivot${here.length > 2 ? 's' : ''} change the basis without moving`, `; poi ${here.length - 1} pivot degeneri cambiano la base senza spostare il punto`);
    ev += k === nv - 1 ? t(`; no edge rises any more: ${status}.`, `; nessuno spigolo sale più: ${status}.`) : '.';
  }
  $('event').textContent = ev;
}

function recompute() {
  L = layout({ preset: state.preset, rule: state.rule, c: state.c, size: S });
  state.k = Math.min(state.k, L.idx.length - 1);
  draw(); table(); writeHash();
}

let timer = null;
function stop() { if (timer) { clearInterval(timer); timer = null; } $('play').innerHTML = $('play').dataset.play; }
function play() {
  if (timer) return stop();
  if (state.k >= L.idx.length - 1) state.k = 0;
  $('play').innerHTML = $('play').dataset.pause;
  timer = setInterval(() => {
    if (state.k >= L.idx.length - 1) return stop();
    state.k++; draw(); table();
  }, 1000);   // one pivot a second
}

function syncControls() {
  $('preset').value = state.preset; $('rule').value = state.rule; $('style').value = state.style; $('preview').checked = state.preview;
  state.c.forEach((v, j) => { $('c' + j).value = v; $('c' + j + 'out').textContent = v; });
}

function names() {
  for (const o of $('preset').options) o.textContent = t(presets[o.value].en, presets[o.value].it);
}

// the options of the selects in both languages
const OPTS = {
  rule: { dantzig: ['Dantzig', 'Dantzig'], bland: ['Bland', 'Bland'], steepest: ['steepest edge', 'steepest edge'] },
  style: { solid: ['solid, grooved edges', 'solido, spigoli incisi'], struts: ['struts', 'aste'] },
};
const optNames = () => { for (const [id, m] of Object.entries(OPTS)) for (const o of $(id).options) if (m[o.value]) o.textContent = t(...m[o.value]); };

function init() {
  readHash();
  optNames(); onLang(optNames);
  setup();
  for (const k of Object.keys(presets)) $('preset').appendChild(new Option(k, k));
  names(); syncControls();
  $('play').dataset.play = $('play').innerHTML;
  $('play').dataset.pause = `<span data-l="en">Pause</span><span data-l="it" lang="it">Pausa</span>`;
  $('preset').addEventListener('change', e => { stop(); state.preset = e.target.value; state.c = [...presets[state.preset].c]; state.k = Infinity; syncControls(); recompute(); });
  $('rule').addEventListener('change', e => { stop(); state.rule = e.target.value; state.k = Infinity; recompute(); });
  $('style').addEventListener('change', e => { state.style = e.target.value; recompute(); });
  $('preview').addEventListener('change', e => { state.preview = e.target.checked; recompute(); });
  for (let j = 0; j < 3; j++) $('c' + j).addEventListener('input', e => {
    stop(); state.c[j] = +e.target.value; $('c' + j + 'out').textContent = state.c[j]; state.k = Infinity; recompute();
  });
  $('reset').addEventListener('click', () => { stop(); state.k = 0; draw(); table(); });
  $('step').addEventListener('click', () => { stop(); state.k = Math.min(L.idx.length - 1, state.k + 1); draw(); table(); });
  $('play').addEventListener('click', play);
  recompute();
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'side of the polytope', it: 'lato del politopo' } },
    fields: [
      { key: 'tube', label: { en: 'path radius, mm', it: 'raggio del cammino, mm' }, value: 1.6, min: 0.8, max: 4, step: 0.1 },
      { key: 'arrow', type: 'check', label: { en: 'arrow of c', it: 'freccia di c' }, value: false },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: false,
        thick: { key: 'baseThick', label: { en: 'base, mm', it: 'base, mm' }, value: 2, min: 1, max: 6, step: 0.2 } },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid',
      args: o => [{ preset: state.preset, rule: state.rule, c: state.c, style: state.style, ...o }] },
    name: o => fileName({ preset: state.preset, rule: state.rule, style: state.style, ...o }),
    head: 'binary STL, millimetres, a polytope with the path of the simplex',
    object: 'simplex path',
    share: () => shareUrl(SPEC, flat()),
  });
  onLang(() => { names(); table(); });
  onTheme(() => draw());
}

init();
