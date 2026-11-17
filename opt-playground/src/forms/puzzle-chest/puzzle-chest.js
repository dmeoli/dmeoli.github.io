// The page of the puzzle chest: the split found in a worker, the pieces in
// 3D with one colour each, taken apart in their order along their
// directions (by the slider or the animation), the sequence with the test of
// every stage, and the print panel.

import * as THREE from 'three';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder } from '../mathematics/view.js';
import { pieceFaces, DIRS, DIRNAMES, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  shape: { def: 'small', values: ['small', 'large'] },
  n: { def: 5, min: 3, max: 7, int: true },
  seed: { def: 1, min: 1, max: 99999, int: true },
};
const state = readState(SPEC);
const MODEL = new URL('./model.js', import.meta.url).href;

const view = createView($('stage'), { eye: [1.1, -1.5, 1.0] });
const build = workerBuilder(() => view.status(t('searching', 'ricerca')));
const hidden = new THREE.MeshBasicMaterial({ visible: false });
let D = null, objs = [], centre = [0, 0, 0], s = 0;

const colours = () => {
  const base = [css('--accent') || '#7338a8', css('--gold') || '#6c5920', css('--accent-2') || '#9363be', css('--lilac') || '#d4b9eb', css('--ink-soft') || '#5f4b76'];
  return objs.map((_, i) => new THREE.Color(base[i % base.length]).offsetHSL(0, 0, i >= base.length ? 0.12 : 0));
};
function paint() { const c = colours(); objs.forEach((o, i) => o.material.color.copy(c[i])); view.render(); }
onTheme(paint);

const far = () => Math.max(D.G.nx, D.G.ny, D.G.nz) + 1.5;
// the pieces at time s in [0, n - 1]: piece i has slid out by min(1, s - i)
function place() {
  objs.forEach((o, i) => {
    const d = D.dirs[i] >= 0 ? DIRS[D.dirs[i]] : [0, 0, 0], a = Math.max(0, Math.min(1, s - i)) * far();
    o.position.set(d[0] * a - centre[0], d[1] * a - centre[1], d[2] * a - centre[2]);
  });
  view.render();
}

async function rebuild() {
  writeState(SPEC, state);
  stopPlay();
  try {
    const r = await build(MODEL, 'screen', [{ ...state }]);
    if (!r) return;
    D = { ...r, G: { nx: r.nx, ny: r.ny, nz: r.nz } };
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); return; }
  for (const o of objs) { view.group.remove(o); o.geometry.dispose(); o.material.dispose(); }
  const { nx, ny, nz } = D.G, F = 1;
  // an invisible box one cube larger than the chest frames the camera
  const ext = { pos: Float32Array.from([-F, -F, -F, nx + F, ny + F, nz + F, -F, ny + F, 0]), idx: Uint32Array.from([0, 1, 2]) };
  view.show(ext, { material: hidden, refit: true });
  centre = [nx / 2, ny / 2, nz / 2];
  objs = D.pieces.map(cells => {
    const m = pieceFaces(D.G, cells), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeVertexNormals();
    const o = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1 }));
    o.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x1a1426, transparent: true, opacity: 0.35 })));
    view.group.add(o);
    return o;
  });
  paint();
  $('explode').max = D.pieces.length - 1; s = Math.min(s, D.pieces.length - 1); $('explode').value = s;
  place(); sequence();
  view.status(D.ok ? `${D.pieces.length} ${t('pieces', 'pezzi')} · ${D.tries} ${t('moves', 'mosse')}` : t('no interlocking split found', 'nessuna divisione a incastro trovata'));
}

function sequence() {
  const name = i => `P<sub>${i + 1}</sub>`;
  const rows = D.pieces.map((cells, i) => {
    const last = i === D.pieces.length - 1, bad = D.report[i] || [];
    const test = last ? t('stays', 'resta') : bad.length ? t('fails', 'non passa') : t('only movable piece: interlocked', 'unico pezzo mobile: a incastro');
    return `<li><span class="sw" style="background:${'#' + objs[i].material.color.getHexString()}"></span>${name(i)}, ${cells.length} ${t('cells', 'celle')}` +
      (last ? '' : `, ${t('slides', 'esce')} ${DIRNAMES[D.dirs[i]]}`) + ` · <i>${test}</i></li>`;
  });
  $('seq').innerHTML = rows.join('');
  $('stats').innerHTML = `<span>${t('grid', 'griglia')} <b>${D.G.nx}×${D.G.ny}×${D.G.nz}</b></span>` +
    `<span>${t('cells', 'celle')} <b>${D.pieces.reduce((a, p) => a + p.length, 0)}</b></span>` +
    `<span>${t('moves of the search', 'mosse della ricerca')} <b>${D.tries}</b></span><span>${t('test', 'test')} <b>${D.ok ? t('passed', 'superato') : t('failed', 'non superato')}</b></span>`;
}

/* ---------------------------------------------------------- the controls -- */

const fmt = v => String(v);
for (const k of Object.keys(SPEC)) {
  const el = $(k), sp = SPEC[k];
  el.value = state[k]; if ($(k + 'out')) $(k + 'out').textContent = fmt(state[k]);
  const read = () => (typeof sp.def === 'number' ? Math.min(sp.max, Math.max(sp.min, Math.round(+el.value))) : el.value);
  el.addEventListener('input', () => { if ($(k + 'out')) $(k + 'out').textContent = fmt(read()); });
  el.addEventListener('change', () => { state[k] = read(); rebuild(); });
}
$('random').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 99999); $('seed').value = state.seed; rebuild(); });
$('explode').addEventListener('input', e => { stopPlay(); s = +e.target.value; place(); });
$('spin').addEventListener('change', e => view.spin(e.target.checked));
$('view').addEventListener('click', () => view.reset());
let anim = null;
function stopPlay() { if (anim) { cancelAnimationFrame(anim.raf); anim = null; } $('play').innerHTML = '<span data-l="en">Take apart</span><span data-l="it" lang="it">Smonta</span>'; }
$('play').addEventListener('click', () => {
  if (anim) return stopPlay();
  if (!D) return;
  const n = D.pieces.length - 1, dir = s >= n ? -1 : 1;
  anim = { raf: 0 };
  $('play').innerHTML = '<span data-l="en">Stop</span><span data-l="it" lang="it">Ferma</span>';
  let last = performance.now();
  const go = now => {
    if (!anim) return;
    s = Math.max(0, Math.min(n, s + dir * (now - last) / 900)); last = now;
    $('explode').value = s; place();
    if ((dir > 0 && s >= n) || (dir < 0 && s <= 0)) return stopPlay();
    anim.raf = requestAnimationFrame(go);
  };
  anim.raf = requestAnimationFrame(go);
});
onLang(() => { if (D) { sequence(); } });

printPanel($('print'), {
  size: { value: 60, min: 40, max: 160, label: { en: 'width of the chest, mm', it: 'larghezza del baule, mm' } },
  fields: [
    { key: 'clearance', label: { en: 'clearance between pieces, mm', it: 'gioco fra i pezzi, mm' }, value: 0.2, min: 0.1, max: 0.4, step: 0.05 },
    { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
      options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
  ],
  worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
  name: o => fileName({ ...state, ...o }),
  head: 'binary STL, millimetres, interlocking puzzle chest',
  object: 'puzzle chest',
  note: info => (info && info.unsupported !== undefined ? ` · ${info.count} ${t('pieces', 'pezzi')}, ${info.unsupported} ${t('cells need supports', 'celle richiedono supporti')}` : ''),
  share: () => shareUrl(SPEC, state),
});
rebuild();
