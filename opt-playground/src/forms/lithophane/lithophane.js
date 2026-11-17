// Lithophanes of the exhibitions: a work of the exhibitions or a picture of
// the visitor (read here, never sent anywhere), its luminance turned into
// the thickness of a plate, shown in daylight or against a lamp, and the
// download panel of src/print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onTheme, onLang } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { solid, grid, linear, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ASSETS = new URL('../../../assets/lithophane/', import.meta.url).href;
const WORKS = [
  ['modigliani_cappello_s1', 'Man with a Hat', 'Uomo con cappello', 'Modigliani'],
  ['modigliani_treccia_s1', 'Young Woman with a Braid', 'Giovane donna con treccia', 'Modigliani'],
  ['van_gogh_vecchio_pipa_s1', 'Old Man with a Pipe', 'Vecchio con la pipa', 'Van Gogh'],
  ['van_gogh_cuffia_s1', 'Peasant Woman with a White Bonnet', 'Contadina con cuffia bianca', 'Van Gogh'],
  ['munch_notte_estate_s1', 'Summer Night on the Shore', "Notte d'estate sulla riva", 'Munch'],
  ['munch_bosco_inverno_s1', 'Winter Forest', "Bosco d'inverno", 'Munch'],
  ['kirchner_ferrovia_s1', 'Mountain Railway', 'Ferrovia in montagna', 'Kirchner'],
  ['kirchner_contadino_s3', 'Mountain Farmer', 'Contadino di montagna', 'Kirchner'],
  ['leonardo_vecchio_s2', 'Head of an Old Man in Profile', 'Testa di vecchio di profilo', 'Leonardo'],
  ['leonardo_cavallo_s2', 'Study of a Standing Horse', 'Studio di cavallo in piedi', 'Leonardo'],
];
const MU = 1.2;
const SPEC = {
  work: { def: WORKS[0][0], values: WORKS.map(w => w[0]) }, shape: { def: 'flat', values: ['flat', 'curved'] },
  angle: { def: 120, min: 60, max: 180, int: true }, curve: { def: 'light', values: ['light', 'linear'] }, lamp: { def: false },
};
const state = { ...readState(SPEC), own: null, ownName: '' };
const workIndex = () => Math.max(0, WORKS.findIndex(w => w[0] === state.work));
const toHash = () => writeState(SPEC, state);

/* --------------------------------------------------------- the picture -- */

let picture = null; // an ImageBitmap or an Image
const loadWork = i => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = ASSETS + WORKS[i][0] + '.webp'; });

// the linear luminance of the picture on a grid of cells of side px mm for
// a print whose largest side is `size` mm with a frame
function luminance(size, frame, px) {
  const w0 = picture.width, h0 = picture.height, inner = size - 2 * frame, n = Math.max(8, Math.round(inner / px));
  const gw = w0 >= h0 ? n : Math.max(8, Math.round(n * w0 / h0)), gh = w0 >= h0 ? Math.max(8, Math.round(n * h0 / w0)) : n;
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(picture, 0, 0, gw, gh);
  const d = g.getImageData(0, 0, gw, gh).data, lum = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) lum[i] = 0.2126 * linear(d[4 * i]) + 0.7152 * linear(d[4 * i + 1]) + 0.0722 * linear(d[4 * i + 2]);
  return { lum, gw, gh };
}

/* ----------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, meshObj = null, dirty = true;
const mats = {};
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-1.5, -0.6, 1.2); scene.add(sun);
  mats.day = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.75 });
  mats.lit = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.8, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

const SIZE = 100, FRAME = 3, FT = 4, THIN = 0.8, THICK = 3;
// the light through the plate, as a canvas: nx x ny cells, a warm lamp
function lightCanvas(g, mirror) {
  const c = document.createElement('canvas'); c.width = g.nx; c.height = g.ny;
  const x = c.getContext('2d'), im = x.createImageData(g.nx, g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const T = Math.exp(-MU * (g.H[j * g.nx + i] - THIN)), v = T ** (1 / 2.2);
    const o = 4 * ((g.ny - 1 - j) * g.nx + (mirror ? g.nx - 1 - i : i));
    im.data[o] = 255 * v; im.data[o + 1] = 232 * v; im.data[o + 2] = 196 * v; im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return c;
}

function rebuild() {
  if (!picture) return;
  const px = 0.6, L = luminance(SIZE, FRAME, px), curved = state.shape === 'curved';
  const o = { ...L, size: SIZE, frame: FRAME, frameThick: FT, thin: THIN, thick: THICK, mu: MU, curve: state.curve, shape: state.shape, angle: state.angle };
  const m = solid(o);
  const g = grid({ ...o, mirror: !curved });
  // the light through it, flat, as seen from the smooth side
  const lc = lightCanvas(g, !curved), out = $('lit');
  out.width = lc.width; out.height = lc.height;
  out.getContext('2d').drawImage(lc, 0, 0);
  // uv of the cells: the height field's vertices are the top layer, then the bottom one
  const nxy = g.nx * g.ny, uv = new Float32Array(4 * nxy);
  for (let k = 0; k < 2 * nxy; k++) { const q = k % nxy; uv[2 * k] = (q % g.nx) / (g.nx - 1); uv[2 * k + 1] = Math.floor(q / g.nx) / (g.ny - 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
  geo.computeVertexNormals(); geo.computeBoundingBox();
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
  const tex = new THREE.CanvasTexture(lightCanvas(g, false));
  tex.colorSpace = THREE.SRGBColorSpace;
  if (mats.lit.map) mats.lit.map.dispose();
  mats.lit.map = tex; mats.lit.needsUpdate = true;
  if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
  meshObj = new THREE.Mesh(geo, state.lamp ? mats.lit : mats.day);
  scene.add(meshObj);
  $('stage').classList.toggle('lit', state.lamp);
  const r = geo.boundingBox.max.distanceTo(geo.boundingBox.min) / 2;
  // daylight: the relief (top of the flat plate, inside of the curved one);
  // lamp: the smooth side (under the flat plate, outside of the curved one)
  const v = curved ? (state.lamp ? [0.35, -3.2, 0.5] : [-0.6, 2.6, 1.5]) : (state.lamp ? [0.2, -0.9, -3.2] : [0.6, -1.6, 2.8]);
  camera.up.set(curved ? 0 : 0, curved ? 0 : 1, curved ? 1 : 0);
  camera.position.set(v[0] * r, v[1] * r, v[2] * r); controls.target.set(0, 0, 0); controls.update();
  dirty = true;
}

function names() {
  $('shape').innerHTML = [['flat', 'flat', 'piana'], ['curved', 'curved', 'curva']].map(([v, en, it]) => `<option value="${v}"${v === state.shape ? ' selected' : ''}>${t(en, it)}</option>`).join('');
  $('curve').innerHTML = [['light', 'light', 'luce'], ['linear', 'linear', 'lineare']].map(([v, en, it]) => `<option value="${v}"${v === state.curve ? ' selected' : ''}>${t(en, it)}</option>`).join('');
  const w = WORKS[workIndex()];
  $('picked').innerHTML = state.own ? `<b>${state.ownName}</b>` : `<b>${t(w[1], w[2])}</b>, ${t('after', 'da')} ${w[3]}`;
  for (const b of $('works').children) b.title = t(WORKS[+b.dataset.i][1], WORKS[+b.dataset.i][2]);
}

async function pick(i) {
  state.work = WORKS[i][0]; state.own = null;
  for (const b of $('works').children) b.classList.toggle('on', +b.dataset.i === i);
  picture = await loadWork(i);
  names(); toHash(); rebuild();
}

function init() {
  $('works').innerHTML = WORKS.map(([f], i) => `<button type="button" data-i="${i}"><img src="${ASSETS + f}.webp" alt="" loading="lazy"></button>`).join('');
  $('works').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
  names(); onLang(names);
  $('angle').value = state.angle; $('angleout').textContent = state.angle + '°'; $('lamp').checked = state.lamp;
  $('anglab').style.display = state.shape === 'curved' ? '' : 'none';
  setup();
  printPanel($('print'), {
    size: { value: 100, min: 40, max: 250, what: { en: 'largest side', it: 'lato maggiore' } },
    fields: [
      { key: 'thin', label: { en: 'thinnest, mm', it: 'minimo, mm' }, value: 0.8, min: 0.4, max: 2, step: 0.1 },
      { key: 'thick', label: { en: 'thickest, mm', it: 'massimo, mm' }, value: 3, min: 1.5, max: 6, step: 0.1 },
      { key: 'frame', label: { en: 'frame, mm', it: 'cornice, mm' }, value: 4, min: 0, max: 15, step: 0.5 },
      { key: 'px', type: 'select', label: { en: 'pixel', it: 'pixel' }, value: '0.3',
        options: [{ value: '0.4', en: '0.4 mm', it: '0,4 mm' }, { value: '0.3', en: '0.3 mm', it: '0,3 mm' }, { value: '0.2', en: '0.2 mm (large file)', it: '0,2 mm (file grande)' }] },
    ],
    // the luminance is computed here, from the picture in this page
    worker: {
      module: new URL('./model.js', import.meta.url).href, fn: 'solid',
      args: o => {
        const frame = Math.max(0.01, o.frame), L = luminance(o.size, frame, +o.px);
        return [{ ...L, size: o.size, frame, frameThick: Math.max(o.thick + 1, FT), thin: o.thin, thick: Math.max(o.thin + 0.4, o.thick), mu: MU, curve: state.curve, shape: state.shape, angle: state.angle }];
      },
    },
    name: o => fileName({ ...o, shape: state.shape, name: state.own ? 'own' : WORKS[workIndex()][0].replace(/_s\d$/, '') }),
    head: 'binary STL, millimetres, a lithophane',
    object: 'lithophane',
    share: () => shareUrl(SPEC, state),
    // a picture of the visitor cannot travel in the link: it goes with the e-mail
    title: () => t('Lithophanes of the exhibitions', 'Litofanie delle mostre') + (state.own ? t(' (with my own picture, which I attach to this e-mail)', ' (con una mia immagine, che allego a questa mail)') : ''),
  });
  $('shape').addEventListener('change', e => { state.shape = e.target.value; $('anglab').style.display = state.shape === 'curved' ? '' : 'none'; toHash(); rebuild(); });
  $('angle').addEventListener('input', e => { state.angle = +e.target.value; $('angleout').textContent = state.angle + '°'; });
  $('angle').addEventListener('change', () => { toHash(); rebuild(); });
  $('curve').addEventListener('change', e => { state.curve = e.target.value; toHash(); rebuild(); });
  $('lamp').addEventListener('change', e => { state.lamp = e.target.checked; toHash(); rebuild(); });
  $('file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // read in this page only: nothing is sent anywhere
    picture = await createImageBitmap(f);
    state.own = true; state.ownName = f.name;
    for (const b of $('works').children) b.classList.remove('on');
    names(); rebuild();
  });
  onTheme(() => { dirty = true; });
  $('curve').value = state.curve;
  pick(workIndex());
}

init();
