// The page of the monsters: the creature of a seed and a type turning in 3D,
// its card, the evolution through the three stages and the download panel.
// Seed, type and stage live in the address, so that a link brings back the
// same monster.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { GENES } from '../biomorphs/model.js';
import { creatureObject, lights, frame } from '../biomorphs/view.js';
import { TYPES, TYPE, beats, genome, typeParams, monster, screenMesh, names, number, palette, fileName } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = { type: { def: 'ice', values: TYPES }, seed: { def: 21, min: 0, max: 999999, int: true }, s: { def: '3', values: ['1', '2', '3', 'c'] } };
const state = readState(SPEC);
const THUMB = new URLSearchParams(location.hash.slice(1)).get('thumb') === '1';
if (THUMB) document.body.classList.add('thumb');

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, obj = null, dirty = true, glowUntil = 0;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  const hint = document.createElement('div'); hint.className = 'hint'; stage.appendChild(hint);
  const sayHint = () => { hint.textContent = t('drag to turn, wheel or pinch to zoom', 'trascina per ruotare, rotella o pizzico per lo zoom'); };
  sayHint(); onLang(sayHint);
  scene = new THREE.Scene(); lights(scene);
  camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = THUMB ? innerWidth : stage.clientWidth, h = THUMB ? innerHeight : Math.round(Math.min(w * 0.82, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = now => {
    if (controls.update()) dirty = true;
    if (obj && glowUntil) {
      const left = (glowUntil - now) / 900;
      obj.userData.mesh.material.emissiveIntensity = left > 0 ? 0.5 * Math.sin(Math.PI * Math.min(1, left)) : 0;
      if (left <= 0) glowUntil = 0;
      dirty = true;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const cache = new Map();
function meshOf(stage, cells) {
  const key = `${state.type}|${state.seed}|${stage}|${cells}`;
  if (!cache.has(key)) {
    cache.set(key, screenMesh(state.seed, state.type, stage, cells));
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

function show(stage, { fit = true, size = null, cells = 84 } = {}) {
  const m = meshOf(stage, stage === 'c' ? 120 : cells), o = creatureObject(m);
  if (obj) { scene.remove(obj); obj.userData.mesh.geometry.dispose(); obj.userData.mesh.material.dispose(); }
  obj = o; scene.add(obj);
  if (fit) {
    const dir = camera.position.clone().sub(controls.target);
    const az = dir.lengthSq() > 0 ? Math.atan2(dir.y, dir.x) : (stage === 'c' ? -0.25 : -0.55);
    const el = dir.lengthSq() > 0 ? Math.asin(dir.z / dir.length()) : 0.26;
    controls.target.copy(frame(camera, size || obj.userData.size, { az, el: Math.max(0.05, el), pad: stage === 'c' ? 0.8 : (THUMB ? 0.8 : 0.9) }));
  }
  dirty = true;
}

/* ------------------------------------------------------------- the card -- */

const BODY = ['seg', 'fat', 'len', 'posture', 'legs', 'leglen', 'sym', 'head', 'eyes', 'ears', 'tail', 'snout'];
const tname = k => t(TYPE[k].en, TYPE[k].it);

// the parameters of the type, as the card prints them
function typeLines(m) {
  const p = m.p, i = m.info;
  if (m.type === 'ice') return [`Reiter: α ${p.alpha}, β ${p.beta}, γ ${p.gamma}`, t(`${i.steps} steps, radius ${i.radius} cells`, `${i.steps} passi, raggio ${i.radius} celle`)];
  if (m.type === 'plant') return [t(`stochastic shrub, n = ${i.n}, angle ${p.delta}°`, `arbusto stocastico, n = ${i.n}, angolo ${p.delta}°`), t(`${i.segments} internodes`, `${i.segments} internodi`)];
  if (m.type === 'fire') return [t(`fBm, ${i.octaves} octaves, warp ${p.warp}`, `fBm, ${i.octaves} ottave, deformazione ${p.warp}`), t(`${i.flames} flames`, `${i.flames} fiamme`)];
  if (m.type === 'rock') return [t(`Voronoi, ${i.seeds} seeds in ${i.clusters} clusters`, `Voronoi, ${i.seeds} semi in ${i.clusters} grappoli`), t(`gap ${p.gap}`, `fessura ${p.gap}`)];
  return [`${p.surface}, ${t('period', 'periodo')} ${p.period}`, t(`${i.sails} sails`, `${i.sails} vele`)];
}

let still = null;
function stillShot(canvas) {
  if (!still) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(390, 300, false);
    const sc = new THREE.Scene(); lights(sc);
    still = { r, sc, cam: new THREE.PerspectiveCamera(30, 1.3, 1, 1000) };
  }
  const st = state.s === 'c' ? '3' : state.s, o = creatureObject(meshOf(st, 60));
  still.sc.add(o);
  frame(still.cam, o.userData.size, { pad: 0.86 });
  still.r.render(still.sc, still.cam);
  const x = canvas.getContext('2d'); x.clearRect(0, 0, canvas.width, canvas.height); x.drawImage(still.r.domElement, 0, 0, canvas.width, canvas.height);
  still.sc.remove(o); o.userData.mesh.geometry.dispose();
}

function drawCard() {
  const st = state.s === 'c' ? 3 : +state.s, m = monster(state.seed, state.type, st);
  const nm = names(state.seed, state.type), pal = palette(state.seed, state.type), g = genome(state.seed, state.type);
  const chain = nm.map((n, i) => (i === st - 1 ? `<b>${n}</b>` : `<span>${n}</span>`)).join('<span>→</span>');
  const idx = Object.fromEntries(GENES.map((d, i) => [d.k, i]));
  const genes = BODY.map(k => { const d = GENES[idx[k]], v = g[idx[k]]; return `<div class="gn"><span>${t(d.en, d.it)}</span><span class="bar"><i style="width:${(v / 15 * 100).toFixed(0)}%"></i></span><span>${v}</span></div>`; }).join('');
  const [b1, b2] = beats(state.type), weak = TYPES.filter(k => beats(k).includes(state.type));
  $('card').innerHTML = `<article class="card" style="--c1:${pal.css};--c2:${pal.cssAccent}"><div class="in">
    <div class="top"><span class="name">${nm[st - 1]}</span><span class="no">No. ${String(number(state.seed, state.type)).padStart(3, '0')}</span></div>
    <span class="pill">${t('stage', 'stadio')} ${st} / 3</span><span class="type">${tname(state.type)}</span>
    <div class="pic"><canvas width="390" height="300"></canvas></div>
    <div class="math">${t(TYPE[state.type].math.en, TYPE[state.type].math.it)}: ${typeLines(m).join('; ')}</div>
    <div class="chain">${chain}</div>
    <div class="vs">${t('beats', 'batte')} <b>${tname(b1)}</b>, <b>${tname(b2)}</b> · ${t('loses to', 'perde con')} <b>${tname(weak[0])}</b>, <b>${tname(weak[1])}</b></div>
    <div class="genes">${genes}</div>
    <div class="foot">${t('seed', 'seme')} <span class="code">${state.seed}</span> · ${t('type', 'tipo')} <span class="code">${state.type}</span>${typeParams(state.seed, state.type).mirror ? '' : ' · ' + t('asymmetric parts', 'parti asimmetriche')}</div>
  </div></article>`;
  stillShot($('card').querySelector('canvas'));
}

/* ----------------------------------------------------------- everything -- */

function caption() {
  const nm = names(state.seed, state.type), st = state.s;
  $('cap').innerHTML = `<b>${st === 'c' ? nm.join(' → ') : nm[+st - 1]}</b><br>${tname(state.type)} · ${st === 'c' ? t('the three stages, young to adult', 'i tre stadi, dal piccolo all’adulto') : t(`stage ${st} of 3`, `stadio ${st} di 3`)}`;
  for (const b of $('stages').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.s === st));
  for (const b of $('types').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.t === state.type));
  $('seed').value = state.seed;
  const ps = $('pstage'); if (ps) ps.value = st;
}

function refresh({ view = true } = {}) {
  writeState(SPEC, state); caption();
  if (view) show(state.s);
  if (!THUMB) drawCard();
  $('status').textContent = '';
}

let growing = false;
async function evolve() {
  if (growing) return;
  const from = state.s === 'c' ? 0 : +state.s;
  if (from === 3 || from === 0) { state.s = from === 3 ? 'c' : '1'; refresh(); return; }
  growing = true; $('evolve').disabled = true;
  const to = from + 1, end = meshOf(String(to), 84), size = [end.hi[0] - end.lo[0], end.hi[1] - end.lo[1], end.hi[2]];
  show(String(from), { size });
  const steps = 6;
  for (let k = 1; k < steps; k++) {
    await new Promise(r => setTimeout(r, 20));
    show((from + k / steps).toFixed(3), { fit: false, cells: 56 });
  }
  state.s = String(to); growing = false; $('evolve').disabled = false;
  refresh({ view: false });
  show(state.s, { fit: false });
  glowUntil = performance.now() + 900;
}

function init() {
  setup();
  const tb = $('types');
  for (const k of TYPES) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.t = k;
    b.innerHTML = `<span data-l="en">${TYPE[k].en}</span><span data-l="it" lang="it">${TYPE[k].it}</span>`;
    b.addEventListener('click', () => { state.type = k; refresh(); });
    tb.appendChild(b);
  }
  $('seed').addEventListener('change', () => { state.seed = Math.max(0, Math.min(999999, Math.round(+$('seed').value || 0))); refresh(); });
  $('random').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 100000); refresh(); });
  for (const b of $('stages').querySelectorAll('button')) b.addEventListener('click', () => { state.s = b.dataset.s; refresh(); });
  $('evolve').addEventListener('click', evolve);
  $('share').addEventListener('click', async () => {
    const u = shareUrl(SPEC, state);
    try { await navigator.clipboard.writeText(u); $('status').textContent = t('link copied: ', 'link copiato: ') + u; }
    catch { $('status').textContent = u; }
  });
  printPanel($('print'), {
    size: { value: 70, min: 30, max: 200, what: { en: 'height of the tallest figure', it: 'altezza della figura più alta' } },
    fields: [
      { key: 'stage', type: 'select', label: { en: 'stage', it: 'stadio' }, value: state.s,
        options: [{ value: '1', en: 'stage 1', it: 'stadio 1' }, { value: '2', en: 'stage 2', it: 'stadio 2' }, { value: '3', en: 'stage 3', it: 'stadio 3' }, { value: 'c', en: 'all three', it: 'tutti e tre' }] },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...o, seed: state.seed, type: state.type }] },
    name: o => fileName({ ...o, seed: state.seed, type: state.type }),
    head: 'binary STL, millimetres, a monster typed by mathematics',
    object: 'monster',
    share: () => shareUrl(SPEC, state),
    note: info => `; ${info.overhang}% ${t('overhangs over 45°', 'sporge oltre 45°')}, ${info.overhang <= 4 ? t('no supports needed', 'senza supporti') : t('supports advised', 'supporti consigliati')}`,
  });
  refresh();
  onLang(() => { caption(); if (!THUMB) drawCard(); });
  onTheme(() => { dirty = true; });
  addEventListener('hashchange', () => { Object.assign(state, readState(SPEC)); refresh(); });
}

init();
