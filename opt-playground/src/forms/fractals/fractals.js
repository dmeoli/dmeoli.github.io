// Fractals in the hand: the Menger sponge, the Sierpinski tetrahedron and
// the Mandelbulb as the solids that are printed, with their facts and the
// download panel of src/print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onTheme, onLang } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { solid, fileName, DIMENSION } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const FORMS = {
  menger: { en: 'Menger sponge', it: 'spugna di Menger', size: 60, levels: [1, 3], level: 3 },
  sierpinski: { en: 'Sierpinski tetrahedron', it: 'tetraedro di Sierpinski', size: 80, levels: [1, 5], level: 4 },
  mandelbulb: { en: 'Mandelbulb', it: 'Mandelbulb', size: 60 },
};
const SPEC = {
  form: { def: 'menger', values: Object.keys(FORMS) }, level: { def: 3, min: 1, max: 5, int: true },
  power: { def: 8, min: 2, max: 12, int: true }, stand: { def: 'edge', values: ['edge', 'face'] },
};
const state = readState(SPEC);
const toHash = () => writeState(SPEC, state);

let renderer, scene, camera, controls, meshObj = null, dirty = true, mat;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3450, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-1.3, -1.8, 2.6); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(2, 1.4, 0.4); scene.add(rim);
  mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
  paint();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.78, 540));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function paint() { mat.color.set(css('--accent') || '#7338a8'); dirty = true; }

const opts = () => ({ form: state.form, level: state.level, power: state.power, stand: state.stand, size: FORMS[state.form].size });

let pending = 0;
function rebuild() {
  facts();
  const my = ++pending;
  $('busy').textContent = t('building the solid…', 'costruzione del solido…');
  // after a frame, so that the message shows
  setTimeout(() => {
    if (my !== pending) return;
    const m = solid({ ...opts(), res: 'view', thick: 0.4, neck: 0.6 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    // flat faces for the sponge, smooth for the traced ones
    const geo = state.form === 'menger' ? g.toNonIndexed() : g;
    geo.computeVertexNormals(); geo.computeBoundingBox();
    const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
    if (state.form === 'mandelbulb') {
      // darker in the crevices: a colour by the distance from the centre
      const P = geo.attributes.position.array, n = P.length / 3, col = new Float32Array(3 * n), rs = new Float32Array(n);
      let lo = Infinity, hi = 0;
      for (let i = 0; i < n; i++) { rs[i] = Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2] - (geo.boundingBox.min.z * 0.15)); lo = Math.min(lo, rs[i]); hi = Math.max(hi, rs[i]); }
      for (let i = 0; i < n; i++) { const a = Math.pow((rs[i] - lo) / (hi - lo), 1.6), v = 0.25 + 0.75 * a; col[3 * i] = col[3 * i + 1] = col[3 * i + 2] = v; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    mat.vertexColors = state.form === 'mandelbulb'; mat.needsUpdate = true;
    if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
    meshObj = new THREE.Mesh(geo, mat);
    scene.add(meshObj);
    const r = geo.boundingBox.max.distanceTo(geo.boundingBox.min) / 2;
    const view = { menger: [1.6, -2.9, 1.9], sierpinski: [-1.3, -3.0, 1.6], mandelbulb: [0.9, -2.2, 2.9] }[state.form];
    camera.position.set(view[0] * r, view[1] * r, view[2] * r); controls.target.set(0, 0, 0); controls.update();
    $('busy').textContent = ''; dirty = true;
    facts(m);
  }, 30);
}

function facts(m) {
  const F = state.form, n = state.level, rows = [];
  if (F === 'menger') {
    rows.push([t('cubes', 'cubi'), `20<sup>${n}</sup> = ${(20 ** n).toLocaleString()}`]);
    rows.push([t('volume left', 'volume rimasto'), `(20/27)<sup>${n}</sup> = ${(100 * (20 / 27) ** n).toFixed(1)}%`]);
    rows.push([t('dimension', 'dimensione'), `log 20 / log 3 = ${DIMENSION.menger.toFixed(4)}`]);
  } else if (F === 'sierpinski') {
    rows.push([t('tetrahedra', 'tetraedri'), `4<sup>${n}</sup> = ${(4 ** n).toLocaleString()}`]);
    rows.push([t('volume left', 'volume rimasto'), `(1/2)<sup>${n}</sup> = ${(100 / 2 ** n).toFixed(1)}%`]);
    rows.push([t('dimension', 'dimensione'), `log 4 / log 2 = 2`]);
  } else {
    rows.push([t('rule', 'regola'), `z ↦ z<sup>${state.power}</sup> + c ${t('in spherical coordinates', 'in coordinate sferiche')}`]);
    rows.push([t('symmetry', 'simmetria'), t(`${state.power - 1}-fold around the vertical axis`, `di ordine ${state.power - 1} attorno all'asse verticale`)]);
  }
  if (m) rows.push([t('mesh', 'mesh'), `${(m.idx.length / 3).toLocaleString()} ${t('triangles (view)', 'triangoli (vista)')}`]);
  $('facts').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const notes = {
    menger: [`Karl Menger described the sponge in 1926 as a universal curve: it has no volume and an infinite surface, and every curve of finite dimension fits inside it. Each step removes the centre and the middle of each face of every cube; the printed level 3 has ${(20 ** 3).toLocaleString()} cubes and holes down to a twenty-seventh of the side.`,
      `Karl Menger descrisse la spugna nel 1926 come curva universale: ha volume nullo e superficie infinita, e ogni curva di dimensione finita ci sta dentro. Ogni passo toglie il centro e il mezzo di ogni faccia di ogni cubo; il livello 3 stampato ha ${(20 ** 3).toLocaleString('it')} cubi e buchi fino a un ventisettesimo del lato.`],
    sierpinski: ['Its dimension is exactly 2, like a plane, although it is a solid of zero volume: halving the size gives four copies, and 4 = 2². Seen along the axis through the middles of two opposite edges it covers a square with no gap, which is why it stands so well on an edge. The copies touch only at corners, so the print thickens them a little to make those corners into joints.',
      "La sua dimensione è esattamente 2, come un piano, benché sia un solido di volume nullo: dimezzando la misura si hanno quattro copie, e 4 = 2². Visto lungo l'asse che passa per i punti medi di due spigoli opposti copre un quadrato senza lacune, ed è per questo che sta così bene su uno spigolo. Le copie si toccano solo nei vertici, quindi la stampa le ispessisce un poco per fare di quei vertici delle giunture."],
    mandelbulb: ['There is no algebra of three-dimensional numbers, so the bulb borrows one: a point is raised to the power n by multiplying its two angles by n and raising its distance from the origin to n. A point belongs to the set when that orbit stays bounded; the distance estimator 0.5 r log r / |dr| tells the marching how far the surface is, so the grid of the print needs no ray marching.',
      "Non esiste un'algebra dei numeri tridimensionali, quindi il bulbo ne prende in prestito una: un punto si eleva alla potenza n moltiplicando per n i suoi due angoli ed elevando alla n la sua distanza dall'origine. Un punto appartiene all'insieme quando quell'orbita resta limitata; lo stimatore di distanza 0.5 r log r / |dr| dice al marching quanto è lontana la superficie."],
  };
  $('note').innerHTML = `<p>${t(...notes[F])}</p>`;
}

function syncControls() {
  const F = FORMS[state.form];
  $('levlab').style.display = F.levels ? '' : 'none';
  $('powlab').style.display = state.form === 'mandelbulb' ? '' : 'none';
  $('standlab').style.display = state.form === 'sierpinski' ? '' : 'none';
  if (F.levels) { const L = $('level'); L.min = F.levels[0]; L.max = F.levels[1]; state.level = Math.max(F.levels[0], Math.min(F.levels[1], state.level)); L.value = state.level; $('levelout').textContent = state.level; }
  $('power').value = state.power; $('powerout').textContent = state.power;
  const size = $('psize'); if (size) size.value = F.size;
}

function init() {
  const sel = $('form'), st = $('stand');
  const names = () => {
    sel.innerHTML = Object.entries(FORMS).map(([k, f]) => `<option value="${k}"${k === state.form ? ' selected' : ''}>${t(f.en, f.it)}</option>`).join('');
    st.innerHTML = [['edge', 'an edge', 'uno spigolo'], ['face', 'a face', 'una faccia']].map(([v, en, it]) => `<option value="${v}"${v === state.stand ? ' selected' : ''}>${t(en, it)}</option>`).join('');
  };
  names(); onLang(() => { names(); facts(); });
  setup();
  printPanel($('print'), {
    size: { value: FORMS[state.form].size, min: 20, max: 250, what: { en: 'side, edge or width', it: 'lato, spigolo o larghezza' } },
    fields: [
      { key: 'neck', label: { en: 'tetrahedron joints, mm', it: 'giunture tetraedro, mm' }, value: 0.6, min: 0.3, max: 2, step: 0.1 },
      { key: 'thick', label: { en: 'bulb thickening, mm', it: 'ispessimento bulbo, mm' }, value: 0.4, min: 0, max: 2, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'normal', it: 'normale' }, { value: 'fine', en: 'fine (slow)', it: 'alta (lenta)' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...opts(), ...o }] },
    name: o => fileName({ ...opts(), ...o }),
    head: 'binary STL, millimetres, a fractal',
    object: 'fractal',
    share: () => shareUrl(SPEC, state),
  });
  syncControls(); rebuild();
  sel.addEventListener('change', () => { state.form = sel.value; state.level = FORMS[state.form].level || state.level; syncControls(); toHash(); rebuild(); });
  $('level').addEventListener('input', e => { state.level = +e.target.value; $('levelout').textContent = state.level; toHash(); facts(); });
  $('level').addEventListener('change', rebuild);
  $('power').addEventListener('input', e => { state.power = +e.target.value; $('powerout').textContent = state.power; toHash(); facts(); });
  $('power').addEventListener('change', rebuild);
  st.addEventListener('change', () => { state.stand = st.value; toHash(); rebuild(); });
  onTheme(paint);
}

init();
