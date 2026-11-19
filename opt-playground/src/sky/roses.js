// Synodic roses (sky-roses.html): the path of a planet around the Earth over
// some years, which for Venus closes almost exactly after 8 years and 5
// inferior conjunctions into a rose of five petals, and the lines between
// the Earth and the planet drawn every few days from above the Sun; the
// near commensurabilities of the periods come from the continued fraction of
// their ratio. Positions from Astronomy Engine in the ecliptic of J2000.

import * as S from './core.js';
import { $, el, clear, path, readState, writeState, clock, dateStr, relangOptions } from './ui.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const W = 400, C = W / 2;
const START = Date.UTC(2020, 0, 1);
const STEP = { Mercury: 0.5, Venus: 1, Mars: 1, Jupiter: 2, Saturn: 2 };
const LINES = { Mercury: 3, Venus: 6, Mars: 8, Jupiter: 12, Saturn: 16 };
const NAME = p => t(p, S.PLANET_IT[p]);
const state = readState({ planet: 'Venus', years: 0 });
let data = null;

// the near return: q synodic periods that last about p years, from the
// convergents of synodic period / year
function cycles(p) {
  const syn = S.synodic(p), yr = S.sidereal('Earth');
  return S.convergents(syn / yr, 8).filter(([a, b]) => b > 0 && a > 0)
    .map(([years, n]) => ({ years, n, days: n * syn - years * yr, drift: 360 * (n * syn - years * yr) / yr }))
    .filter(c => c.years <= 120);
}
const defaultYears = p => { const c = cycles(p).filter(c => c.years >= 2 && c.years <= 40); return c.length ? c[c.length - 1].years : 8; };

function build() {
  const p = state.planet, st = STEP[p], n = Math.round(state.years * 365.25 / st), samples = [];
  for (let i = 0; i <= n; i++) {
    const ms = S.addDays(START, i * st);
    samples.push({ ms, geo: S.geoJ2000(p, ms), earth: S.helio('Earth', ms), planet: S.helio(p, ms) });
  }
  const k = S.inferior(p) ? 'inf' : 'opp';
  const events = S.synodicEvents(p, START, S.addDays(START, state.years * 365.25)).filter(e => e.kind === k);
  data = { p, samples, events };
}

const idx = u => Math.min(data.samples.length - 1, Math.round(u * (data.samples.length - 1)));

function drawGeo(u) {
  const svg = $('geo'); clear(svg);
  const sm = data.samples, k = idx(u), rmax = Math.max(...sm.map(s => Math.hypot(s.geo.x, s.geo.y)));
  const sc = 180 / rmax, X = s => C + sc * s.geo.x, Y = s => C - sc * s.geo.y;
  for (const r of [0.25, 0.5, 0.75, 1]) el('circle', { cx: C, cy: C, r: 180 * r, class: 's-ring' }, svg);
  el('path', { d: path(sm.slice(0, k + 1).map(s => [X(s), Y(s)])), class: 's-planet-l', style: 'stroke-width:1.3' }, svg);
  // the conjunctions (or oppositions) passed, joined in the order of time
  const ev = data.events.filter(e => e.ms <= sm[k].ms).map(e => { const g = S.geoJ2000(data.p, e.ms); return [C + sc * g.x, C - sc * g.y]; });
  if (ev.length > 1) el('path', { d: path(ev), class: 's-accent-l', style: 'stroke-width:1.2;opacity:.8' }, svg);
  for (const [x, y] of ev) el('circle', { cx: x, cy: y, r: 3.5, class: 'r-ev' }, svg);
  // the conjunction (or opposition) just passed, ringed in gold for a while
  const j = recent(u);
  if (j >= 0) el('circle', { cx: ev[j][0], cy: ev[j][1], r: 9, class: 's-gold-l' }, svg);
  el('circle', { cx: C, cy: C, r: 5, class: 's-earth' }, svg);
  el('circle', { cx: X(sm[k]), cy: Y(sm[k]), r: 4.5, class: 's-planet' }, svg);
  el('text', { x: 8, y: W - 10, class: 's-lab' }, svg, t(`rings every ${(rmax / 4).toFixed(2)} AU`, `anelli ogni ${(rmax / 4).toFixed(2)} UA`));
}

function drawHelio(u) {
  const svg = $('helio'); clear(svg);
  const sm = data.samples, k = idx(u), outer = Math.max(S.MEAN[data.p][0], 1), sc = 180 / (outer * 1.07);
  const X = v => C + sc * v.x, Y = v => C - sc * v.y, every = Math.max(1, Math.round(LINES[data.p] / STEP[data.p]));
  const n = Math.floor(k / every) + 1, op = Math.max(0.12, Math.min(0.6, 60 / n));
  let d = '';
  for (let i = 0; i <= k; i += every) { const s = sm[i]; d += `M${X(s.earth).toFixed(1)},${Y(s.earth).toFixed(1)}L${X(s.planet).toFixed(1)},${Y(s.planet).toFixed(1)}`; }
  el('path', { d, class: 'r-line', style: `opacity:${op}` }, svg);
  for (const b of ['Earth', data.p]) {
    const P = S.sidereal(b), pts = [];
    for (let i = 0; i <= 180; i++) { const v = S.helio(b, S.addDays(START, P * i / 180)); pts.push([X(v), Y(v)]); }
    el('path', { d: path(pts) + 'Z', class: 's-orbit' }, svg);
  }
  const s = sm[k];
  el('line', { x1: X(s.earth), y1: Y(s.earth), x2: X(s.planet), y2: Y(s.planet), class: 's-sight now' }, svg);
  el('circle', { cx: C, cy: C, r: 6, class: 's-sun' }, svg);
  el('circle', { cx: X(s.earth), cy: Y(s.earth), r: 4.5, class: 's-earth' }, svg);
  el('circle', { cx: X(s.planet), cy: Y(s.planet), r: 4.5, class: 's-planet' }, svg);
  $('helunder').innerHTML = t(`A line every ${LINES[data.p]} days.`, `Una linea ogni ${LINES[data.p]} giorni.`);
}

function info(u) {
  const s = data.samples[idx(u)], ev = data.events.filter(e => e.ms <= s.ms).length;
  $('info').innerHTML = `<div><dt>${t('date (UT)', 'data (UT)')}</dt><dd>${dateStr(s.ms)}</dd></div>
    <div><dt>${t('years', 'anni')}</dt><dd>${((s.ms - START) / 864e5 / 365.25).toFixed(2)}</dd></div>
    <div><dt>${S.inferior(data.p) ? t('inferior conjunctions', 'congiunzioni inferiori') : t('oppositions', 'opposizioni')}</dt><dd>${ev}</dd></div>
    <div><dt>${t('distance', 'distanza')}</dt><dd>${Math.hypot(s.geo.x, s.geo.y, s.geo.z).toFixed(3)} ${t('AU', 'UA')}</dd></div>
    <div><dt>${t('sidereal period', 'periodo siderale')}</dt><dd>${S.sidereal(data.p).toFixed(2)} ${t('d', 'g')}</dd></div>
    <div><dt>${t('synodic period', 'periodo sinodico')}</dt><dd>${S.synodic(data.p).toFixed(2)} ${t('d', 'g')}</dd></div>`;
}

function tables() {
  const p = data.p;
  const cv = cycles(p);
  $('ratios').innerHTML = `<tr><th>${t('synodic periods', 'periodi sinodici')}</th><th class="num">${t('years', 'anni')}</th><th class="num">${t('difference, days', 'differenza, giorni')}</th><th class="num">${t('figure turns by', 'la figura ruota di')}</th></tr>` +
    cv.map(c => `<tr${c.years === state.years ? ' class="on"' : ''}><td class="num">${c.n}</td><td class="num">${c.years}</td><td class="num">${c.days >= 0 ? '+' : '−'}${Math.abs(c.days).toFixed(2)}</td><td class="num">${c.drift >= 0 ? '+' : '−'}${Math.abs(c.drift).toFixed(2)}°</td></tr>`).join('');
  const ev = data.events.slice(0, 12);
  $('events').innerHTML = `<tr><th>${S.inferior(p) ? t('inferior conjunction', 'congiunzione inferiore') : t('opposition', 'opposizione')}</th><th>${t('date, UT', 'data, UT')}</th><th class="num">${t('longitude (J2000)', 'longitudine (J2000)')}</th><th class="num">${t('step', 'passo')}</th></tr>` +
    ev.map((e, i) => { const l = S.geoJ2000(p, e.ms).lon, l0 = i ? S.geoJ2000(p, ev[i - 1].ms).lon : null;
      return `<tr><td class="num">${i + 1}</td><td>${S.ymdhm(e.ms)}</td><td class="num">${l.toFixed(2)}°</td><td class="num">${l0 === null ? '' : S.norm(l - l0).toFixed(2) + '°'}</td></tr>`; }).join('');
}

// the index of the event passed within the last 1/40 of the span, or -1
function recent(u) {
  const sm = data.samples, now = sm[idx(u)].ms, span = sm.at(-1).ms - sm[0].ms;
  let j = -1; data.events.forEach((e, i) => { if (e.ms <= now && now - e.ms < span / 40) j = i; });
  return j;
}
let clk;
function frame(u) {
  drawGeo(u); drawHelio(u); info(u);
  const j = recent(u);
  [...$('events').rows].forEach((r, i) => r.classList.toggle('on', i === j + 1));
}
function recompute() { build(); tables(); writeState(state); $('years').value = state.years; $('yearsout').value = state.years; frame(clk.u); }
function init() {
  if (!state.years) state.years = defaultYears(state.planet);
  $('planet').value = state.planet;
  clk = clock({ seconds: 16, step: 0.025, onFrame: frame, home: 0 });
  build(); tables(); writeState(state);
  $('years').value = state.years; $('yearsout').value = state.years;
  clk.set(1);
  $('planet').addEventListener('change', () => { state.planet = $('planet').value; state.years = defaultYears(state.planet); clk.pause(); recompute(); clk.set(1); });
  $('years').addEventListener('change', () => { state.years = +$('years').value; clk.pause(); recompute(); clk.set(1); });
  $('years').addEventListener('input', () => { $('yearsout').value = $('years').value; });
  relangOptions(lang());
  onLang(() => { relangOptions(lang()); tables(); frame(clk.u); });
  onTheme(() => frame(clk.u));
}
init();
