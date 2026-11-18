// Precession and the zodiac (sky-precession.html): the year runs from
// 13000 BC to AD 15000; the celestial sphere in three.js, built in the
// ecliptic of J2000, with the pole and the equator of date moving among a few
// bright stars; the dial of the IAU constellations along the ecliptic with
// the ring of the tropical signs that the equinox drags; the strip of the
// ages under three conventions; and the dates of the Sun in signs and
// constellations this year. Long-term precession of Vondrak, Capitaine and
// Wallace (2011); IAU boundaries through Astronomy Engine.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as S from './core.js';
import { $, css, el, clear, readState, writeState, clock, SIGN_GLYPH, SIGN_ABBR, signName, dateStr, yearStr, deg } from './ui.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const Y0 = -13000, Y1 = 15000, NOW = 2026;
const D = Math.PI / 180;
const u2y = u => Y0 + u * (Y1 - Y0), y2u = y => (y - Y0) / (Y1 - Y0);
const state = readState({ year: NOW });
const ECL = S.eclipticConstellations();
// a few bright stars near the path of the pole, J2000 (Hipparcos), with
// their proper motions left out (they move Vega by about 1 degree here)
const STARS = [['Polaris', 2 + 31 / 60 + 49.1 / 3600, 89 + 15 / 60 + 51 / 3600], ['Kochab', 14 + 50 / 60 + 42.3 / 3600, 74 + 9 / 60 + 20 / 3600],
  ['Thuban', 14 + 4 / 60 + 23.3 / 3600, 64 + 22 / 60 + 33 / 3600], ['Vega', 18 + 36 / 60 + 56.3 / 3600, 38 + 47 / 60 + 1 / 3600],
  ['Deneb', 20 + 41 / 60 + 25.9 / 3600, 45 + 16 / 60 + 49 / 3600], ['Alderamin', 21 + 18 / 60 + 34.8 / 3600, 62 + 35 / 60 + 8 / 3600],
  ['Errai', 23 + 39 / 60 + 20.8 / 3600, 77 + 37 / 60 + 57 / 3600]];
const NAMES_IT = { Pisces: 'Pesci', Aries: 'Ariete', Taurus: 'Toro', Gemini: 'Gemelli', Cancer: 'Cancro', Leo: 'Leone', Virgo: 'Vergine',
  Libra: 'Bilancia', Scorpius: 'Scorpione', Ophiuchus: 'Ofiuco', Sagittarius: 'Sagittario', Capricornus: 'Capricorno', Aquarius: 'Acquario', Cetus: 'Balena' };
const cname = n => t(n, NAMES_IT[n] || n);

/* ------------------------------------------------------------ ages ---- */

// the transitions of the equinox from one constellation to the next, and
// from one sign of 30 degrees of a sidereal zodiac to the next
function agesIAU() {
  const con = y => S.constellation(S.equinox(y).vec), out = [];
  let prev = con(Y0), from = Y0;
  for (let y = Y0 + 20; y <= Y1; y += 20) {
    const c = con(y);
    if (c.symbol === prev.symbol) continue;
    let lo = y - 20, hi = y;
    while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (con(m).symbol === prev.symbol) lo = m; else hi = m; }
    out.push({ from, to: hi, label: prev.name }); prev = c; from = hi;
  }
  out.push({ from, to: Y1, label: prev.name });
  return out;
}
function agesSidereal(year0) {
  // the sidereal longitude of the equinox is minus the ayanamsa
  const sign = y => Math.floor(S.norm(-S.ayanamsa(y, year0)) / 30), out = [];
  let prev = sign(Y0), from = Y0;
  for (let y = Y0 + 20; y <= Y1; y += 20) {
    const s = sign(y);
    if (s === prev) continue;
    let lo = y - 20, hi = y;
    while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (sign(m) === prev) lo = m; else hi = m; }
    out.push({ from, to: hi, sign: prev }); prev = s; from = hi;
  }
  out.push({ from, to: Y1, sign: prev });
  return out;
}
const AGES = { iau: agesIAU(), lahiri: agesSidereal(S.AYANAMSA_ZERO.lahiri), fb: agesSidereal(S.AYANAMSA_ZERO.fagan_bradley) };
const ageName = a => (a.label ? cname(a.label) : signName(a.sign));

/* ------------------------------------------------------------ sphere ---- */

// ecliptic of J2000 (x to the equinox of J2000, z to the pole of the
// ecliptic) into the world of three.js (y up)
const W3 = v => new THREE.Vector3(v.x, v.z, -v.y);
const E0 = 84381.406 / 3600 * D;
const eqToEcl = v => ({ x: v.x, y: v.y * Math.cos(E0) + v.z * Math.sin(E0), z: -v.y * Math.sin(E0) + v.z * Math.cos(E0) });
const fromEcl = (l, b = 0) => ({ x: Math.cos(b * D) * Math.cos(l * D), y: Math.cos(b * D) * Math.sin(l * D), z: Math.sin(b * D) });

function makeSphere(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  stage.appendChild(labels.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(3.1, 3.2, 3.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 3; controls.maxDistance = 10;
  const fixed = new THREE.Group(), moving = new THREE.Group();
  scene.add(fixed, moving);
  const mats = [];
  const mat = (key, opts = {}) => {
    const m = opts.dashed ? new THREE.LineDashedMaterial({ dashSize: 0.03, gapSize: 0.03, transparent: true })
      : opts.point ? new THREE.MeshBasicMaterial() : new THREE.LineBasicMaterial({ transparent: true });
    m.userData.key = key; if (!opts.point) m.opacity = opts.alpha ?? 1;
    mats.push(m); return m;
  };
  const line = (pts, m, g, closed = false) => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(closed ? pts.concat([pts[0]]) : pts), m);
    if (m.isLineDashedMaterial) l.computeLineDistances();
    g.add(l); return l;
  };
  const label = (text, cls, pos, g) => {
    const div = document.createElement('div'); div.className = 'lab3 ' + cls; div.textContent = text;
    const o = new CSS2DObject(div); o.position.copy(pos); g.add(o); return o;
  };
  const dot = (pos, key, r, g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat(key, { point: true })); m.position.copy(pos); g.add(m); return m; };

  // fixed: the ecliptic, its constellations, the pole of the ecliptic, the
  // stars and the path of the pole of the equator over the whole interval
  line(Array.from({ length: 240 }, (_, i) => W3(fromEcl(i * 1.5))), mat('ecl'), fixed, true);
  for (const c of ECL) {
    if (c.from > 0) line([W3(fromEcl(c.from, -4)), W3(fromEcl(c.from, 4))], mat('con'), fixed);
    if (c.to - c.from > 8) label(c.symbol, 'con', W3(fromEcl((c.from + c.to) / 2, -9)), fixed);
  }
  dot(W3({ x: 0, y: 0, z: 1 }), 'ink', 0.018, fixed);
  const starLabels = [];
  for (const [name, ra, dec] of STARS) {
    const v = eqToEcl({ x: Math.cos(dec * D) * Math.cos(ra * 15 * D), y: Math.cos(dec * D) * Math.sin(ra * 15 * D), z: Math.sin(dec * D) });
    dot(W3(v), 'star', 0.014, fixed);
    const l = label(name, 'star', W3(v).multiplyScalar(1.04), fixed);
    // Kochab and Thuban are 10 degrees apart: one label above, one below
    if (name === 'Kochab') l.center.set(0.5, 1.2); else if (name === 'Thuban') l.center.set(0.5, -0.2);
    starLabels.push(l);
  }
  const path = [];
  for (let y = Y0; y <= Y1; y += 100) path.push(W3(eqToEcl(S.equinox(y).pole)));
  line(path, mat('path', { alpha: 0.7 }), fixed);

  // moving: the pole and the equator of date, the equinox and the signs
  let movingLabels = [];
  function update(year) {
    for (const o of [...moving.children]) { moving.remove(o); if (o.geometry) o.geometry.dispose(); if (o.element) o.element.remove(); }
    const q = S.equinox(year), pole = eqToEcl(q.pole), g = eqToEcl(q.vec);
    const P = W3(pole), G = W3(g), Q = new THREE.Vector3().crossVectors(P, G).normalize();
    line(Array.from({ length: 160 }, (_, i) => { const a = i / 160 * 2 * Math.PI; return G.clone().multiplyScalar(Math.cos(a)).addScaledVector(Q, Math.sin(a)); }), mat('equ', { dashed: true }), moving, true);
    line([P.clone().multiplyScalar(-1.15), P.clone().multiplyScalar(1.15)], mat('axis'), moving);
    dot(P, 'pole', 0.026, moving);
    dot(G, 'gamma', 0.026, moving);
    label(t('pole', 'polo'), 'pole', P.clone().multiplyScalar(1.22), moving);
    label('γ', 'gamma', G.clone().multiplyScalar(1.13), moving);
    // the tropical signs from the equinox, along the ecliptic
    for (let k = 0; k < 12; k++) {
      const l = q.lon + 30 * k;
      line([W3(fromEcl(l, 0)), W3(fromEcl(l, 6))], mat('sign'), moving);
      label(SIGN_GLYPH[k], 'sign', W3(fromEcl(l + 15, 7)), moving);
    }
    colours();
  }
  function colours() {
    const c = { ecl: css('--accent'), con: css('--ink-soft'), ink: css('--ink'), star: css('--gold'), path: css('--gold'),
      equ: css('--ink-soft'), axis: css('--ink'), pole: css('--planet'), gamma: css('--planet'), sign: css('--accent-2') };
    for (const m of mats) m.color.set(c[m.userData.key] || c.ink);
    dirty = true;
  }
  let dirty = true;
  function resize() {
    const w = stage.clientWidth;
    renderer.setSize(w, w, false);
    renderer.domElement.style.width = renderer.domElement.style.height = w + 'px';
    labels.setSize(w, w); camera.aspect = 1; camera.updateProjectionMatrix(); dirty = true;
  }
  new ResizeObserver(resize).observe(stage); resize();
  controls.addEventListener('change', () => { dirty = true; });
  (function loop() {
    requestAnimationFrame(loop); controls.update();
    if (dirty) { renderer.render(scene, camera); labels.render(scene, camera); dirty = false; }
  })();
  return { update, colours };
}

/* -------------------------------------------------------------- dial ---- */

// the ecliptic of J2000 seen from its north pole, longitude counterclockwise
// with 0 of J2000 at the right: outside the constellations (fixed), inside
// the tropical signs, whose 0 Aries is the equinox of date
function drawDial(year) {
  const svg = $('dial'); clear(svg);
  const C = 200, R1 = 186, R2 = 150, R3 = 118, R4 = 86;
  const P = (l, r) => [C + r * Math.cos(l * D), C - r * Math.sin(l * D)];
  const arc = (a, b, ro, ri) => {
    const [x1, y1] = P(a, ro), [x2, y2] = P(b, ro), [x3, y3] = P(b, ri), [x4, y4] = P(a, ri), big = b - a > 180 ? 1 : 0;
    return `M${x1},${y1}A${ro},${ro} 0 ${big} 0 ${x2},${y2}L${x3},${y3}A${ri},${ri} 0 ${big} 1 ${x4},${y4}Z`;
  };
  const q = S.equinox(year), here = S.constellation(q.vec).symbol;
  ECL.forEach((c, i) => {
    el('path', { d: arc(c.from, c.to, R1, R2), class: 'd-con' + (i % 2 ? ' alt' : '') + (c.symbol === here ? ' on' : '') }, svg);
    if (c.to - c.from > 6) {
      const [x, y] = P((c.from + c.to) / 2, (R1 + R2) / 2);
      el('text', { x, y, class: 'd-clab' + (c.symbol === here ? ' on' : '') }, svg, c.symbol);
    }
  });
  for (let k = 0; k < 12; k++) {
    const a = q.lon + 30 * k;
    el('path', { d: arc(a, a + 30, R3, R4), class: 'd-sign' + (k % 2 ? ' alt' : '') }, svg);
    const [x, y] = P(a + 15, (R3 + R4) / 2);
    el('text', { x, y, class: 's-glyph' }, svg, SIGN_GLYPH[k]);
  }
  // the equinox: a pointer from the centre through the two rings
  const [gx, gy] = P(q.lon, R1 + 4), [hx, hy] = P(q.lon, 20);
  el('line', { x1: hx, y1: hy, x2: gx, y2: gy, class: 'd-gamma' }, svg);
  const [lx, ly] = P(q.lon, R4 - 18);
  el('text', { x: lx, y: ly, class: 'd-glab' }, svg, 'γ');
  el('circle', { cx: C, cy: C, r: 3, class: 's-sun' }, svg);
  el('text', { x: C, y: C + 24, class: 's-lab mid strong' }, svg, yearStr(year));
}

/* ------------------------------------------------------------- strip ---- */

function drawStrip(year) {
  const svg = $('strip'); clear(svg);
  const W = 1000, L = 112, Rr = 980, X = y => L + (y - Y0) / (Y1 - Y0) * (Rr - L), rows = [
    ['iau', t('IAU', 'IAU')], ['lahiri', 'Lahiri'], ['fb', 'Fagan-Bradley']];
  rows.forEach(([key, name], r) => {
    const y = 14 + r * 34;
    el('text', { x: 8, y: y + 17, class: 's-lab strong' }, svg, name);
    AGES[key].forEach((a, i) => {
      const x0 = X(a.from), x1 = X(a.to), on = year >= a.from && year < a.to;
      el('rect', { x: x0, y, width: Math.max(0, x1 - x0), height: 26, class: 'd-con' + (i % 2 ? ' alt' : '') + (on ? ' on' : '') }, svg);
      const nm = key === 'iau' ? (ECL.find(c => c.name === a.label)?.symbol || a.label.slice(0, 3)) : SIGN_ABBR[a.sign];
      if (x1 - x0 > 26) el('text', { x: (x0 + x1) / 2, y: y + 17, class: 'd-clab' + (on ? ' on' : '') }, svg, nm);
    });
  });
  for (let y = -12000; y <= 14000; y += 2000) {
    el('line', { x1: X(y), y1: 116, x2: X(y), y2: 122, class: 's-axis' }, svg);
    el('text', { x: X(y), y: 136, class: 's-lab mid' }, svg, y === 0 ? '0' : String(y));
  }
  el('line', { x1: X(year), y1: 6, x2: X(year), y2: 124, class: 'd-now' }, svg);
}

/* ------------------------------------------------------- stats, tables ---- */

function info(year) {
  const q = S.equinox(year), c = S.constellation(q.vec), P = S.precessionSince2000(year);
  const ageOf = k => AGES[k].find(a => year >= a.from && year < a.to);
  $('info').innerHTML = `<div><dt>${t('year', 'anno')}</dt><dd>${yearStr(year)}</dd></div>
    <div><dt>${t('equinox in', 'equinozio in')}</dt><dd>${cname(c.name)}</dd></div>
    <div><dt>${t('precession since 2000', 'precessione dal 2000')}</dt><dd>${P >= 0 ? '+' : '−'}${Math.abs(P).toFixed(2)}°</dd></div>
    <div><dt>${t('obliquity', 'obliquità')}</dt><dd>${q.eps.toFixed(3)}°</dd></div>
    <div><dt>${t('age, sidereal Lahiri', 'era, siderale Lahiri')}</dt><dd>${ageName(ageOf('lahiri'))}</dd></div>`;
  $('year').value = Math.round(year); $('yearout').value = yearStr(year);
}

function tables() {
  const near = k => AGES[k].filter(a => a.to > -3000 && a.from < 5000);
  const rows = [];
  for (const [k, name] of [['iau', t('IAU', 'IAU')], ['lahiri', 'Lahiri'], ['fb', 'Fagan-Bradley']])
    for (const a of near(k)) if (a.from > -3000) rows.push(`<tr><td>${name}</td><td>${ageName(a)}</td><td class="num">${yearStr(a.from)}</td><td class="num">${(a.to - a.from).toFixed(0)}</td></tr>`);
  $('ages').innerHTML = `<tr><th>${t('convention', 'convenzione')}</th><th>${t('age of', 'era di')}</th><th class="num">${t('begins', 'inizia')}</th><th class="num">${t('years', 'anni')}</th></tr>` + rows.join('');
  // this year: the Sun in the tropical signs and in the constellations
  const y0 = Date.UTC(NOW, 0, 1), P = S.precessionSince2000(NOW + 0.5), r2 = [];
  const order = ECL.slice(0, -1);
  for (let k = 0; k < 12; k++) r2.push([k, S.sunAt(30 * k, y0)]);
  const conRows = order.filter(c => c.to - c.from > 0).map(c => [c, S.sunAt(c.from + P, y0)]).sort((a, b) => a[1] - b[1]);
  const tr = r2.sort((a, b) => a[1] - b[1]);
  const n = Math.max(tr.length, conRows.length);
  let html = `<tr><th>${t('sign', 'segno')}</th><th>${t('from', 'dal')}</th><th>${t('constellation', 'costellazione')}</th><th>${t('from', 'dal')}</th><th class="num">${t('days', 'giorni')}</th></tr>`;
  for (let i = 0; i < n; i++) {
    const a = tr[i], b = conRows[i];
    const days = b ? (((conRows[(i + 1) % conRows.length][1] - b[1]) / 864e5 + 365.2422) % 365.2422).toFixed(1) : '';
    html += `<tr><td>${a ? signName(a[0]) : ''}</td><td>${a ? dateStr(a[1], false) : ''}</td><td>${b ? cname(b[0].name) : ''}</td><td>${b ? dateStr(b[1], false) : ''}</td><td class="num">${days}</td></tr>`;
  }
  $('sun').innerHTML = html;
}

/* ------------------------------------------------------------- shell ---- */

const sphere = makeSphere($('stage'));
let shown = null;
function frame(u) {
  const year = Math.round(u2y(u));
  if (year === shown) return;
  shown = year;
  sphere.update(year); drawDial(year); drawStrip(year); info(year);
  state.year = year; writeState(state);
}
const clk = clock({ seconds: 40, step: 2000 / (Y1 - Y0), onFrame: frame, home: y2u(NOW) });
$('year').addEventListener('input', () => { clk.pause(); clk.set(y2u(+$('year').value)); });
tables();
clk.set(y2u(state.year));
onLang(() => { tables(); const y = shown; shown = null; clk.set(y2u(y)); });
onTheme(() => { sphere.colours(); const y = shown; shown = null; clk.set(y2u(y)); });
