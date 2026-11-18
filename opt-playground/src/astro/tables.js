// The three tables of a chart (positions, cusps, aspects) as HTML, in the
// language of the page; the scene and the booklet print the same ones.

import { GLYPH, SIGN_GLYPH, SIGNS, SIGNS_IT, NAME_EN, NAME_IT, ASPECTS, signOf, dm, fmtOrb } from './core.js';
import { t } from '../i18n.js';

const nm = n => t(NAME_EN[n] || n, NAME_IT[n]);
const sign = l => t(SIGNS[signOf(l)], SIGNS_IT[signOf(l)]);
const th = cells => `<tr>${cells.map(c => `<th${c[1] ? ` class="${c[1]}"` : ''}>${c[0]}</th>`).join('')}</tr>`;

export function positionsTable(ch) {
  let h = '<thead>' + th([['', 'g'], [t('body', 'corpo')], ['', 'g'], [t('sign', 'segno'), 'sn'], [t('degree', 'grado'), 'num'], [t('house', 'casa'), 'num'], ['']]) + '</thead><tbody>';
  for (const b of ch.bodies) {
    h += `<tr data-name="${b.name}"><td class="g body">${GLYPH[b.name]}</td><td>${nm(b.name)}</td><td class="g">${SIGN_GLYPH[signOf(b.lon)]}</td><td class="sn">${sign(b.lon)}</td><td class="num">${dm(b.lon)}</td><td class="num">${b.house}</td><td class="r">${b.speed < 0 ? 'R' : ''}</td></tr>`;
  }
  for (const [n, l] of [['Asc', ch.asc], ['MC', ch.mc]]) {
    h += `<tr class="ang" data-name="${n}"><td class="g body">${n === 'Asc' ? 'AC' : 'MC'}</td><td>${nm(n)}</td><td class="g">${SIGN_GLYPH[signOf(l)]}</td><td class="sn">${sign(l)}</td><td class="num">${dm(l)}</td><td class="num"></td><td></td></tr>`;
  }
  return h + '</tbody>';
}

export function cuspsTable(ch) {
  let h = '<thead>' + th([[t('house', 'casa'), 'num'], ['', 'g'], [t('sign', 'segno')], [t('cusp', 'cuspide'), 'num']]) + '</thead><tbody>';
  for (let k = 1; k <= 12; k++) {
    const l = ch.houses.cusps[k];
    h += `<tr><td class="num">${k}</td><td class="g">${SIGN_GLYPH[signOf(l)]}</td><td>${sign(l)}</td><td class="num">${dm(l)}</td></tr>`;
  }
  return h + '</tbody>';
}

export function aspectsTable(ch) {
  let h = '<thead>' + th([['', 'g'], [t('aspect', 'aspetto')], ['', 'g'], [t('orb', 'orbita'), 'num'], ['']]) + '</thead><tbody>';
  const gl = n => (n === 'Asc' ? 'AC' : GLYPH[n]);
  for (const a of ch.aspects) {
    const A = ASPECTS.find(x => x.key === a.type);
    h += `<tr data-a="${a.a}" data-b="${a.b}"><td class="g body" title="${nm(a.a)}">${gl(a.a)}</td><td class="${a.type}">${A.glyph} ${t(A.en, A.it)}</td><td class="g body" title="${nm(a.b)}">${gl(a.b)}</td><td class="num">${fmtOrb(a.orb)}</td><td>${a.applying ? 'a' : 's'}</td></tr>`;
  }
  if (!ch.aspects.length) h += `<tr><td colspan="5">${t('none', 'nessuno')}</td></tr>`;
  return h + '</tbody>';
}
