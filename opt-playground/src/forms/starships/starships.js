// The page of the starships: the targets of the fitness, the genetic
// algorithm run a generation at a time, the fleet of the current population
// in 3D with the chosen ship in gold, the top views of the fleet against the
// target outline, the curve of the fitness, the derivation of the chosen
// ship, and the print panel.

import * as THREE from 'three';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';
import { evolve, derive, heightMap, targetMask, TARGETS, RULES, N, F, HMAX, fileName } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  target: { def: 'dart', values: Object.keys(TARGETS) },
  bulk: { def: 0.3, min: 0.1, max: 0.6 },
  sym: { def: 0.4, min: 0, max: 1 },
  pop: { def: 12, min: 8, max: 24, int: true },
  mut: { def: 0.08, min: 0.01, max: 0.3 },
  seed: { def: 1, min: 1, max: 99999, int: true },
  gens: { def: 15, min: 0, max: 2000, int: true },
  pick: { def: 0, min: 0, max: 23, int: true },
};
const state = readState(SPEC);
const fmt = v => (Number.isInteger(v) ? String(v) : (+v.toFixed(2)).toString());
let E = evolve(state);

/* ------------------------------------------------------------- the view -- */

const view = createView($('stage'), { eye: [0.12, -0.75, 1.4], ratio: 0.8 });
const build = workerBuilder(f => view.status(building(f)));
const gold = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
const tint = () => { gold.color.set(css('--gold') || '#e3b341'); view.render(); };
tint(); onTheme(tint);
const MODEL = new URL('./model.js', import.meta.url).href;
let ticket = 0;
async function show3d() {
  const me = ++ticket;
  try {
    const m = await build(MODEL, 'fleetMesh', [{ genomes: E.pop.map(p => p.g), pick: state.pick }]);
    if (!m || me !== ticket) return;
    const obj = view.show(m);
    obj.geometry.clearGroups();
    const s = 3 * m.sel, c = 3 * m.selCount, all = m.idx.length;
    if (s > 0) obj.geometry.addGroup(0, s, 0);
    obj.geometry.addGroup(s, c, 1);
    if (s + c < all) obj.geometry.addGroup(s + c, all - s - c, 0);
    obj.material = [view.material, gold];
    view.render();
    view.status(`${t('generation', 'generazione')} ${state.gens} · ${E.pop.length} ${t('ships', 'navi')}`);
  } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
}

/* ------------------------------------------------- top views and curve -- */

function tops() {
  const cv = $('tops'), cols = 4, rows = Math.ceil(E.pop.length / cols), px = 3, side = N * px, gap = 8;
  cv.width = cols * side + (cols - 1) * gap; cv.height = rows * side + (rows - 1) * gap;
  const g = cv.getContext('2d'), mask = targetMask(state.target);
  const acc = css('--accent-2') || '#9363be', ink = css('--ink') || '#222', gl = css('--gold') || '#e3b341', ground = css('--panel') || '#fff';
  g.clearRect(0, 0, cv.width, cv.height);
  E.pop.forEach((p, n) => {
    const ox = (n % cols) * (side + gap), oy = Math.floor(n / cols) * (side + gap), Hm = heightMap(derive(p.g).parts);
    g.fillStyle = ground; g.fillRect(ox, oy, side, side);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = Hm[j * N + i], y = oy + (N - 1 - j) * px;
      if (mask[j * N + i] && !h) { g.fillStyle = ink; g.globalAlpha = 0.08; g.fillRect(ox + i * px, y, px, px); }
      if (h) { g.fillStyle = acc; g.globalAlpha = 0.35 + 0.65 * Math.min(1, h / HMAX); g.fillRect(ox + i * px, y, px, px); }
    }
    g.globalAlpha = 1;
    g.lineWidth = n === state.pick ? 3 : 1; g.strokeStyle = n === state.pick ? gl : css('--rule') || '#ccc';
    g.strokeRect(ox + 0.5, oy + 0.5, side - 1, side - 1);
    g.fillStyle = ink; g.font = '11px "IBM Plex Mono", monospace';
    g.fillText(p.fitness.toFixed(3), ox + 4, oy + 13);
  });
  cv.onclick = e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
    const n = Math.floor(y / (side + gap)) * cols + Math.floor(x / (side + gap));
    if (n >= 0 && n < E.pop.length) { state.pick = n; writeState(SPEC, state); tops(); about(); show3d(); }
  };
}

function curve() {
  const H = E.history, w = 330, h = 120, pad = 22, n = Math.max(1, H.length - 1);
  const lo = Math.min(...H.map(x => x[1])), hi = Math.max(...H.map(x => x[0]));
  const X = i => pad + (w - pad - 6) * i / n, Y = v => h - pad - (h - pad - 8) * (v - lo) / (hi - lo || 1);
  const line = k => H.map((x, i) => `${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`).join(' ');
  $('curve').innerHTML = `<line x1="${pad}" x2="${w - 6}" y1="${h - pad}" y2="${h - pad}" class="axis"/>` +
    `<polyline points="${line(1)}" class="mean"/><polyline points="${line(0)}" class="best"/>` +
    `<text x="${pad}" y="${h - 6}" class="lab">0</text><text x="${w - 6}" y="${h - 6}" class="lab" text-anchor="end">${H.length - 1}</text>` +
    `<text x="${pad + 4}" y="14" class="lab">${t('best', 'migliore')} ${hi.toFixed(3)}</text>` +
    `<text x="${w - 6}" y="14" class="lab mean-lab" text-anchor="end">${t('mean', 'media')}</text>`;
}

const NAMES = {
  Nose: ['nose', 'prua'], Wings: ['wings', 'ali'], Engines: ['engines', 'motori'], Cockpit: ['cockpit', 'cabina'],
  Fins: ['fins', 'pinne'], Greebles: ['greebles', 'dettagli'],
};
function about() {
  const p = E.pop[Math.min(state.pick, E.pop.length - 1)], D = derive(p.g);
  $('stats').innerHTML = `<span>${t('generation', 'generazione')} <b>${state.gens}</b></span>` +
    `<span>${t('fitness', 'fitness')} <b>${p.fitness.toFixed(3)}</b></span>` +
    `<span>IoU <b>${p.iou.toFixed(2)}</b></span><span>${t('bulk', 'massa')} <b>${p.bulk.toFixed(2)}</b></span>` +
    `<span>${t('symmetry', 'simmetria')} <b>${p.sym.toFixed(2)}</b></span>`;
  $('derivation').innerHTML = Object.keys(RULES).map(k => `<span>${t(...NAMES[k])} → <b>${D.choices[k] ?? '—'}</b></span>`).join('') +
    `<span>${t('parts', 'parti')} <b>${D.parts.length}</b></span>`;
}

/* --------------------------------------------------------- the controls -- */

const sync = () => {
  for (const k of Object.keys(SPEC)) {
    const el = $(k);
    if (!el) continue;
    el.value = state[k];
    if ($(k + 'out')) $(k + 'out').textContent = fmt(state[k]);
  }
  $('gensout').textContent = state.gens;
};
function refresh() { writeState(SPEC, state); sync(); tops(); curve(); about(); show3d(); }
function restart() { stop(); state.gens = 0; state.pick = Math.min(state.pick, state.pop - 1); E = evolve(state); refresh(); }
for (const k of ['target', 'bulk', 'sym', 'pop', 'mut', 'seed']) {
  const el = $(k), s = SPEC[k];
  const read = () => (typeof s.def === 'number' ? Math.min(s.max, Math.max(s.min, s.int ? Math.round(+el.value) : +el.value)) : el.value);
  el.addEventListener('input', () => { if ($(k + 'out')) $(k + 'out').textContent = fmt(read()); });
  el.addEventListener('change', () => { state[k] = read(); restart(); });
}
$('random').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 99999); restart(); });
$('reset').addEventListener('click', restart);
const step = () => { E = evolve(state, E, 1); state.gens++; };
$('step').addEventListener('click', () => { stop(); step(); refresh(); });
let timer = null;
function stop() { if (timer) { clearInterval(timer); timer = null; } $('play').innerHTML = `<span data-l="en">Evolve</span><span data-l="it" lang="it">Evolvi</span>`; }
$('play').addEventListener('click', () => {
  if (timer) return stop();
  let left = 30;
  $('play').innerHTML = `<span data-l="en">Stop</span><span data-l="it" lang="it">Ferma</span>`;
  timer = setInterval(() => { step(); refresh(); if (--left <= 0 || state.gens >= SPEC.gens.max) stop(); }, 160);
});
$('spin').addEventListener('change', e => view.spin(e.target.checked));
$('view').addEventListener('click', () => view.reset());
onLang(() => { curve(); about(); });
onTheme(() => tops());

printPanel($('print'), {
  size: { value: 80, min: 30, max: 220, label: { en: 'ship length, mm', it: 'lunghezza della nave, mm' } },
  fields: [
    { key: 'what', type: 'select', label: { en: 'what', it: 'cosa' }, value: 'one',
      options: [{ value: 'one', en: 'the chosen ship', it: 'la nave scelta' }, { value: 'four', en: 'the four best', it: 'le quattro migliori' }] },
    { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
      options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
  ],
  worker: { module: MODEL, fn: 'solid', args: o => [{ ...state, ...o }] },
  name: o => fileName({ ...state, ...o }),
  head: 'binary STL, millimetres, starship from a shape grammar',
  object: 'starship',
  share: () => shareUrl(SPEC, state),
});
refresh();
