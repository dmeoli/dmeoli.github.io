// The page of the cards: the card of the monster of a seed, type and stage,
// drawn as the plate looks against a lamp and as it looks on a table, the
// invariants of its figurine, and the download panel. A worker builds the
// figurine and the face; the state lives in the address.

import { t, lang, onLang, onTheme } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { TYPES, TYPE, names } from '../monsters/model.js';
import { thickness } from '../lithophane/model.js';
import { fileName } from './model.js';

const $ = id => document.getElementById(id);
const SPEC = { type: { def: 'water', values: TYPES }, seed: { def: 21, min: 0, max: 999999, int: true }, s: { def: '3', values: ['1', '2', '3'] } };
const state = readState(SPEC);
const THUMB = new URLSearchParams(location.hash.slice(1)).get('thumb') === '1';
if (THUMB) document.body.classList.add('thumb');
const MU = 1.2, THIN = 0.8, THICK = 3;
let data = null, worker = null, token = 0;

/* --------------------------------------------------------- the drawing -- */

// the plate against a lamp: the light through a thickness t falls as
// exp(-mu t), warm white behind; and on a table: the relief lit from the
// upper left, in the color of the filament
function draw() {
  if (!data) return;
  const { gw, gh, grid } = data, T = new Float32Array(gw * gh);
  for (let i = 0; i < T.length; i++) T[i] = thickness(grid[i], { thin: THIN, thick: THICK, mu: MU });
  const lit = $('lit'), tab = $('table');
  for (const c of [lit, tab]) { c.width = gw; c.height = gh; }
  const a = lit.getContext('2d').createImageData(gw, gh), b = tab.getContext('2d').createImageData(gw, gh);
  const lo = Math.exp(-MU * (THICK - THIN)), px = 88 / gh;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const o = j * gw + i, tr = (Math.exp(-MU * (T[o] - THIN)) - lo) / (1 - lo);
    const v = Math.pow(0.04 + 0.96 * tr, 1 / 2.2);
    a.data[4 * o] = 255 * v; a.data[4 * o + 1] = 236 * v; a.data[4 * o + 2] = 200 * v; a.data[4 * o + 3] = 255;
    const dx = (T[j * gw + Math.min(gw - 1, i + 1)] - T[j * gw + Math.max(0, i - 1)]) / (2 * px);
    const dy = (T[Math.min(gh - 1, j + 1) * gw + i] - T[Math.max(0, j - 1) * gw + i]) / (2 * px);
    const n = [-dx, dy, 1], nl = Math.hypot(...n), s = Math.max(0, (n[0] * -0.5 + n[1] * 0.5 + n[2] * 0.7) / (nl * 0.995));
    const w = 0.55 + 0.45 * s;
    b.data[4 * o] = 238 * w; b.data[4 * o + 1] = 232 * w; b.data[4 * o + 2] = 226 * w; b.data[4 * o + 3] = 255;
  }
  lit.getContext('2d').putImageData(a, 0, 0); tab.getContext('2d').putImageData(b, 0, 0);
}

function stats() {
  if (!data) return;
  const i = data.inv;
  const row = (k, v) => `<div><dt>${k}</dt><dd><b>${v}</b></dd></div>`;
  $('stats').innerHTML = [
    row(t('volume', 'volume'), `${(i.volume / 1000).toFixed(2)} cm³`), row(t('area', 'area'), `${(i.area / 100).toFixed(1)} cm²`),
    row('V', i.V), row('E', i.E), row('F', i.F), row('χ = V − E + F', i.chi),
    row(t('components', 'componenti'), i.comps), row(t('genus', 'genere'), i.genus), row(t('symmetry order', 'ordine di simmetria'), i.sym),
  ].join('');
}

async function build() {
  const my = ++token, msg = { seed: state.seed, type: state.type, stage: state.s, lang: lang(), size: 88, px: 0.3 };
  // headless Chrome with a virtual time budget (the thumbnails) does not run
  // workers: the card is built on the page instead
  if (THUMB) {
    const { cardData } = await import('./model.js');
    data = cardData(msg); draw(); stats();
    return;
  }
  if (worker) worker.terminate();
  worker = new Worker(new URL('./card-worker.js', import.meta.url), { type: 'module' });
  $('status').textContent = t('measuring the figurine and drawing the card…', 'misura della statuina e disegno della carta…');
  worker.onmessage = ({ data: r }) => {
    if (my !== token) return;
    worker.terminate(); worker = null;
    if (r.error) { $('status').textContent = t('failed: ', 'non riuscito: ') + r.error; return; }
    data = r.d; draw(); stats();
    $('status').textContent = '';
    document.body.dataset.ready = '1';
  };
  worker.postMessage(msg);
}

function caption() {
  for (const b of $('stages').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.s === state.s));
  for (const b of $('types').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.t === state.type));
  $('seed').value = state.seed;
  const nm = names(state.seed, state.type)[+state.s - 1];
  $('cap').innerHTML = `<b>${nm}</b> · ${t(TYPE[state.type].en, TYPE[state.type].it)} · ${t('stage', 'stadio')} ${state.s} · <a href="monsters.html#type=${state.type}&seed=${state.seed}&s=${state.s}">${t('the monster in 3D', 'il mostro in 3D')}</a>`;
}

function refresh() { writeState(SPEC, state); caption(); build(); }

function init() {
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
  $('share').addEventListener('click', async () => {
    const u = shareUrl(SPEC, state);
    try { await navigator.clipboard.writeText(u); $('status').textContent = t('link copied: ', 'link copiato: ') + u; }
    catch { $('status').textContent = u; }
  });
  printPanel($('print'), {
    size: { value: 88, min: 60, max: 180, what: { en: 'long side of the card', it: 'lato lungo della carta' } },
    fields: [
      { key: 'thin', label: { en: 'thinnest, mm', it: 'minimo, mm' }, value: THIN, min: 0.5, max: 2, step: 0.1 },
      { key: 'thick', label: { en: 'thickest, mm', it: 'massimo, mm' }, value: THICK, min: 1.5, max: 6, step: 0.1 },
      { key: 'lang', type: 'select', label: { en: 'language of the card', it: 'lingua della carta' }, value: lang(),
        options: [{ value: 'en', en: 'English', it: 'inglese' }, { value: 'it', en: 'Italian', it: 'italiano' }] },
    ],
    worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid', args: o => [{ ...o, seed: state.seed, type: state.type, stage: state.s }] },
    name: o => fileName({ ...o, seed: state.seed, type: state.type, stage: state.s }),
    head: 'binary STL, millimetres, a monster card as a lithophane',
    object: 'monster card',
    share: () => shareUrl(SPEC, state),
  });
  refresh();
  onLang(() => { caption(); stats(); build(); });
  onTheme(draw);
  addEventListener('hashchange', () => { Object.assign(state, readState(SPEC)); refresh(); });
}

init();
