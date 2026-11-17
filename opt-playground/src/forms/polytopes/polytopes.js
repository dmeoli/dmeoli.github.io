// 4D polytopes: the polytope, its projection and its rotation in 4D chosen
// above; the edges drawn at once as lines while the solid of struts and balls
// is built in a worker at the resolution of the view; its numbers; and the
// download panel, which builds the same solid finer.

import * as THREE from 'three';
import { t } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { fileName, project, INFO, NAMES } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const MODEL = new URL('./model.js', import.meta.url).href;
// every parameter of the scene, kept in the address
const SPEC = {
  shape: { def: '120-cell', values: NAMES },
  proj: { def: 'stereographic', values: ['stereographic', 'perspective'] },
  first: { def: 'cell', values: ['cell', 'vertex'] },
  eye: { def: 0.25, min: 0.02, max: 2 },
  xw: { def: 0, min: -180, max: 180, int: true },
  yw: { def: 0, min: -180, max: 180, int: true },
  zw: { def: 0, min: -180, max: 180, int: true },
  taper: { def: true },
};
const state = readState(SPEC);
const DEF = { size: 100, strut: 1.3, joint: 1.5, base: 'cut' };

const lineMat = new THREE.LineBasicMaterial();
const view = createView($('stage'), { eye: [0.9, -1.5, 0.75], extra: () => lineMat.color.set(css('--accent') || '#7338a8') });
const build = workerBuilder(f => view.status(building(f)));
let panel, lines = null, solidObj = null;

const params = () => ({ ...state, ...(panel ? panel.read() : DEF) });

// the edges as lines, centred like the solid will be
function drawLines() {
  const { lines: L } = project(params());
  const pos = [];
  for (const l of L) for (let k = 0; k + 1 < l.length; k++) pos.push(...l[k].slice(0, 3), ...l[k + 1].slice(0, 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  if (lines) { view.group.remove(lines); lines.geometry.dispose(); }
  lines = new THREE.LineSegments(g, lineMat);
  view.group.add(lines);
  if (solidObj) solidObj.visible = false;
  view.render();
}


function sync() {
  for (const k of ['shape', 'proj', 'first']) $(k).value = state[k];
  for (const k of ['xw', 'yw', 'zw']) { $(k).value = state[k]; $(k + 'out').textContent = state[k] + '°'; }
  $('eye').value = state.eye; $('eyeout').textContent = state.eye.toFixed(2);
  $('taper').checked = state.taper;
  $('eyebox').hidden = state.proj !== 'perspective';
  const I = INFO[state.shape];
  $('sym').textContent = I.sym;
  $('nV').textContent = I.V; $('nE').textContent = I.E; $('nF').textContent = I.F; $('nC').textContent = I.C;
  $('cells').textContent = t(I.cell[0], I.cell[1]);
}

async function rebuild() {
  writeState(SPEC, state); sync(); drawLines();
  view.status(building(0));
  try {
    const m = await build(MODEL, 'solid', [{ ...params(), res: 'preview' }]);
    if (!m) return;
    solidObj = view.show(m);
    solidObj.visible = true;
    if (lines) lines.visible = false;
    view.render();
    view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')} · ${t('preview', 'anteprima')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

function init() {
  for (const k of ['shape', 'proj', 'first']) $(k).addEventListener('change', e => { state[k] = e.target.value; rebuild(); });
  for (const k of ['xw', 'yw', 'zw', 'eye']) {
    const fmt = k === 'eye' ? v => v.toFixed(2) : v => v + '°';
    $(k).addEventListener('input', e => { state[k] = +e.target.value; $(k + 'out').textContent = fmt(state[k]); if (lines) lines.visible = true; drawLines(); });
    $(k).addEventListener('change', rebuild);
  }
  $('taper').addEventListener('change', e => { state.taper = e.target.checked; rebuild(); });
  $('spin').addEventListener('change', e => view.spin(e.target.checked));
  $('view').addEventListener('click', () => view.reset());
  window.addEventListener('langchange', sync);
  panel = printPanel($('print'), {
    size: { value: DEF.size, min: 30, max: 250, what: { en: 'largest dimension', it: 'lato maggiore' } },
    fields: [
      { key: 'strut', label: { en: 'strut radius, mm', it: 'raggio delle aste, mm' }, value: DEF.strut, min: 0.8, max: 5, step: 0.1 },
      { key: 'joint', label: { en: 'balls / struts', it: 'sfere / aste' }, value: DEF.joint, min: 1, max: 2.5, step: 0.1 },
      { key: 'base', type: 'select', label: { en: 'base', it: 'base' }, value: DEF.base,
        options: [{ value: 'cut', en: 'flat cut', it: 'taglio piano' }, { value: 'plate', en: 'disc', it: 'disco' }, { value: 'none', en: 'none', it: 'nessuna' }] },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
    name: o => fileName({ ...state, ...o }),
    head: () => `binary STL, millimetres, the ${state.shape}`,
    object: '4D polytope',
    share: () => shareUrl(SPEC, state),
  });
  for (const k of ['strut', 'joint', 'base']) $('p' + k).addEventListener('change', rebuild);
  rebuild();
}

init();
