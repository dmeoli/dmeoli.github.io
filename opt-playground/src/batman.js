// The Batman equation: the seven functions drawn piece by piece in the plane,
// with their formulas, and the region extruded in three.js on the oval of the
// emblem; downloads of the curve (SVG) and of the solid (STL, 3MF, zip).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pieces, abscissae, boundary, piecePolylines, planar, solid, fileName, OVAL } from './batman-model.js';
import { printPanel, save } from './print/index.js';
import { t, onLang, onTheme } from './i18n.js';
import { setTex } from './tex.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const still = matchMedia('(prefers-reduced-motion: reduce)');
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

// the order of the drawing: the head, then outwards along the top, then the bottom
const ORDER = ['p', 'h', 'g', 'q', 'r', 's', 'f'];
const LABEL = { p: 0, h: 0.62, g: 0.88, q: 2, r: 5, s: 5.5, f: 3 };
const DOMAIN = { p: '|x| < 0.5', h: '0.5 < |x| < 0.75', g: '0.75 < |x| < 1', q: '1 < |x| \\le 3', r: '3 < |x| \\le 7', s: '4 < |x| \\le 7', f: '|x| \\le 4' };
const state = { den: 112, off: new Set(), mode: 'solid', thick: 0.6, bevel: 0.06 };
let PS = pieces(112), XS = abscissae(24), MODEL = planar({ den: 112 });
const colour = id => css('--c-' + id);

/* ------------------------------------------------------------- 2D ------- */

// the frame: x in [-8.5, 8.5], y in [-4.6, 4.6], 40 pixels a unit
const K = 40, X = x => 340 + K * x, Y = y => 185 - K * y;
const pathOf = lines => lines.map(l => 'M' + l.map(([x, y]) => `${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join('L')).join('');

// the parts of the region where both its functions are on: at every strip
// between two samples one lower and one upper function hold, and the region
// there is empty if either is turned off
function regionPaths(off) {
  const runs = [];
  let cur = null;
  for (let k = 0; k < XS.length - 1; k++) {
    const m = (XS[k] + XS[k + 1]) / 2;
    const on = !off.has(boundary(PS, 'upper', m).id) && !off.has(boundary(PS, 'lower', m).id);
    if (on && !cur) cur = [k, k];
    if (on) cur[1] = k;
    if (!on && cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map(([k0, k1]) => {
    const top = [], bot = [];
    for (let k = k0; k <= k1 + 1; k++) {
      const x = XS[k], d = k === k0 ? 1 : -1;
      top.push([x, boundary(PS, 'upper', x, d).y]);
      // the lower limits from both sides, where the outline steps
      const a = boundary(PS, 'lower', x, -1).y, b = boundary(PS, 'lower', x, 1).y;
      if (k === k0) bot.push([x, b]);
      else if (k === k1 + 1) bot.push([x, a]);
      else { bot.push([x, a]); if (Math.abs(a - b) > 1e-12) bot.push([x, b]); }
    }
    return 'M' + [...top, ...bot.reverse()].map(([x, y]) => `${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join('L') + 'Z';
  }).join('');
}

// draws the plane into svg; with pal (colours by name) the attributes are
// written out, for the file, else the classes take the colours of the page
function drawPlot(svg, pal) {
  svg.replaceChildren();
  const P = pal || {};
  const st = (cls, extra) => (pal ? extra : { class: cls });
  for (let x = -8; x <= 8; x++) el('line', { ...st('grid', { stroke: P.rule, 'stroke-width': 1 }), x1: X(x), x2: X(x), y1: Y(4.5), y2: Y(-4.5) }, svg);
  for (let y = -4; y <= 4; y++) el('line', { ...st('grid', { stroke: P.rule, 'stroke-width': 1 }), x1: X(-8.5), x2: X(8.5), y1: Y(y), y2: Y(y) }, svg);
  el('line', { ...st('axis', { stroke: P.soft, 'stroke-width': 1 }), x1: X(-8.5), x2: X(8.5), y1: Y(0), y2: Y(0) }, svg);
  el('line', { ...st('axis', { stroke: P.soft, 'stroke-width': 1 }), x1: X(0), x2: X(0), y1: Y(4.5), y2: Y(-4.5) }, svg);
  for (const x of [-7, -4, -1, 1, 4, 7]) el('text', { ...st('tick', { fill: P.soft, 'font-family': 'monospace', 'font-size': 11 }), x: X(x) + 3, y: Y(0) + 13 }, svg).textContent = x;
  for (const y of [-3, 3]) el('text', { ...st('tick', { fill: P.soft, 'font-family': 'monospace', 'font-size': 11 }), x: X(-8.4), y: Y(y) + 4 }, svg).textContent = y;
  el('ellipse', { ...st('oval', { fill: 'none', stroke: P.gold, 'stroke-width': 1.2, 'stroke-dasharray': '4 4' }), cx: X(0), cy: Y(0), rx: K * OVAL.A, ry: K * OVAL.B }, svg);
  const region = el('path', { ...st('region', { fill: P.fill }), d: regionPaths(state.off) }, svg);
  const out = { region, pieces: {} };
  for (const id of ORDER) {
    if (pal && state.off.has(id)) continue;
    const Pc = PS.find(p => p.id === id), lines = piecePolylines(Pc, XS);
    const g = el('g', { 'data-id': id }, svg);
    const path = el('path', pal ? { fill: 'none', stroke: P[id], 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: pathOf(lines) }
      : { class: 'piece', stroke: `var(--c-${id})`, d: pathOf(lines) }, g);
    // the letter beside the right half, away from the region
    const lx = LABEL[id], ly = Pc.y(lx), up = Pc.side === 'upper' ? 1 : -1;
    const dx = id === 'h' ? -0.32 : id === 'g' ? 0.3 : 0, dy = id === 'p' ? 0.3 : 0.38;
    el('text', pal ? { fill: P[id], 'font-family': 'Georgia, serif', 'font-style': 'italic', 'font-weight': 600, 'font-size': 17, x: X(lx + dx) - 5, y: Y(ly + up * dy) + 5 }
      : { class: 'lab', fill: `var(--c-${id})`, x: X(lx + dx) - 5, y: Y(ly + up * dy) + 5 }, g).textContent = id;
    if (!pal) el('path', { class: 'hit', d: pathOf(lines) }, g);
    g.style.display = state.off.has(id) ? 'none' : '';
    out.pieces[id] = { g, path };
  }
  return out;
}

let plot = null, drawing = 0;
function draw2d(animate) {
  cancelAnimationFrame(drawing); drawing = 0;
  plot = drawPlot($('plot'));
  for (const id of ORDER) plot.pieces[id].g.addEventListener('pointerenter', () => hover(id));
  for (const id of ORDER) plot.pieces[id].g.addEventListener('pointerleave', () => hover(null));
  for (const id of ORDER) plot.pieces[id].g.addEventListener('click', () => hover(id, true));
  if (!animate || still.matches) return;
  // each function traced in turn, its letter shown as it ends, the region
  // filled at the end; driven by the frames, so that it can also be filmed
  const steps = [];
  let t0 = 0;
  for (const id of ORDER) {
    const p = plot.pieces[id].path, len = p.getTotalLength(), dur = 260 + 90 * len / K;
    p.style.strokeDasharray = `${len} ${len}`;
    steps.push([p, 'strokeDashoffset', t0, dur, len, 0], [plot.pieces[id].g.querySelector('text'), 'opacity', t0 + dur * 0.6, 200, 0, 1]);
    t0 += dur;
  }
  steps.push([plot.region, 'opacity', t0, 700, 0, 1]);
  let start = null;
  const frame = now => {
    if (start === null) start = now;
    const t = now - start;
    for (const [e, k, s0, d, a, b] of steps) {
      const u = Math.min(1, Math.max(0, (t - s0) / d)), e2 = u * u * (3 - 2 * u);
      e.style[k] = a + (b - a) * e2;
    }
    drawing = t < t0 + 700 ? requestAnimationFrame(frame) : 0;
  };
  frame(performance.now());
}
function finishDrawing() { if (drawing) { cancelAnimationFrame(drawing); drawing = 0; draw2d(false); } }

// the formula of the function pointed at, under the plot, and its row of the legend
let pinned = null;
function hover(id, pin) {
  if (pin) pinned = pinned === id ? null : id;
  const show = id || pinned, tip = $('tip');
  for (const k of ORDER) {
    plot.pieces[k].g.classList.toggle('on', k === show);
    const li = $('legend').querySelector(`[data-id="${k}"]`);
    if (li) li.classList.toggle('on', k === show);
  }
  if (!show) {
    tip.classList.remove('show'); tip.style.removeProperty('--tipc');
    tip.textContent = t('Point at a curve, or touch it, for its formula.', 'Puntare una curva, o toccarla, per la sua formula.');
    return;
  }
  const P = PS.find(p => p.id === show);
  tip.style.setProperty('--tipc', colour(show));
  tip.replaceChildren();
  const w = document.createElement('span'); w.className = 'what'; w.textContent = t(P.en, P.it); tip.appendChild(w);
  const f = document.createElement('span'); tip.appendChild(f);
  setTex(f, `\\(${P.tex},\\quad ${DOMAIN[show]}\\)`);
  tip.classList.add('show');
}

function legend() {
  const ul = $('legend');
  ul.replaceChildren();
  for (const id of ORDER) {
    const P = PS.find(p => p.id === id), li = document.createElement('li');
    li.dataset.id = id;
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = !state.off.has(id);
    box.setAttribute('aria-label', `${id}: ${t(P.en, P.it)}`);
    box.addEventListener('change', () => { box.checked ? state.off.delete(id) : state.off.add(id); toggled(); });
    const sw = document.createElement('i'); sw.style.background = `var(--c-${id})`;
    const f = document.createElement('span'); f.className = 'f';
    const s = document.createElement('small'); s.textContent = t(P.en, P.it) + ' · ';
    const d = document.createElement('span'); s.appendChild(d);
    const m = document.createElement('span');
    f.append(s, m);
    li.append(box, sw, f);
    li.addEventListener('pointerenter', () => hover(id));
    li.addEventListener('pointerleave', () => hover(null));
    ul.appendChild(li);
    setTex(d, `\\(${DOMAIN[id]}\\)`);
    setTex(m, `\\(${P.tex}\\)`);
  }
}

function toggled() {
  for (const id of ORDER) plot.pieces[id].g.style.display = state.off.has(id) ? 'none' : '';
  plot.region.setAttribute('d', regionPaths(state.off));
  showMode();
  show();
}

/* ------------------------------------------------------------- 3D ------- */

let renderer, scene, camera, controls, emblem, bat, ghost, oval, sweepLight, dirty = true;
const ribbons = {};
const INK = '#2e2040', GOLD = '#b59a45';
const matBat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.38, metalness: 0.35 });
const matGhost = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5, transparent: true, opacity: 0.18, depthWrite: false });
const matOval = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.45, metalness: 0.45 });
const OVAL_D = 0.3;

function outlineShape() {
  const s = new THREE.Shape();
  MODEL.bat.forEach((v, i) => { const [x, y] = MODEL.V[v]; i ? s.lineTo(x, y) : s.moveTo(x, y); });
  s.closePath();
  return s;
}

function buildBat() {
  if (bat) { emblem.remove(bat, ghost); bat.geometry.dispose(); }
  const b = state.bevel, geo = new THREE.ExtrudeGeometry(outlineShape(), {
    depth: Math.max(0.02, state.thick - 2 * b), curveSegments: 1, steps: 1,
    bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3,
  });
  geo.translate(0, 0, b);
  bat = new THREE.Mesh(geo, matBat); ghost = new THREE.Mesh(geo, matGhost);
  emblem.add(bat, ghost);
  buildRibbons();
  showMode();
}

function buildOval() {
  const s = new THREE.Shape();
  s.absellipse(0, 0, OVAL.A + 0.25, OVAL.B + 0.25, 0, 2 * Math.PI, false, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: OVAL_D - 0.1, curveSegments: 160, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.12, bevelOffset: -0.12, bevelSegments: 4 });
  geo.translate(0, 0, -OVAL_D + 0.05);
  oval = new THREE.Mesh(geo, matOval);
  emblem.add(oval);
}

// each function as a band standing on its piece of the outline
function buildRibbons() {
  for (const id in ribbons) { emblem.remove(ribbons[id]); ribbons[id].geometry.dispose(); ribbons[id].material.dispose(); delete ribbons[id]; }
  const h = state.thick + 0.25;
  for (const P of PS) {
    const pos = [], idx = [];
    for (const line of piecePolylines(P, XS)) {
      const o = pos.length / 3;
      line.forEach(([x, y]) => pos.push(x, y, 0, x, y, h));
      for (let i = 0; i < line.length - 1; i++) { const a = o + 2 * i; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colour(P.id), roughness: 0.5, side: THREE.DoubleSide, emissive: colour(P.id), emissiveIntensity: 0.25 }));
    m.visible = !state.off.has(P.id);
    ribbons[P.id] = m; emblem.add(m);
  }
}

function showMode() {
  const rib = state.mode === 'ribbons';
  bat.visible = !rib; ghost.visible = rib;
  for (const id in ribbons) ribbons[id].visible = rib && !state.off.has(id);
  dirty = true;
}

function recolour() {
  for (const id in ribbons) { ribbons[id].material.color.set(colour(id)); ribbons[id].material.emissive.set(colour(id)); }
  dirty = true;
}

const HOME = [0, -6.5, 17];
// the oval fills the frame also on a narrow screen
const fit = () => { camera.position.setLength(Math.max(21, 21 * 1.33 / Math.max(0.6, camera.aspect))); dirty = true; };
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(...HOME);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.minDistance = 6; controls.maxDistance = 60;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a80, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-5, 6, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(6, -4, -6); scene.add(rim);
  sweepLight = new THREE.PointLight(0xfff2d0, 0, 30, 1.2); sweepLight.position.set(0, 0, 4); scene.add(sweepLight);
  emblem = new THREE.Group(); scene.add(emblem);
  buildOval(); buildBat();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.75, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    fit();
  };
  new ResizeObserver(resize).observe(stage); resize();
  controls.addEventListener('change', () => { dirty = true; });
  $('sweep').checked = !still.matches;
  const loop = now => {
    if ($('sweep').checked) {
      const u = (now / 4200) % 2, s = u < 1 ? u : 2 - u, e = s * s * (3 - 2 * s);
      sweepLight.position.set(-11 + 22 * e, 2.5 - 5 * e, 3.5);
      sweepLight.intensity = 35; dirty = true;
    } else if (sweepLight.intensity) { sweepLight.intensity = 0; dirty = true; }
    if (controls.update()) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------ the state ------- */

function stats() {
  let a = 0;
  const poly = MODEL.bat.map(v => MODEL.V[v]);
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; }
  $('area').textContent = (a / 2).toFixed(3);
}

function show() {
  $('mode').value = state.mode;
  $('thick').value = state.thick; $('thickout').textContent = state.thick.toFixed(2);
  $('bevel').value = state.bevel; $('bevelout').textContent = state.bevel.toFixed(2);
  const h = { mode: state.mode, thick: state.thick, bevel: state.bevel };
  if (state.off.size) h.off = [...state.off].join('');
  history.replaceState(null, '', '#' + new URLSearchParams(h));
}

function fillSelects() {
  $('mode').options[0].textContent = t('solid', 'solido');
  $('mode').options[1].textContent = t('ribbons', 'nastri');
}

/* ------------------------------------------------------ downloads ------- */

// the curve in the light colours of the page, whatever the theme on screen
function svgFile() {
  const pal = { rule: '#d4c9e6', soft: '#5f4b76', gold: '#6c5920', fill: '#7338a81f',
    p: '#6c5920', h: '#2f7d8c', g: '#b0457a', q: '#c0602a', r: '#3d5fb0', s: '#4c8a3c', f: '#7338a8' };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS); svg.setAttribute('viewBox', '0 0 680 370'); svg.setAttribute('width', 680); svg.setAttribute('height', 370);
  drawPlot(svg, pal);
  const bg = el('rect', { x: 0, y: 0, width: 680, height: 370, fill: '#ffffff' });
  svg.prepend(bg);
  save(new XMLSerializer().serializeToString(svg), 'batman_curve.svg', 'image/svg+xml');
}

// the solid is quick to build: on the main thread
function printSetup() {
  printPanel($('dl'), {
    size: { value: 100, min: 20, max: 300, what: { en: 'width', it: 'larghezza' } },
    fields: [
      { key: 'thick', label: { en: 'bat, mm', it: 'pipistrello, mm' }, value: 4, min: 0.6, max: 20, step: 0.1 },
      { key: 'base', type: 'check', label: { en: 'oval plate', it: 'piastra ovale' }, value: true,
        thick: { key: 'plate', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2, min: 0.6, max: 10, step: 0.1 } },
    ],
    before: [$('ggb'), $('svg')],
    build: o => solid(opts(o)),
    name: o => fileName(opts(o)),
    head: 'binary STL, millimetres, the Batman equation',
    object: 'batman',
  });
}
const opts = o => ({ den: state.den, size: o.size, thick: o.thick, plate: o.base ? o.plate : 0 });

/* ------------------------------------------------------------ init ------ */

function init() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('mode') === 'ribbons') state.mode = 'ribbons';
  const num = (k, lo, hi, d) => { const x = parseFloat(h.get(k)); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  state.thick = num('thick', 0.1, 2, 0.6); state.bevel = num('bevel', 0, 0.2, 0.06);
  for (const c of h.get('off') || '') if (ORDER.includes(c)) state.off.add(c);
  PS = pieces(state.den); MODEL = planar({ den: state.den });
  fillSelects(); legend(); draw2d(true); hover(null); setup(); stats(); show();
  $('mode').addEventListener('change', e => { state.mode = e.target.value; showMode(); show(); });
  $('thick').addEventListener('input', e => { state.thick = +e.target.value; buildBat(); show(); });
  $('bevel').addEventListener('input', e => { state.bevel = +e.target.value; buildBat(); show(); });
  $('replay').addEventListener('click', () => draw2d(true));
  $('view').addEventListener('click', () => { controls.reset(); camera.position.set(...HOME); controls.target.set(0, 0, 0); fit(); });
  $('svg').addEventListener('click', svgFile);
  printSetup();
  onLang(() => { fillSelects(); legend(); hover(null); });
  onTheme(() => { recolour(); });
  still.addEventListener('change', () => { controls.enableDamping = !still.matches; if (still.matches) { $('sweep').checked = false; finishDrawing(); } });
}

init();
