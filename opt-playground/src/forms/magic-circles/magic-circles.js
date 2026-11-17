// The page of the magic circles: the lines drawn on a canvas, their rings
// turning at different speeds, the medallion in 3D, and the print panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { design, solid, fileName, gcd } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  seed: { def: 7, min: 0, max: 999999, int: true },
  n: { def: 6, min: 3, max: 12, int: true },
  k: { def: 2, min: 1, max: 5, int: true },
  curve: { def: 'hypo', values: ['hypo', 'epi', 'none'] },
  glyphs: { def: true },
  spin: { def: true },
};
const state = readState(SPEC);
let lines = [];

/* ------------------------------------------------------- the 2D drawing -- */

const cv = $('flat'), cx = cv.getContext('2d');
function draw(time = 0) {
  const w = cv.clientWidth, dpr = Math.min(2, devicePixelRatio);
  if (cv.width !== Math.round(w * dpr)) { cv.width = cv.height = Math.round(w * dpr); }
  const S = cv.width / 2 * 0.96, c = cv.width / 2;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, cv.width, cv.height);
  const ink = css('--accent') || '#7338a8', glow = css('--accent-2') || '#9363be';
  cx.lineJoin = cx.lineCap = 'round';
  cx.strokeStyle = ink; cx.shadowColor = glow; cx.shadowBlur = 8 * dpr;
  // the layers turn alternately one way and the other, the outer ones slower
  const speed = [0, 0.05, -0.08, 0.04, -0.12, 0.2];
  for (const l of lines) {
    const a = state.spin ? speed[l.layer] * time / 1000 : 0, ca = Math.cos(a), sa = Math.sin(a);
    cx.lineWidth = Math.max(1, l.w * S * 0.011);
    cx.beginPath();
    l.pts.forEach(([x, y], i) => {
      const X = c + S * (ca * x - sa * y), Y = c - S * (sa * x + ca * y);
      if (i) cx.lineTo(X, Y); else cx.moveTo(X, Y);
    });
    if (l.closed) cx.closePath();
    cx.stroke();
  }
}
let anim = 0;
function loop(now) {
  draw(now);
  anim = state.spin ? requestAnimationFrame(loop) : 0;
}
function redraw() { if (!anim) { if (state.spin) anim = requestAnimationFrame(loop); else draw(); } }

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, obj, dirty = true;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
  camera.up.set(0, 0, 1); camera.position.set(0, -70, 85);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x403050, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-60, -40, 90); scene.add(sun);
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const tick = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function rebuild3d() {
  const m = solid({ ...state, size: 80, res: 'screen' });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals();
  if (obj) { scene.remove(obj); obj.geometry.dispose(); }
  obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: css('--accent') || '#7338a8', roughness: 0.45, metalness: 0.1 }));
  scene.add(obj); dirty = true;
}

/* ----------------------------------------------------------- everything -- */

function facts() {
  const n = state.n, k = lines.k, d = gcd(n, k), m = lines.meta;
  const star = k === 1 ? t(`the regular ${n}-gon {${n}}`, `il ${n}-gono regolare {${n}}`)
    : d > 1 ? t(`{${n}/${k}}, which is ${d} copies of ${k === d ? `{${n / d}}` : `{${n / d}/${k / d}}`} turned by 360°/${n}`, `{${n}/${k}}, cioè ${d} copie di ${k === d ? `{${n / d}}` : `{${n / d}/${k / d}}`} ruotate di 360°/${n}`)
      : t(`{${n}/${k}}, one closed line through all ${n} corners`, `{${n}/${k}}, una sola linea chiusa per tutti gli ${n} vertici`);
  const curve = !m ? t('a second star polygon', 'un secondo poligono stellato')
    : t(`the ${state.curve === 'hypo' ? 'hypotrochoid' : 'epitrochoid'} with p = ${m.p}, q = ${m.q}, d = ${m.d}, which closes after ${m.q} turns of the rolling circle and repeats ${m.p} times around`,
      `l'${state.curve === 'hypo' ? 'ipotrocoide' : 'epitrocoide'} con p = ${m.p}, q = ${m.q}, d = ${m.d}, che si chiude dopo ${m.q} giri del cerchio che rotola e si ripete ${m.p} volte attorno`);
  $('facts').innerHTML = `<dt>${t('symmetry', 'simmetria')}</dt><dd>${t(`rotations by multiples of 360°/${n} (the cyclic group C${n}), apart from the glyphs`, `rotazioni di multipli di 360°/${n} (il gruppo ciclico C${n}), glifi a parte`)}</dd>`
    + `<dt>${t('star', 'stella')}</dt><dd>${star}</dd><dt>${t('inside', 'dentro')}</dt><dd>${curve}</dd>`;
}

function refresh({ view = true } = {}) {
  state.k = Math.min(state.k, Math.max(1, Math.floor((state.n - 1) / 2)));
  $('k').max = Math.max(1, Math.floor((state.n - 1) / 2));
  for (const id of ['seed', 'n', 'k']) $(id).value = state[id];
  $('nout').textContent = state.n; $('kout').textContent = state.k;
  const cn = { hypo: t('hypotrochoid', 'ipotrocoide'), epi: t('epitrochoid', 'epitrocoide'), none: t('second star', 'seconda stella') };
  for (const op of $('curve').options) op.textContent = cn[op.value];
  $('curve').value = state.curve; $('glyphs').checked = state.glyphs; $('spin').checked = state.spin;
  writeState(SPEC, state);
  lines = design(state);
  facts(); redraw();
  if (view) rebuild3d();
}

function init() {
  setup();
  $('seed').addEventListener('change', e => { state.seed = Math.max(0, Math.round(+e.target.value || 0)); refresh(); });
  $('random').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 100000); refresh(); });
  for (const id of ['n', 'k']) $(id).addEventListener('input', e => { state[id] = +e.target.value; refresh(); });
  $('curve').addEventListener('change', e => { state.curve = e.target.value; refresh(); });
  $('glyphs').addEventListener('change', e => { state.glyphs = e.target.checked; refresh(); });
  $('spin').addEventListener('change', e => { state.spin = e.target.checked; refresh({ view: false }); });
  printPanel($('print'), {
    size: { value: 80, min: 30, max: 200, what: { en: 'diameter', it: 'diametro' } },
    fields: [
      { key: 'line', label: { en: 'line width, mm', it: 'larghezza delle linee, mm' }, value: 1, min: 0.6, max: 3, step: 0.1 },
      { key: 'height', label: { en: 'relief, mm', it: 'rilievo, mm' }, value: 1.2, min: 0.4, max: 4, step: 0.1 },
      { key: 'base', label: { en: 'disc, mm', it: 'disco, mm' }, value: 2.4, min: 1.2, max: 8, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a magic circle medallion',
    object: 'magic circle',
    share: () => shareUrl(SPEC, state),
  });
  refresh();
  new ResizeObserver(() => { if (!anim) draw(); }).observe(cv);
  onLang(() => refresh({ view: false }));
  onTheme(() => { if (obj) obj.material.color.set(css('--accent')); dirty = true; if (!anim) draw(); });
}

init();
