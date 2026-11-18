// The computing core of the scenes of the sky (sky-*.html), next to the one
// of the natal chart (src/astro/core.js, which it reuses and does not change):
// geocentric and heliocentric positions in the ecliptic of J2000 and of date,
// the stations and the conjunctions of a planet, the mean circular orbits of
// an epicyclic model, the long-term precession of Vondrak, Capitaine and
// Wallace (2011), the constellation of a direction (IAU boundaries, through
// Astronomy Engine), the house systems that core.js does not have, the
// equation of time and the numbering of eclipses in Saros series.
// Everything is in degrees and days unless said otherwise.

import { norm, delta, ascendant, midheaven, houseCusps as chartCusps } from '../astro/core.js';
export { norm, delta };

const A = () => globalThis.Astronomy;
const D = Math.PI / 180;
const sin = x => Math.sin(x * D), cos = x => Math.cos(x * D), tan = x => Math.tan(x * D);
const atan2 = (y, x) => norm(Math.atan2(y, x) / D);
const asin = x => Math.asin(Math.max(-1, Math.min(1, x))) / D;
const atan = x => Math.atan(x) / D;

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
export const PLANET_IT = { Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Earth: 'Terra', Sun: 'Sole', Moon: 'Luna' };
export const inferior = p => p === 'Mercury' || p === 'Venus';

/* ------------------------------------------------------------ time ---- */

export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const timeOf = ms => A().MakeTime(new Date(ms));
export const msOf = t => t.date.getTime();
export const addDays = (ms, d) => ms + d * 864e5;
// a date as YYYY-MM-DD, also before year 1000 and before the common era
export function ymd(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  const ys = y < 0 ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0');
  return `${ys}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const ymdhm = ms => `${ymd(ms)} ${new Date(ms).toISOString().slice(11, 16)}`;

/* ------------------------------------------------------- positions ---- */

const ROT = { ecl: null };
// a vector of the equator of J2000 into the ecliptic of J2000
function eqjToEcl(v) {
  if (!ROT.ecl) ROT.ecl = A().Rotation_EQJ_ECL();
  return A().RotateVector(ROT.ecl, v);
}
const sph = v => ({ lon: atan2(v.y, v.x), lat: asin(v.z / Math.hypot(v.x, v.y, v.z)), dist: Math.hypot(v.x, v.y, v.z) });

// heliocentric position in the ecliptic of J2000 (AU), for the plan views
export function helio(body, ms) {
  const v = eqjToEcl(A().HelioVector(body, timeOf(ms)));
  return { x: v.x, y: v.y, z: v.z, ...sph(v) };
}
// geocentric apparent position in the ecliptic of J2000 (light time and
// aberration, no precession), for the views that share that frame
export function geoJ2000(body, ms) {
  const v = eqjToEcl(A().GeoVector(body, timeOf(ms), true));
  return { x: v.x, y: v.y, z: v.z, ...sph(v) };
}
// geocentric apparent longitude on the true ecliptic of date, as in the chart
// and in the ephemerides
export function geoOfDate(body, ms) {
  const e = A().Ecliptic(A().GeoVector(body, timeOf(ms), true));
  return { lon: norm(e.elon), lat: e.elat };
}
// the speed in longitude (degrees a day), by a central difference of two hours
export function speed(body, ms) {
  const h = 1 / 24;
  return delta(geoOfDate(body, addDays(ms, -h)).lon, geoOfDate(body, addDays(ms, h)).lon) / (2 * h);
}

// the stations (speed zero) in [ms0, ms1]: sampled every day, then bisected
// to a few seconds; kind 'R' when the planet turns retrograde, 'D' direct
export function stations(body, ms0, ms1) {
  const out = [], step = 1;
  let a = ms0, sa = speed(body, a);
  for (let b = addDays(a, step); b <= ms1; b = addDays(b, step)) {
    const sb = speed(body, b);
    if (Math.sign(sa) === Math.sign(sb)) { a = b; sa = sb; continue; }
    let lo = a, hi = b, slo = sa;
    for (let i = 0; i < 40 && hi - lo > 2000; i++) {
      const m = (lo + hi) / 2, sm = speed(body, m);
      if (Math.sign(sm) === Math.sign(slo)) { lo = m; slo = sm; } else hi = m;
    }
    const ms = (lo + hi) / 2;
    out.push({ ms, kind: sa > 0 ? 'R' : 'D', lon: geoOfDate(body, ms).lon });
    a = b; sa = sb;
  }
  return out;
}

// the conjunctions and oppositions with the Sun in geocentric longitude
// (Astronomy Engine searches the heliocentric relative longitude, which is 0
// at an inferior conjunction or an opposition and 180 at a superior
// conjunction); kind: 'inf', 'sup' or 'opp'
export function synodicEvents(body, ms0, ms1) {
  const out = [];
  for (const rel of [0, 180]) {
    let t = timeOf(ms0);
    for (;;) {
      const e = A().SearchRelativeLongitude(body, rel, t);
      const ms = msOf(e);
      if (ms > ms1) break;
      const kind = rel === 180 ? 'sup' : inferior(body) ? 'inf' : 'opp';
      const g = refineElongation(body, ms, kind === 'opp' ? 180 : 0);
      out.push({ ms: g, kind, lon: geoOfDate(body, g).lon });
      t = timeOf(addDays(ms, 10));
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// the instant near ms when the geocentric longitudes of the body and of the
// Sun differ by off (0 or 180), as the ephemerides define a conjunction or an
// opposition; the heliocentric search above is within a few hours of it
function refineElongation(body, ms, off) {
  const f = m => delta(geoOfDate('Sun', m).lon + off, geoOfDate(body, m).lon);
  let lo = addDays(ms, -1), hi = addDays(ms, 1), flo = f(lo);
  if (Math.sign(flo) === Math.sign(f(hi))) return ms;
  for (let i = 0; i < 40 && hi - lo > 1000; i++) {
    const m = (lo + hi) / 2, fm = f(m);
    if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m;
  }
  return (lo + hi) / 2;
}

/* -------------------------------------------- mean circular orbits ---- */

// mean elements for J2000 of Standish (JPL, "Keplerian elements for
// approximate positions of the major planets", table 1): semi-major axis (AU),
// mean longitude at J2000 and its rate (degrees a Julian century); the Earth
// is the Earth-Moon barycentre
export const MEAN = {
  Mercury: [0.38709927, 252.25032350, 149472.67411175],
  Venus: [0.72333566, 181.97909950, 58517.81538729],
  Earth: [1.00000261, 100.46457166, 35999.37244981],
  Mars: [1.52371034, -4.55343205, 19140.30268499],
  Jupiter: [5.20288700, 34.39644051, 3034.74612775],
  Saturn: [9.53667594, 49.95424423, 1222.49362201]
};
export const meanLon = (body, ms) => { const [, L, n] = MEAN[body]; return norm(L + n * (ms - J2000_MS) / 864e5 / 36525); };
export const sidereal = body => 360 / (MEAN[body][2] / 36525);
export const synodic = body => 1 / Math.abs(1 / sidereal(body) - 1 / sidereal('Earth'));

// the epicyclic model that the circular coplanar orbits imply: the planet
// rides an epicycle whose centre runs on a deferent round the Earth. For a
// superior planet the deferent has the radius and the motion of the orbit of
// the planet and the radius of the epicycle stays parallel to the line from
// the Earth to the mean Sun; for an inferior planet the deferent carries the
// mean Sun and the epicycle is the orbit of the planet. In both cases the sum
// is exactly the difference of the two circular orbits.
export function epicycle(body, ms) {
  const lp = meanLon(body, ms), le = meanLon('Earth', ms), ap = MEAN[body][0], ae = MEAN.Earth[0];
  const [R, ld, r, le2] = inferior(body) ? [ae, le + 180, ap, lp] : [ap, lp, ae, le + 180];
  const c = { x: R * cos(ld), y: R * sin(ld) };
  const p = { x: c.x + r * cos(le2), y: c.y + r * sin(le2) };
  return { R, r, centre: c, planet: p, lon: atan2(p.y, p.x) };
}

/* ------------------------------------------------------- precession ---- */

// long-term precession, Vondrak, Capitaine and Wallace, A&A 534, A22 (2011)
// and its erratum, A&A 541, C1 (2012): the poles of the ecliptic and of the
// equator of date in the frame of the equator of J2000, valid within some
// 200000 years; the coefficients are those of ltpecl and ltpequ of ERFA
const AS = D / 3600, EPS0 = 84381.406 * AS;
const PQPOL = [[5851.607687, -0.1189000, -0.00028913, 0.000000101], [-1600.886300, 1.1689818, -0.00000020, -0.000000437]];
const PQPER = [[708.15, -5486.751211, -684.661560, 667.666730, -5523.863691], [2309.00, -17.127623, 2446.283880, -2354.886252, -549.747450],
  [1620.00, -617.517403, 399.671049, -428.152441, -310.998056], [492.20, 413.442940, -356.652376, 376.202861, 421.535876],
  [1183.00, 78.614193, -186.387003, 184.778874, -36.776172], [622.00, -180.732815, -316.800070, 335.321713, -145.278396],
  [882.00, -87.676083, 198.296701, -185.138669, -34.744450], [547.00, 46.140315, 101.135679, -120.972830, 22.885731]];
const XYPOL = [[5453.282155, 0.4252841, -0.00037173, -0.000000152], [-73750.930350, -0.7675452, -0.00018725, 0.000000231]];
const XYPER = [[256.75, -819.940624, 75004.344875, 81491.287984, 1558.515853], [708.15, -8444.676815, 624.033993, 787.163481, 7774.939698],
  [274.20, 2600.009459, 1251.136893, 1251.296102, -2219.534038], [241.45, 2755.175630, -1102.212834, -1257.950837, -2523.969396],
  [2309.00, -167.659835, -2660.664980, -2966.799730, 247.850422], [492.20, 871.855056, 699.291817, 639.744522, -846.485643],
  [396.10, 44.769698, 153.167220, 131.600209, -1393.124055], [288.90, -512.313065, -950.865637, -445.040117, 368.526116],
  [231.10, -819.415595, 499.754645, 584.522874, 749.045012], [1610.00, -538.071099, -145.188210, -89.756563, 444.704518],
  [620.00, -189.793622, 558.116553, 524.429630, 235.934465], [157.87, -402.922932, -23.923029, -13.549067, 374.049623],
  [220.30, 179.516345, -165.405086, -210.157124, -171.330180], [1200.00, -9.814756, 9.344131, -44.919798, -22.899655]];
function series(epj, pol, per) {
  const t = (epj - 2000) / 100, w = 2 * Math.PI * t;
  let a = 0, b = 0;
  for (const [P, c1, c2, s1, s2] of per) { const x = w / P, s = Math.sin(x), c = Math.cos(x); a += c * c1 + s * s1; b += c * c2 + s * s2; }
  for (let i = 0, p = 1; i < 4; i++, p *= t) { a += pol[0][i] * p; b += pol[1][i] * p; }
  return [a * AS, b * AS];
}
// epj: Julian epoch (2000 + days since J2000 / 365.25)
export function eclipticPole(epj) {
  const [p, q] = series(epj, PQPOL, PQPER), w = Math.sqrt(Math.max(0, 1 - p * p - q * q));
  const s = Math.sin(EPS0), c = Math.cos(EPS0);
  return { x: p, y: -q * c - w * s, z: -q * s + w * c };
}
export function equatorPole(epj) {
  const [x, y] = series(epj, XYPOL, XYPER);
  return { x, y, z: Math.sqrt(Math.max(0, 1 - x * x - y * y)) };
}
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = v => { const n = Math.hypot(v.x, v.y, v.z); return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
// the mean equinox of date (the node of the equator on the ecliptic, both of
// date) in the equator of J2000, its right ascension and declination there,
// its longitude and latitude on the ecliptic of J2000, and the obliquity
export function equinox(epj) {
  const pe = equatorPole(epj), pk = eclipticPole(epj);
  const v = unit(cross(pe, pk));
  const ra = atan2(v.y, v.x), dec = asin(v.z);
  const s = Math.sin(EPS0), c = Math.cos(EPS0);
  const e = { x: v.x, y: v.y * c + v.z * s, z: -v.y * s + v.z * c };
  return { vec: v, pole: pe, eclPole: pk, ra, dec, lon: atan2(e.y, e.x), lat: asin(e.z), eps: Math.acos(dot(pe, pk)) / D };
}
// a point of the ecliptic of J2000 to the equator of J2000
export function eclToEq(lon, lat = 0) {
  const s = Math.sin(EPS0), c = Math.cos(EPS0), x = cos(lat) * cos(lon), y = cos(lat) * sin(lon), z = sin(lat);
  return { x, y: y * c - z * s, z: y * s + z * c };
}
// the IAU constellation (boundaries of Delporte, 1930, as tabulated by
// Davenhall and Leggett, CDS VI/49) of a direction of the equator of J2000
export function constellation(v) {
  const ra = atan2(v.y, v.x) / 15, dec = asin(v.z / Math.hypot(v.x, v.y, v.z));
  return A().Constellation(ra, dec);
}
// the general precession in longitude accumulated from J2000 to the epoch,
// i.e. minus the longitude of the equinox of date on the ecliptic of J2000,
// unwrapped through a table every 100 years (built once) so that it can
// exceed 180 degrees
const PGRID = { y0: -30000, step: 100, v: null };
function pgrid() {
  if (PGRID.v) return PGRID.v;
  const n = (34000 - PGRID.y0) / PGRID.step, v = new Float64Array(n + 1), i0 = (2000 - PGRID.y0) / PGRID.step;
  const L = i => -equinox(PGRID.y0 + i * PGRID.step).lon;
  v[i0] = 0;
  for (let i = i0 + 1; i <= n; i++) v[i] = v[i - 1] + delta(L(i - 1), L(i));
  for (let i = i0 - 1; i >= 0; i--) v[i] = v[i + 1] + delta(L(i + 1), L(i));
  return (PGRID.v = v);
}
export function precessionSince2000(epj) {
  const v = pgrid(), i = Math.max(0, Math.min(v.length - 1, Math.round((epj - PGRID.y0) / PGRID.step)));
  return v[i] + delta(-equinox(PGRID.y0 + i * PGRID.step).lon, -equinox(epj).lon);
}
// the ayanamsa of a sidereal zodiac whose 0 Aries held the equinox in year0
export const ayanamsa = (epj, year0) => precessionSince2000(epj) - precessionSince2000(year0);
// the years in which the equinox crosses a sign of 30 degrees of that zodiac
export const AYANAMSA_ZERO = { lahiri: 285.7, fagan_bradley: 222.0 };

// the stretches of the ecliptic of J2000 that lie in each constellation,
// from 0 to 360 (the first and the last are both Pisces)
export function eclipticConstellations() {
  const at = l => constellation(eclToEq(l)).symbol, out = [];
  let prev = at(0), from = 0;
  for (let l = 0.25; l <= 360; l += 0.25) {
    const c = at(l);
    if (c === prev) continue;
    let lo = l - 0.25, hi = l;
    while (hi - lo > 1e-6) { const m = (lo + hi) / 2; if (at(m) === prev) lo = m; else hi = m; }
    out.push({ symbol: prev, name: constellation(eclToEq((from + hi) / 2)).name, from, to: hi });
    prev = c; from = hi;
  }
  out.push({ symbol: prev, name: constellation(eclToEq((from + 360) / 2)).name, from, to: 360 });
  return out;
}
// the instant (ms) when the Sun reaches an apparent longitude of date, in
// the year that starts at ms0
export const sunAt = (lon, ms0) => msOf(A().SearchSunLongitude(norm(lon), timeOf(ms0), 370));

/* ----------------------------------------------------------- houses ---- */

const asc1 = (x, f, eps) => atan2(sin(x), cos(x) * cos(eps) - tan(f) * sin(eps));

// seven systems: Placidus and Koch from the chart (where they exist),
// Porphyry, Regiomontanus, Campanus, equal and whole sign as in swehouse.c
// of the Swiss Ephemeris, with its conventions beyond the polar circles
export const SYSTEMS = ['P', 'K', 'O', 'R', 'C', 'E', 'W'];
export const SYSTEM_NAME = { P: ['Placidus', 'Placidus'], K: ['Koch', 'Koch'], O: ['Porphyry', 'Porfirio'], R: ['Regiomontanus', 'Regiomontano'],
  C: ['Campanus', 'Campano'], E: ['Equal', 'Uguali'], W: ['Whole sign', 'Segno intero'] };

export function cusps(sys, armc, lat, eps) {
  if (sys === 'P' || sys === 'K') {
    const h = chartCusps(sys, armc, lat, eps);
    return { cusps: h.failed ? new Array(13).fill(NaN) : h.cusps, asc: h.asc, mc: h.mc, failed: !!h.failed };
  }
  let asc = ascendant(armc, lat, eps), mc = midheaven(armc, eps);
  const c = new Array(13).fill(NaN);
  // within the polar circles the Ascendant can fall west of the Midheaven
  // (the point that rises is then on the other side); the Swiss Ephemeris
  // takes the opposite point, the Descendant, as Ascendant, and in the
  // systems of Regiomontanus and Campanus turns the Midheaven to the north
  const west = delta(mc, asc) < 0;
  if (sys === 'E' || sys === 'W') {
    if (west) asc = norm(asc + 180);
    const a0 = sys === 'E' ? asc : Math.floor(asc / 30) * 30;
    for (let k = 1; k <= 12; k++) c[k] = norm(a0 + 30 * (k - 1));
    return { cusps: c, asc, mc, failed: false };
  }
  if (sys === 'O') {
    if (west) asc = norm(asc + 180);
    const acmc = delta(mc, asc);
    c[1] = asc; c[10] = mc;
    c[11] = norm(mc + acmc / 3); c[12] = norm(mc + 2 * acmc / 3);
    c[2] = norm(asc + (180 - acmc) / 3); c[3] = norm(asc + 2 * (180 - acmc) / 3);
  } else {
    c[1] = asc; c[10] = mc;
    if (sys === 'R') {
      const fh1 = atan(tan(lat) * 0.5), fh2 = atan(tan(lat) * cos(30));
      c[11] = asc1(armc + 30, fh1, eps); c[12] = asc1(armc + 60, fh2, eps);
      c[2] = asc1(armc + 120, fh2, eps); c[3] = asc1(armc + 150, fh1, eps);
    } else {
      const fh1 = asin(sin(lat) / 2), fh2 = asin(Math.sqrt(3) / 2 * sin(lat)), cf = cos(lat);
      const xh1 = atan(Math.sqrt(3) / cf), xh2 = atan(1 / Math.sqrt(3) / cf);
      c[11] = asc1(armc + 90 - xh1, fh1, eps); c[12] = asc1(armc + 90 - xh2, fh2, eps);
      c[2] = asc1(armc + 90 + xh2, fh2, eps); c[3] = asc1(armc + 90 + xh1, fh1, eps);
    }
    if (Math.abs(lat) >= 90 - eps && west) {
      asc = norm(asc + 180); mc = norm(mc + 180);
      for (const k of [10, 11, 12, 1, 2, 3]) c[k] = norm(c[k] + 180);
    }
  }
  for (const k of [1, 2, 3, 10, 11, 12]) c[(k + 5) % 12 + 1] = norm(c[k] + 180);
  return { cusps: c, asc, mc, failed: false };
}
// the sizes of the twelve houses (degrees of ecliptic)
export const sizes = c => Array.from({ length: 12 }, (_, i) => norm(c[(i + 1) % 12 + 1] - c[i + 1]));

/* -------------------------------------------------- equation of time ---- */

// apparent minus mean solar time, in minutes, from the hour angle of the Sun
// at Greenwich; and its two parts, the equation of the centre (eccentricity:
// mean minus true longitude) and the reduction to the equator (obliquity:
// true longitude minus right ascension)
export function equationOfTime(ms) {
  const t = timeOf(ms), obs = new (A().Observer)(0, 0, 0);
  const eq = A().Equator('Sun', t, obs, true, true);
  const ha = A().SiderealTime(t) - eq.ra;              // hours
  const ut = ((ms % 864e5) + 864e5) % 864e5 / 36e5;
  let e = (ha + 12 - ut) * 60;
  e = ((e % 1440) + 2160) % 1440 - 720;
  const lam = A().SunPosition(t).elon;
  const ecc = delta(lam, meanSun(ms)) * 4;
  return { total: e, ecc, obl: e - ecc };
}
// the mean longitude of the Sun on the ecliptic of date (Meeus 25.2)
export function meanSun(ms) {
  const T = (ms - J2000_MS) / 864e5 / 36525;
  return norm(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
}

/* ------------------------------------------------------------ Saros ---- */

// the number of the new moon (k of Meeus, 0 on 2000 January 6) nearest to an
// instant, and the series: a Saros is 223 lunations and an inex 358, and the
// number of the series grows by one from an eclipse to the next one an inex
// later, so it is a*k + b modulo 223 with 358 a = 1 (mod 223); b is fixed by
// one eclipse of known series (solar 2017-08-21, 145; lunar 2025-03-14, 123)
const SYN = 29.530588861, K0 = Date.UTC(2000, 0, 6, 18, 14);
export const lunation = ms => (ms - K0) / 864e5 / SYN;
let INV = 1;
while ((358 * INV) % 223 !== 1) INV++;
const mod = (x, m) => ((x % m) + m) % m;
const B_SOL = mod(145 - INV * Math.round(lunation(Date.UTC(2017, 7, 21, 18, 26))), 223);
const B_LUN = mod(123 - INV * Math.round(lunation(Date.UTC(2025, 2, 14, 6, 59)) - 0.5), 223);
export function saros(ms, solar) {
  const k = solar ? Math.round(lunation(ms)) : Math.round(lunation(ms) - 0.5);
  const s = mod(INV * k + (solar ? B_SOL : B_LUN), 223);
  return s === 0 ? 223 : s;
}
export const SAROS_DAYS = 223 * SYN;

// the eclipses in [ms0, ms1], solar (global) and lunar, from Astronomy Engine
export function eclipses(ms0, ms1) {
  const out = [];
  for (let e = A().SearchGlobalSolarEclipse(timeOf(ms0)); msOf(e.peak) <= ms1; e = A().NextGlobalSolarEclipse(e.peak)) {
    const ms = msOf(e.peak);
    out.push({ ms, solar: true, kind: e.kind, lat: e.latitude, lon: e.longitude, saros: saros(ms, true), k: Math.round(lunation(ms)) });
  }
  for (let e = A().SearchLunarEclipse(timeOf(ms0)); msOf(e.peak) <= ms1; e = A().NextLunarEclipse(e.peak)) {
    const ms = msOf(e.peak);
    out.push({ ms, solar: false, kind: e.kind, saros: saros(ms, false), k: Math.round(lunation(ms) - 0.5) + 0.5 });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/* ------------------------------------------------- rational ratios ---- */

// the convergents p/q of a positive real number (continued fraction)
export function convergents(x, n = 6) {
  const out = [];
  let h0 = 1, h1 = 0, k0 = 0, k1 = 1, y = x;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(y);
    [h0, h1] = [a * h0 + h1, h0]; [k0, k1] = [a * k0 + k1, k0];
    out.push([h0, k0]);
    if (y - a < 1e-12) break;
    y = 1 / (y - a);
  }
  return out;
}
