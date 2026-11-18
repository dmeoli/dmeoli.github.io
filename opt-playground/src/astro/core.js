// The computing core of the natal chart: positions of the bodies on the true
// ecliptic of date (Astronomy Engine, loaded as the global Astronomy), the
// sidereal time and the obliquity, the angles (Ascendant, Midheaven) and the
// house cusps in four systems, the aspects, and the conversion of a civil
// time in an IANA zone into universal time (the tz database of the browser).
// The formulas of the houses follow the General Manual of the Swiss
// Ephemeris and swehouse.c; everything is in degrees.

const A = () => globalThis.Astronomy;
const D = Math.PI / 180;
export const norm = x => ((x % 360) + 360) % 360;
const sin = x => Math.sin(x * D), cos = x => Math.cos(x * D), tan = x => Math.tan(x * D);
const atan2 = (y, x) => norm(Math.atan2(y, x) / D);
const asin = x => Math.asin(Math.max(-1, Math.min(1, x))) / D;
const acos = x => Math.acos(Math.max(-1, Math.min(1, x))) / D;
// signed difference b - a in (-180, 180]
export const delta = (a, b) => { const d = norm(b - a); return d > 180 ? d - 360 : d; };

export const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
export const SIGNS_IT = ['Ariete', 'Toro', 'Gemelli', 'Cancro', 'Leone', 'Vergine', 'Bilancia', 'Scorpione', 'Sagittario', 'Capricorno', 'Acquario', 'Pesci'];
// the glyphs, with U+FE0E so that no system draws them as emoji
const VS = '︎';
export const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS);
export const GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇', Node: '☊', Asc: 'Asc', MC: 'MC' };
for (const k in GLYPH) if (GLYPH[k].length === 1) GLYPH[k] += VS;
export const NAME_IT = { Sun: 'Sole', Moon: 'Luna', Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Uranus: 'Urano', Neptune: 'Nettuno', Pluto: 'Plutone', Node: 'Nodo nord', Asc: 'Ascendente', MC: 'Medio cielo' };
export const NAME_EN = { Node: 'North node', Asc: 'Ascendant', MC: 'Midheaven' };

/* ------------------------------------------------------------ time ---- */

// the offset (minutes east of Greenwich) of an IANA zone at a UTC instant,
// read from the parts that Intl writes for that instant
export function zoneOffset(zone, ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', era: 'short',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  let y = +p.year;
  if (p.era === 'BC' || p.era === 'B') y = 1 - y;
  const d = new Date(0);
  d.setUTCFullYear(y, +p.month - 1, +p.day);
  d.setUTCHours(+p.hour, +p.minute, +p.second, 0);
  return Math.round((d.getTime() - Math.floor(ms / 1000) * 1000) / 60000);
}

// a civil date and time (y, mo, d, h, mi, s) in a zone to the UTC instant;
// the result says whether the time does not exist (skipped by a change of
// clock) or occurs twice (in that case the first, as usual, is taken)
export function civilToUtc(y, mo, d, h, mi, s, zone) {
  const w = new Date(0);
  w.setUTCFullYear(y, mo - 1, d);
  w.setUTCHours(h, mi, s, 0);
  const wall = w.getTime();
  if (zone === 'UTC') return { ms: wall, offset: 0, status: 'ok' };
  const cands = new Set();
  for (const probe of [wall - 864e5, wall, wall + 864e5]) {
    const o = zoneOffset(zone, probe - 0);
    const ms = wall - o * 60000;
    if (zoneOffset(zone, ms) === o) cands.add(ms);
  }
  const list = [...cands].sort((a, b) => a - b);
  if (list.length) return { ms: list[0], offset: zoneOffset(zone, list[0]), status: list.length > 1 ? 'twice' : 'ok' };
  // a gap: the clock jumped over this time; read it with the offset before
  const o = zoneOffset(zone, wall - 864e5 / 4);
  return { ms: wall - o * 60000, offset: o, status: 'gap' };
}

/* ----------------------------------------------------------- bodies ---- */

export const eclOfDate = (body, time) => {
  const v = A().GeoVector(body, time, true), e = A().Ecliptic(v);
  return { lon: norm(e.elon), lat: e.elat, dist: v.Length() };
};

// the north node of the Moon: mean (polynomial of Meeus, Astronomical
// Algorithms, 47.7) or true, i.e., osculating (the ascending node of the
// plane of the geocentric position and velocity of the Moon)
function meanNode(time) {
  const T = time.tt / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
}
function trueNode(time) {
  const dt = 1 / 24, at = t => A().Ecliptic(A().GeoMoon(t)).vec;
  const r = at(time), a = at(time.AddDays(-dt)), b = at(time.AddDays(dt));
  const v = { x: (b.x - a.x) / (2 * dt), y: (b.y - a.y) / (2 * dt), z: (b.z - a.z) / (2 * dt) };
  const h = { x: r.y * v.z - r.z * v.y, y: r.z * v.x - r.x * v.z };
  // ascending node: the direction z x h
  return atan2(h.x, -h.y);
}

const H = 1 / 24;

// all that the chart needs, for a UTC instant and a place (lat north, lon east)
export function chart(ms, lat, lon, opts = {}) {
  const time = A().MakeTime(new Date(ms));
  const eps = A().e_tilt(time).tobl;
  const gast = A().SiderealTime(time);
  const armc = norm(gast * 15 + lon);
  const bodies = BODIES.map(name => {
    const p = eclOfDate(name, time);
    // the speed in degrees a day, by a central difference over two hours
    const q = eclOfDate(name, time.AddDays(-H)), r = eclOfDate(name, time.AddDays(H));
    return { name, lon: p.lon, lat: p.lat, dist: p.dist, speed: delta(q.lon, r.lon) / (2 * H) };
  });
  const nodeOf = opts.node === 'mean' ? meanNode : trueNode;
  const n0 = nodeOf(time), n1 = nodeOf(time.AddDays(H)), nm = nodeOf(time.AddDays(-H));
  bodies.push({ name: 'Node', lon: n0, lat: 0, dist: 0, speed: delta(nm, n1) / (2 * H) });
  const houses = houseCusps(opts.houses || 'P', armc, lat, eps);
  for (const b of bodies) b.house = houseOf(b.lon, houses.cusps);
  return { ms, time, lat, lon, eps, gast, armc, bodies, houses,
    asc: houses.asc, mc: houses.mc, aspects: aspects(bodies, houses) };
}

/* ----------------------------------------------------------- houses ---- */

// the point of the ecliptic that rises at latitude f when the right ascension
// of the meridian is x - 90 (Asc1 of swehouse.c)
const asc1 = (x, f, eps) => atan2(sin(x), cos(x) * cos(eps) - tan(f) * sin(eps));
export const ascendant = (armc, lat, eps) => asc1(armc + 90, lat, eps);
export const midheaven = (armc, eps) => atan2(sin(armc), cos(armc) * cos(eps));
// right ascension and declination of a point of the ecliptic
export const raOf = (l, eps) => atan2(sin(l) * cos(eps), cos(l));
export const declOf = (l, eps) => asin(sin(eps) * sin(l));

export const HOUSE_SYSTEMS = { P: 'Placidus', K: 'Koch', E: 'Equal', W: 'Whole sign' };

// Placidus: the cusp of house 11 is the point of the ecliptic that has run a
// third of its diurnal semi-arc since it crossed the meridian, house 12 two
// thirds, and houses 2 and 3 the same fractions of the nocturnal semi-arc
// after rising; found by fixed-point iteration on the right ascension
function placidus(armc, lat, eps) {
  const cusp = (k, part) => {
    let ra = armc + k;
    for (let i = 0; i < 100; i++) {
      const l = atan2(sin(ra), cos(ra) * cos(eps));
      const x = -tan(lat) * tan(declOf(l, eps));
      if (Math.abs(x) > 1) return NaN;
      const dsa = acos(x);
      const next = part(dsa);
      if (Math.abs(delta(ra, next)) < 1e-9) { ra = next; break; }
      ra = next;
    }
    return atan2(sin(ra), cos(ra) * cos(eps));
  };
  return {
    11: cusp(30, dsa => armc + dsa / 3), 12: cusp(60, dsa => armc + 2 * dsa / 3),
    2: cusp(120, dsa => armc + 60 + 2 * dsa / 3), 3: cusp(150, dsa => armc + 120 + dsa / 3)
  };
}

// Koch: the cusps are the ascendants of the times that trisect the diurnal
// semi-arc of the Midheaven (as in swehouse.c)
function koch(armc, lat, eps, mc) {
  const sina = Math.min(1, sin(mc) * sin(eps) / cos(lat));
  const cosa = Math.sqrt(1 - sina * sina);
  const c = Math.atan(tan(lat) / cosa) / D;
  const ad3 = asin(sin(c) * sina) / 3;
  return {
    11: asc1(armc + 30 - 2 * ad3, lat, eps), 12: asc1(armc + 60 - ad3, lat, eps),
    2: asc1(armc + 120 + ad3, lat, eps), 3: asc1(armc + 150 + 2 * ad3, lat, eps)
  };
}

// cusps[1..12]; Placidus and Koch do not exist where some degrees of the
// ecliptic never rise or never set, i.e., beyond the polar circles, and there
// the result says so and falls back to equal houses
export function houseCusps(sys, armc, lat, eps) {
  const asc = ascendant(armc, lat, eps), mc = midheaven(armc, eps);
  const cusps = new Array(13).fill(NaN);
  let used = sys, failed = null;
  if ((sys === 'P' || sys === 'K') && Math.abs(lat) >= 90 - eps) { failed = sys; used = 'E'; }
  if (used === 'P' || used === 'K') {
    const q = used === 'P' ? placidus(armc, lat, eps) : koch(armc, lat, eps, mc);
    if ([11, 12, 2, 3].some(k => !Number.isFinite(q[k]))) { failed = sys; used = 'E'; }
    else {
      cusps[1] = asc; cusps[10] = mc;
      for (const k of [11, 12, 2, 3]) cusps[k] = q[k];
      for (const k of [1, 2, 3, 10, 11, 12]) cusps[(k + 5) % 12 + 1] = norm(cusps[k] + 180);
    }
  }
  if (used === 'E') for (let k = 1; k <= 12; k++) cusps[k] = norm(asc + 30 * (k - 1));
  if (used === 'W') for (let k = 1; k <= 12; k++) cusps[k] = norm(Math.floor(asc / 30) * 30 + 30 * (k - 1));
  return { system: sys, used, failed, cusps, asc, mc };
}

export function houseOf(l, cusps) {
  for (let k = 1; k <= 12; k++) {
    const a = cusps[k], b = cusps[k % 12 + 1];
    if (norm(l - a) < norm(b - a)) return k;
  }
  return 12;
}

/* ---------------------------------------------------------- aspects ---- */

// the five major aspects of Ptolemy and the quincunx, with the orbs most
// programs use by default for the luminaries and the planets
export const ASPECTS = [
  { key: 'conj', angle: 0, orb: 8, glyph: '☌' + VS, en: 'conjunction', it: 'congiunzione' },
  { key: 'sext', angle: 60, orb: 5, glyph: '⚹' + VS, en: 'sextile', it: 'sestile' },
  { key: 'squa', angle: 90, orb: 7, glyph: '□' + VS, en: 'square', it: 'quadrato' },
  { key: 'trin', angle: 120, orb: 7, glyph: '△' + VS, en: 'trine', it: 'trigono' },
  { key: 'quin', angle: 150, orb: 3, glyph: '⚻' + VS, en: 'quincunx', it: 'quinconce' },
  { key: 'oppo', angle: 180, orb: 8, glyph: '☍' + VS, en: 'opposition', it: 'opposizione' }
];

export function aspects(bodies, houses) {
  const pts = bodies.concat([{ name: 'Asc', lon: houses.asc, speed: 0 }, { name: 'MC', lon: houses.mc, speed: 0 }]);
  const out = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const p = pts[i], q = pts[j];
    if ((p.name === 'Asc' || p.name === 'MC' || p.name === 'Node') && (q.name === 'Asc' || q.name === 'MC' || q.name === 'Node')) continue;
    const sep = Math.abs(delta(p.lon, q.lon));
    for (const a of ASPECTS) {
      const orb = sep - a.angle;
      // the orbs are smaller for the node and the angles
      const lim = (p.name === 'Node' || q.name === 'Asc' || q.name === 'MC' || q.name === 'Node') ? Math.min(a.orb, 5) : a.orb;
      if (Math.abs(orb) <= lim) {
        // applying when the separation moves toward the exact angle
        const sep2 = Math.abs(delta(p.lon + p.speed / 24, q.lon + q.speed / 24));
        const applying = Math.abs(sep2 - a.angle) < Math.abs(orb);
        out.push({ a: p.name, b: q.name, type: a.key, angle: a.angle, orb, applying });
      }
    }
  }
  return out.sort((x, y) => Math.abs(x.orb) - Math.abs(y.orb));
}

/* --------------------------------------------------------- formats ---- */

export const signOf = l => Math.floor(norm(l) / 30);
// degrees and minutes within the sign, e.g. 18°21'
export function dm(l) {
  let x = norm(l) % 30, d = Math.floor(x), m = Math.round((x - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  if (d === 30) d = 0;
  return `${d}°${String(m).padStart(2, '0')}′`;
}
export const fmtOrb = o => { const a = Math.abs(o), d = Math.floor(a), m = Math.round((a - d) * 60); return m === 60 ? `${d + 1}°00′` : `${d}°${String(m).padStart(2, '0')}′`; };
