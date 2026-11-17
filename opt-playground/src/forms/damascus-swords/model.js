// Damascus swords: a sword written by a small grammar (blade, guard, grip,
// pommel) whose parameters are 16 genes, each a hexadecimal digit, evolved by
// the eye as in the sword generator Volcano of Pirovano, Mainetti and
// Loiacono (2015); the blade carries the pattern of pattern-welded steel,
// computed as in the model of Jaffer: a bar of alternating layers is twisted
// (or pressed, or drilled), the blade is a plane cut through it, and the
// etched pattern is the layer met at each point of the plane, pulled back
// through the deformation. The solid lies flat on the bed: a flat bottom,
// heights by part, rounded upper edges and the pattern in low relief.
// Units: millimetres, x along the sword from the pommel to the tip, y across,
// z up. No DOM: the model runs in workers.

import { implicitSolid } from '../../print/index.js';
import { rng } from '../fantasy/util.js';

export const GENES = [
  ['len', 'blade length', 'lunghezza lama'], ['width', 'blade width', 'larghezza lama'], ['taper', 'point', 'punta'],
  ['curve', 'curve', 'curvatura'], ['leaf', 'leaf', 'foglia'], ['wave', 'flame', 'fiamma'], ['fuller', 'fuller', 'sguscio'],
  ['guard', 'guard', 'guardia'], ['gbend', 'guard bend', 'curva guardia'], ['gend', 'guard ends', 'estremi guardia'],
  ['grip', 'grip', 'impugnatura'], ['wraps', 'wraps', 'fasciatura'], ['pommel', 'pommel', 'pomolo'],
  ['psize', 'pommel size', 'grandezza pomolo'], ['ptype', 'pattern', 'motivo'], ['pscale', 'pattern scale', 'scala del motivo'],
].map(([k, en, it]) => ({ k, en, it }));
export const NG = GENES.length;
export const DEFAULT_CODE = '96a2648a83a7584a';

export const encode = g => g.map(v => v.toString(16)).join('');
export function decode(s) {
  s = String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return s.length === NG ? [...s].map(c => parseInt(c, 16)) : null;
}

// the eight children of a genome: each gene changes with probability `rate`
// by a step of 1 to 3, drawn from the generation number
export function children(g, gen, rate = 0.25, roll = 0) {
  return Array.from({ length: 8 }, (_, i) => {
    const r = rng(gen * 9973 + roll * 7919 + i * 131 + 7), c = g.slice();
    let changed = 0;
    for (let k = 0; k < NG; k++) if (r() < rate) { c[k] = Math.max(0, Math.min(15, c[k] + (r() < 0.5 ? -1 : 1) * (1 + r.int(3)))); changed++; }
    if (!changed) { const k = r.int(NG); c[k] = (c[k] + 1 + r.int(14)) % 16; }
    return c;
  });
}

export const PATTERNS = ['twist', 'chevron', 'ladder', 'raindrop', 'random'];
const POMMELS = ['disc', 'lobed', 'oval', 'ring'], ENDS = ['plain', 'ball', 'flare', 'disc'];

// the sword of a genome at overall length L (mm)
export function sword(g, L = 180) {
  const q = Object.fromEntries(GENES.map((G, i) => [G.k, g[i] / 15]));
  const s = {
    L, code: encode(g),
    bladeF: 0.6 + 0.2 * q.len, w: L * (0.02 + 0.04 * q.width), tip: 0.08 + 0.4 * q.taper,
    sag: q.curve < 0.5 ? 0 : (q.curve - 0.5) * 2 * 0.07, leaf: -0.1 + 0.45 * q.leaf,
    wave: g[5] >= 11 ? (g[5] - 10) / 5 * 0.14 : 0, fuller: g[6] < 4 ? 0 : 0.25 + 0.5 * q.fuller,
    guard: L * (0.06 + 0.1 * q.guard), gbend: (q.gbend - 0.5) * 2 * 0.035 * L, gend: ENDS[g[9] >> 2],
    gripF: 0.12 + 0.08 * q.grip, wraps: g[11] < 5 ? 0 : 2.2 + 3 * (1 - q.wraps),
    pommel: POMMELS[g[12] >> 2], rp: L * (0.022 + 0.022 * q.psize),
    ptype: PATTERNS[Math.min(4, Math.floor(g[14] * 5 / 16))], pscale: q.pscale,
  };
  // along x: the pommel, the grip, the guard, the blade
  const used = s.bladeF + s.gripF;
  s.x0 = 2 * s.rp;
  const k = (L - s.x0) / used;
  s.xg = s.x0 + s.gripF * k;           // the guard, where the blade starts
  s.Lb = s.bladeF * k;                 // the blade
  s.tg = Math.max(4, 0.03 * L);        // the guard, along x
  s.wg = Math.max(4.5, 0.55 * s.w);    // the half width of the grip
  s.width = 2 * Math.max(s.guard + (s.gend === 'ball' || s.gend === 'disc' ? 0.035 * L : 0), s.rp * 1.2, s.w * (1 + Math.max(0, s.leaf) + s.wave) + Math.abs(s.sag) * s.Lb);
  return s;
}

// the blade: its centre line and half width at t in [0, 1] from the guard
export const bladeC = (s, t) => -s.sag * s.Lb * t * t;
export function bladeW(s, t) {
  let w = s.w * (1 + s.leaf * Math.sin(Math.PI * Math.min(1, t / 0.85)) * (t < 0.85 ? 1 : 0)) * (1 - 0.18 * t);
  if (s.wave) w *= 1 + s.wave * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, 4 * t) * (t < 1 - s.tip ? 1 : 0);
  const a = 1 - s.tip;
  if (t > a) w *= Math.sqrt(Math.max(0, (1 - t) / s.tip));
  return w;
}

/* ------------------------------------------------- pattern-welded steel -- */

// the layer seen at a point of the blade, t along it and v in [-1, 1]
// across, as a value in [-1, 1] (the two steels are its signs): N layers
// across the thickness of a bar of half width 1, the grinding plane at depth
// e from the axis; twist: the bar turned by tau t about its axis, so that
// the plane meets the layer coordinate -v sin(tau t) + e cos(tau t);
// chevron: two or three twisted bars side by side, turned in opposite
// directions; ladder and raindrop: flat layers pushed by grooves across the
// bar or by dimples, so that the plane meets them at a depth that varies;
// random: flat layers bent by a gentle noise
export function damascus(s, t, v) {
  const N = 4 + Math.round(6 * s.pscale), e = 0.35, len = s.Lb / s.w;
  let Lc;
  switch (s.ptype) {
    case 'twist': { const tau = 2 * Math.PI * (0.06 + 0.06 * s.pscale) * len; Lc = -v * Math.sin(tau * t) + e * Math.cos(tau * t); break; }
    case 'chevron': {
      const nb = s.pscale > 0.5 ? 3 : 2, b = Math.min(nb - 1, Math.floor((v + 1) / 2 * nb)), vb = ((v + 1) / 2 * nb - b) * 2 - 1;
      const tau = (b % 2 ? -1 : 1) * 2 * Math.PI * 0.1 * len;
      Lc = (-vb * Math.sin(tau * t) + e * Math.cos(tau * t)) * 0.8; break;
    }
    case 'ladder': { const p = 0.9 + 0.8 * s.pscale; Lc = 0.5 * v + 0.55 * Math.abs(Math.sin(Math.PI * t * len / p)); break; }
    case 'raindrop': {
      const p = 1.1 + 0.6 * s.pscale, a = t * len / p, b = (v + 1) / p * 1.2;
      const da = a - Math.round(a), db = b - Math.round(b - (Math.round(a) % 2) * 0.5) - (Math.round(a) % 2) * 0.5;
      Lc = 0.4 * v + 0.6 * Math.exp(-(da * da + db * db) * 9); break;
    }
    default: Lc = 0.6 * v + 0.25 * Math.sin(7.3 * t * len / 6 + 2 * Math.sin(3.1 * v + t * len / 4)) + 0.1 * Math.sin(13 * t * len / 6 - 5 * v);
  }
  return Math.cos(Math.PI * N * Lc / 2);
}

/* -------------------------------------------------------- the solid -- */

// heights (mm) of the parts
export const H = { edge: 3, spine: 4.6, relief: 0.4, guard: 6.5, grip: 5.2, wrap: 0.6, pommel: 7.5, round: 1.2 };

const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// the rounded top of a part of height h at depth d inside its outline
const rounded = (h, d, r = H.round) => (d >= r ? h : h - r + Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));

// the parts as functions (x, y) -> [d, top]: d the (approximate) signed
// distance from the outline in the plane, top the height of the surface
export function parts(s, pattern = true) {
  const out = [];
  // the blade, ending in a round tip of radius 1.5 mm
  out.push((x, y) => {
    const t = (x - s.xg) / s.Lb;
    if (t < -0.02 || t > 1.02) return [Infinity, 0];
    const tc = Math.min(1, Math.max(0, t)), c = bladeC(s, tc), w = Math.max(1.5, bladeW(s, tc));
    let d = Math.abs(y - c) - w;
    if (t > 1) d = Math.max(d, (t - 1) * s.Lb);
    if (t < 0) d = Math.max(d, -t * s.Lb);
    const dIn = -d, bev = Math.min(0.75 * w, 6);
    let top = H.edge + (H.spine - H.edge) * smooth(0, bev, dIn);
    if (s.fuller && tc < s.fuller) {
      const f = Math.exp(-(((y - c) / (0.22 * w)) ** 2)) * smooth(0, 0.08, s.fuller - tc) * smooth(0, 0.04, tc);
      top -= 0.8 * f;
    }
    if (pattern) top += H.relief * (0.5 + 0.5 * Math.tanh(3 * damascus(s, tc, (y - c) / w))) * smooth(0.6, 1.6, dIn);
    return [d, rounded(top, dIn)];
  });
  // the guard: a bar across, bent, with its ends
  out.push((x, y) => {
    const u = Math.abs(y) / s.guard, cx = s.xg - s.tg / 2 + s.gbend * u * u;
    let half = s.tg / 2;
    if (s.gend === 'flare') half *= 1 + 0.9 * u * u;
    let d = Math.max(Math.abs(x - cx) - half, Math.abs(y) - s.guard);
    if (s.gend === 'ball') d = Math.min(d, Math.hypot(x - (s.xg - s.tg / 2 + s.gbend), Math.abs(y) - s.guard) - s.tg * 0.9);
    if (s.gend === 'disc') d = Math.min(d, Math.hypot(x - (s.xg - s.tg / 2 + s.gbend), Math.abs(y) - s.guard) - s.tg * 1.3);
    return [d, rounded(H.guard, -d, 1.6)];
  });
  // the grip, slightly waisted, wrapped by ridges
  out.push((x, y) => {
    const t = (x - s.x0) / (s.xg - s.tg - s.x0);
    const hw = s.wg * (1 - 0.1 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))));
    const d = Math.max(Math.abs(y) - hw, s.x0 - 1 - x, x - (s.xg - s.tg / 2));
    let top = H.grip;
    if (s.wraps) top += H.wrap * smooth(0.55, 0.8, Math.abs(Math.sin(Math.PI * (x + 0.8 * y) / s.wraps)));
    return [d, rounded(top, -d)];
  });
  // the pommel
  out.push((x, y) => {
    const px = s.x0 - s.rp * 0.35, dx = x - px, r = Math.hypot(dx, y), th = Math.atan2(y, dx);
    let d;
    if (s.pommel === 'lobed') d = r - s.rp * (1 + 0.14 * Math.cos(6 * th));
    else if (s.pommel === 'oval') d = (Math.hypot(dx / 1.35, y / 0.9) - s.rp) * 0.9;
    else if (s.pommel === 'ring') d = Math.max(r - s.rp, 0.45 * s.rp - r);
    else d = r - s.rp;
    const dome = H.pommel - 2.5 * (r / s.rp) ** 2;
    return [d, rounded(Math.max(H.grip, dome), -d, 1.6)];
  });
  return out;
}

// the part at (x, y) and the height there (part -1: outside)
export function at(P, x, y) {
  let best = -1, top = 0, dmin = Infinity;
  P.forEach((f, i) => { const [d, h] = f(x, y); if (d < 0 && h > top) { best = i; top = h; } dmin = Math.min(dmin, d); });
  return [best, top, dmin];
}

export function fileName(o) { return `damascus_sword_${o.g || DEFAULT_CODE}_${o.size}mm`; }

// o: g (the genome as code), size (overall length, mm), res
export function solid(o, progress) {
  const g = decode(o.g) || decode(DEFAULT_CODE), L = o.size || 180, s = sword(g, L), P = parts(s);
  const h = o.res === 'fine' ? 0.22 : o.res === 'draft' ? 0.32 : Math.max(0.6, L / 260);
  const f = (x, y, z) => {
    let v = Infinity;
    for (const p of P) { const [d, top] = p(x, y); if (d === Infinity) continue; v = Math.min(v, Math.max(d, -z, z - top)); }
    return v;
  };
  const W = s.width / 2 + 2;
  const m = implicitSolid(f, [[-1, -W, 0], [L + 1, W, H.pommel + 0.5]], h, { progress });
  m.dims = [L, 2 * W, H.pommel];
  m.blade = s.Lb; m.ptype = s.ptype; m.pommel = s.pommel;
  return m;
}
