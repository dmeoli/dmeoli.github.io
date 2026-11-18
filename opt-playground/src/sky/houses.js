// Houses compared (sky-houses.html): seven house systems for one moment of
// the sky, given by the right ascension of the meridian (local sidereal
// time) and the latitude, which Play slides from the equator toward the
// pole: the seven wheels as concentric rings, the twelve sizes of each as a
// bar, and the size of the largest house of each system against the
// latitude, where Placidus and Koch end at the polar circle.

import * as S from './core.js';
import { $, el, clear, readState, writeState, clock, lonSign, SIGN_GLYPH, SIGN_ABBR, relangOptions } from './ui.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const EPS = 23.4392911, LMAX = 85, POLAR = 90 - EPS;
const SYS = S.SYSTEMS;
const name = s => t(S.SYSTEM_NAME[s][0], S.SYSTEM_NAME[s][1]);
const state = readState({ lat: 45, lst: 8 });
const D = Math.PI / 180;
const COL = { P: '--accent', K: '--accent-2', O: '--gold', R: '--earth', C: '--model', E: '--planet', W: '--ink-soft' };

function all(lat) { const armc = state.lst * 15; return SYS.map(s => ({ s, ...S.cusps(s, armc, lat, EPS) })); }

// the rings: the Ascendant of the equal system on the left (as in the chart
// wheel), longitude counterclockwise, Placidus outside and whole sign inside
function drawRings(H) {
  const svg = $('rings'); clear(svg);
  const C = 200, R0 = 188, w = 20, asc = H.find(h => h.s === 'E').asc;
  const P = (l, r) => [C - r * Math.cos((l - asc) * D), C + r * Math.sin((l - asc) * D)];
  // the zodiac around, in signs of 30 degrees
  for (let k = 0; k < 12; k++) {
    const [x1, y1] = P(30 * k, R0), [x2, y2] = P(30 * k, R0 - 12);
    el('line', { x1, y1, x2, y2, class: 's-tick' }, svg);
    const [gx, gy] = P(30 * k + 15, R0 - 2);
    el('text', { x: gx, y: gy, class: 's-glyph', style: 'font-size:11px' }, svg, SIGN_GLYPH[k]);
  }
  H.forEach((h, i) => {
    const ro = R0 - 14 - i * w, ri = ro - w + 2;
    el('circle', { cx: C, cy: C, r: ro, class: 's-ring' }, svg);
    if (h.failed) {
      el('text', { x: C, y: C - ro + w / 2 + 1, class: 's-lab mid', style: 'font-size:9px', 'dominant-baseline': 'central' }, svg, t('none', 'nessuna'));
      return;
    }
    for (let k = 1; k <= 12; k++) {
      const [x1, y1] = P(h.cusps[k], ro), [x2, y2] = P(h.cusps[k], ri);
      el('line', { x1, y1, x2, y2, class: 'h-cusp', style: `stroke:var(${COL[h.s]})`, 'stroke-width': k === 1 || k === 10 ? 2.4 : 1.2 }, svg);
      const mid = h.cusps[k] + S.sizes(h.cusps)[k - 1] / 2;
      if (S.sizes(h.cusps)[k - 1] > 9) { const [x, y] = P(mid, (ro + ri) / 2); el('text', { x, y, class: 'h-num' }, svg, k); }
    }
    el('circle', { cx: C, cy: C, r: ri, class: 's-ring' }, svg);
  });
  // the letters of the systems on the right
  H.forEach((h, i) => {
    const r = R0 - 14 - i * w - w / 2 + 1;
    el('text', { x: C + r + 0, y: C + 0.5, class: 'h-sys', style: `fill:var(${COL[h.s]})` }, svg, h.s);
  });
  const [ax, ay] = P(asc, R0 - 14 - SYS.length * w - 6);
  el('text', { x: ax + 4, y: ay, class: 's-lab', 'dominant-baseline': 'central' }, svg, 'Asc');
}

// the sizes of the twelve houses of each system as a bar of 360 degrees
function drawBars(H) {
  const svg = $('hbars'); clear(svg);
  const L = 104, Rr = 388, bh = 34, gap = 16, top = 34, X = d => L + d / 360 * (Rr - L);
  for (let d = 0; d <= 360; d += 90) {
    el('line', { x1: X(d), y1: top - 6, x2: X(d), y2: top + SYS.length * (bh + gap) - gap + 4, class: 's-grid' }, svg);
    el('text', { x: X(d), y: top - 12, class: 's-lab mid' }, svg, `${d}°`);
  }
  H.forEach((h, i) => {
    const y = top + i * (bh + gap);
    el('text', { x: 8, y: y + bh / 2 + 4, class: 's-lab strong' }, svg, name(h.s));
    if (h.failed) { el('text', { x: X(180), y: y + bh / 2 + 4, class: 's-lab mid' }, svg, t('does not exist here', 'qui non esiste')); return; }
    let x = 0;
    S.sizes(h.cusps).forEach((d, k) => {
      el('rect', { x: X(x), y, width: Math.max(0, X(x + d) - X(x)), height: bh, class: 'h-bar' + (k % 2 ? ' alt' : ''), style: `fill:var(${COL[h.s]})` }, svg);
      if (d > 14) el('text', { x: X(x + d / 2), y: y + bh / 2 + 4, class: 'h-barlab' }, svg, k + 1);
      x += d;
    });
  });
  el('text', { x: L, y: top + SYS.length * (bh + gap) + 8, class: 's-lab' }, svg, t('degrees from the cusp of house 1', 'gradi dalla cuspide della casa 1'));
}

// the largest house of each system against the latitude, at this sidereal time
function drawCurves(H) {
  const svg = $('hcurves'); clear(svg);
  const L = 44, Rr = 386, T = 20, B = 360, X = l => L + l / 90 * (Rr - L), Y = d => B - d / 180 * (B - T);
  for (let d = 0; d <= 180; d += 30) {
    el('line', { x1: L, y1: Y(d), x2: Rr, y2: Y(d), class: 's-grid' }, svg);
    el('text', { x: L - 6, y: Y(d) + 4, class: 's-lab end' }, svg, `${d}°`);
  }
  for (let l = 0; l <= 90; l += 15) {
    el('line', { x1: X(l), y1: T, x2: X(l), y2: B, class: 's-grid' }, svg);
    el('text', { x: X(l), y: B + 16, class: 's-lab mid' }, svg, `${l}°`);
  }
  el('rect', { x: X(POLAR), y: T, width: X(90) - X(POLAR), height: B - T, class: 's-retro' }, svg);
  el('text', { x: X(POLAR) + 4, y: T + 12, class: 's-lab' }, svg, t('polar circle', 'circolo polare'));
  const armc = state.lst * 15;
  for (const s of [...SYS].reverse()) {
    let d = '', pen = false;
    for (let l = 0; l <= 89.5; l += 0.5) {
      const h = S.cusps(s, armc, l, EPS);
      if (h.failed) { pen = false; continue; }
      const m = Math.max(...S.sizes(h.cusps));
      d += (pen ? 'L' : 'M') + `${X(l).toFixed(1)},${Y(Math.min(180, m)).toFixed(1)}`; pen = true;
    }
    el('path', { d, class: 'h-curve', style: `stroke:var(${COL[s]})` }, svg);
  }
  el('line', { x1: X(state.lat), y1: T, x2: X(state.lat), y2: B, class: 'd-now' }, svg);
  el('text', { x: (L + Rr) / 2, y: B + 34, class: 's-lab mid' }, svg, t('latitude', 'latitudine'));
}

// a cusp as 22°45′ Lib, short enough for seven columns
function short(l) {
  l = S.norm(l); let s = Math.floor(l / 30), x = l - 30 * s, d = Math.floor(x), m = Math.round((x - d) * 60);
  if (m === 60) { d++; m = 0; }
  if (d === 30) { d = 0; s = (s + 1) % 12; }
  return `${d}°${String(m).padStart(2, '0')}′ ${SIGN_ABBR[s]}`;
}

function table(H) {
  let html = `<tr><th>${t('house', 'casa')}</th>` + H.map(h => `<th>${name(h.s)}</th>`).join('') + '</tr>';
  for (let k = 1; k <= 12; k++)
    html += `<tr><td class="num">${k}</td>` + H.map(h => `<td>${h.failed ? '—' : short(h.cusps[k])}</td>`).join('') + '</tr>';
  $('cusps').innerHTML = html;
}

function info(H) {
  const e = H.find(h => h.s === 'E'), p = H.find(h => h.s === 'P');
  const hh = Math.floor(state.lst), mm = Math.round((state.lst - hh) * 60);
  $('info').innerHTML = `<div><dt>${t('latitude', 'latitudine')}</dt><dd>${state.lat.toFixed(1)}°</dd></div>
    <div><dt>${t('sidereal time', 'tempo siderale')}</dt><dd>${hh}h${String(mm).padStart(2, '0')}m</dd></div>
    <div><dt>${t('Ascendant', 'Ascendente')}</dt><dd>${lonSign(e.asc)}</dd></div>
    <div><dt>${t('Midheaven', 'Medio cielo')}</dt><dd>${lonSign(e.mc)}</dd></div>
    <div><dt>Placidus, Koch</dt><dd>${p.failed ? t('undefined beyond the polar circle', 'non definite oltre il circolo polare') : t('defined', 'definite')}</dd></div>`;
  $('latout').value = state.lat.toFixed(1) + '°'; $('lstout').value = `${hh}h${String(mm).padStart(2, '0')}`;
  $('lat').value = state.lat; $('lst').value = state.lst;
}

function draw() {
  const H = all(state.lat);
  drawRings(H); drawBars(H); drawCurves(H); table(H); info(H); writeState(state);
}
const clk = clock({ seconds: 16, step: 5 / LMAX, onFrame: u => { state.lat = u * LMAX; draw(); }, home: 0 });
$('lat').addEventListener('input', () => { clk.pause(); clk.set(+$('lat').value / LMAX); });
$('lst').addEventListener('input', () => { state.lst = +$('lst').value; draw(); });
clk.set(state.lat / LMAX);
relangOptions(lang());
onLang(() => { relangOptions(lang()); draw(); });
onTheme(draw);
