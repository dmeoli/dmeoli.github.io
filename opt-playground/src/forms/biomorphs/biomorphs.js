// The page of the biomorphs: the parent turning in 3D, its litter of eight
// mutants in a grid around it, the lineage, the card and the download panel.
// The state (genome, stage, ancestors) lives in the address, so that a link
// brings back the same creature and the same history.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang, onTheme } from '../../i18n.js';
import { printPanel } from '../../print/index.js';
import { GALLERY, GENES, encode, decode, fromSeed, litter, names, number, kind, palette, fileName } from './model.js';
import { meshOf, creatureObject, lights, frame, stills } from './view.js';

const $ = id => document.getElementById(id);


const state = { g: decode(GALLERY[0].code), stage: '3', anc: [], roll: 0, genes: 1 };

/* ---------------------------------------------------------- the address -- */

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const g = decode(q.get('g'));
  if (g) state.g = g;
  else if (q.has('seed')) state.g = fromSeed(+q.get('seed'));
  if (['1', '2', '3', 'c'].includes(q.get('s'))) state.stage = q.get('s');
  state.anc = (q.get('a') || '').split('.').map(decode).filter(Boolean);
  state.roll = +q.get('r') || 0;
}
function writeHash() {
  const a = state.anc.slice(-24).map(encode).join('.');
  const h = `g=${encode(state.g)}&s=${state.stage}` + (a ? `&a=${a}` : '') + (state.roll ? `&r=${state.roll}` : '');
  history.replaceState(null, '', '#' + h);
}

/* ------------------------------------------------------------- the view -- */

let renderer, scene, camera, controls, obj = null, dirty = true, glowUntil = 0;
function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.appendChild(renderer.domElement);
  const hint = document.createElement('div'); hint.className = 'hint'; stage.appendChild(hint);
  const sayHint = () => { hint.textContent = t('drag to turn, wheel or pinch to zoom', 'trascinare per ruotare, rotella o pizzico per lo zoom'); };
  sayHint(); onLang(sayHint);
  scene = new THREE.Scene(); lights(scene);
  camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = stage.clientWidth, h = Math.round(Math.min(w * 0.82, 560));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = now => {
    if (controls.update()) dirty = true;
    if (obj && glowUntil) {
      const left = (glowUntil - now) / 900;
      obj.userData.mesh.material.emissiveIntensity = left > 0 ? 0.55 * Math.sin(Math.PI * Math.min(1, left)) : 0;
      if (left <= 0) glowUntil = 0;
      dirty = true;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// show the creature (stage may be a number between 1 and 3 while it grows);
// `fit` the camera to `size`, keeping the direction the user turned it to
function show(g, stage, { fit = true, size = null, cells = 84 } = {}) {
  const m = meshOf(g, stage, cells), o = creatureObject(m);
  if (obj) { scene.remove(obj); obj.userData.mesh.geometry.dispose(); obj.userData.mesh.material.dispose(); }
  obj = o; scene.add(obj);
  if (fit) {
    const dir = camera.position.clone().sub(controls.target);
    const az = dir.lengthSq() > 0 ? Math.atan2(dir.y, dir.x) : (stage === 'c' ? -0.2 : -0.5);
    const el = dir.lengthSq() > 0 ? Math.asin(dir.z / dir.length()) : 0.28;
    const target = frame(camera, size || obj.userData.size, { az, el: Math.max(0.05, el), pad: stage === 'c' ? 0.8 : 0.9 });
    controls.target.copy(target);
  }
  dirty = true;
}

/* ------------------------------------------------- the litter and lineage -- */

const shoot = stills(260);
let kids = [], token = 0;
const idle = () => new Promise(r => setTimeout(r, 0));
const stillStage = () => (state.stage === 'c' ? '3' : state.stage);

// what a child changed, e.g. "horns +1"
function diff(a, b) {
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(`${t(GENES[i].en, GENES[i].it)} ${b[i] > a[i] ? '+' : '−'}${Math.abs(b[i] - a[i])}`);
  return out.join(', ');
}

async function drawLitter() {
  const my = ++token, box = $('litter');
  kids = litter(state.g, `${state.anc.length}:${state.roll}`, 8, { genes: state.genes, step: 1 });
  box.replaceChildren();
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const parent = i === 4, k = parent ? null : kids[i < 4 ? i : i - 1];
    const el = document.createElement(parent ? 'div' : 'button');
    if (parent) el.className = 'parent'; else el.type = 'button';
    const c = document.createElement('canvas'); c.width = c.height = 260;
    const who = document.createElement('div'); who.className = 'who';
    who.textContent = parent ? t('parent', 'genitore') : names(k)[Math.min(2, +stillStage() - 1)];
    el.append(c, who);
    if (!parent) {
      const gd = document.createElement('div'); gd.className = 'gene'; gd.textContent = diff(state.g, k); el.appendChild(gd);
      el.title = gd.textContent;
      el.setAttribute('aria-label', `${who.textContent}: ${gd.textContent}`);
      el.addEventListener('click', () => choose(k));
    }
    box.appendChild(el); cells.push([el, c, parent ? state.g : k]);
  }
  for (const [, c, g] of [cells[4], ...cells.filter((_, i) => i !== 4)]) {
    await idle();
    if (my !== token) return;
    shoot(g, stillStage(), c, 46);
  }
}

async function drawLineage() {
  const box = $('lineage'), list = [...state.anc.slice(-14), state.g], skip = state.anc.length - (list.length - 1);
  box.replaceChildren();
  const my = token, todo = [];
  list.forEach((g, i) => {
    if (i > 0) { const a = document.createElement('span'); a.className = 'arrow'; a.textContent = '→'; box.appendChild(a); }
    const b = document.createElement('button'); b.type = 'button';
    const c = document.createElement('canvas'); c.width = c.height = 144;
    const s = document.createElement('small'); s.textContent = `${t('gen.', 'gen.')} ${skip + i}`;
    b.append(c, s); b.title = names(g)[2];
    if (i === list.length - 1) b.className = 'now';
    else b.addEventListener('click', () => { state.anc = state.anc.slice(0, skip + i); state.g = g; state.roll = 0; refresh(); });
    box.appendChild(b); todo.push([c, g]);
  });
  box.scrollLeft = box.scrollWidth;
  for (const [c, g] of todo.reverse()) { await idle(); if (my !== token) return; shoot(g, '3', c, 40); }
}

function choose(k) {
  state.anc.push(state.g); state.g = k; state.roll = 0;
  refresh();
}

/* ------------------------------------------------------------- the card -- */

let cardShot = null;
function drawCard() {
  const g = state.g, nm = names(g), st = stillStage(), pal = palette(g), si = +st - 1;
  const host = $('card');
  const genes = GENES.map((d, i) => `<div class="gn"><span>${t(d.en, d.it)}</span><span class="bar"><i style="width:${(g[i] / 15 * 100).toFixed(0)}%"></i></span><span>${g[i]}</span></div>`).join('');
  const kinds = kind(g).map(([en, it]) => t(en, it)).join(' · ');
  const chain = nm.map((n, i) => (i === si ? `<b>${n}</b>` : `<span>${n}</span>`)).join('<span>→</span>');
  const anc = state.anc.slice(-4).reverse().map(a => names(a)[2]).join(' ← ');
  host.innerHTML = `<article class="card" style="--c1:${pal.css};--c2:${pal.cssAccent}"><div class="in">
    <div class="top"><span class="name">${nm[si]}</span><span class="no">No. ${String(number(g)).padStart(3, '0')}</span></div>
    <span class="pill">${t('stage', 'stadio')} ${st} / 3</span>
    <div class="pic"><canvas width="390" height="300"></canvas></div>
    <div class="kinds">${kinds || t('plain', 'semplice')}</div>
    <div class="chain">${chain}</div>
    <div class="genes">${genes}</div>
    <div class="foot">${t('generation', 'generazione')} ${state.anc.length}${anc ? ` · ${t('ancestors', 'antenati')}: ${anc}` : ''}<br>
    ${t('genome', 'genoma')} <span class="code">${encode(g)}</span></div>
  </div></article>`;
  const c = host.querySelector('canvas');
  if (!cardShot) cardShot = stills(360);
  // a square still, in the middle of the canvas
  const sq = document.createElement('canvas'); sq.width = sq.height = 360;
  cardShot(g, st, sq, 70);
  c.getContext('2d').drawImage(sq, 45, 0, 300, 300);
}

/* ----------------------------------------------------------- everything -- */

function caption() {
  const nm = names(state.g), st = state.stage;
  const what = st === 'c' ? nm.join(' → ') : nm[+st - 1];
  $('cap').innerHTML = `<b>${what}</b><br>${st === 'c' ? t('the three stages, young to adult', 'i tre stadi, dal piccolo all’adulto') : t(`stage ${st} of 3`, `stadio ${st} di 3`)} · ${t('generation', 'generazione')} ${state.anc.length}`;
  $('back').disabled = state.anc.length === 0;
  $('evolve').disabled = false;
  for (const b of $('stages').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.s === st));
  const ps = $('pstage'); if (ps) ps.value = st;
}

function refresh({ view = true } = {}) {
  writeHash(); caption();
  if (view) show(state.g, state.stage);
  drawLitter(); drawLineage(); drawCard();
  $('status').textContent = '';
}

// grow from the shown stage to the next, drawing the stages in between
let growing = false;
async function evolve() {
  if (growing) return;
  const from = state.stage === 'c' ? 0 : +state.stage;
  if (from === 3 || from === 0) { setStage(from === 3 ? 'c' : '1'); return; }
  growing = true; $('evolve').disabled = true;
  const to = from + 1, end = meshOf(state.g, to, 84), size = [end.hi[0] - end.lo[0], end.hi[1] - end.lo[1], end.hi[2]];
  show(state.g, from, { size });
  const steps = 7;
  for (let k = 1; k <= steps; k++) {
    await new Promise(r => setTimeout(r, 30));
    const s = from + k / steps;
    show(state.g, k === steps ? to : +s.toFixed(3), { fit: false, cells: k === steps ? 84 : 60 });
  }
  glowUntil = performance.now() + 900;
  state.stage = String(to); growing = false;
  refresh({ view: false });
  show(state.g, state.stage);
  glowUntil = performance.now() + 900;
}

function setStage(s) { state.stage = s; refresh(); }

function init() {
  readHash(); setup();
  const gal = $('gallery');
  const galNames = () => {
    gal.replaceChildren(new Option('—', ''));
    GALLERY.forEach((x, i) => gal.appendChild(new Option(t(x.en, x.it), String(i))));
    const i = GALLERY.findIndex(x => x.code === encode(state.g)); gal.value = i >= 0 ? String(i) : '';
  };
  galNames(); onLang(galNames);
  gal.addEventListener('change', () => { if (gal.value === '') return; state.g = decode(GALLERY[+gal.value].code); state.anc = []; state.roll = 0; refresh(); });
  const fromSeedBox = () => { state.g = fromSeed(+$('seed').value || 0); state.anc = []; state.roll = 0; gal.value = ''; refresh(); };
  $('seed').addEventListener('change', fromSeedBox);
  $('random').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 100000); fromSeedBox(); });
  for (const b of $('stages').querySelectorAll('button')) b.addEventListener('click', () => setStage(b.dataset.s));
  $('genes').addEventListener('change', e => { state.genes = +e.target.value; drawLitter(); });
  $('evolve').addEventListener('click', evolve);
  $('back').addEventListener('click', () => { if (state.anc.length) { state.g = state.anc.pop(); state.roll = 0; refresh(); } });
  $('litterBtn').addEventListener('click', () => { state.roll++; writeHash(); drawLitter(); });
  $('share').addEventListener('click', async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); $('status').textContent = t('link copied: ', 'link copiato: ') + location.href; }
    catch { $('status').textContent = location.href; }
  });
  $('printcard').addEventListener('click', () => window.print());
  printPanel($('print'), {
    size: { value: 70, min: 30, max: 200, what: { en: 'height of the tallest figure', it: 'altezza della figura più alta' } },
    fields: [
      { key: 'stage', type: 'select', label: { en: 'stage', it: 'stadio' }, value: state.stage,
        options: [{ value: '1', en: 'stage 1', it: 'stadio 1' }, { value: '2', en: 'stage 2', it: 'stadio 2' }, { value: '3', en: 'stage 3', it: 'stadio 3' }, { value: 'c', en: 'all three', it: 'tutti e tre' }] },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
      { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: true },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...o, code: encode(state.g) }] },
    name: o => fileName({ ...o, code: encode(state.g) }),
    head: 'binary STL, millimetres, a biomorph',
    object: 'biomorph',
    note: info => `; ${info.overhang}% ${t('overhangs over 45°', 'sporge oltre 45°')}, ${info.overhang <= 4 ? t('no supports needed', 'senza supporti') : t('supports advised', 'supporti consigliati')}`,
  });
  refresh();
  onLang(() => { caption(); drawCard(); drawLitter(); drawLineage(); });
  onTheme(() => { dirty = true; });
  addEventListener('hashchange', () => { readHash(); refresh(); });
}

init();
