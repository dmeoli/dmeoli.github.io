// Fair dice: the die chosen in the list, drawn exactly (its faces and the
// strokes of its numbers) or as the printed mesh, with its facts and the
// download panel of src/print.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onTheme, onLang } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { KINDS, layout, numbering, solid, fileName, stableFaces } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ORDER = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'trapezohedron', 'bipyramid', 'long', 'rhombic12', 'tetrakis24', 'deltoid24', 'rhombic30', 'disdyakis48', 'pentakis60', 'disdyakis120'];
const SPEC = {
  kind: { def: 'd20', values: ORDER }, n: { def: 14, min: 3, max: 40, int: true },
  pips: { def: false }, mesh: { def: false },
};
const state = readState(SPEC);
const toHash = () => writeState(SPEC, state);

let renderer, scene, camera, controls, group = null, dirty = true;
const mats = {};
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => { dirty = true; });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-1.2, -1.6, 2.4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(2, 1.5, 0.5); scene.add(rim);
  mats.body = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 });
  mats.ink = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  paint();
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.75, 520));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => { if (dirty) { renderer.render(scene, camera); dirty = false; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function paint() {
  mats.body.color.set(css('--accent') || '#7338a8');
  mats.ink.color.set(css('--ground') || '#e8e2f3');
  dirty = true;
}

const opts = () => ({ kind: state.kind, n: state.n, pips: state.pips && state.kind === 'd6', size: KINDS[state.kind].size, round: 0.8, depth: 0.6 });

// the exact die: its faces, and its numbers as flat strokes on them
function exact() {
  const { D, M, down, k } = layout(opts());
  const pos = [], ink = [];
  const P = p => down(p.map(x => x * k));
  for (const f of D.faces) {
    const v = f.pts.map(P);
    for (let j = 1; j + 1 < v.length; j++) pos.push(...v[0], ...v[j], ...v[j + 1]);
  }
  D.faces.forEach((f, i) => {
    const at = (u, w) => P(f.c.map((c, a) => c + u * f.e1[a] + w * f.e2[a] + 0.002 * f.n[a]));
    const segs = M.out[i].segs, half = Math.max(0.3, 0.075 * (segs.s || 1) * k) / k;
    const quad = (p, q, r, s) => ink.push(...p, ...q, ...r, ...p, ...r, ...s);
    for (const [x0, y0, x1, y1] of segs) {
      const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l * half, ny = (x1 - x0) / l * half;
      quad(at(x0 + nx, y0 + ny), at(x0 - nx, y0 - ny), at(x1 - nx, y1 - ny), at(x1 + nx, y1 + ny));
      // round joints
      for (let j = 0; j < 10; j++) {
        const a0 = 2 * Math.PI * j / 10, a1 = 2 * Math.PI * (j + 1) / 10;
        ink.push(...at(x1, y1), ...at(x1 + half * Math.cos(a0), y1 + half * Math.sin(a0)), ...at(x1 + half * Math.cos(a1), y1 + half * Math.sin(a1)));
      }
    }
    for (const [cu, cv, r] of M.out[i].dots) for (let j = 0; j < 24; j++) {
      const a0 = 2 * Math.PI * j / 24, a1 = 2 * Math.PI * (j + 1) / 24;
      ink.push(...at(cu, cv), ...at(cu + r * Math.cos(a0), cv + r * Math.sin(a0)), ...at(cu + r * Math.cos(a1), cv + r * Math.sin(a1)));
    }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const gi = new THREE.BufferGeometry(); gi.setAttribute('position', new THREE.Float32BufferAttribute(ink, 3)); gi.computeVertexNormals();
  const G = new THREE.Group();
  G.add(new THREE.Mesh(g, mats.body), new THREE.Mesh(gi, mats.ink));
  return G;
}

// the printed mesh, built here (a second or two for the larger dice)
function printed() {
  const m = solid({ ...opts(), res: 'draft' });
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g0.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g0.computeVertexNormals();
  const G = new THREE.Group(); G.add(new THREE.Mesh(g0, mats.body));
  return G;
}

function rebuild() {
  if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
  group = state.mesh ? printed() : exact();
  const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
  group.position.sub(c);
  scene.add(group);
  const r = box.max.distanceTo(box.min) / 2;
  camera.position.set(0.95 * r, -2.5 * r, 2.1 * r); controls.target.set(0, 0, 0); controls.update();
  dirty = true;
  facts();
}

function facts() {
  const K = KINDS[state.kind], { D, support } = layout(opts()), { num, opposite } = numbering(D);
  const stable = stableFaces(D), roofs = D.planes.length - D.numbered.length;
  const sym = state.kind === 'long'
    ? t(`by symmetry among the ${D.count} sides; the ${roofs} faces of the two roofs are not stable rests (${stable.slice(D.count).some(Boolean) ? 'some are' : 'none is'})`,
        `per simmetria fra i ${D.count} lati; le ${roofs} facce dei due tetti non sono posizioni di riposo stabili (${stable.slice(D.count).some(Boolean) ? 'alcune lo sono' : 'nessuna lo è'})`)
    : t('isohedral: a symmetry takes any face to any other', 'isoedro: una simmetria porta ogni faccia su ogni altra');
  const sum = state.kind === 'd4' ? t('a number at each corner', 'un numero per vertice')
    : opposite ? t(`opposite faces add to ${D.count + 1}`, `le facce opposte sommano ${D.count + 1}`)
    : t('no exactly opposite faces: the most opposite ones add to ' + (D.count + 1), 'nessuna faccia esattamente opposta: le più opposte sommano ' + (D.count + 1));
  const sup = { no: t('none needed', 'non servono'), maybe: t('usually none', 'di solito no'), yes: t('needed', 'servono') }[support.supports];
  const rows = [
    [t('faces', 'facce'), `${D.count}${state.kind === 'long' ? t(' (and two roofs)', ' (più due tetti)') : ''}`],
    [t('fair', 'equo'), sym],
    [t('numbers', 'numeri'), sum],
    [t('overhang', 'sbalzo'), `${support.overhang}° ${t('from the vertical', 'dalla verticale')}; ${t('supports', 'supporti')}: ${sup}`],
  ];
  $('facts').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  void num; void K;
}

function syncControls() {
  const K = KINDS[state.kind];
  $('nlab').style.display = K.family ? '' : 'none';
  $('piplab').style.display = state.kind === 'd6' ? '' : 'none';
  const n = $('n');
  if (K.odd) { n.min = 3; n.max = 15; n.step = 2; if (state.n % 2 === 0) state.n = Math.min(15, state.n + 1); }
  else { n.min = 6; n.max = 40; n.step = 2; if (state.n % 2) state.n = Math.max(6, state.n - 1); }
  n.value = state.n; $('nout').textContent = state.n;
  $('pips').checked = state.pips; $('mesh').checked = state.mesh;
  const size = $('psize'); if (size) size.value = K.size;
}

function init() {
  const sel = $('kind');
  const names = () => { sel.innerHTML = ORDER.map(k => `<option value="${k}"${k === state.kind ? ' selected' : ''}>${t(KINDS[k].en, KINDS[k].it)}</option>`).join(''); };
  names(); onLang(() => { names(); facts(); });
  setup();
  printPanel($('print'), {
    size: { value: KINDS[state.kind].size, min: 10, max: 120, what: { en: 'largest dimension', it: 'misura maggiore' } },
    fields: [
      { key: 'round', label: { en: 'edge radius, mm', it: 'raggio spigoli, mm' }, value: 0.8, min: 0, max: 4, step: 0.1 },
      { key: 'depth', label: { en: 'engraving, mm', it: 'incisione, mm' }, value: 0.6, min: 0.3, max: 0.9, step: 0.05 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'normal', it: 'normale' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...opts(), ...o }] },
    name: o => fileName({ ...opts(), ...o }),
    head: 'binary STL, millimetres, a fair die',
    object: 'fair die',
    share: () => shareUrl(SPEC, state),
    note: info => info.overhang !== undefined ? `, ${t('overhang', 'sbalzo')} ${info.overhang}°, ${t('supports', 'supporti')}: ${{ no: t('no', 'no'), maybe: t('probably not', 'probabilmente no'), yes: t('yes', 'sì') }[info.supports]}` : '',
  });
  syncControls(); rebuild();
  sel.addEventListener('change', () => { state.kind = sel.value; syncControls(); toHash(); rebuild(); });
  $('n').addEventListener('input', e => { state.n = +e.target.value; $('nout').textContent = state.n; toHash(); rebuild(); });
  $('pips').addEventListener('change', e => { state.pips = e.target.checked; toHash(); rebuild(); });
  $('mesh').addEventListener('change', e => { state.mesh = e.target.checked; toHash(); rebuild(); });
  onTheme(paint);
}

init();
