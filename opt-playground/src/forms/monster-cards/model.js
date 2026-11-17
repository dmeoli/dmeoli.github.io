// Collectible cards of the monsters (src/forms/monsters) as lithophanes: a
// plate whose thickness follows the darkness of the face of the card, so
// that the card shows its picture against a lamp. The numbers of the card are
// invariants of the figurine of the monster, a closed triangle mesh built as
// for printing at a reference height: its volume and its area, its Euler
// characteristic V - E + F and its genus, and the order of the group of
// isometries that map its vertices onto its vertices. The face is drawn on an
// OffscreenCanvas (the picture by a small z-buffer of the same mesh), turned
// into luminance and into a plate by src/forms/lithophane/model.js. No DOM:
// cardData and solid run in workers.

import { implicitSolid, volume } from '../../print/index.js';
import { lineup, TYPE, beats, names, number } from '../monsters/model.js';
import { solid as lithophane, linear } from '../lithophane/model.js';

export const REF = 60;        // the height of the figurine measured, mm

/* ------------------------------------------------------------ the mesh -- */

// the figurine without a base, REF mm tall, at the draft resolution of the
// monsters (cells of REF / 85 mm)
export function figurine(seed, type, stage) {
  const [m] = lineup(seed, type, String(stage));
  const k = REF / m.top, h = REF / 85;
  const f = (x, y, z) => Math.max(m.f(x / k, y / k, z / k) * k, -z);
  const mesh = implicitSolid(f, [m.lo.map(v => v * k), m.hi.map(v => v * k)].map((b, i) => (i === 0 ? [b[0], b[1], 0] : b)), h);
  mesh.h = h;
  return mesh;
}

// volume (mm3), area (mm2), V, E, F, the Euler characteristic, the
// components, the genus and the order of the symmetry group of a closed mesh
export function invariants(m) {
  const P = m.pos, I = m.idx, V = P.length / 3, F = I.length / 3;
  const edges = new Set();
  let area = 0;
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; edges.add(a < b ? a * V + b : b * V + a); }
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  const E = edges.size, chi = V - E + F;
  const up = new Int32Array(V).map((_, i) => i), find = i => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); up[find(I[t + 1])] = a; up[find(I[t + 2])] = a; }
  let comps = 0;
  for (let i = 0; i < V; i++) if (find(i) === i) comps++;
  return { volume: volume(m), area, V, E, F, chi, comps, genus: (2 * comps - chi) / 2, sym: symmetry(m) };
}

// the isometries that fix the vertical axis through the centre of the box
// (rotations by 360/k degrees, mirrors in the planes x = c and y = c, and
// their products), counted when 99% of the vertices land within tol of a
// vertex; the identity is always there
export function symmetry(m, tol = (m.h || 1) * 1.1) {
  const P = m.pos, V = P.length / 3;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cs = tol, key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  const grid = new Map();
  for (let v = 0; v < V; v++) {
    const k = key(Math.floor(P[3 * v] / cs), Math.floor(P[3 * v + 1] / cs), Math.floor(P[3 * v + 2] / cs));
    let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v);
  }
  const near = (x, y, z) => {
    const i = Math.floor(x / cs), j = Math.floor(y / cs), k = Math.floor(z / cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = grid.get(key(i + a, j + b, k + c));
      if (l) for (const v of l) if (Math.hypot(P[3 * v] - x, P[3 * v + 1] - y, P[3 * v + 2] - z) <= tol) return true;
    }
    return false;
  };
  const test = map => {
    const step = Math.max(1, Math.floor(V / 4000));
    let n = 0, ok = 0;
    for (let v = 0; v < V; v += step) { n++; const q = map(P[3 * v] - cx, P[3 * v + 1] - cy); if (near(q[0] + cx, q[1] + cy, P[3 * v + 2])) ok++; }
    return ok >= 0.99 * n;
  };
  let order = 1;
  for (let k = 2; k <= 6; k++) {
    const a = 2 * Math.PI / k, c = Math.cos(a), s = Math.sin(a);
    if (test((x, y) => [c * x - s * y, s * x + c * y])) {
      // the cyclic group of order k, and the dihedral one if a mirror holds too
      order = Math.max(order, k * (test((x, y) => [x, -y]) || test((x, y) => [-x, y]) ? 2 : 1));
    }
  }
  if (order === 1 && (test((x, y) => [x, -y]) || test((x, y) => [-x, y]))) order = 2;
  return order;
}

/* --------------------------------------------------------- the picture -- */

// the mesh seen from the front right and a little above, by a z-buffer of
// w x h pixels: the luminance of a Lambert shading, 1 where nothing is hit,
// with a dark outline where the depth jumps
export function picture(m, w, h) {
  const az = -0.6, el = 0.3, P = m.pos, I = m.idx, V = P.length / 3;
  const fw = [-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el)];   // into the screen
  const rt = [-Math.sin(az), Math.cos(az), 0];
  const upv = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const X = new Float32Array(V), Y = new Float32Array(V), Z = new Float32Array(V);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < V; v++) {
    const p = [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
    X[v] = p[0] * rt[0] + p[1] * rt[1] + p[2] * rt[2]; Y[v] = p[0] * upv[0] + p[1] * upv[1] + p[2] * upv[2]; Z[v] = p[0] * fw[0] + p[1] * fw[1] + p[2] * fw[2];
    x0 = Math.min(x0, X[v]); x1 = Math.max(x1, X[v]); y0 = Math.min(y0, Y[v]); y1 = Math.max(y1, Y[v]);
  }
  const sc = 0.92 * Math.min(w / (x1 - x0), h / (y1 - y0)), ox = (w - sc * (x1 - x0)) / 2, oy = (h - sc * (y1 - y0)) / 2;
  const sx = v => ox + (X[v] - x0) * sc, sy = v => h - oy - (Y[v] - y0) * sc;
  const depth = new Float32Array(w * h).fill(Infinity), lum = new Float32Array(w * h).fill(1);
  const L = [0.45, 0.35, 0.82], Ll = Math.hypot(...L);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b), cx = sx(c), cy = sy(c);
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    // the normal of the face, for its shade (facing the viewer only)
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], nl = Math.hypot(...n) || 1;
    if (n[0] * fw[0] + n[1] * fw[1] + n[2] * fw[2] > 0) continue;
    const lam = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * Ll));
    const shade = 0.3 + 0.62 * lam;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * Z[a] + l2 * Z[b] + l3 * Z[c], o = j * w + i;
      if (z < depth[o]) { depth[o] = z; lum[o] = shade; }
    }
  }
  // the outline: where the depth jumps by more than a few pixels
  const out = lum.slice(), jump = 4 / sc;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const o = j * w + i, d = depth[o];
    const ds = [depth[o - 1], depth[o + 1], depth[o - w], depth[o + w]];
    if (ds.some(e => (d === Infinity) !== (e === Infinity) || (d !== Infinity && e !== Infinity && Math.abs(d - e) > jump))) out[o] = 0.05;
  }
  return out;
}

/* ----------------------------------------------------------- the card -- */

const TX = {
  en: { stage: 'stage', mass: 'MASS', skin: 'SKIN', holes: 'HOLES', sym: 'SYMMETRY', euler: 'EULER', beats: 'beats', at: `figurine ${REF} mm tall`, cm3: 'cm³', cm2: 'cm²' },
  it: { stage: 'stadio', mass: 'MASSA', skin: 'PELLE', holes: 'BUCHI', sym: 'SIMMETRIA', euler: 'EULERO', beats: 'batte', at: `statuina alta ${REF} mm`, cm3: 'cm³', cm2: 'cm²' },
};

// little drawings of the five kinds of mathematics, in a box of side s
function icon(g, type, x, y, s) {
  g.save(); g.translate(x, y); g.lineWidth = Math.max(2, s * 0.08); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (type === 'ice') for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a), sn = Math.sin(a);
    g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + c * s * 0.45, s / 2 + sn * s * 0.45);
    g.moveTo(s / 2 + c * s * 0.25, s / 2 + sn * s * 0.25); g.lineTo(s / 2 + Math.cos(a + 0.6) * s * 0.36, s / 2 + Math.sin(a + 0.6) * s * 0.36);
  } else if (type === 'plant') {
    const br = (x0, y0, a, l, d) => { const x1 = x0 + Math.cos(a) * l, y1 = y0 - Math.sin(a) * l; g.moveTo(x0, y0); g.lineTo(x1, y1); if (d > 0) { br(x1, y1, a + 0.5, l * 0.68, d - 1); br(x1, y1, a - 0.5, l * 0.68, d - 1); } };
    br(s / 2, s * 0.95, Math.PI / 2, s * 0.32, 3);
  } else if (type === 'fire') {
    g.moveTo(s * 0.5, s * 0.05); g.bezierCurveTo(s * 0.95, s * 0.45, s * 0.85, s * 0.95, s * 0.5, s * 0.95);
    g.bezierCurveTo(s * 0.15, s * 0.95, s * 0.05, s * 0.55, s * 0.35, s * 0.35); g.bezierCurveTo(s * 0.35, s * 0.55, s * 0.5, s * 0.6, s * 0.5, s * 0.05);
  } else if (type === 'rock') {
    const pts = [[0.1, 0.5], [0.3, 0.15], [0.7, 0.1], [0.92, 0.45], [0.75, 0.9], [0.25, 0.88]];
    g.moveTo(pts[0][0] * s, pts[0][1] * s); for (const [a, b] of pts.slice(1)) g.lineTo(a * s, b * s); g.closePath();
    g.moveTo(0.3 * s, 0.15 * s); g.lineTo(0.5 * s, 0.5 * s); g.lineTo(0.92 * s, 0.45 * s); g.moveTo(0.5 * s, 0.5 * s); g.lineTo(0.25 * s, 0.88 * s);
  } else {
    for (let k = 0; k < 3; k++) { const yy = s * (0.25 + 0.25 * k); g.moveTo(s * 0.05, yy); for (let i = 1; i <= 20; i++) g.lineTo(s * (0.05 + 0.9 * i / 20), yy + Math.sin(i / 20 * 2 * Math.PI + k) * s * 0.1); }
  }
  g.stroke(); g.restore();
}

// the face of the card, 63 x 88 mm drawn at 10 pixels per mm: black on
// white, the luminance that the lithophane turns into thickness
export function cardFace({ seed, type, stage, lang = 'en', inv, pic, pw, ph }) {
  const W = 630, H = 880, c = new OffscreenCanvas(W, H), g = c.getContext('2d'), L = TX[lang] || TX.en;
  const ink = '#000', st = +stage;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 9;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  rr(14, 14, W - 28, H - 28, 34); g.stroke();
  // the name, the number, the type
  const nm = names(seed, type)[st - 1];
  g.font = 'bold 64px sans-serif'; g.textBaseline = 'alphabetic';
  let fs = 64; while (g.measureText(nm).width > 400 && fs > 36) { fs -= 4; g.font = `bold ${fs}px sans-serif`; }
  g.fillText(nm, 44, 104);
  g.font = 'bold 34px sans-serif'; g.textAlign = 'right'; g.fillText('No. ' + String(number(seed, type)).padStart(3, '0'), W - 44, 96); g.textAlign = 'left';
  // the picture in its frame
  const bx = 44, by = 128, bw = W - 88, bh = 350;
  const img = new ImageData(pw, ph);
  for (let i = 0; i < pw * ph; i++) { const v = Math.round(255 * Math.pow(pic[i], 1 / 2.2)); img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v; img.data[4 * i + 3] = 255; }
  const tmp = new OffscreenCanvas(pw, ph); tmp.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(tmp, bx + 6, by + 6, bw - 12, bh - 12);
  g.lineWidth = 7; rr(bx, by, bw, bh, 18); g.stroke();
  // the type, its mathematics, the stage
  icon(g, type, bx, by + bh + 20, 64);
  g.font = 'bold 38px sans-serif';
  g.fillText(TYPE[type][lang] || TYPE[type].en, bx + 82, by + bh + 58);
  g.font = '28px sans-serif';
  g.fillText(`${TYPE[type].math[lang] || TYPE[type].math.en} · ${L.stage} ${st}/3`, bx + 82, by + bh + 92);
  // the numbers
  const rows = [
    [L.mass, `${(inv.volume / 1000).toFixed(1)} ${L.cm3}`],
    [L.skin, `${(inv.area / 100).toFixed(0)} ${L.cm2}`],
    [L.holes, `${inv.genus}`],
    [L.sym, `${inv.sym}`],
  ];
  let y = by + bh + 140;
  g.lineWidth = 4; g.beginPath(); g.moveTo(bx, y - 42); g.lineTo(bx + bw, y - 42); g.stroke();
  for (const [k, v] of rows) {
    g.font = 'bold 36px sans-serif'; g.fillText(k, bx, y);
    g.textAlign = 'right'; g.fillText(v, bx + bw, y); g.textAlign = 'left';
    y += 44;
  }
  g.font = '27px sans-serif';
  const [b1, b2] = beats(type);
  g.fillText(`${L.beats} ${TYPE[b1][lang] || b1}, ${TYPE[b2][lang] || b2} · χ = ${inv.chi}`, bx, y + 2);
  g.font = '22px sans-serif';
  g.fillText(`${L.at} · ${seed} · ${type}`, bx, H - 38);
  const d = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = linear(d[4 * i]);
  return { lum, W, H };
}

// the luminance resampled to cells of px mm (63 x 88 mm in all)
function resample({ lum, W, H }, gw, gh) {
  const out = new Float32Array(gw * gh), sx = W / gw, sy = H / gh;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let s = 0, n = 0;
    for (let y = Math.floor(j * sy); y < Math.floor((j + 1) * sy); y++) for (let x = Math.floor(i * sx); x < Math.floor((i + 1) * sx); x++) { s += lum[y * W + x]; n++; }
    out[j * gw + i] = s / Math.max(1, n);
  }
  return out;
}

// everything the page and the print need: the invariants, the face at full
// resolution and on the grid of the plate (cells of about px mm at size mm)
export function cardData({ seed = 21, type = 'ice', stage = '3', lang = 'en', size = 88, px = 0.3 } = {}, progress) {
  const m = figurine(seed, type, stage === 'c' ? '3' : stage);
  if (progress) progress(0.3);
  const inv = invariants(m);
  const pw = 270, ph = 170, pic = picture(m, pw, ph);
  const face = cardFace({ seed, type, stage: stage === 'c' ? '3' : stage, lang, inv, pic, pw, ph });
  const gh = Math.round(size / px), gw = Math.round(gh * 63 / 88);
  return { inv, face, gw, gh, grid: resample(face, gw, gh) };
}

// o: { seed, type, stage, lang, size (mm, the long side), thin, thick (mm) }
export function solid(o = {}, progress) {
  const size = o.size ?? 88, px = size / 300;
  const d = cardData({ ...o, px }, progress && (f => progress(0.6 * f)));
  const m = lithophane({ lum: d.grid, gw: d.gw, gh: d.gh, size, shape: 'flat', frame: 0.01, frameThick: o.thick ?? 3, thin: o.thin ?? 0.8, thick: o.thick ?? 3 });
  if (progress) progress(1);
  Object.assign(m, { volumeFig: +(d.inv.volume / 1000).toFixed(2), genus: d.inv.genus, sym: d.inv.sym, chi: d.inv.chi });
  return m;
}

export const fileName = o => `card_${o.type}_${o.seed}_stage${o.stage === 'c' ? 3 : o.stage}_${o.size}mm`;
