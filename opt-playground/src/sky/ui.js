// What the scenes of the sky share: SVG elements, the colours of the theme,
// the state kept in the address, the clock of Reset, Step and Play, and the
// formats of angles and dates.

import { t, lang, onLang } from '../i18n.js';
import { norm } from './core.js';

export const $ = id => document.getElementById(id);
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const NS = 'http://www.w3.org/2000/svg';
export function el(tag, attrs = {}, parent = null, text = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
export const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); };
export const path = pts => pts.length ? 'M' + pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L') : '';
// a polyline broken where it jumps (e.g. across the edge of a strip)
export function brokenPath(pts, jump) {
  let d = '', prev = null;
  for (const p of pts) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { prev = null; continue; }
    d += (prev && Math.abs(p[0] - prev[0]) < jump ? 'L' : 'M') + `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    prev = p;
  }
  return d;
}

// the state of a scene in the address (#k=v&...), read once and written on
// every change, so that a link reopens the same view
export function readState(defaults) {
  const q = new URLSearchParams(location.hash.slice(1)), s = { ...defaults };
  for (const k in defaults) if (q.has(k)) s[k] = typeof defaults[k] === 'number' ? +q.get(k) : q.get(k);
  for (const k in s) if (typeof defaults[k] === 'number' && !Number.isFinite(s[k])) s[k] = defaults[k];
  return s;
}
export function writeState(s) {
  const q = new URLSearchParams();
  for (const k in s) q.set(k, typeof s[k] === 'number' ? +s[k].toFixed(4) : s[k]);
  history.replaceState(null, '', '#' + q.toString());
}

// the clock: a position u in [0, 1] that Play runs in `seconds`, Step moves by
// `step`, Reset sends back to `home` (0 unless said); Play at the end starts
// again from 0
export function clock({ seconds = 12, step = 0.05, onFrame, play = 'play', stepId = 'step', reset = 'reset', home = 0 }) {
  let u = 0, running = false, last = 0;
  const btn = $(play);
  const label = () => { btn.innerHTML = running ? `<span data-l="en">Pause</span><span data-l="it" lang="it">Pausa</span>` : `<span data-l="en">Play</span><span data-l="it" lang="it">Avvia</span>`; };
  const set = x => { u = Math.max(0, Math.min(1, x)); onFrame(u); };
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (u >= 1) { running = false; label(); return; }
    set(u + dt / c.seconds);
    requestAnimationFrame(tick);
  }
  const c = {
    seconds, home,
    get u() { return u; },
    set,
    play() { c.pause(); if (u >= 1) u = 0; running = true; last = performance.now(); label(); requestAnimationFrame(tick); },
    pause() { running = false; cancelAnimationFrame(glide); aim = null; label(); },
    get running() { return running; }
  };
  btn.addEventListener('click', () => (running ? c.pause() : c.play()));
  // Step glides to the next position in 0.5 s (a jump when motion is reduced)
  let glide = 0, aim = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function stepTo(x) {
    cancelAnimationFrame(glide);
    if (still.matches) return set(x);
    const a = u, t0 = performance.now();
    const f = now => {
      const k = Math.min(1, (now - t0) / 500);
      set(a + (x - a) * k * k * (3 - 2 * k));
      if (k < 1) glide = requestAnimationFrame(f); else aim = null;
    };
    aim = x;
    glide = requestAnimationFrame(f);
  }
  $(stepId)?.addEventListener('click', () => { const b = aim ?? u; c.pause(); b >= 1 ? set(0) : stepTo(Math.min(1, b + step)); });
  $(reset)?.addEventListener('click', () => { c.pause(); set(c.home); });
  label();
  return c;
}

/* --------------------------------------------------------- formats ---- */

export const SIGN_EN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const SIGN_IT = ['Ariete', 'Toro', 'Gemelli', 'Cancro', 'Leone', 'Vergine', 'Bilancia', 'Scorpione', 'Sagittario', 'Capricorno', 'Acquario', 'Pesci'];
export const SIGN_ABBR = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
const VS = '︎';
export const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS);
export const signName = i => t(SIGN_EN[i], SIGN_IT[i]);
// a longitude as degrees and minutes in its sign, e.g. 18°21′ Leo
export function lonSign(l) {
  l = norm(l);
  let s = Math.floor(l / 30), x = l - 30 * s, d = Math.floor(x), m = Math.round((x - d) * 60);
  if (m === 60) { d++; m = 0; }
  if (d === 30) { d = 0; s = (s + 1) % 12; }
  return `${d}°${String(m).padStart(2, '0')}′ ${signName(s)}`;
}
export const deg = (x, n = 1) => `${x.toFixed(n)}°`;
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
// a date as 16 Jan 2025 / 16 gen 2025 (UTC)
export function dateStr(ms, withYear = true) {
  const d = new Date(ms), m = d.getUTCMonth();
  return `${d.getUTCDate()} ${t(MON_EN[m], MON_IT[m])}${withYear ? ' ' + d.getUTCFullYear() : ''}`;
}
export const yearStr = y => (y < 1 ? t(`${1 - Math.floor(y)} BC`, `${1 - Math.floor(y)} a.C.`) : String(Math.floor(y)));

// the options written <option data-it="..."> follow the language
export function relangOptions(lang) {
  for (const o of document.querySelectorAll('option[data-it]')) {
    if (!o.dataset.en) o.dataset.en = o.textContent;
    o.textContent = lang === 'it' ? o.dataset.it : o.dataset.en;
  }
}

// the labels for screen readers written aria-label="..." data-aria-it="..."
// follow the language
export function relangAria() {
  for (const e of document.querySelectorAll('[data-aria-it]')) {
    if (!e.dataset.ariaEn) e.dataset.ariaEn = e.getAttribute('aria-label');
    e.setAttribute('aria-label', lang() === 'it' ? e.dataset.ariaIt : e.dataset.ariaEn);
  }
}
relangAria();
onLang(relangAria);
