// The wheel of the natal chart in SVG: the ecliptic seen from its north pole,
// with the Ascendant on the left and the longitudes growing counterclockwise;
// zodiac band, house cusps and numbers, the bodies (moved apart where they
// crowd, with a line back to their true longitude) and the aspect lines.

import { norm, delta, signOf, GLYPH, SIGN_GLYPH, ASPECTS, NAME_EN, NAME_IT } from './core.js';
import { t } from '../i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent, text) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
const C = 300;
// radii: outer and inner edge of the zodiac, the column of the bodies, the
// ring of the house numbers and the circle of the aspects
const R0 = 296, R1 = 254, RG = 226, RD = 203, RS = 188, RM = 174, RR = 161, RH = 128, RN = 116, RA = 104;
const MINSEP = 8.5;

// spread the display angles of the bodies so that two are never closer than
// MINSEP degrees: the circle is cut in its widest gap, the bodies too close
// are merged into groups, and each group is laid at MINSEP steps around the
// mean of its true longitudes, merging again until no two groups touch
export function spread(lons, minsep = MINSEP) {
  const n = lons.length;
  if (n < 2) return lons.slice();
  const idx = lons.map((l, i) => i).sort((a, b) => norm(lons[a]) - norm(lons[b]));
  let cut = 0, wide = -1;
  for (let k = 0; k < n; k++) {
    const g = norm(lons[idx[(k + 1) % n]] - lons[idx[k]]);
    if (g > wide) { wide = g; cut = (k + 1) % n; }
  }
  const order = idx.slice(cut).concat(idx.slice(0, cut));
  const base = lons[order[0]], x = order.map(i => norm(lons[i] - base));
  let groups = x.map((v, k) => ({ from: k, to: k, sum: v }));
  const place = g => { const m = g.to - g.from + 1, c = g.sum / m; return [c - (m - 1) * minsep / 2, c + (m - 1) * minsep / 2]; };
  for (let changed = true; changed;) {
    changed = false;
    for (let k = 0; k + 1 < groups.length; k++) {
      if (place(groups[k + 1])[0] - place(groups[k])[1] < minsep - 1e-9) {
        const a = groups[k], b = groups[k + 1];
        groups.splice(k, 2, { from: a.from, to: b.to, sum: a.sum + b.sum });
        changed = true; break;
      }
    }
  }
  const out = new Array(n);
  for (const g of groups) {
    const [lo] = place(g);
    for (let k = g.from; k <= g.to; k++) out[order[k]] = norm(base + lo + (k - g.from) * minsep);
  }
  return out;
}

export function drawWheel(svg, ch) {
  svg.replaceChildren();
  const th = l => (180 + delta(ch.asc, l)) * Math.PI / 180;
  const P = (l, r) => [C + r * Math.cos(th(l)), C - r * Math.sin(th(l))];
  const fx = v => v.toFixed(2);
  const line = (l1, r1, l2, r2, cls, parent = svg) => {
    const [a, b] = P(l1, r1), [c, d] = P(l2, r2);
    return el('line', { x1: fx(a), y1: fx(b), x2: fx(c), y2: fx(d), class: cls }, parent);
  };
  const arcBand = (l0, l1, ra, rb, cls) => {
    const [a, b] = P(l0, ra), [c, d] = P(l1, ra), [e, f] = P(l1, rb), [g, h] = P(l0, rb);
    // counterclockwise on the screen: sweep 0 in SVG coordinates (y down)
    el('path', { d: `M${fx(a)},${fx(b)} A${ra},${ra} 0 0 0 ${fx(c)},${fx(d)} L${fx(e)},${fx(f)} A${rb},${rb} 0 0 1 ${fx(g)},${fx(h)} Z`, class: cls }, svg);
  };

  // the zodiac band, a sector per sign, shaded alternately
  for (let s = 0; s < 12; s++) {
    arcBand(30 * s, 30 * s + 30, R0, R1, 'w-band ' + (s % 2 ? 'o' : 'e'));
    line(30 * s, R0, 30 * s, R1, 'w-signline');
    const [x, y] = P(30 * s + 15, (R0 + R1) / 2);
    el('text', { x: fx(x), y: fx(y), class: 'w-sign' }, svg, SIGN_GLYPH[s]);
  }
  for (let d = 0; d < 360; d++) if (d % 30) line(d, R1, d, R1 - (d % 10 === 0 ? 9 : d % 5 === 0 ? 7 : 4), 'w-tick');
  for (const r of [R0, R1, RH, RA]) el('circle', { cx: C, cy: C, r, class: 'w-circle' }, svg);

  // the cusps, from the circle of the aspects to the zodiac, and the numbers
  // of the houses in the middle of each house
  const cu = ch.houses.cusps;
  for (let k = 1; k <= 12; k++) {
    const axis = ch.houses.used !== 'W' && ch.houses.used !== 'E' ? (k === 1 || k === 4 || k === 7 || k === 10) : (k === 1 || k === 7);
    if (!axis) line(cu[k], RA, cu[k], R1, 'w-cusp');
    const mid = cu[k] + norm(cu[k % 12 + 1] - cu[k]) / 2;
    const [x, y] = P(mid, RN);
    el('text', { x: fx(x), y: fx(y), class: 'w-hnum' }, svg, String(k));
  }
  // the axes: horizon (Ascendant, Descendant) and meridian (Midheaven,
  // Imum coeli), through the whole wheel and named outside it
  const axes = [[ch.asc, 'AC'], [ch.asc + 180, 'DC'], [ch.mc, 'MC'], [ch.mc + 180, 'IC']];
  for (const [l, name] of axes) {
    line(l, RA, l, R0 + 6, 'w-axis');
    const [x, y] = P(l, R0 + 20);
    const lab = el('text', { x: fx(x), y: fx(y), class: 'w-axislab' }, svg, name);
    const c = Math.cos(th(l));
    lab.setAttribute('text-anchor', c < -0.3 ? 'end' : c > 0.3 ? 'start' : 'middle');
  }

  // the aspect lines between the bodies (not the node), at their true longitudes
  const lonOf = Object.fromEntries(ch.bodies.map(b => [b.name, b.lon]));
  const g = el('g', {}, svg);
  for (const a of ch.aspects) {
    if (a.type === 'conj' || !(a.a in lonOf) || !(a.b in lonOf) || a.a === 'Node' || a.b === 'Node') continue;
    const ln = line(lonOf[a.a], RA, lonOf[a.b], RA, `w-asp ${a.type}${a.type === 'quin' || a.type === 'sext' ? ' minor' : ''}`, g);
    ln.dataset.a = a.a; ln.dataset.b = a.b;
    ln.style.opacity = (1 - 0.55 * Math.abs(a.orb) / 8).toFixed(2);
  }

  // the bodies: a tick at the true longitude, the glyph and the degrees at
  // the spread angle, stacked along the radius
  const shown = spread(ch.bodies.map(b => b.lon));
  ch.bodies.forEach((b, i) => {
    const gb = el('g', { class: 'w-body' + (b.name === 'Sun' || b.name === 'Moon' ? ' lum' : '') }, svg);
    gb.dataset.name = b.name;
    const d = shown[i];
    line(b.lon, R1, b.lon, R1 - 10, 'w-btick', gb);
    if (Math.abs(delta(b.lon, d)) > 0.3) {
      const [a1, a2] = P(b.lon, R1 - 10), [c1, c2] = P(d, RG + 14);
      el('line', { x1: fx(a1), y1: fx(a2), x2: fx(c1), y2: fx(c2), class: 'w-lead' }, gb);
    }
    const x = norm(b.lon) % 30;
    let deg = Math.floor(x), min = Math.round((x - deg) * 60);
    if (min === 60) { deg += 1; min = 0; }
    // the labels stacked inward along the ray at the spread angle, each as
    // close to the previous as their boxes allow in the direction of the ray
    // (on the sides of the wheel the step is set by the widths, at the top
    // and bottom by the heights)
    const items = [['w-glyph', GLYPH[b.name], 22, 22], ['w-deg', `${deg % 30}\u00B0`, 7.6 * String(deg % 30).length + 6, 13],
      ['w-sg', SIGN_GLYPH[signOf(b.lon)], 12, 13], ['w-min', `${String(min).padStart(2, '0')}\u2032`, 15, 11]];
    if (b.speed < 0) items.push(['w-r', 'R', 7, 11]);
    const c = Math.abs(Math.cos(th(d))), s = Math.abs(Math.sin(th(d)));
    let r = RG, prev = null;
    for (const [cls, text, w, h] of items) {
      if (prev) r -= Math.min(s > 1e-3 ? (prev[1] + h) / 2 / s : Infinity, c > 1e-3 ? (prev[0] + w) / 2 / c : Infinity) + 1.5;
      const [px, py] = P(d, r);
      el('text', { x: fx(px), y: fx(py), class: cls }, gb, text);
      prev = [w, h];
    }
    el('title', {}, gb, t(NAME_EN[b.name] || b.name, NAME_IT[b.name]));
  });
}

// the key of the aspect lines, under the wheel
export function drawKey(ul) {
  ul.replaceChildren();
  for (const a of ASPECTS) {
    if (a.key === 'conj') continue;
    const li = document.createElement('li');
    li.innerHTML = `<i class="${a.key === 'quin' || a.key === 'sext' ? 'minor' : ''}" style="border-color: var(--a-${a.key})"></i>${t(a.en, a.it)}`;
    ul.appendChild(li);
  }
}
