// Giant robots from a shape grammar. Every part is a superquadric (Barr
// 1981), a solid between a box, a cylinder and an ellipsoid set by two
// exponents; a few rules, each with its alternatives drawn from the seed,
// rewrite the robot into legs, pelvis, torso, head and arms, and these into
// armour, joints and details, mirrored left to right. The solid is the
// union of the parts as an implicit function, traced by src/print; as parts
// to assemble, the arms and the head come off, joined to the body by pins
// in holes with a clearance.

import { implicitSolid, merge, transform, onBed, bounds, flip } from '../../print/index.js';

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------------------------- the superquadric -- */

// the inside-outside function of Barr, F = ((|x/a|^(2/e2) + |y/b|^(2/e2))^(e2/e1)
// + |z/c|^(2/e1)), F < 1 inside; returned as (F^(e1/2) - 1) min(a, b, c),
// which is close to a distance near the surface. A part is { c (centre), R
// (columns: its axes), s: [a, b, c], e1, e2, kind, group }.
function sqf(P, x, y, z) {
  const dx = x - P.c[0], dy = y - P.c[1], dz = z - P.c[2], R = P.R;
  const u = Math.abs(R[0] * dx + R[1] * dy + R[2] * dz) / P.s[0];
  const v = Math.abs(R[3] * dx + R[4] * dy + R[5] * dz) / P.s[1];
  const w = Math.abs(R[6] * dx + R[7] * dy + R[8] * dz) / P.s[2];
  const F = ((u ** (2 / P.e2) + v ** (2 / P.e2)) ** (P.e2 / P.e1) + w ** (2 / P.e1));
  return (F ** (P.e1 / 2) - 1) * P.m;
}

// the rows of R are the axes of the part (so that R (p - c) is local)
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function axisTo(d) {
  const l = Math.hypot(...d), z = d.map(v => v / l);
  let x = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const k = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = x.map((v, i) => v - k * z[i]); const lx = Math.hypot(...x); x = x.map(v => v / lx);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [...x, ...y, ...z];
}

function part(kind, group, c, s, e1 = 1, e2 = 1, R = I3) {
  return { kind, group, c, s, e1, e2, R, m: Math.min(...s), r: Math.hypot(...s) };
}
// a limb from a to b, of half-widths rx, ry across
function limb(kind, group, a, b, rx, ry, e1, e2) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) / 2;
  return part(kind, group, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [rx, ry, l], e1, e2, axisTo(d));
}
const mirror = P => ({ ...P, c: [-P.c[0], P.c[1], P.c[2]], R: [P.R[0], -P.R[1], -P.R[2], -P.R[3], P.R[4], P.R[5], -P.R[6], P.R[7], P.R[8]] });

/* ---------------------------------------------------------- the grammar -- */

// the rules and their alternatives; derive() records which one each
// nonterminal took, and the scene prints the derivation
export const RULES = {
  Legs: ['straight', 'reversed knee', 'heavy'],
  Torso: ['box', 'barrel', 'wedge'],
  Chest: ['plate', 'core', 'vents'],
  Head: ['dome', 'box', 'visor'],
  Crest: ['none', 'fin', 'ears', 'antennae'],
  Shoulders: ['pauldron', 'sphere', 'layered'],
  Hands: ['fist', 'claw'],
  Back: ['none', 'thrusters', 'wings'],
};

// the robot of a seed: { parts, choices, joints } in units of about 10 high,
// x across (the robot's left at +x), y backwards, z up
export function derive(seed = 1) {
  const R = rng(seed * 2654435761 + 17), U = (a, b) => a + (b - a) * R();
  const pick = k => RULES[k][Math.floor(R() * RULES[k].length)];
  const ch = {}; for (const k of Object.keys(RULES)) ch[k] = pick(k);
  const sq = U(0.2, 0.55), round = U(0.6, 1);   // squareness of armour and of frame
  const P = [], side = [];  // side: the left side, mirrored at the end
  const L = U(3.4, 4.6), foot = 0.45, hip = L + foot, tw = U(1.1, 1.6), td = U(0.65, 0.95), T = U(2.2, 3), pw = tw * U(0.7, 0.9);
  const z0 = hip + 0.25, top = z0 + T;
  /* Legs -> thigh knee shin foot */
  const hx = pw * 0.62, lr = U(0.34, 0.48);
  let knee, ankle = [hx * 1.15, 0, foot];
  if (ch.Legs === 'reversed knee') knee = [hx * 1.1, 0.55, foot + L * 0.5];
  else knee = [hx * 1.1, -0.12, foot + L * 0.52];
  side.push(limb('frame', 'body', [hx, 0, hip], knee, lr, lr, round, 1));
  side.push(part('joint', 'body', knee, [lr * 1.05, lr * 1.05, lr * 1.05], 1, 1));
  const shin = ch.Legs === 'heavy' ? 1.45 : 1.15;
  side.push(limb('armour', 'body', knee, [ankle[0], ankle[1], ankle[2] + 0.15], lr * shin, lr * shin * 1.1, sq, sq));
  if (ch.Legs === 'heavy') side.push(part('armour', 'body', [ankle[0] + lr * 0.9, 0, foot + L * 0.3], [0.12, lr, L * 0.18], 0.3, 0.3));
  side.push(part('armour', 'body', [ankle[0], -0.25, foot / 2], [lr * 1.3, 0.85, foot / 2], 0.25, 0.3));
  side.push(part('armour', 'body', [ankle[0], -0.1, foot + 0.15], [lr * 0.9, lr, 0.22], sq, sq));
  /* Pelvis and Torso */
  P.push(part('frame', 'body', [0, 0, hip], [pw, td * 0.75, 0.38], 0.4, 0.5));
  P.push(part('frame', 'body', [0, 0, z0 + 0.25], [tw * 0.55, td * 0.7, 0.45], round, round));
  if (ch.Torso === 'box') P.push(part('armour', 'body', [0, 0, z0 + T * 0.62], [tw, td, T * 0.38], sq, sq));
  else if (ch.Torso === 'barrel') P.push(part('armour', 'body', [0, 0, z0 + T * 0.6], [tw, td * 1.05, T * 0.42], 0.7, 1));
  else {
    P.push(part('armour', 'body', [0, 0, z0 + T * 0.72], [tw * 1.1, td, T * 0.28], sq, sq));
    P.push(part('armour', 'body', [0, 0, z0 + T * 0.38], [tw * 0.7, td * 0.85, T * 0.22], sq, 0.6));
  }
  /* Chest */
  const fz = z0 + T * 0.66;
  if (ch.Chest === 'plate') P.push(part('armour', 'body', [0, -td * 0.92, fz], [tw * 0.7, 0.18, T * 0.2], 0.3, 0.3));
  else if (ch.Chest === 'core') P.push(part('light', 'body', [0, -td * 0.92, fz], [0.32, 0.22, 0.32], 1, 1));
  else for (let k = -1; k <= 1; k++) P.push(part('light', 'body', [0, -td * 0.93, fz + k * 0.28], [tw * 0.45, 0.12, 0.08], 0.3, 0.3));
  /* Head, on a neck that is also the pin of the head */
  const hs = U(0.45, 0.65), hz = top + 0.2 + hs * 0.9;
  P.push(part('joint', 'body', [0, 0, top + 0.1], [0.28, 0.28, 0.35], 1, 1));
  if (ch.Head === 'dome') P.push(part('frame', 'head', [0, 0, hz], [hs, hs * 1.05, hs], 1, 1));
  else if (ch.Head === 'box') P.push(part('frame', 'head', [0, 0, hz], [hs, hs, hs * 0.9], 0.35, 0.35));
  else {
    P.push(part('frame', 'head', [0, 0, hz], [hs, hs * 1.05, hs * 0.95], 0.6, 0.7));
    P.push(part('armour', 'head', [0, -0.25, hz + hs * 0.55], [hs * 1.1, hs * 1.05, hs * 0.3], 0.5, 0.6));
  }
  P.push(part('light', 'head', [0, -hs * 0.95, hz + 0.05], [hs * 0.65, 0.12, 0.1], 0.3, 0.3));
  if (ch.Crest === 'fin') P.push(part('armour', 'head', [0, 0.1, hz + hs * 0.9], [0.12, hs * 0.95, hs * 0.45], 0.4, 0.4));
  else if (ch.Crest === 'ears') side.push(part('armour', 'head', [hs * 0.95, 0, hz], [0.22, hs * 0.5, hs * 0.5], 1, 0.4, axisTo([1, 0, 0])));
  else if (ch.Crest === 'antennae') side.push(limb('armour', 'head', [hs * 0.6, 0.05, hz + hs * 0.6], [hs * 0.75, 0.15, hz + hs * 1.9], 0.13, 0.13, 1, 1));
  /* Arms -> shoulder upper arm elbow forearm hand; the arm hangs out by 12 degrees */
  const ar = U(0.27, 0.4), ua = U(1.3, 1.8), fa = U(1.3, 1.9), sz = top - 0.45, sx = tw + 0.25 + ar;
  const out = 0.21, elbow = [sx + ua * Math.sin(out), -0.05, sz - ua * Math.cos(out)];
  const wrist = [elbow[0] + fa * Math.sin(out * 0.5), -0.35, elbow[2] - fa * Math.cos(out * 0.5)];
  side.push(part('joint', 'arm', [sx, 0, sz], [ar * 1.1, ar * 1.1, ar * 1.1], 1, 1));
  // the link from the torso to the shoulder, left out when the arm comes off
  side.push(limb('joint', 'link', [tw * 0.7, 0, sz], [sx, 0, sz], ar * 0.75, ar * 0.75, 1, 1));
  side.push(limb('frame', 'arm', [sx, 0, sz], elbow, ar, ar, round, 1));
  side.push(part('joint', 'arm', elbow, [ar, ar, ar], 1, 1));
  side.push(limb('armour', 'arm', elbow, wrist, ar * 1.3, ar * 1.3, sq, sq));
  if (ch.Hands === 'fist') side.push(part('frame', 'arm', [wrist[0], wrist[1], wrist[2] - ar * 0.9], [ar * 1.05, ar * 1.1, ar * 1.0], 0.35, 0.4));
  else {
    side.push(part('frame', 'arm', [wrist[0], wrist[1], wrist[2] - ar * 0.5], [ar, ar, ar * 0.6], 0.5, 0.5));
    for (const [dx, dy] of [[0.5, -0.5], [-0.5, -0.5], [0, 0.6]]) {
      const a = [wrist[0] + dx * ar, wrist[1] + dy * ar, wrist[2] - ar * 0.8];
      side.push(limb('armour', 'arm', a, [a[0] + dx * ar * 0.4, a[1] + dy * ar * 0.4, a[2] - ar * 1.3], 0.13, 0.13, 1, 1));
    }
  }
  /* Shoulders */
  if (ch.Shoulders === 'pauldron') side.push(part('armour', 'arm', [sx + 0.1, 0, sz + ar * 0.6], [ar * 2, td * 1.05, ar * 1.3], sq, sq));
  else if (ch.Shoulders === 'sphere') side.push(part('armour', 'arm', [sx + 0.05, 0, sz + 0.05], [ar * 1.8, ar * 1.8, ar * 1.8], 1, 1));
  else for (let k = 0; k < 3; k++) side.push(part('armour', 'arm', [sx + 0.15 + k * 0.08, 0, sz + ar * 0.9 - k * 0.45], [ar * 1.7 - k * 0.15, td, 0.17], 0.3, 0.5));
  /* Back */
  if (ch.Back === 'thrusters') {
    side.push(limb('armour', 'back', [tw * 0.45, td * 0.8, top - 0.2], [tw * 0.5, td * 1.5, z0 + T * 0.25], 0.28, 0.28, 0.4, 1));
    side.push(part('light', 'back', [tw * 0.5, td * 1.55, z0 + T * 0.18], [0.2, 0.2, 0.12], 1, 1, axisTo([0, 0.6, -0.8])));
  } else if (ch.Back === 'wings') side.push(limb('armour', 'back', [tw * 0.3, td * 1.0, top - 0.3], [tw * 1.9, td * 1.6, top + 0.9], 0.45, 0.1, 0.25, 0.25));
  for (const p of side) P.push(p, mirror(p));
  return { parts: P, choices: ch, shoulder: { x: sx, z: sz, r: ar, td }, head: { z: hz, s: hs }, top };
}

// the implicit function of a set of parts: the smallest of their values,
// with a cheap lower bound to skip the far ones
export function field(parts) {
  const n = parts.length;
  return (x, y, z) => {
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      const P = parts[k], d = Math.hypot(x - P.c[0], y - P.c[1], z - P.c[2]) - P.r;
      if (d > best) continue;
      const v = sqf(P, x, y, z);
      if (v < best) best = v;
    }
    return best;
  };
}

// which part is nearest to (x, y, z), for the colors of the screen
export function nearest(parts, x, y, z) {
  let best = Infinity, who = null;
  for (const P of parts) { const v = sqf(P, x, y, z); if (v < best) { best = v; who = P; } }
  return who;
}

// the box around the parts (the extent of a part along a world axis is
// bounded by the sum of its half sizes times the components of its axes)
function box(parts, pad = 0.4) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of parts) for (let a = 0; a < 3; a++) {
    const e = Math.abs(P.R[a]) * P.s[0] + Math.abs(P.R[3 + a]) * P.s[1] + Math.abs(P.R[6 + a]) * P.s[2];
    lo[a] = Math.min(lo[a], P.c[a] - e); hi[a] = Math.max(hi[a], P.c[a] + e);
  }
  return [lo.map(v => v - pad), hi.map(v => v + pad)];
}

// the screen mesh in model units, with a color kind per vertex
export function screenMesh(seed, cells = 70) {
  const D = derive(seed), f = field(D.parts), [lo, hi] = box(D.parts);
  const h = (hi[2] - lo[2]) / cells;
  const m = implicitSolid(f, [lo, hi], h, { crumbs: 0.02 });
  const kinds = new Uint8Array(m.pos.length / 3), code = { frame: 0, armour: 1, joint: 2, light: 3 };
  for (let i = 0; i < kinds.length; i++) kinds[i] = code[nearest(D.parts, m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]).kind];
  m.kinds = kinds; m.choices = D.choices;
  return m;
}

/* ------------------------------------------------------------ the solid -- */

// a cylinder along the axis from a to b, radius r, as an implicit function
function rod(a, b, r) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d), u = d.map(v => v / l);
  return (x, y, z) => {
    const wx = x - a[0], wy = y - a[1], wz = z - a[2], t = wx * u[0] + wy * u[1] + wz * u[2];
    const rr = Math.hypot(wx - t * u[0], wy - t * u[1], wz - t * u[2]) - r, e = Math.max(-t, t - l);
    return Math.max(rr, e);
  };
}

// o: { seed, size (mm, the height), mode ('one' | 'parts'), pin (radius,
// mm), clearance (mm), base (boolean), res ('draft' | 'fine') }
export function solid(o = {}, progress) {
  const { seed = 1, size = 120, mode = 'one', pin = 2.5, clearance = 0.2, base = true, res = 'draft' } = o;
  const D = derive(seed), [, hi0] = box(D.parts, 0), k = size / hi0[2];
  const cells = res === 'fine' ? 190 : 120, h = size / cells;
  // everything in mm from here on
  const parts = D.parts.map(P => ({ ...P, c: P.c.map(v => v * k), s: P.s.map(v => v * k), m: P.m * k, r: P.r * k }));
  const step = (i, n) => progress && progress(i / n);
  if (mode !== 'parts') {
    let f = field(parts);
    if (base) {
      // an oval plate 2 mm thick under the feet, the feet sunk 0.5 mm into it
      const [lo, hi] = box(parts, 0);
      const ax = (hi[0] - lo[0]) * 0.5, ay = Math.max(ax * 0.6, (hi[1] - lo[1]) * 0.55);
      const g = f, cy = (lo[1] + hi[1]) / 2;
      f = (x, y, z) => Math.min(g(x, y, z + 1.5), Math.max(Math.hypot(x / ax, (y - cy) / ay) - 1, -z - 2, z));
    }
    const [lo, hi] = box(parts, 2);
    lo[2] = base ? -2 : Math.max(lo[2], 0);
    const g = f, fl = base ? g : (x, y, z) => Math.max(g(x, y, z), -z);
    const m = implicitSolid(fl, [lo, hi], h, { progress: p => step(p, 1) });
    onBed(m);
    m.mode = 'one';
    return m;
  }
  // parts: the body with holes, two arms and the head, each with its pin or
  // hole; the arms are cut off 0.6 mm outside the torso, the head 0.25
  // units above it, and the body just above the torso
  const sx = D.shoulder.x * k, sz = D.shoulder.z * k, rp = pin, rh = pin + clearance, ar = D.shoulder.r * k, td = D.shoulder.td * k;
  const out = [], top = D.top * k, zb = top + 0.12 * k, zh = top + 0.25 * k;
  const body = parts.filter(P => P.group === 'body' || P.group === 'back'), head = parts.filter(P => P.group === 'head');
  // the side of the torso near the shoulder: the largest x inside the body
  const ft = field(parts.filter(P => P.group === 'body'));
  let xs = 0;
  for (let x = 0; x < sx; x += 0.25) for (let y = -td; y <= td; y += td / 4) for (let z = sz - 2 * ar; z <= sz + 2 * ar; z += ar / 2) if (ft(x, y, z) < 0) xs = Math.max(xs, x);
  const len = Math.min(xs * 0.5, 4 * pin), xa = xs + 0.6;
  const fb = field(body), holes = [rod([xs + 2, 0, sz], [xs - len - 0.6, 0, sz], rh), rod([-xs - 2, 0, sz], [-xs + len + 0.6, 0, sz], rh)];
  const neckPin = rod([0, 0, top - 0.3 * k], [0, 0, zh + len], rp);
  const fbody = (x, y, z) => Math.max(Math.min(Math.max(fb(x, y, z), z - zb), neckPin(x, y, z)), -holes[0](x, y, z), -holes[1](x, y, z), -z);
  const [blo, bhi] = box(body, 2); blo[2] = 0; bhi[2] = Math.max(bhi[2], zh + len + 2);
  out.push(onBed(implicitSolid(fbody, [blo, bhi], h, { progress: p => step(p / 4, 1) })));
  const hh = field(head), hhole = rod([0, 0, zh - 2], [0, 0, zh + len + 0.6], rh);
  const fhead = (x, y, z) => Math.max(hh(x, y, z), zh - z, -hhole(x, y, z));
  const [hlo, hhi] = box(head, 2);
  out.push(onBed(implicitSolid(fhead, [hlo, hhi], h / 1.4, { progress: p => step(0.25 + p / 4, 1) })));
  for (const s of [1, -1]) {
    const arm = parts.filter(P => P.group === 'arm' && Math.sign(P.c[0]) === s), fa = field(arm);
    const pinRod = rod([s * sx, 0, sz], [s * (xs - len), 0, sz], rp);
    const farm = (x, y, z) => Math.min(Math.max(fa(x, y, z), xa - s * x), pinRod(x, y, z));
    const [alo, ahi] = box(arm, 2);
    if (s > 0) alo[0] = xs - len - 2; else ahi[0] = -xs + len + 2;
    const m = implicitSolid(farm, [alo, ahi], h, { progress: p => step(0.5 + (s > 0 ? 0 : 0.25) + p / 4, 1) });
    // laid with the pin pointing up: the axis -s x becomes +z
    transform(m, ([x, y, z]) => [z, y, -s * x]);
    if (s < 0) flip(m);
    out.push(onBed(m));
  }
  // side by side on the bed, 6 mm apart
  let x = 0;
  for (const m of out) {
    const [lo, hi] = bounds(m), dx = x - lo[0];
    transform(m, ([a, b, c]) => [a + dx, b, c]);
    x += hi[0] - lo[0] + 6;
  }
  const all = merge(...out);
  onBed(all);
  all.mode = 'parts';
  return all;
}

export const fileName = o => `robot_s${o.seed}_${o.mode}_${o.size}mm`;
