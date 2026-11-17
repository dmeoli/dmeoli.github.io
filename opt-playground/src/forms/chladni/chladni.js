// Chladni figures: the mode chosen above, its sand on the plate in 2D, the
// plate with its ridges in 3D (built in a worker), the formula, a tone at a
// pitch proportional to the frequency of the mode, and the download panel.

import { t, onTheme } from '../../i18n.js';
import { setTex } from '../../tex.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import * as THREE from 'three';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, sand, mode, degenerate } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const MODEL = new URL('./model.js', import.meta.url).href;
// every parameter of the scene, kept in the address (src/print/state.js)
const SPEC = {
  shape: { def: 'square', values: ['square', 'circle'] },
  n: { def: 5, min: 0, max: 9, int: true },
  m: { def: 3, min: 1, max: 9, int: true },
  sign: { def: -1, min: -1, max: 1, int: true },
  spin: { def: false },
};
const state = readState(SPEC);
const LIM = { square: { n: [0, 9], m: [1, 9] }, circle: { n: [0, 8], m: [1, 6] } };

const view = createView($('stage'), { eye: [0.22, -1.05, 1.15] });
// the plate dark as metal and the sand light, as in the 2D view, by vertex
const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, vertexColors: true });
let shown = null, shownShape = null, plateZ = 2;
const closer = () => { view.camera.position.multiplyScalar(state.shape === 'circle' ? 0.88 : 0.74); view.controls.update(); view.render(); };
function paint() {
  if (!shown) return;
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  const plate = new THREE.Color(dark ? '#4e2c72' : '#5a3d82'), grain = new THREE.Color(dark ? '#e9dcb4' : '#f3ead2');
  const g = shown.geometry, P = g.getAttribute('position'), n = P.count, col = new Float32Array(3 * n);
  // the geometry is centred: the bottom of the plate is at its lowest z
  g.computeBoundingBox();
  const z0 = g.boundingBox.min.z, c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const h = P.getZ(i) - z0 - plateZ;
    c.copy(plate).lerp(grain, Math.min(1, Math.max(0, h / 0.35)));
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  view.render();
}
const build = workerBuilder(f => view.status(building(f)));
let panel;

const clamp = () => {
  const L = LIM[state.shape];
  state.n = Math.min(L.n[1], Math.max(L.n[0], state.n)); state.m = Math.min(L.m[1], Math.max(L.m[0], state.m));
  state.sign = state.sign < 0 ? -1 : 1;
};

/* ------------------------------------------------------------- 2D sand -- */

function drawSand() {
  const cv = $('plate'), W = cv.clientWidth || 360, dpr = Math.min(2, devicePixelRatio);
  cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
  const g = cv.getContext('2d'), S = cv.width, c = S / 2, R = S / 2 - 6 * dpr;
  g.clearRect(0, 0, S, S);
  const dark = css('--ground').toLowerCase() !== '#e8e2f3';
  g.fillStyle = dark ? '#14111c' : '#2e2040';
  g.beginPath();
  if (state.shape === 'circle') g.arc(c, c, R, 0, 2 * Math.PI); else g.rect(c - R, c - R, 2 * R, 2 * R);
  g.fill();
  if (degenerate(state)) {
    $('empty').hidden = false;
    return;
  }
  $('empty').hidden = true;
  const P = sand(state, state.shape === 'circle' ? 42000 : 34000);
  g.fillStyle = dark ? '#e9dcb4' : '#f3ead2';
  const r = 0.75 * dpr;
  for (let i = 0; i < P.length; i += 2) g.fillRect(c + R * P[i] - r, c - R * P[i + 1] - r, 2 * r, 2 * r);
}

/* --------------------------------------------------------------- sound -- */

// the eigenvalue of the mode sets the pitch, in proportion: the frequency of
// a plate grows as the square of its wave number; scaled to be heard
const pitch = () => {
  const e = mode(state).eigen;
  return Math.min(3200, Math.max(80, (state.shape === 'circle' ? 8 : 2.4) * e));
};
let audio = null;
function tone() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const f = pitch(), o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 1.7);
  } catch (e) { /* no audio */ }
}

/* ---------------------------------------------------------------- page -- */

function sync() {
  $('shape').value = state.shape; $('sign').value = String(state.sign);
  const L = LIM[state.shape];
  for (const k of ['n', 'm']) { $(k).min = L[k][0]; $(k).max = L[k][1]; $(k).value = state[k]; $(k + 'out').textContent = state[k]; }
  $('signbox').hidden = state.shape === 'circle';
  const sq = state.shape === 'square';
  $('nlab').innerHTML = sq ? 'n' : `n <span data-l="en">(diameters)</span><span data-l="it" lang="it">(diametri)</span>`;
  $('mlab').innerHTML = sq ? 'm' : `m <span data-l="en">(circles)</span><span data-l="it" lang="it">(cerchi)</span>`;
  const s = state.sign < 0 ? '-' : '+';
  setTex($('formula'), sq
    ? `\\(\\cos(${state.n}\\pi x)\\cos(${state.m}\\pi y) ${s} \\cos(${state.m}\\pi x)\\cos(${state.n}\\pi y) = 0\\)`
    : `\\(J_{${state.n}}(k_{${state.n},${state.m}}\\, r)\\cos(${state.n}\\theta) = 0,\\quad k_{${state.n},${state.m}} = ${mode(state).k.toFixed(4)}\\)`);
  $('hz').textContent = `${Math.round(pitch())} Hz`;
}

async function rebuild() {
  clamp(); writeState(SPEC, state); sync(); drawSand();
  const o = { shape: state.shape, n: state.n, m: state.m, sign: state.sign, ...(panel ? panel.read() : { size: 80, base: 2, ridge: 1.6, width: 2.4 }), res: 'preview' };
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [o]);
    if (!m) return;
    const fresh = shown === null || shownShape !== state.shape;
    plateZ = o.base; shown = view.show(m, { material: mat }); paint();
    // a thin plate: closer than the sphere that holds it
    if (fresh) { view.reset(); closer(); shownShape = state.shape; }
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  clamp();
  $('shape').addEventListener('change', e => { state.shape = e.target.value; rebuild(); });
  $('sign').addEventListener('change', e => { state.sign = +e.target.value; rebuild(); });
  for (const k of ['n', 'm']) {
    $(k).addEventListener('input', e => { state[k] = +e.target.value; $(k + 'out').textContent = state[k]; });
    $(k).addEventListener('change', rebuild);
  }
  $('tone').addEventListener('click', tone);
  $('spin').checked = state.spin; view.spin(state.spin);
  $('spin').addEventListener('change', e => { state.spin = e.target.checked; view.spin(state.spin); writeState(SPEC, state); });
  $('view').addEventListener('click', () => { view.reset(); closer(); });
  panel = printPanel($('print'), {
    size: { value: 80, min: 30, max: 250, what: { en: 'side of the square, or diameter', it: 'lato del quadrato, o diametro' } },
    fields: [
      { key: 'base', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2, min: 0.8, max: 6, step: 0.1 },
      { key: 'ridge', label: { en: 'sand height, mm', it: 'altezza della sabbia, mm' }, value: 1.6, min: 0.4, max: 6, step: 0.1 },
      { key: 'width', label: { en: 'sand width, mm', it: 'larghezza della sabbia, mm' }, value: 2.4, min: 1, max: 6, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: 'binary STL, millimetres, a Chladni figure',
    object: 'Chladni plate',
    share: () => shareUrl(SPEC, state),
  });
  for (const k of ['base', 'ridge', 'width']) $('p' + k).addEventListener('change', rebuild);
  onTheme(() => { drawSand(); paint(); });
  new ResizeObserver(() => drawSand()).observe($('plate'));
  rebuild();
}

init();
