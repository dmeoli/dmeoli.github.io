// The analemma (sky-analemma.html): the Sun at the same mean time of day
// through one year, seen from a latitude on the meridian of Greenwich (the
// local mean time of any other meridian gives the same figure), the equation
// of time with its two parts, and the figure drawn by the equation of time
// against the declination, with the figures that each part alone would draw.

import * as S from './core.js';
import { $, el, clear, path, readState, writeState, clock, dateStr } from './ui.js';
import { t, onLang, onTheme } from '../i18n.js';

const A = () => globalThis.Astronomy;
const W = 400, C = W / 2;
const state = readState({ lat: 45, hour: 12, year: 2026 });
let data = null;

function build() {
  const y = state.year, ms0 = Date.UTC(y, 0, 1), n = Math.round((Date.UTC(y + 1, 0, 1) - ms0) / 864e5);
  const obs = new (A().Observer)(state.lat, 0, 0), days = [];
  for (let d = 0; d < n; d++) {
    const ms = ms0 + d * 864e5 + state.hour * 36e5, tm = S.timeOf(ms);
    const eq = A().Equator('Sun', tm, obs, true, true), hor = A().Horizon(tm, obs, eq.ra, eq.dec, null);
    days.push({ ms, az: hor.azimuth, alt: hor.altitude, dec: eq.dec, ...S.equationOfTime(ms) });
  }
  const mx = days.reduce((a, b) => (b.total > a.total ? b : a)), mn = days.reduce((a, b) => (b.total < a.total ? b : a));
  data = { days, mx, mn, ms0 };
}
const idx = u => Math.min(data.days.length - 1, Math.round(u * (data.days.length - 1)));
const MONTH0 = d => new Date(d.ms).getUTCDate() === 1;

// on the sky: azimuth across (from the east on the left to the west on the
// right, facing south or, south of the equator, facing north) and altitude up,
// in degrees on the same scale, the horizon at the foot
function drawSky(u) {
  const svg = $('sky'); clear(svg);
  const ds = data.days, k = idx(u), south = state.lat >= 0;
  const azc = south ? 180 : 0, rel = a => S.delta(azc, a);   // west positive
  const xs = ds.map(d => rel(d.az)), ys = ds.map(d => d.alt);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0) * 1.12 + 2, sc = (W - 70) / span;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const X = a => C + (a - cx) * sc, Y = h => C - (h - cy) * sc;
  const gs = span > 80 ? 20 : span > 40 ? 10 : 5;
  for (let a = Math.ceil((cx - span / 2) / gs) * gs; a <= cx + span / 2; a += gs) {
    el('line', { x1: X(a), y1: 20, x2: X(a), y2: W - 30, class: 's-grid' }, svg);
    el('text', { x: X(a), y: W - 14, class: 's-lab mid' }, svg, `${S.norm(azc + a).toFixed(0)}°`);
  }
  for (let h = Math.ceil((cy - span / 2) / gs) * gs; h <= cy + span / 2; h += gs) {
    if (Y(h) < 20 || Y(h) > W - 30) continue;
    el('line', { x1: 30, y1: Y(h), x2: W - 10, y2: Y(h), class: h === 0 ? 's-axis' : 's-grid' }, svg);
    el('text', { x: 26, y: Y(h) + 4, class: 's-lab end' }, svg, `${h}°`);
  }
  if (Y(0) < W - 30) el('rect', { x: 30, y: Y(0), width: W - 40, height: W - 30 - Y(0), class: 's-retro', style: 'fill:var(--ink-soft)' }, svg);
  el('path', { d: path(ds.map(d => [X(rel(d.az)), Y(d.alt)])) + 'Z', class: 's-orbit' }, svg);
  for (let i = 0; i <= k; i++) {
    const d = ds[i];
    el('circle', { cx: X(rel(d.az)), cy: Y(d.alt), r: MONTH0(d) ? 3.2 : 1.6, class: MONTH0(d) ? 's-sun' : 'a-dot' }, svg);
  }
  for (const d of ds.filter(MONTH0).slice(0, 12)) if (d.ms <= ds[k].ms) {
    const right = rel(d.az) >= cx;
    el('text', { x: X(rel(d.az)) + (right ? 8 : -8), y: Y(d.alt) + 4, class: 's-lab s-halo' + (right ? '' : ' end') }, svg, dateStr(d.ms, false));
  }
  const d = ds[k];
  el('circle', { cx: X(rel(d.az)), cy: Y(d.alt), r: 6, class: 's-sun' }, svg);
  el('text', { x: 34, y: 34, class: 's-lab' }, svg, south ? t('facing south', 'verso sud') : t('facing north', 'verso nord'));
}

// the equation of time through the year, and its two parts
function drawEot(u) {
  const svg = $('eot'); clear(svg);
  const ds = data.days, k = idx(u), L = 40, R = 390, T = 20, B = 360;
  const X = i => L + i / (ds.length - 1) * (R - L), Y = m => C - 4 + -m * (B - T) / 44;
  for (let m = -20; m <= 20; m += 5) {
    el('line', { x1: L, y1: Y(m), x2: R, y2: Y(m), class: m === 0 ? 's-axis' : 's-grid' }, svg);
    el('text', { x: L - 6, y: Y(m) + 4, class: 's-lab end' }, svg, `${m > 0 ? '+' : ''}${m}`);
  }
  ds.forEach((d, i) => { if (MONTH0(d)) { el('line', { x1: X(i), y1: B, x2: X(i), y2: B + 5, class: 's-axis' }, svg); el('text', { x: X(i) + 14, y: B + 18, class: 's-lab mid' }, svg, dateStr(d.ms, false).split(' ')[1]); } });
  el('text', { x: L - 30, y: T - 6, class: 's-lab' }, svg, t('minutes', 'minuti'));
  el('path', { d: path(ds.map((d, i) => [X(i), Y(d.ecc)])), class: 's-earth-l', style: 'stroke-dasharray:5 3' }, svg);
  el('path', { d: path(ds.map((d, i) => [X(i), Y(d.obl)])), class: 's-model-l', style: 'stroke-width:1.5;stroke-dasharray:2 3' }, svg);
  el('path', { d: path(ds.map((d, i) => [X(i), Y(d.total)])), class: 's-orbit', style: 'opacity:.6' }, svg);
  el('path', { d: path(ds.slice(0, k + 1).map((d, i) => [X(i), Y(d.total)])), class: 's-accent-l' }, svg);
  for (const e of [data.mx, data.mn]) {
    const i = ds.indexOf(e);
    el('circle', { cx: X(i), cy: Y(e.total), r: 3, class: 'r-ev' }, svg);
    el('text', { x: X(i), y: Y(e.total) + (e.total > 0 ? -10 : 18), class: 's-lab mid s-halo strong' }, svg, `${e.total > 0 ? '+' : '−'}${fmtMin(e.total)}`);
  }
  el('line', { x1: X(k), y1: T, x2: X(k), y2: B, class: 'd-now' }, svg);
}
const fmtMin = m => { const a = Math.abs(m), mm = Math.floor(a), ss = Math.round((a - mm) * 60); return ss === 60 ? `${mm + 1}m00s` : `${mm}m${String(ss).padStart(2, '0')}s`; };

// the equation of time (as an angle, 4 minutes to the degree) against the
// declination: the analemma without the horizon, and the two figures that
// each part would draw alone
function drawFig(u) {
  const svg = $('fig'); clear(svg);
  const ds = data.days, k = idx(u), sc = (W - 80) / 52;
  // across the minutes of the equation of time, on a scale of their own
  const Y = dd => C - dd * sc, XX = m => C + 10 + m * 8.5;
  for (let dd = -20; dd <= 20; dd += 10) {
    el('line', { x1: 30, y1: Y(dd), x2: W - 10, y2: Y(dd), class: dd === 0 ? 's-axis' : 's-grid' }, svg);
    el('text', { x: 26, y: Y(dd) + 4, class: 's-lab end' }, svg, `${dd}°`);
  }
  for (let m = -16; m <= 16; m += 8) {
    el('line', { x1: XX(m), y1: 20, x2: XX(m), y2: W - 30, class: m === 0 ? 's-axis' : 's-grid' }, svg);
    el('text', { x: XX(m), y: W - 14, class: 's-lab mid' }, svg, `${m > 0 ? '+' : ''}${m}m`);
  }
  el('path', { d: path(ds.map(d => [XX(d.ecc), Y(d.dec)])) + 'Z', class: 's-earth-l', style: 'stroke-dasharray:5 3' }, svg);
  el('path', { d: path(ds.map(d => [XX(d.obl), Y(d.dec)])) + 'Z', class: 's-model-l', style: 'stroke-width:1.5;stroke-dasharray:2 3' }, svg);
  el('path', { d: path(ds.map(d => [XX(d.total), Y(d.dec)])) + 'Z', class: 's-orbit', style: 'opacity:.6' }, svg);
  el('path', { d: path(ds.slice(0, k + 1).map(d => [XX(d.total), Y(d.dec)])), class: 's-accent-l' }, svg);
  const d = ds[k];
  el('circle', { cx: XX(d.total), cy: Y(d.dec), r: 5, class: 's-sun' }, svg);
  el('text', { x: 34, y: 34, class: 's-lab' }, svg, t('declination ↑, minutes →', 'declinazione ↑, minuti →'));
}

function info(u) {
  const d = data.days[idx(u)];
  $('info').innerHTML = `<div><dt>${t('date (UT)', 'data (UT)')}</dt><dd>${dateStr(d.ms)}</dd></div>
    <div><dt>${t('altitude', 'altezza')}</dt><dd>${d.alt.toFixed(1)}°</dd></div>
    <div><dt>${t('azimuth', 'azimut')}</dt><dd>${d.az.toFixed(1)}°</dd></div>
    <div><dt>${t('declination', 'declinazione')}</dt><dd>${d.dec >= 0 ? '+' : '−'}${Math.abs(d.dec).toFixed(2)}°</dd></div>
    <div><dt>${t('equation of time', 'equazione del tempo')}</dt><dd>${d.total >= 0 ? '+' : '−'}${fmtMin(d.total)}</dd></div>`;
  $('latout').value = `${state.lat.toFixed(0)}°`; $('hourout').value = `${String(Math.floor(state.hour)).padStart(2, '0')}:${String(Math.round((state.hour % 1) * 60)).padStart(2, '0')}`;
}

function table() {
  const ds = data.days, rows = [];
  // the zeros of the equation of time and its four extremes
  for (let i = 1; i < ds.length - 1; i++) {
    const a = ds[i - 1].total, b = ds[i].total, c = ds[i + 1].total;
    if ((b >= a && b > c) || (b <= a && b < c)) rows.push([b >= a && b > c ? t('maximum', 'massimo') : t('minimum', 'minimo'), ds[i]]);
    if (a * b < 0 || (b === 0 && a !== 0)) rows.push([t('zero', 'zero'), ds[i]]);
  }
  rows.sort((x, y) => x[1].ms - y[1].ms);
  $('extremes').innerHTML = `<tr><th>${t('point', 'punto')}</th><th>${t('date', 'data')}</th><th class="num">${t('equation', 'equazione')}</th><th class="num">${t('eccentricity', 'eccentricità')}</th><th class="num">${t('obliquity', 'obliquità')}</th></tr>` +
    rows.map(([n, d]) => `<tr><td>${n}</td><td>${dateStr(d.ms, false)}</td><td class="num">${d.total >= 0 ? '+' : '−'}${fmtMin(d.total)}</td><td class="num">${d.ecc >= 0 ? '+' : '−'}${Math.abs(d.ecc).toFixed(2)}m</td><td class="num">${d.obl >= 0 ? '+' : '−'}${Math.abs(d.obl).toFixed(2)}m</td></tr>`).join('');
}

let clk;
function frame(u) { drawSky(u); drawEot(u); drawFig(u); info(u); }
function recompute() { build(); table(); writeState(state); frame(clk.u); }
clk = clock({ seconds: 14, step: 1 / 24, onFrame: frame, home: 0 });
build(); table(); writeState(state);
$('lat').value = state.lat; $('hour').value = state.hour;
clk.set(1);
$('lat').addEventListener('input', () => { state.lat = +$('lat').value; recompute(); });
$('hour').addEventListener('input', () => { state.hour = +$('hour').value; recompute(); });
onLang(() => { table(); frame(clk.u); });
onTheme(() => frame(clk.u));
