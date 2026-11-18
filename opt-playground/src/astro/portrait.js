// The portrait of a chart, i.e., the booklet: the factors of factors.js are
// sorted into the chapters of src/astro/rules.json by weight, two factors
// that pull in opposite directions are reconciled by the conflict rules,
// and each factor chosen prints its fragment of src/astro/texts/<lang>.json.
// The fragments are all written for this site, none taken or paraphrased
// from published interpretations (cf. docs/study-astro.md, section 3.4).
// The assembly is deterministic: the same chart, language and start of the
// year ahead give the same booklet, word for word.

import { SIGNS, SIGNS_IT, NAME_EN, NAME_IT, ASPECTS, fmtOrb } from './core.js';
import { factors, transits } from './factors.js';

let RULES = null;
const TEXTS = {};
const url = p => new URL(p, import.meta.url);
export const ready = Promise.all([
  fetch(url('./rules.json')).then(r => r.json()),
  fetch(url('./texts/en.json')).then(r => r.json()),
  fetch(url('./texts/it.json')).then(r => r.json())
]).then(([r, en, it]) => { RULES = r; TEXTS.en = en; TEXTS.it = it; return { rules: r, texts: TEXTS }; });

/* ---------------------------------------------------------- labels ---- */

const L = {
  en: {
    Dsc: 'Descendant', IC: 'Imum coeli', house: h => `the ${h}${['th', 'st', 'nd', 'rd'][h % 10 > 3 || [11, 12, 13].includes(h) ? 0 : h % 10]} house`,
    fire: 'fire', earth: 'earth', air: 'air', water: 'water', cardinal: 'cardinal signs', fixed: 'fixed signs', mutable: 'mutable signs',
    strong: 'strong', weak: 'scarce', east: 'eastern half', west: 'western half', south: 'upper half', north: 'lower half',
    tsquare: 'T-square', grandtrine: 'grand trine', grandcross: 'grand cross', yod: 'yod', stellium: 'stellium',
    in: 'in', on: 'on the', ruler: 'chart ruler', dominant: 'dominant planet', score: 'score', retro: 'retrograde', emphasis: 'emphasis on',
    apex: 'apex', of: 'of', bodies: 'bodies', orb: 'orb', natal: 'natal', exact: 'exact', within: 'within orb',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  it: {
    Dsc: 'Discendente', IC: 'Fondo cielo', house: h => `casa ${h}`,
    fire: 'fuoco', earth: 'terra', air: 'aria', water: 'acqua', cardinal: 'segni cardinali', fixed: 'segni fissi', mutable: 'segni mobili',
    strong: 'forte', weak: 'scarso', east: 'metà orientale', west: 'metà occidentale', south: 'metà superiore', north: 'metà inferiore',
    tsquare: 'T quadrato', grandtrine: 'grande trigono', grandcross: 'grande croce', yod: 'yod', stellium: 'stellium',
    in: 'in', on: 'su', ruler: 'governatore della carta', dominant: 'pianeta dominante', score: 'punteggio', retro: 'retrogrado', emphasis: 'accento su',
    apex: 'apice', of: 'di', bodies: 'corpi', orb: 'orbita', natal: 'natale', exact: 'esatto', within: 'in orbita',
    months: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  }
};
const name = (n, lang) => (lang === 'it' ? NAME_IT[n] || L.it[n] : NAME_EN[n] || L.en[n] || n);
const signName = (s, lang) => (lang === 'it' ? SIGNS_IT[SIGNS.indexOf(s)] : s);
const aspName = (type, lang) => ASPECTS.find(a => a.key === type)[lang];
const list = (ns, lang) => ns.map(n => name(n, lang)).join(', ');
const pct = x => `${Math.round(x * 100)}%`;
// the Italian article before a name of the chart: "sul Medio cielo", "sull'Ascendente"
const onIt = n => (/^[AEIOU]/.test(name(n, 'it')) ? "sull'" : n === 'IC' || n === 'MC' ? 'sul ' : 'sul ');
export const fmtDate = (ms, lang) => { const d = new Date(ms); return `${d.getUTCDate()} ${L[lang].months[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// the label of a factor, i.e., the line that says what a paragraph is about
export function label(f, lang) {
  const l = L[lang], d = f.data, [kind] = f.key.split('.');
  switch (kind) {
    case 'sign': return `${name(d.p, lang)} ${l.in} ${signName(d.sign, lang)}`;
    case 'house': return lang === 'it' ? `${name(d.p, lang)} in ${l.house(d.house)}` : `${name(d.p, lang)} in ${l.house(d.house)}`;
    case 'aspect': return `${name(d.a, lang)} ${aspName(d.type, lang)} ${name(d.b, lang)} (${l.orb} ${fmtOrb(d.orb)})`;
    case 'angular': return lang === 'it' ? `${name(d.p, lang)} ${onIt(d.angle)}${name(d.angle, lang)} (${fmtOrb(d.orb)})` : `${name(d.p, lang)} on the ${name(d.angle, lang)} (${fmtOrb(d.orb)})`;
    case 'element': case 'modality': return `${l[d.x][0].toUpperCase() + l[d.x].slice(1)} ${l[f.key.split('.')[2]]} (${pct(d.share)})`;
    case 'hemisphere': return `${l[d.x][0].toUpperCase() + l[d.x].slice(1)}: ${list(d.bodies, lang)}`;
    case 'pattern': {
      const where = d.sign ? ` ${l.in} ${signName(d.sign, lang)}` : d.house ? ` ${l.in} ${l.house(d.house)}` : '';
      return `${l[d.type][0].toUpperCase() + l[d.type].slice(1)}${where}: ${list(d.bodies, lang)}${d.apex ? ` (${l.apex} ${name(d.apex, lang)})` : ''}`;
    }
    case 'ruler': return `${l.ruler[0].toUpperCase() + l.ruler.slice(1)}: ${name(d.p, lang)} (${name('Asc', lang)} ${l.in} ${signName(d.sign, lang)})`;
    case 'dominant': return `${l.dominant[0].toUpperCase() + l.dominant.slice(1)}: ${name(d.p, lang)} (${l.score} ${d.score})`;
    case 'retro': return `${name(d.p, lang)} ${l.retro}`;
    case 'emphasis': return `${l.emphasis[0].toUpperCase() + l.emphasis.slice(1)} ${d.sign ? signName(d.sign, lang) : l.house(d.house)}: ${list(d.bodies, lang)}`;
    default: return f.key;
  }
}

export function transitLabel(e, lang) {
  const l = L[lang];
  const head = `${name(e.planet, lang)} ${aspName(e.type, lang)} ${name(e.target, lang)} ${l.natal}`;
  const when = e.exact.length ? `${l.exact} ${e.exact.map(ms => fmtDate(ms, lang)).join(', ')}`
    : `${l.within} ${fmtDate(e.windows[0][0], lang)} – ${fmtDate(e.windows[e.windows.length - 1][1], lang)}`;
  return `${head} · ${when}`;
}

/* -------------------------------------------------------- assembly ---- */

// a * stands for one segment of a key, a final * for the rest of it
const glob = g => new RegExp('^' + g.split('.').map((s, i, all) => (s === '*' ? (i === all.length - 1 ? '.+' : '[^.]+') : s.replace(/[^\w]/g, '\\$&'))).join('\\.') + '$');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

// the booklet of a chart in a language, with the year ahead from the UTC
// instant from; null while the rules and the texts are being loaded
export function portrait(ch, lang, from = Date.UTC(new Date().getUTCFullYear(), 0, 1), data = null) {
  const R = data ? data.rules : RULES, X = (data ? data.texts : TEXTS)[lang];
  if (!R || !X) return null;
  const F = factors(ch, R), TR = transits(ch, from, R);
  const missing = [];
  const text = (key, kind = 'fragments') => {
    const e = X[kind][key];
    if (!e) { missing.push(key); return { text: `[${key}]`, status: 'missing' }; }
    return e;
  };
  const polar = R.conflicts.polarities;
  const opposed = (s, u) => polar.find(([x, y]) => (s.includes(x) && u.includes(y)) || (s.includes(y) && u.includes(x)));
  const used = new Set();
  const chapters = [];
  for (const C of R.chapters) {
    const chap = { id: C.id, title: X.ui['chapter.' + C.id], sub: X.ui['chapter.' + C.id + '.sub'], paras: [] };
    chapters.push(chap);
    if (C.source === 'transits') {
      const pick = TR.list.slice(0, C.max).sort((a, b) => a.windows[0][0] - b.windows[0][0] || b.weight - a.weight);
      const told = new Set();
      for (const e of pick) {
        const t = text(e.key), u = text(e.touch);
        const vars = { planet: name(e.planet, lang), target: name(e.target, lang) };
        const lead = told.has(e.key) ? fill(text('transit.again', 'sentences').text, vars) : t.text;
        told.add(e.key);
        chap.paras.push({ key: e.key, touch: e.touch, weight: e.weight, label: transitLabel(e, lang), text: lead + ' ' + u.text,
          status: [t.status, u.status].includes('draft') ? 'draft' : t.status, transit: e });
      }
      if (!pick.length) chap.empty = X.ui['chapter.year.none'];
      continue;
    }
    const takes = C.take.map(x => ({ re: glob(x.match), boost: x.boost || 1 }));
    const leadRe = C.lead ? glob(C.lead) : null;
    const cands = [];
    for (const f of F.items) {
      if (used.has(f.key)) continue;
      const boost = takes.filter(x => x.re.test(f.key)).reduce((m, x) => Math.max(m, x.boost), 0);
      const score = Math.round(f.weight * boost * 100) / 100;
      if (boost && score >= (R.min_score || 0)) cands.push({ f, score });
    }
    cands.sort((a, b) => b.score - a.score || (a.f.key < b.f.key ? -1 : 1));
    const chosen = [], tensions = [];
    const lead = leadRe && cands.find(c => leadRe.test(c.f.key));
    if (lead) chosen.push(lead);
    for (const c of cands) {
      if (chosen.length >= C.max) break;
      if (c === lead) continue;
      const clash = chosen.map(k => [k, opposed(k.f.tags, c.f.tags)]).find(([, p]) => p);
      if (clash) { tensions.push({ winner: clash[0], loser: c, polarity: clash[1].join('-') }); continue; }
      chosen.push(c);
    }
    const order = chosen.slice(lead ? 1 : 0).sort((a, b) => b.score - a.score || (a.f.key < b.f.key ? -1 : 1));
    if (lead) order.unshift(lead);
    const saidPolarity = new Set();
    for (const c of order) {
      used.add(c.f.key);
      const t = text(c.f.key);
      const p = { key: c.f.key, weight: c.f.weight, score: c.score, label: label(c.f, lang), text: t.text, status: t.status };
      const ten = tensions.find(x => x.winner === c && !saidPolarity.has(x.polarity));
      if (ten) {
        saidPolarity.add(ten.polarity);
        const s = text('tension.' + ten.polarity, 'sentences');
        p.tension = { key: 'tension.' + ten.polarity, against: ten.loser.f.key, text: fill(s.text, { a: label(c.f, lang), b: label(ten.loser.f, lang) }), status: s.status };
      }
      chap.paras.push(p);
    }
    if (!order.length) chap.empty = X.ui['chapter.empty'];
  }
  const paras = chapters.flatMap(c => c.paras);
  return { lang, from: TR.from, to: TR.to, chapters, factors: F, transits: TR, missing,
    told: Object.fromEntries(chapters.flatMap(c => c.paras.map(p => [p.key, c.id]))),
    drafts: paras.filter(p => p.status === 'draft').length, paragraphs: paras.length };
}
