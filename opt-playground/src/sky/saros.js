// The Saros cycle (sky-saros.html): the solar or lunar eclipses of
// 1901-2100 placed by date and by Saros series, a series followed through
// its whole life (the latitude of the Moon at each eclipse, which drifts from
// one pole to the other) and its eclipses on the map of the Earth (the point
// of greatest eclipse for the Sun, the point under the Moon for the Moon).
// Eclipses from Astronomy Engine; series numbered as in the catalogues of
// Espenak (NASA), checked in tests/sky.html.

import * as S from './core.js';
import { $, el, clear, path, readState, writeState, clock, dateStr, relangOptions } from './ui.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const A = () => globalThis.Astronomy;
const MS0 = Date.UTC(1901, 0, 1), MS1 = Date.UTC(2101, 0, 1);
const state = readState({ kind: 'solar', series: 145 });
const ALL = S.eclipses(MS0, MS1);
const LAND = await (await fetch(new URL('./land.json', import.meta.url))).json();
const KIND = {
  total: ['total', 'totale', '--planet'], annular: ['annular', 'anulare', '--gold'], hybrid: ['hybrid', 'ibrida', '--accent'],
  partial: ['partial', 'parziale', '--ink-soft'], penumbral: ['penumbral', 'penombrale', '--rule']
};
const kname = k => t(KIND[k][0], KIND[k][1]);
let list = [], life = [];

// the members of a series over its whole life, stepping by one Saros from a
// member and searching for an eclipse within two days of the expected time
function seriesLife(start) {
  const find = ms => {
    const e = start.solar ? A().SearchGlobalSolarEclipse(S.timeOf(ms - 5 * 864e5)) : A().SearchLunarEclipse(S.timeOf(ms - 5 * 864e5));
    const p = S.msOf(e.peak);
    return Math.abs(p - ms) < 2 * 864e5 ? describe(e, start.solar) : null;
  };
  const out = [describe(null, start.solar, start)], step = S.SAROS_DAYS * 864e5;
  for (let ms = start.ms, n = 0; n < 120; n++) { const e = find(ms + step); if (!e) break; out.push(e); ms = e.ms; }
  for (let ms = start.ms, n = 0; n < 120; n++) { const e = find(ms - step); if (!e) break; out.unshift(e); ms = e.ms; }
  return out;
}
function describe(e, solar, known = null) {
  if (known) return { ...known, mlat: moonLat(known.ms), ...sub(known) };
  const ms = S.msOf(e.peak), d = { ms, solar, kind: e.kind, lat: e.latitude, lon: e.longitude };
  return { ...d, mlat: moonLat(ms), ...sub(d) };
}
const moonLat = ms => A().EclipticGeoMoon(S.timeOf(ms)).lat;
// the point of the map: greatest eclipse for the Sun (when the axis of the
// shadow touches the Earth), the point with the Moon at the zenith for the Moon
function sub(e) {
  if (e.solar) return Number.isFinite(e.lat) ? { mx: e.lon, my: e.lat } : { mx: NaN, my: NaN };
  const tm = S.timeOf(e.ms), eq = A().Equator('Moon', tm, new (A().Observer)(0, 0, 0), true, true);
  return { mx: S.delta(0, (eq.ra - A().SiderealTime(tm)) * 15), my: eq.dec };
}

function select() {
  list = ALL.filter(e => e.solar === (state.kind === 'solar'));
  const series = [...new Set(list.map(e => e.saros))].sort((a, b) => a - b);
  if (!series.includes(state.series)) state.series = state.kind === 'solar' ? 145 : 123;
  $('series').replaceChildren(...series.map(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; return o; }));
  $('series').value = state.series;
  const kinds = new Set(list.map(e => e.kind));
  for (const li of $('key').children) li.hidden = !kinds.has(li.dataset.k);
  const first = list.find(e => e.saros === state.series);
  life = seriesLife(first);
  writeState(state);
}

/* ----------------------------------------------------------- views ---- */

const yearOf = ms => 1901 + (ms - MS0) / (MS1 - MS0) * 200;
function drawPanel(cut) {
  const svg = $('panel'); clear(svg);
  const series = [...new Set(list.map(e => e.saros))].sort((a, b) => a - b);
  const L = 40, R = 390, T = 16, B = 366, X = ms => L + (ms - MS0) / (MS1 - MS0) * (R - L);
  const rowH = (B - T) / series.length, Y = s => T + (series.indexOf(s) + 0.5) * rowH;
  for (let y = 1901; y <= 2101; y += 50) {
    const x = X(Date.UTC(y - 1, 0, 1));
    el('line', { x1: x, y1: T, x2: x, y2: B, class: 's-grid' }, svg);
    el('text', { x, y: B + 16, class: 's-lab mid' }, svg, y - 1);
  }
  el('rect', { x: L, y: Y(state.series) - rowH / 2, width: R - L, height: rowH, class: 'd-con on' }, svg);
  for (const s of series) if (s % 10 === 0 || s === series[0] || s === series[series.length - 1])
    el('text', { x: L - 5, y: Y(s) + 3.5, class: 's-lab end' }, svg, s);
  for (const e of list) el('circle', { cx: X(e.ms), cy: Y(e.saros), r: e.ms <= cut ? 2.6 : 1.4, style: `fill:var(${KIND[e.kind][2]})`, opacity: e.ms <= cut ? 1 : 0.45 }, svg);
  el('line', { x1: X(cut), y1: T, x2: X(cut), y2: B, class: 'd-now' }, svg);
  el('text', { x: L - 5, y: T - 4, class: 's-lab end' }, svg, 'Saros');
}

function drawMap(cut) {
  const svg = $('smap'); clear(svg);
  const T = 100, H = 200, X = lon => (lon + 180) / 360 * 400, Y = lat => T + (90 - lat) / 180 * H;
  el('rect', { x: 0, y: T, width: 400, height: H, class: 'm-sea' }, svg);
  for (const r of LAND) el('path', { d: path(r.map(([lo, la]) => [X(lo), Y(la)])) + 'Z', class: 'm-land' }, svg);
  for (let lo = -180; lo <= 180; lo += 30) el('line', { x1: X(lo), y1: T, x2: X(lo), y2: T + H, class: 'm-grid' }, svg);
  for (let la = -60; la <= 60; la += 30) el('line', { x1: 0, y1: Y(la), x2: 400, y2: Y(la), class: 'm-grid' + (la === 0 ? ' eq' : '') }, svg);
  // the members of the series: all dots, those of 1901-2100 named, the one
  // nearest before the cursor marked
  const pts = life.filter(e => Number.isFinite(e.mx));
  for (const e of pts) {
    const inRange = e.ms >= MS0 && e.ms < MS1, past = e.ms <= cut && inRange;
    el('circle', { cx: X(e.mx), cy: Y(e.my), r: inRange ? 4 : 2, style: `fill:var(${KIND[e.kind][2]})`, opacity: inRange ? (past ? 1 : 0.5) : 0.35, class: 'm-pt' }, svg);
    if (inRange) el('text', { x: X(e.mx), y: Y(e.my) - 7, class: 's-lab mid s-halo', style: 'font-size:10px' }, svg, new Date(e.ms).getUTCFullYear());
  }
  el('text', { x: 4, y: T - 8, class: 's-lab' }, svg, state.kind === 'solar' ? t('point of greatest eclipse', 'punto di massima eclissi') : t('point with the Moon at the zenith', 'punto con la Luna allo zenit'));
  el('text', { x: 4, y: T + H + 16, class: 's-lab' }, svg, t('Natural Earth, 1:110m', 'Natural Earth, 1:110m'));
}

function drawLife(cut) {
  const svg = $('life'); clear(svg);
  const L = 44, R = 390, T = 20, B = 360, n = life.length;
  const lim = state.kind === 'solar' ? 1.6 : 1.7, ym = Math.max(lim, ...life.map(e => Math.abs(e.mlat))) * 1.05;
  const X = i => L + (i + 0.5) / n * (R - L), Y = b => (T + B) / 2 - b / ym * (B - T) / 2;
  for (let b = -1.5; b <= 1.5; b += 0.5) {
    el('line', { x1: L, y1: Y(b), x2: R, y2: Y(b), class: b === 0 ? 's-axis' : 's-grid' }, svg);
    el('text', { x: L - 6, y: Y(b) + 4, class: 's-lab end' }, svg, `${b > 0 ? '+' : ''}${b.toFixed(1)}°`);
  }
  el('path', { d: path(life.map((e, i) => [X(i), Y(e.mlat)])), class: 's-orbit' }, svg);
  life.forEach((e, i) => {
    const inRange = e.ms >= MS0 && e.ms < MS1;
    el('circle', { cx: X(i), cy: Y(e.mlat), r: inRange ? 4 : 2.6, style: `fill:var(${KIND[e.kind][2]})`, opacity: inRange && e.ms > cut ? 0.5 : 1, class: inRange ? 'm-pt' : '' }, svg);
  });
  const y0 = new Date(life[0].ms).getUTCFullYear(), y1 = new Date(life[n - 1].ms).getUTCFullYear();
  el('text', { x: L, y: B + 18, class: 's-lab' }, svg, String(y0));
  el('text', { x: R, y: B + 18, class: 's-lab end' }, svg, String(y1));
  el('text', { x: (L + R) / 2, y: B + 18, class: 's-lab mid' }, svg, t(`${n} eclipses, one every 18 years 11 days`, `${n} eclissi, una ogni 18 anni e 11 giorni`));
  el('text', { x: L, y: T - 6, class: 's-lab' }, svg, t('latitude of the Moon', 'latitudine della Luna'));
}

function info(cut) {
  const past = list.filter(e => e.ms <= cut), next = list.find(e => e.ms > cut);
  $('info').innerHTML = `<div><dt>${t('date', 'data')}</dt><dd>${dateStr(cut)}</dd></div>
    <div><dt>${t('eclipses so far', 'eclissi finora')}</dt><dd>${past.length} / ${list.length}</dd></div>
    <div><dt>${t('next', 'prossima')}</dt><dd>${next ? `${dateStr(next.ms)}, ${kname(next.kind)}, Saros ${next.saros}` : '—'}</dd></div>`;
}

function tables() {
  const inRange = life.filter(e => e.ms >= MS0 && e.ms < MS1);
  $('members').innerHTML = `<tr><th>${t('date, UT', 'data, UT')}</th><th>${t('type', 'tipo')}</th><th class="num">${t('Moon lat.', 'lat. Luna')}</th><th class="num">${t('map lat.', 'lat. mappa')}</th><th class="num">${t('map lon.', 'lon. mappa')}</th></tr>` +
    inRange.map(e => `<tr><td>${S.ymdhm(e.ms)}</td><td>${kname(e.kind)}</td><td class="num">${e.mlat.toFixed(3)}°</td><td class="num">${Number.isFinite(e.my) ? e.my.toFixed(1) + '°' : '—'}</td><td class="num">${Number.isFinite(e.mx) ? e.mx.toFixed(1) + '°' : '—'}</td></tr>`).join('');
  const count = {};
  for (const e of life) count[e.kind] = (count[e.kind] || 0) + 1;
  const y = ms => { const v = new Date(ms).getUTCFullYear(); return v < 1 ? t(`${1 - v} BC`, `${1 - v} a.C.`) : v; };
  $('summary').innerHTML = `<tr><th>${t('series', 'serie')} ${state.series}</th><th class="num"></th></tr>
    <tr><td>${t('first eclipse', 'prima eclissi')}</td><td class="num">${y(life[0].ms)}</td></tr>
    <tr><td>${t('last eclipse', 'ultima eclissi')}</td><td class="num">${y(life[life.length - 1].ms)}</td></tr>
    <tr><td>${t('length', 'durata')}</td><td class="num">${((life[life.length - 1].ms - life[0].ms) / 864e5 / 365.25).toFixed(0)} ${t('years', 'anni')}</td></tr>` +
    Object.keys(KIND).filter(k => count[k]).map(k => `<tr><td>${kname(k)}</td><td class="num">${count[k]}</td></tr>`).join('') +
    `<tr><td>${t('eclipses in 1901-2100, all series', 'eclissi fra il 1901 e il 2100, tutte le serie')}</td><td class="num">${list.length}</td></tr>`;
}

/* ------------------------------------------------------------ shell ---- */

const cutOf = u => MS0 + u * (MS1 - MS0 - 1);
function frame(u) { const c = cutOf(u); drawPanel(c); drawMap(c); drawLife(c); info(c); }
const clk = clock({ seconds: 30, step: 0.05, onFrame: frame, home: (Date.UTC(2026, 10, 18) - MS0) / (MS1 - MS0) });
function recompute() { select(); tables(); frame(clk.u); }
$('kind').value = state.kind;
select(); tables();
clk.set((Date.UTC(2026, 10, 18) - MS0) / (MS1 - MS0));
$('kind').addEventListener('change', () => { state.kind = $('kind').value; state.series = 0; recompute(); });
$('series').addEventListener('change', () => { state.series = +$('series').value; recompute(); });
relangOptions(lang());
onLang(() => { relangOptions(lang()); tables(); frame(clk.u); });
onTheme(() => frame(clk.u));
