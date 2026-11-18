// The factors of a chart that the booklet can tell, computed from the chart
// of core.js and weighed by src/astro/rules.json: the sign and the house of
// each body, the aspects, the bodies on the angles, the balance of elements
// and modalities, the hemispheres, the ruler of the chart, the dominant
// planets, the patterns (T-square, grand trine, grand cross, yod, stellium),
// the retrograde planets, the emphasised signs and houses; and, for the year
// ahead, the transits of the slow planets to the natal bodies and angles, with
// the dates on which each is exact, found by bisection on the ephemeris.
// Every factor is { key, weight, tags, data }; the key names its fragment.

import { BODIES, SIGNS, ASPECTS, norm, delta, signOf, eclOfDate } from './core.js';

const TEN = BODIES.filter(b => b !== 'Node');
const ANGLE_OF = { Asc: c => c.asc, Dsc: c => c.asc + 180, MC: c => c.mc, IC: c => c.mc + 180 };

// the keys that a family of the rules can produce (as tools/astro_coverage.py)
export function selectable(R) {
  const out = new Set();
  for (const f of R.families) {
    if (f.pairs) { for (const [a, b, fs] of f.pairs) for (const x of fs) out.add(f.key.replace('{a}', a).replace('{b}', b).replace('{f}', x)); continue; }
    let keys = [f.key];
    for (const [v, vals] of Object.entries(f.vars)) {
      const list = typeof vals === 'string' ? R.sets[vals] : vals;
      keys = keys.flatMap(k => list.map(x => k.replace(`{${v}}`, x)));
    }
    keys.forEach(k => out.add(k));
  }
  return out;
}

const tightness = (orb, lim, floor) => 1 - (1 - floor) * Math.min(1, Math.abs(orb) / lim);
const orbLimit = (type, a, b) => {
  const o = ASPECTS.find(x => x.key === type).orb;
  return [a, b].some(n => n === 'Asc' || n === 'MC' || n === 'Node') ? Math.min(o, 5) : o;
};

export function factors(ch, R) {
  const W = R.weights, Z = R.zodiac, T = R.conflicts.tags;
  const ok = selectable(R);
  const items = [];
  const add = (key, weight, data = {}, tags = []) => {
    if (!ok.has(key)) return;
    items.push({ key, weight: Math.round(weight * 100) / 100, data, tags: [...new Set(tags)] });
  };
  const body = Object.fromEntries(ch.bodies.map(b => [b.name, b]));
  const lonOf = n => (n === 'Asc' ? ch.asc : n === 'MC' ? ch.mc : body[n].lon);
  const signName = l => SIGNS[signOf(l)];
  const elementOf = s => Z.element[SIGNS.indexOf(s) % 4];
  const modalityOf = s => Z.modality[SIGNS.indexOf(s) % 3];
  const signTags = s => [...(T.element[elementOf(s)] || []), ...(T.modality[modalityOf(s)] || [])];
  const planetTags = (...ns) => ns.flatMap(n => T.planet[n] || []);

  // the ruler of the chart: the ruler of the sign of the Ascendant
  const ruler = Z.rulers[signName(ch.asc)];
  const dignity = (p, s) => ((Z.domicile[p] || []).includes(s) ? W.sign_dignity.domicile : Z.exaltation[p] === s ? W.sign_dignity.exaltation : 1);

  // sign and house of each body and angle
  for (const p of TEN.concat(['Asc', 'MC'])) {
    const s = signName(lonOf(p));
    add(`sign.${p}.${s}`, W.body[p] * dignity(p, s) + (p === ruler ? W.ruler_bonus : 0), { p, sign: s }, signTags(s));
  }
  for (const p of TEN) {
    const h = body[p].house;
    add(`house.${p}.${h}`, W.body[p] * W.house_kind[h] + (p === ruler ? W.ruler_bonus : 0), { p, house: h });
  }

  // the bodies on the angles
  const angular = [];
  for (const p of TEN) for (const x of ['Asc', 'Dsc', 'MC', 'IC']) {
    const d = delta(ANGLE_OF[x](ch), body[p].lon);
    if (Math.abs(d) <= W.angular_orb) {
      angular.push({ p, angle: x, orb: d });
      add(`angular.${p}.${x}`, W.body[p] * W.angular_mult * tightness(d, W.angular_orb, W.orb_floor), { p, angle: x, orb: d }, planetTags(p));
    }
  }

  // the aspects: between bodies by family, to the angles only trine, sextile
  // (flow) and square (tension), since a conjunction or an opposition to an
  // angle is a body on an angle
  for (const a of ch.aspects) {
    const fam = W.family[a.type];
    if (!fam || a.a === 'Node' || a.b === 'Node') continue;
    const toAngle = a.b === 'Asc' || a.b === 'MC';
    if (toAngle && (a.type === 'conj' || a.type === 'oppo')) continue;
    const w = (W.body[a.a] + W.body[a.b]) / 2 * W.aspect_type[a.type] * tightness(a.orb, orbLimit(a.type, a.a, a.b), W.orb_floor);
    const tags = fam === 'flow' ? [] : planetTags(a.a, a.b);
    add(`aspect.${a.a}.${a.b}.${fam}`, w, { a: a.a, b: a.b, type: a.type, orb: a.orb }, tags);
  }

  // the balance of elements and modalities, by the points of rules.weights.balance
  const balance = { element: Object.fromEntries(Z.element.map(e => [e, 0])), modality: Object.fromEntries(Z.modality.map(m => [m, 0])) };
  let total = 0;
  for (const [p, w] of Object.entries(W.balance)) {
    const s = signName(lonOf(p));
    balance.element[elementOf(s)] += w; balance.modality[modalityOf(s)] += w; total += w;
  }
  for (const kind of ['element', 'modality']) {
    const cfg = W[kind];
    for (const [x, pts] of Object.entries(balance[kind])) {
      const share = pts / total;
      balance[kind][x] = share;
      if (share >= cfg.strong_share) add(`${kind}.${x}.strong`, cfg.strong * share / cfg.strong_share, { x, share }, kind === 'element' ? T.element[x] : T.modality[x]);
      else if (share <= cfg.weak_share) add(`${kind}.${x}.weak`, cfg.weak, { x, share });
    }
  }

  // the hemispheres
  const halves = { east: [10, 11, 12, 1, 2, 3], west: [4, 5, 6, 7, 8, 9], south: [7, 8, 9, 10, 11, 12], north: [1, 2, 3, 4, 5, 6] };
  const hemispheres = {};
  for (const [x, hs] of Object.entries(halves)) {
    const n = TEN.filter(p => hs.includes(body[p].house));
    hemispheres[x] = n.length;
    if (n.length >= W.hemisphere.min_bodies) add(`hemisphere.${x}`, W.hemisphere.weight, { x, bodies: n });
  }

  // the patterns, from the major aspects between the ten bodies
  const asp = {};
  for (const a of ch.aspects) if (TEN.includes(a.a) && TEN.includes(a.b)) {
    (asp[a.type] ||= new Set()).add(a.a + '|' + a.b).add(a.b + '|' + a.a);
  }
  const has = (type, p, q) => !!asp[type] && asp[type].has(p + '|' + q);
  const patterns = [];
  const n = TEN.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const p = TEN[i], q = TEN[j];
    if (has('oppo', p, q)) {
      for (const r of TEN) if (r !== p && r !== q && has('squa', p, r) && has('squa', q, r)) patterns.push({ type: 'tsquare', bodies: [p, q, r], apex: r });
      for (let k = i + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
        const r = TEN[k], s = TEN[l];
        if (r === q || s === q || !has('oppo', r, s)) continue;
        if (has('squa', p, r) && has('squa', p, s) && has('squa', q, r) && has('squa', q, s)) patterns.push({ type: 'grandcross', bodies: [p, q, r, s] });
      }
    }
    if (has('sext', p, q)) for (const r of TEN) if (has('quin', p, r) && has('quin', q, r)) patterns.push({ type: 'yod', bodies: [p, q, r], apex: r });
    if (has('trin', p, q)) for (let k = j + 1; k < n; k++) {
      const r = TEN[k];
      if (has('trin', p, r) && has('trin', q, r)) patterns.push({ type: 'grandtrine', bodies: [p, q, r], element: elementOf(signName(body[r].lon)) });
    }
  }
  // a T-square inside a grand cross is told as the cross
  const crosses = patterns.filter(x => x.type === 'grandcross');
  const kept = patterns.filter(x => x.type !== 'tsquare' || !crosses.some(c => x.bodies.every(b => c.bodies.includes(b))));
  // the stellia: three bodies or more in a sign or in a house
  const groups = {};
  for (const p of TEN) {
    (groups['sign:' + signName(body[p].lon)] ||= []).push(p);
    (groups['house:' + body[p].house] ||= []).push(p);
  }
  for (const [g, ps] of Object.entries(groups)) if (ps.length >= W.stellium.min_bodies) {
    const [kind, where] = g.split(':');
    kept.push({ type: 'stellium', bodies: ps, [kind]: kind === 'house' ? +where : where });
  }
  // one paragraph for each type, on its largest instance (the first one found on a tie)
  for (const type of ['grandcross', 'tsquare', 'grandtrine', 'yod', 'stellium']) {
    const list = kept.filter(x => x.type === type);
    if (!list.length) continue;
    const best = list.reduce((m, x) => (x.bodies.length > m.bodies.length ? x : m));
    add(`pattern.${type}`, type === 'stellium' ? W.stellium.weight : W.pattern[type], best);
  }

  // the ruler of the chart
  add(`ruler.${ruler}`, W.ruler, { p: ruler, sign: signName(ch.asc) });

  // the dominant planets, by the score of rules.weights.dominant
  const D = W.dominant;
  const score = {};
  for (const p of TEN) {
    let s = 0;
    if (angular.some(x => x.p === p)) s += D.angular;
    else if ([1, 4, 7, 10].includes(body[p].house)) s += D.angular_house;
    if (Z.rulers[signName(ch.asc)] === p) s += D.rules_asc;
    if (Z.rulers[signName(body.Sun.lon)] === p) s += D.rules_sun;
    if (Z.rulers[signName(body.Moon.lon)] === p) s += D.rules_moon;
    const sg = signName(body[p].lon);
    if ((Z.domicile[p] || []).includes(sg)) s += D.domicile; else if (Z.exaltation[p] === sg) s += D.exaltation;
    for (const a of ch.aspects) {
      if (!(a.a === p || a.b === p) || a.a === 'Node' || a.b === 'Node' || !W.family[a.type]) continue;
      s += D.aspect * tightness(a.orb, orbLimit(a.type, a.a, a.b), 0);
      const other = a.a === p ? a.b : a.a;
      if (a.type === 'conj' && (other === 'Sun' || other === 'Moon')) s += D.luminary_conj;
    }
    score[p] = Math.round(s * 100) / 100;
  }
  const ranked = TEN.slice().sort((a, b) => score[b] - score[a] || TEN.indexOf(a) - TEN.indexOf(b));
  const dominant = ranked.slice(0, D.count).filter(p => score[p] >= D.min_score);
  dominant.forEach((p, i) => add(`dominant.${p}`, i ? D.second : D.first, { p, score: score[p] }));

  // the retrograde planets
  const retro = TEN.filter(p => body[p].speed < 0);
  for (const p of retro) add(`retro.${p}`, W.retro * W.body[p], { p });

  // the emphasised signs (by the points of the balance) and houses (by bodies)
  const E = W.emphasis, signPts = {};
  for (const [p, w] of Object.entries(W.balance)) {
    const s = signName(lonOf(p));
    (signPts[s] ||= { pts: 0, bodies: [] }).pts += w;
    if (TEN.includes(p)) signPts[s].bodies.push(p);
  }
  for (const [s, v] of Object.entries(signPts)) if (v.pts >= E.sign_min_points && v.bodies.length >= 2) add(`emphasis.sign.${s}`, E.base + E.per_body * v.bodies.length, { sign: s, bodies: v.bodies, points: v.pts });
  for (let h = 1; h <= 12; h++) {
    const ps = TEN.filter(p => body[p].house === h);
    if (ps.length >= E.house_min_bodies) add(`emphasis.house.${h}`, E.base + E.per_body * ps.length, { house: h, bodies: ps });
  }

  items.sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
  return { items, balance, hemispheres, angular, ruler, dominant, score, patterns: kept, retro };
}

/* -------------------------------------------------------- transits ---- */

const DAY = 864e5;
const lonAt = (planet, ms) => eclOfDate(planet, globalThis.Astronomy.MakeTime(new Date(ms))).lon;

// the end of a window of whole months from a UTC instant
export function addMonths(ms, k) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + k);
  return d.getTime();
}

// the instant in [a, b] where delta(goal, lon(t)) changes sign, by bisection
// to about a tenth of a second
function bisect(planet, goal, a, b, fa) {
  for (let i = 0; i < 40 && b - a > 100; i++) {
    const m = (a + b) / 2, fm = delta(goal, lonAt(planet, m));
    if ((fm <= 0) === (fa <= 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

// the transits of rules.transits from the UTC instant fromMs: every aspect of
// a slow planet to a natal body or angle that comes within the orb inside
// the window, with its windows within orb and its exact instants
export function transits(ch, fromMs, R) {
  const C = R.transits, W = R.weights;
  const toMs = addMonths(fromMs, C.months);
  const step = C.step_days * DAY;
  const times = [];
  for (let ms = fromMs; ms < toMs; ms += step) times.push(ms);
  times.push(toMs);
  const natal = Object.fromEntries(ch.bodies.map(b => [b.name, b.lon]));
  natal.Asc = ch.asc; natal.MC = ch.mc;
  const out = new Map();
  for (const T of C.planets) {
    const lon = times.map(ms => lonAt(T, ms));
    for (const N of C.targets) for (const type of C.aspects) {
      const angle = ASPECTS.find(x => x.key === type).angle;
      const goals = angle === 0 || angle === 180 ? [norm(natal[N] + angle)] : [norm(natal[N] + angle), norm(natal[N] - angle)];
      for (const goal of goals) {
        const f = lon.map(l => delta(goal, l));
        const exact = [], windows = [];
        let start = null, inside = 0;
        for (let i = 0; i < f.length; i++) {
          const inOrb = Math.abs(f[i]) <= C.orb;
          if (inOrb) inside++;
          if (inOrb && start === null) {
            // the entry, interpolated between the samples
            start = i === 0 ? times[0] : times[i - 1] + (times[i] - times[i - 1]) * (Math.abs(f[i - 1]) - C.orb) / (Math.abs(f[i - 1]) - Math.abs(f[i]));
          }
          if (!inOrb && start !== null) {
            const end = times[i - 1] + (times[i] - times[i - 1]) * (C.orb - Math.abs(f[i - 1])) / (Math.abs(f[i]) - Math.abs(f[i - 1]));
            windows.push([start, end]); start = null;
          }
          if (i && Math.abs(f[i]) < 10 && Math.abs(f[i - 1]) < 10 && (f[i] <= 0) !== (f[i - 1] <= 0)) exact.push(bisect(T, goal, times[i - 1], times[i], f[i - 1]));
        }
        if (start !== null) windows.push([start, toMs]);
        if (!windows.length) continue;
        const id = `${T}.${type}.${N}`;
        const e = out.get(id) || { planet: T, target: N, type, family: W.family[type], exact: [], windows: [], inside: 0 };
        e.exact.push(...exact); e.windows.push(...windows); e.inside += inside;
        out.set(id, e);
      }
    }
  }
  const list = [...out.values()].map(e => {
    e.exact.sort((a, b) => a - b); e.windows.sort((a, b) => a[0] - b[0]);
    const frac = Math.min(1, e.inside / times.length);
    e.weight = Math.round(C.transiting[e.planet] * C.target[e.target] * W.aspect_type[e.type] * (0.5 + 0.5 * frac) * 100) / 100;
    e.key = `transit.${e.planet}.${e.family}`;
    e.touch = `touch.${e.target}`;
    return e;
  });
  list.sort((a, b) => b.weight - a.weight || a.windows[0][0] - b.windows[0][0] || (a.planet + a.target + a.type < b.planet + b.target + b.type ? -1 : 1));
  return { from: fromMs, to: toMs, list };
}
