// Retrograde motion (sky-retrograde.html): around one opposition (or
// inferior conjunction) of a planet, the orbits seen from the north pole of
// the ecliptic with the lines of sight from the Earth, the loop that the
// planet draws among the stars, and the epicycle on a deferent that the
// circular orbits imply, all three on the same clock. Positions from
// Astronomy Engine in the ecliptic of J2000; stations and the event on the
// ecliptic of date, as in the ephemerides.

import * as S from './core.js';
import { $, el, clear, path, readState, writeState, clock, lonSign, dateStr, relangOptions } from './ui.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const HALF = { Mercury: 42, Venus: 75, Mars: 130, Jupiter: 140, Saturn: 150 };
const STEP = { Mercury: 0.25, Venus: 0.5, Mars: 1, Jupiter: 1, Saturn: 1 };
const NAME = p => t(p, S.PLANET_IT[p]);
const state = readState({ planet: 'Mars', event: 0 });
let events = [], data = null;
const W = 400, C = W / 2;

/* ------------------------------------------------------------ data ---- */

function listEvents() {
  const p = state.planet, k = S.inferior(p) ? 'inf' : 'opp';
  events = S.synodicEvents(p, Date.UTC(2000, 0, 1), Date.UTC(2041, 0, 1)).filter(e => e.kind === k);
  const sel = $('event');
  sel.replaceChildren(...events.map(e => { const o = document.createElement('option'); o.value = e.ms; o.textContent = dateStr(e.ms); return o; }));
  // the event asked by the address, else the one nearest to today
  let best = events[0];
  const want = state.event || Date.now();
  for (const e of events) if (Math.abs(e.ms - want) < Math.abs(best.ms - want)) best = e;
  state.event = best.ms; sel.value = String(best.ms);
}

function build() {
  const p = state.planet, ev = events.find(e => e.ms === state.event), h = HALF[p], st = STEP[p];
  const t0 = S.addDays(ev.ms, -h), t1 = S.addDays(ev.ms, h);
  const n = Math.round(2 * h / st), samples = [];
  let unwrap = null;
  for (let i = 0; i <= n; i++) {
    const ms = S.addDays(t0, i * st);
    const g = S.geoJ2000(p, ms), m = S.epicycle(p, ms);
    let lon = g.lon;
    if (unwrap !== null) lon = unwrap + S.delta(unwrap, lon);
    unwrap = lon;
    samples.push({ ms, earth: S.helio('Earth', ms), planet: S.helio(p, ms), geo: g, lon, model: m });
  }
  // the model's longitude, unwrapped the same way, and its error
  let mu = null, err = 0, errAt = ev.ms;
  for (const s of samples) {
    s.mlon = mu === null ? s.lon + S.delta(s.lon, s.model.lon) : mu + S.delta(mu, s.model.lon);
    mu = s.mlon;
    const e = Math.abs(S.delta(s.geo.lon, s.model.lon));
    if (e > err) { err = e; errAt = s.ms; }
  }
  const stations = S.stations(p, t0, t1);
  data = { p, ev, t0, t1, samples, stations, err, errAt };
}

/* ----------------------------------------------------------- views ---- */

const at = u => data.samples[Math.min(data.samples.length - 1, Math.round(u * (data.samples.length - 1)))];
const idx = u => Math.min(data.samples.length - 1, Math.round(u * (data.samples.length - 1)));

// from above: the Sun, the two orbits, the lines of sight carried to a ring
// of fixed stars, where their ends draw the motion seen from the Earth
function drawHelio(u) {
  const svg = $('helio'); clear(svg);
  const p = data.p, ap = S.MEAN[p][0], outer = Math.max(ap, 1), sc = 128 / outer, Rs = 186;
  const X = v => C + sc * v.x, Y = v => C - sc * v.y;
  el('circle', { cx: C, cy: C, r: Rs, class: 's-ring' }, svg);
  for (let k = 0; k < 12; k++) {
    const a = k * 30 * Math.PI / 180;
    el('line', { x1: C + (Rs - 5) * Math.cos(a), y1: C - (Rs - 5) * Math.sin(a), x2: C + (Rs + 5) * Math.cos(a), y2: C - (Rs + 5) * Math.sin(a), class: 's-tick' }, svg);
  }
  const g = el('text', { x: C + Rs + 2, y: C - 8, class: 's-lab' }, svg, '0°');
  g.setAttribute('text-anchor', 'end');
  // the orbits, sampled over a sidereal period
  for (const [b, cls] of [['Earth', 's-orbit'], [p, 's-orbit']]) {
    const P = S.sidereal(b), pts = [];
    for (let i = 0; i <= 180; i++) { const v = S.helio(b, S.addDays(data.ev.ms, P * i / 180)); pts.push([X(v), Y(v)]); }
    el('path', { d: path(pts) + 'Z', class: cls }, svg);
  }
  const k = idx(u), every = Math.max(1, Math.round(data.samples.length / 26));
  const hit = s => {
    // where the ray from the Earth through the planet meets the ring
    const ex = X(s.earth) - C, ey = Y(s.earth) - C, dx = X(s.planet) - X(s.earth), dy = Y(s.planet) - Y(s.earth);
    const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, b = ex * ux + ey * uy, c = ex * ex + ey * ey - Rs * Rs;
    const tt = -b + Math.sqrt(b * b - c);
    return [C + ex + tt * ux, C + ey + tt * uy];
  };
  for (let i = 0; i <= k; i += every) {
    const s = data.samples[i], h = hit(s);
    el('line', { x1: X(s.earth), y1: Y(s.earth), x2: h[0], y2: h[1], class: 's-sight' }, svg);
    el('circle', { cx: h[0], cy: h[1], r: 2.4, class: 's-planet' }, svg);
  }
  const s = data.samples[k], h = hit(s);
  el('line', { x1: X(s.earth), y1: Y(s.earth), x2: h[0], y2: h[1], class: 's-sight now' }, svg);
  el('circle', { cx: h[0], cy: h[1], r: 4, class: 's-planet' }, svg);
  // the arcs of the orbits run in the window
  el('path', { d: path(data.samples.slice(0, k + 1).map(q => [X(q.earth), Y(q.earth)])), class: 's-earth-l' }, svg);
  el('path', { d: path(data.samples.slice(0, k + 1).map(q => [X(q.planet), Y(q.planet)])), class: 's-planet-l' }, svg);
  el('circle', { cx: C, cy: C, r: 6, class: 's-sun' }, svg);
  el('circle', { cx: X(s.earth), cy: Y(s.earth), r: 4.5, class: 's-earth' }, svg);
  el('circle', { cx: X(s.planet), cy: Y(s.planet), r: 4.5, class: 's-planet' }, svg);
}

// on the sky: longitude growing to the left (east, as seen facing south from
// the northern hemisphere), latitude up, both in degrees, the latitude
// stretched by a factor said under the view
function drawSky(u) {
  const svg = $('sky'); clear(svg);
  const sm = data.samples, lons = sm.map(s => s.lon), lats = sm.map(s => s.geo.lat);
  let l0 = Math.min(...lons), l1 = Math.max(...lons), b0 = Math.min(...lats), b1 = Math.max(...lats);
  const padL = (l1 - l0) * 0.08 + 0.5; l0 -= padL; l1 += padL;
  const pad = 34, w = W - 2 * pad, sx = w / (l1 - l0);
  const bm = (b0 + b1) / 2, bh = Math.max(b1 - b0, 0.5);
  const stretch = Math.max(1, Math.min(12, Math.floor((w * 0.5) / (bh * sx))));
  const sy = sx * stretch;
  const X = l => pad + (l1 - l) * sx, Y = b => C - 24 - (b - bm) * sy;
  // grid every 1, 2, 5 or 10 degrees of longitude
  const span = l1 - l0, gs = span > 60 ? 10 : span > 24 ? 5 : span > 10 ? 2 : 1;
  for (let l = Math.ceil(l0 / gs) * gs; l <= l1; l += gs) {
    el('line', { x1: X(l), y1: pad, x2: X(l), y2: W - pad, class: 's-grid' }, svg);
    el('text', { x: X(l), y: W - pad + 14, class: 's-lab mid' }, svg, `${S.norm(l).toFixed(0)}°`);
  }
  const bs = (bh * stretch) > 6 ? 1 : 0.5;
  for (let b = Math.ceil((bm - (C - pad + 24) / sy) / bs) * bs; b <= bm + (C - pad - 24) / sy; b += bs) {
    el('line', { x1: pad, y1: Y(b), x2: W - pad, y2: Y(b), class: 's-grid' }, svg);
    el('text', { x: pad - 4, y: Y(b) + 4, class: 's-lab end' }, svg, `${b.toFixed(bs < 1 ? 1 : 0)}°`);
  }
  el('text', { x: pad, y: pad - 10, class: 's-lab' }, svg, t('east ←', 'est ←'));
  el('text', { x: W - pad, y: pad - 10, class: 's-lab end' }, svg, t('→ west', '→ ovest'));
  // the retrograde stretch, between the stations
  const st = data.stations;
  const r0 = st.find(s => s.kind === 'R'), r1 = st.find(s => s.kind === 'D');
  if (r0 && r1) {
    const a = sm.find(s => s.ms >= r0.ms), b = sm.find(s => s.ms >= r1.ms);
    if (a && b) el('rect', { x: X(a.lon), y: pad, width: Math.max(0, X(b.lon) - X(a.lon)), height: W - 2 * pad, class: 's-retro' }, svg);
  }
  const k = idx(u);
  el('path', { d: path(sm.map(s => [X(s.lon), Y(s.geo.lat)])), class: 's-orbit' }, svg);
  el('path', { d: path(sm.slice(0, k + 1).map(s => [X(s.lon), Y(s.geo.lat)])), class: 's-planet-l' }, svg);
  // a dot every 10 days, the stations and the event named
  const every = Math.round(10 / STEP[data.p] * (data.p === 'Mercury' ? 0.5 : 1));
  for (let i = 0; i <= k; i += every) el('circle', { cx: X(sm[i].lon), cy: Y(sm[i].geo.lat), r: 1.8, class: 's-planet' }, svg);
  const marks = [...st.map(s => [s.ms, s.kind === 'R' ? t('station R', 'stazione R') : t('station D', 'stazione D')]),
    [data.ev.ms, S.inferior(data.p) ? t('inferior conj.', 'congiunz. inf.') : t('opposition', 'opposizione')]];
  // each event marked on the path, with a guide down to the axis and its
  // name and date at the foot of the frame, on two rows that alternate
  marks.sort((a, b) => a[0] - b[0]).forEach(([ms, name], i) => {
    const s = sm.reduce((a, b) => (Math.abs(b.ms - ms) < Math.abs(a.ms - ms) ? b : a));
    const x = X(s.lon), y = Y(s.geo.lat), yl = W - pad - 34 + (i % 2) * 22 - (i === 1 ? 44 : 0);
    el('line', { x1: x, y1: y, x2: x, y2: yl + 6, class: 's-sight', 'stroke-dasharray': '2 3' }, svg);
    el('circle', { cx: x, cy: y, r: 3, class: 's-orbit', style: 'opacity:1' }, svg);
    el('text', { x, y: yl + 18, class: 's-lab mid s-halo strong' }, svg, name);
    el('text', { x, y: yl + 30, class: 's-lab mid s-halo' }, svg, dateStr(ms));
  });
  const s = sm[k];
  el('circle', { cx: X(s.lon), cy: Y(s.geo.lat), r: 5, class: 's-planet' }, svg);
  $('skyunder').innerHTML = t(`Latitude stretched ${stretch} times; a dot every ${data.p === 'Mercury' ? 5 : 10} days; the band is the retrograde stretch.`,
    `Latitudine allungata ${stretch} volte; un punto ogni ${data.p === 'Mercury' ? 5 : 10} giorni; la fascia è il tratto retrogrado.`);
}

// the epicycle: the Earth at the centre, the deferent and the epicycle of
// the circular model, its path (green) against the true geocentric one
// (dashed), both projected on the ecliptic
function drawModel(u) {
  const svg = $('model'); clear(svg);
  const sm = data.samples, k = idx(u), m = sm[k].model, R = m.R, r = m.r;
  const sc = 168 / (R + r), X = x => C + sc * x, Y = y => C - sc * y;
  el('circle', { cx: C, cy: C, r: sc * R, class: 's-gold-l' }, svg);
  el('path', { d: path(sm.map(s => [X(s.geo.x), Y(s.geo.y)])), class: 's-true-d' }, svg);
  el('path', { d: path(sm.slice(0, k + 1).map(s => [X(s.model.planet.x), Y(s.model.planet.y)])), class: 's-model-l' }, svg);
  el('circle', { cx: X(m.centre.x), cy: Y(m.centre.y), r: sc * r, class: 's-orbit', style: 'opacity:1' }, svg);
  el('line', { x1: C, y1: C, x2: X(m.centre.x), y2: Y(m.centre.y), class: 's-sight now' }, svg);
  el('line', { x1: X(m.centre.x), y1: Y(m.centre.y), x2: X(m.planet.x), y2: Y(m.planet.y), class: 's-sight now' }, svg);
  el('circle', { cx: X(m.centre.x), cy: Y(m.centre.y), r: 2.5, class: 's-orbit', style: 'opacity:1' }, svg);
  el('circle', { cx: X(sm[k].geo.x), cy: Y(sm[k].geo.y), r: 4, class: 's-planet' }, svg);
  el('circle', { cx: X(m.planet.x), cy: Y(m.planet.y), r: 4.5, class: 's-model' }, svg);
  el('circle', { cx: C, cy: C, r: 5, class: 's-earth' }, svg);
  el('text', { x: C, y: C + 18, class: 's-lab mid s-halo' }, svg, t('Earth', 'Terra'));
}

/* --------------------------------------------------- stats, tables ---- */

function stats(u) {
  const s = at(u), sp = S.speed(data.p, s.ms), gd = S.geoOfDate(data.p, s.ms);
  $('info').innerHTML = `<div><dt>${t('date (UT)', 'data (UT)')}</dt><dd>${dateStr(s.ms)}</dd></div>
    <div><dt>${t('longitude', 'longitudine')}</dt><dd>${lonSign(gd.lon)}</dd></div>
    <div><dt>${t('speed', 'velocità')}</dt><dd>${sp >= 0 ? '+' : '−'}${Math.abs(sp).toFixed(3)}°/${t('day', 'giorno')}</dd></div>
    <div><dt>${t('motion', 'moto')}</dt><dd>${sp < 0 ? t('retrograde', 'retrogrado') : t('direct', 'diretto')}</dd></div>
    <div><dt>${t('model error', 'errore del modello')}</dt><dd>${Math.abs(S.delta(s.geo.lon, s.model.lon)).toFixed(2)}°</dd></div>`;
}

function tables() {
  const st = data.stations, r0 = st.find(s => s.kind === 'R'), r1 = st.find(s => s.kind === 'D');
  const rows = [];
  if (r0) rows.push([t('station, turns retrograde', 'stazione, diventa retrogrado'), r0.ms, r0.lon]);
  rows.push([S.inferior(data.p) ? t('inferior conjunction', 'congiunzione inferiore') : t('opposition', 'opposizione'), data.ev.ms, data.ev.lon]);
  if (r1) rows.push([t('station, turns direct', 'stazione, torna diretto'), r1.ms, r1.lon]);
  $('events').innerHTML = `<tr><th>${t('event', 'evento')}</th><th>${t('date, UT', 'data, UT')}</th><th>${t('longitude', 'longitudine')}</th></tr>` +
    rows.map(([n, ms, l]) => `<tr><td>${n}</td><td>${S.ymdhm(ms)}</td><td>${lonSign(l)}</td></tr>`).join('') +
    (r0 && r1 ? `<tr><td>${t('retrograde arc', 'arco retrogrado')}</td><td>${((r1.ms - r0.ms) / 864e5).toFixed(1)} ${t('days', 'giorni')}</td><td>${Math.abs(S.delta(r0.lon, r1.lon)).toFixed(2)}°</td></tr>` : '');
  const p = data.p, inf = S.inferior(p);
  const m = data.samples[0].model;
  $('figures').innerHTML = `<tr><th>${t('quantity', 'grandezza')}</th><th class="num">${t('value', 'valore')}</th></tr>
    <tr><td>${t('deferent radius', 'raggio del deferente')}</td><td class="num">${m.R.toFixed(3)} AU</td></tr>
    <tr><td>${t('epicycle radius', 'raggio dell\'epiciclo')}</td><td class="num">${m.r.toFixed(3)} AU</td></tr>
    <tr><td>${t('ratio epicycle / deferent', 'rapporto epiciclo / deferente')}</td><td class="num">${(m.r / m.R).toFixed(3)}</td></tr>
    <tr><td>${t('deferent turns in', 'il deferente gira in')}</td><td class="num">${(inf ? S.sidereal('Earth') : S.sidereal(p)).toFixed(1)} ${t('days', 'giorni')}</td></tr>
    <tr><td>${t('epicycle turns, on the deferent, in', 'l\'epiciclo gira, sul deferente, in')}</td><td class="num">${S.synodic(p).toFixed(1)} ${t('days', 'giorni')}</td></tr>
    <tr><td>${t('largest error of the model here', 'massimo errore del modello qui')}</td><td class="num">${data.err.toFixed(2)}°</td></tr>`;
}

/* ------------------------------------------------------------ shell ---- */

let clk;
function frame(u) { drawHelio(u); drawSky(u); drawModel(u); stats(u); }
function recompute() {
  build(); tables(); writeState(state);
  clk.seconds = 14; frame(clk.u);
}
function init() {
  $('planet').value = state.planet;
  listEvents();
  clk = clock({ seconds: 14, step: 0.04, onFrame: frame });
  build(); tables(); writeState(state);
  clk.set(0.5);
  $('planet').addEventListener('change', () => { state.planet = $('planet').value; state.event = 0; clk.pause(); listEvents(); recompute(); clk.set(0.5); });
  $('event').addEventListener('change', () => { state.event = +$('event').value; clk.pause(); recompute(); clk.set(0.5); });
  relangOptions(lang());
  onLang(() => { relangOptions(lang()); const v = $('event').value; listEvents(); $('event').value = v; tables(); frame(clk.u); });
  onTheme(() => frame(clk.u));
}
init();
