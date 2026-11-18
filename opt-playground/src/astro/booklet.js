// The booklet of a chart (astro-booklet.html): the chart comes from the hash
// that the scene writes (src/astro/state.js), the year ahead starts on the
// date of the field (y in the hash, today if absent); portrait.js assembles
// the text, and this page lays it out as a cover with the wheel and the data,
// a preface, the chapters, the timeline of the transits, the tables and the
// list of the factors, for the screen and for A4 paper. Nothing leaves the
// browser.

import { chart, civilToUtc, HOUSE_SYSTEMS, GLYPH, ASPECTS } from './core.js';
import { drawWheel } from './wheel.js';
import { positionsTable, cuspsTable, aspectsTable } from './tables.js';
import { EXAMPLE, readHash, toHash } from './state.js';
import { portrait, ready, label, fmtDate } from './portrait.js';
import { t, lang, onLang } from '../i18n.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const state = { ...EXAMPLE };
readHash(location.hash, state);
if (!state.year) state.year = today();
let ch = null, civil = null, B = null;

function compute() {
  const [y, mo, d] = state.date.split('-').map(Number), [h, mi, s] = state.time.split(':').map(Number);
  civil = civilToUtc(y, mo, d, h, mi, s || 0, state.zone);
  ch = chart(civil.ms, +state.lat, +state.lon, { houses: state.houses, node: state.node });
}
const fromMs = () => { const [y, m, d] = state.year.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/* ----------------------------------------------------------- cover ---- */

function cover() {
  drawWheel($('wheel'), ch);
  const offs = m => `UTC${m < 0 ? '−' : '+'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
  const u = new Date(civil.ms);
  const ut = `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())} ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}`;
  const H = ch.houses;
  const dt = (en, it, v) => `<div><dt>${t(en, it)}</dt><dd>${v}</dd></div>`;
  $('data').innerHTML =
    dt('date and local time', 'data e ora locale', `${state.date} ${state.time.slice(0, 5)} (${esc(state.zone)}, ${offs(civil.offset)})`) +
    dt('universal time', 'tempo universale', ut) +
    dt('place', 'luogo', `${esc(state.place)} · ${Math.abs(ch.lat).toFixed(2)}°${ch.lat >= 0 ? 'N' : 'S'} ${Math.abs(ch.lon).toFixed(2)}°${ch.lon >= 0 ? 'E' : t('W', 'O')}`) +
    dt('houses', 'case', HOUSE_SYSTEMS[H.used] + (H.failed ? t(` (instead of ${HOUSE_SYSTEMS[H.failed]}, which does not exist at this latitude)`, ` (al posto di ${HOUSE_SYSTEMS[H.failed]}, che a questa latitudine non esiste)`) : '')) +
    dt('year ahead', 'anno che viene', `${fmtDate(B.from, lang())} – ${fmtDate(B.to, lang())}`);
}

/* -------------------------------------------------------- chapters ---- */

function paragraph(p) {
  const w = p.score && p.score !== p.weight ? `${t('weight', 'peso')} ${p.weight} × ${(p.score / p.weight).toFixed(1)}` : `${t('weight', 'peso')} ${p.weight}`;
  const draft = p.status === 'draft' ? ` <span class="st">${t('draft', 'bozza')}</span>` : '';
  const ten = p.tension ? ` <span class="tension">${esc(p.tension.text)}</span>` : '';
  return `<div class="para"><p class="fac"><span>${esc(p.label)}</span><span class="w">${w}${draft}</span></p><p>${esc(p.text)}${ten}</p></div>`;
}

function chapters() {
  $('chapters').innerHTML = B.chapters.map((c, i) => `<section class="sheet chapter" id="ch-${c.id}">
    <p class="num">${t('Chapter', 'Capitolo')} ${i + 1}</p><h2>${esc(c.title)}</h2><p class="sub">${esc(c.sub)}</p>
    ${c.id === 'year' ? `<figure class="timeline"><svg id="timeline" role="img"></svg><figcaption>${t(
      'The slow planets within one degree of a point of the chart in the twelve months: a bar while the aspect is within the orb, a dot on each day it is exact (a planet that turns back can make the same aspect two or three times); the transits told in the text are in bold.',
      'I pianeti lenti a meno di un grado da un punto della carta nei dodici mesi: una barra finché l\'aspetto è entro l\'orbita, un punto in ogni giorno in cui è esatto (un pianeta che torna indietro può formare lo stesso aspetto due o tre volte); in grassetto i transiti raccontati nel testo.')}</figcaption></figure>` : ''}
    ${c.paras.map(paragraph).join('')}${c.empty ? `<p class="empty">${esc(c.empty)}</p>` : ''}</section>`).join('');
  $('toc').innerHTML = B.chapters.map(c => `<li><a href="#ch-${c.id}">${esc(c.title)}</a></li>`).join('') +
    `<li><a href="#tables">${t('The chart in numbers', 'La carta in numeri')}</a></li><li>${t('Every factor and its weight', 'Tutti i fattori e il loro peso')}</li>`;
  $('drafts').textContent = t(`This copy prints ${B.paragraphs} paragraphs, ${B.drafts} of them from fragments still marked as drafts, i.e., not yet reviewed.`,
    `Questa copia stampa ${B.paragraphs} paragrafi, ${B.drafts} dei quali da frammenti ancora segnati come bozze, cioè non ancora rivisti.`);
  timeline();
}

// the timeline of the year ahead: the ten heaviest transits, one row each
function timeline() {
  const svg = $('timeline');
  if (!svg) return;
  const told = new Set(B.chapters.find(c => c.id === 'year').paras.map(p => p.transit));
  const rows = B.transits.list.slice(0, 10).sort((a, b) => a.windows[0][0] - b.windows[0][0]);
  if (!rows.length) { svg.closest('figure').remove(); return; }
  const W = 720, left = 268, right = 12, top = 38, rh = 22, H = top + rows.length * rh + 6;
  const x = ms => left + (W - left - right) * (ms - B.from) / (B.to - B.from);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let s = '';
  // the months
  const d = new Date(B.from);
  for (let k = 0; k <= 12; k++) {
    const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
    if (ms < B.from || ms > B.to) continue;
    s += `<line class="tl-grid" x1="${x(ms).toFixed(1)}" x2="${x(ms).toFixed(1)}" y1="${top - 6}" y2="${H - 4}"/>`;
    const m = new Date(ms);
    if (x(ms) < W - right - 14) s += `<text class="tl-month" x="${(x(ms) + 2).toFixed(1)}" y="${top - 10}">${fmtDate(ms, lang()).split(' ')[1]}</text>`;
    // the year over its first month, and over the first month shown
    if (m.getUTCMonth() === 0 || k <= 1 && x(ms) < left + 40) s += `<text class="tl-month tl-year" x="${(x(ms) + 2).toFixed(1)}" y="${top - 24}">${m.getUTCFullYear()}</text>`;
  }
  const fam = { conj: 'conj', flow: 'flow', tension: 'tension' };
  rows.forEach((e, i) => {
    const y = top + i * rh + rh / 2;
    const A = ASPECTS.find(a => a.key === e.type);
    const name = n => t(n === 'Asc' ? 'Ascendant' : n === 'MC' ? 'Midheaven' : n, ({ Sun: 'Sole', Moon: 'Luna', Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Nettuno', Pluto: 'Plutone', Asc: 'Ascendente', MC: 'Medio cielo' })[n]);
    s += `<text class="tl-lab${told.has(e) ? ' told' : ''}" x="0" y="${y}"><tspan class="tl-g">${GLYPH[e.planet]} ${A.glyph} ${e.target === 'Asc' ? 'AC' : GLYPH[e.target]}</tspan> ${name(e.planet)} ${t(A.en, A.it)} ${name(e.target)}</text>`;
    s += `<line class="tl-row" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/>`;
    for (const [a, b] of e.windows) s += `<rect class="tl-bar ${fam[e.family]}" x="${x(a).toFixed(1)}" y="${y - 5}" width="${Math.max(1.5, x(b) - x(a)).toFixed(1)}" height="10" rx="3"/>`;
    for (const ms of e.exact) s += `<circle class="tl-dot ${fam[e.family]}" cx="${x(ms).toFixed(1)}" cy="${y}" r="4"><title>${fmtDate(ms, lang())}</title></circle>`;
  });
  svg.innerHTML = s;
}

/* ---------------------------------------------------------- tables ---- */

function tables() {
  $('positions').innerHTML = positionsTable(ch);
  $('cusps').innerHTML = cuspsTable(ch);
  $('aspects').innerHTML = aspectsTable(ch);
  document.querySelector('.data-sheet').id = 'tables';
  const title = Object.fromEntries(B.chapters.map(c => [c.id, c.title]));
  let h = `<thead><tr><th>${t('factor', 'fattore')}</th><th class="num">${t('weight', 'peso')}</th><th>${t('told in', 'raccontato in')}</th></tr></thead><tbody>`;
  for (const f of B.factors.items) {
    const where = B.told[f.key];
    h += `<tr${where ? ' class="told"' : ''}><td>${esc(label(f, lang()))}</td><td class="num">${f.weight}</td><td>${where ? esc(title[where]) : '–'}</td></tr>`;
  }
  $('factors').innerHTML = h + '</tbody>';
}

/* ------------------------------------------------------------ start ---- */

function render() {
  B = portrait(ch, lang(), fromMs());
  if (!B) return;
  cover(); chapters(); tables();
  $('back').href = 'astro-chart.html' + toHash({ ...state, year: '' });
}

$('year').value = state.year;
$('year').addEventListener('change', () => {
  if (!/^\d{4}-\d\d-\d\d$/.test($('year').value)) return;
  state.year = $('year').value;
  history.replaceState(null, '', toHash(state));
  render();
});
$('print').addEventListener('click', () => window.print());
compute();
await ready;
render();
onLang(render);
// for the checks in headless Chrome
window.__booklet = { get booklet() { return B; }, get chart() { return ch; }, state, render, rendered: true };
