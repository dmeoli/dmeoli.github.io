// Chladni figures, in millimetres: the nodal lines of a square plate (the
// approximation cos(n pi x) cos(m pi y) +- cos(m pi x) cos(n pi y) = 0 on the
// unit square) and of a circular one (J_n(k r) cos(n theta) = 0, k a zero of
// J_n, as on a membrane fixed at the rim), drawn as a plate with ridges of sand
// raised along them. The ridge is a rounded bump of the distance to the nodal
// set, estimated to first order by |f| / |grad f|. solid(o, progress) is what
// the page and the download panel call; sand(o, n) gives the grains of the 2D
// view.

import { onBed } from '../../print/index.js';

/* ---------------------------------------------------------- Bessel J_n -- */

// J_n(x) = (1/pi) int_0^pi cos(n t - x sin t) dt, by the trapezoidal rule,
// which converges geometrically on this periodic integrand
export function besselJ(n, x) {
  const K = 96;
  let s = 0.5 * (1 + Math.cos(n * Math.PI));
  for (let k = 1; k < K; k++) { const t = Math.PI * k / K; s += Math.cos(n * t - x * Math.sin(t)); }
  return s / K;
}
// the first m positive zeros of J_n, by a scan and bisection
export function besselZeros(n, m) {
  const z = [];
  let x0 = n === 0 ? 0.5 : n, f0 = besselJ(n, x0);
  for (let x = x0 + 0.05; z.length < m; x += 0.05) {
    const f = besselJ(n, x);
    if (f0 * f < 0) {
      let a = x - 0.05, b = x, fa = f0;
      for (let k = 0; k < 50; k++) { const c = (a + b) / 2, fc = besselJ(n, c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } }
      z.push((a + b) / 2);
    }
    f0 = f;
  }
  return z;
}

/* --------------------------------------------------------------- modes -- */

// the mode of the options: f(x, y) and its gradient on the plate of half
// side (or radius) 1 centred on the origin, as [f, fx, fy]
export function mode({ shape = 'square', m = 3, n = 5, sign = -1 }) {
  if (shape === 'circle') {
    const k = besselZeros(n, m)[m - 1];
    // J_n(k r) and its derivative on a table of r, read by linear interpolation
    const N = 1200, J = new Float64Array(N + 2), D = new Float64Array(N + 2);
    for (let i = 0; i <= N + 1; i++) {
      const x = k * i / N;
      J[i] = besselJ(n, x); D[i] = 0.5 * k * (besselJ(n - 1, x) - besselJ(n + 1, x));
    }
    const at = (A, r) => { const u = Math.min(N, r * N), i = Math.floor(u), w = u - i; return A[i] * (1 - w) + A[i + 1] * w; };
    return {
      k, eigen: k * k,
      f(x, y) {
        const r = Math.hypot(x, y), th = Math.atan2(y, x), c = Math.cos(n * th), s = Math.sin(n * th);
        const j = at(J, r), dj = at(D, r);
        if (r < 1e-9) return [j * c, dj, 0];
        // grad = dj c e_r - n j s / r e_theta
        const er = [x / r, y / r], et = [-y / r, x / r], a = dj * c, b = -n * j * s / r;
        return [j * c, a * er[0] + b * et[0], a * er[1] + b * et[1]];
      },
    };
  }
  // the unit square [0, 1]^2 mapped from [-1, 1]^2
  const P = Math.PI;
  return {
    eigen: P * P * (m * m + n * n),
    f(x, y) {
      const u = (x + 1) / 2, v = (y + 1) / 2;
      const cnu = Math.cos(n * P * u), snu = Math.sin(n * P * u), cmv = Math.cos(m * P * v), smv = Math.sin(m * P * v);
      const cmu = Math.cos(m * P * u), smu = Math.sin(m * P * u), cnv = Math.cos(n * P * v), snv = Math.sin(n * P * v);
      const f = cnu * cmv + sign * cmu * cnv;
      // d/dx = (1/2) d/du
      const fx = 0.5 * P * (-n * snu * cmv - sign * m * smu * cnv);
      const fy = 0.5 * P * (-m * cnu * smv - sign * n * cmu * snv);
      return [f, fx, fy];
    },
  };
}

// a mode that vanishes everywhere (n = m with the minus sign) has no figure
export const degenerate = o => (o.shape || 'square') === 'square' && o.m === o.n && o.sign < 0;

/* ---------------------------------------------------------------- sand -- */

// grains on the plate where the distance to the nodal set (plate units) is
// below w, more of them nearer: Float32Array of x, y in [-1, 1]
export function sand(o, n = 30000, w = 0.022) {
  const md = mode(o), out = [];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < n * 80 && out.length < 2 * n; k++) {
    const x = 2 * rnd() - 1, y = 2 * rnd() - 1;
    if (o.shape === 'circle' && x * x + y * y > 1) continue;
    const [f, fx, fy] = md.f(x, y), d = Math.abs(f) / Math.max(1e-9, Math.hypot(fx, fy));
    if (d < w * (0.25 + rnd())) out.push(x, y);
  }
  return Float32Array.from(out);
}

/* ----------------------------------------------------------- the plate -- */

// a closed solid from a top surface: vertices xy (pairs, centred on the
// origin, star-shaped around it), heights z, triangles counterclockwise
// seen from above and the border loop counterclockwise; the bottom is flat at
// z = 0, a fan from the centre to a copy of the border
function plateMesh(xy, z, tris, loop) {
  const nv = z.length, nb = loop.length;
  const pos = new Float32Array(3 * (nv + nb + 1));
  for (let i = 0; i < nv; i++) { pos[3 * i] = xy[2 * i]; pos[3 * i + 1] = xy[2 * i + 1]; pos[3 * i + 2] = z[i]; }
  for (let k = 0; k < nb; k++) { const i = loop[k], o = 3 * (nv + k); pos[o] = xy[2 * i]; pos[o + 1] = xy[2 * i + 1]; pos[o + 2] = 0; }
  const c = nv + nb, idx = new Uint32Array(tris.length + 9 * nb);
  idx.set(tris);
  let p = tris.length;
  for (let k = 0; k < nb; k++) {
    const q = (k + 1) % nb, ta = loop[k], tb = loop[q], ba = nv + k, bb = nv + q;
    idx[p++] = ba; idx[p++] = bb; idx[p++] = tb;
    idx[p++] = ba; idx[p++] = tb; idx[p++] = ta;
    idx[p++] = c; idx[p++] = bb; idx[p++] = ba;
  }
  return { pos, idx };
}

// o: { shape ('square', 'circle'), m, n, sign (square: +1 or -1), size (mm,
// side or diameter), base (mm, the plate), ridge (mm, the height of the
// sand), width (mm, the width of a ridge at its foot), res ('preview',
// 'draft', 'fine') }
export function solid(o = {}, progress) {
  const { shape = 'square', size = 80, base = 2, ridge = 1.6, width = 2.4, res = 'draft' } = o;
  const md = mode({ m: 3, n: 5, sign: -1, ...o }), a = size / 2, w = width / 2;
  // the grid step in mm: a third of the half width of a ridge, or less
  const step = Math.max(size / 360, Math.min({ preview: 0.5, draft: 0.4, fine: 0.25 }[res] || 0.4, w / 3));
  const empty = degenerate({ m: 3, n: 5, sign: -1, ...o });
  // the height above the plate of a point (x, y in plate units)
  const bump = (x, y) => {
    if (empty) return 0;
    const [f, fx, fy] = md.f(x, y), d = a * Math.abs(f) / Math.max(1e-9, Math.hypot(fx, fy));
    if (d >= w) return 0;
    const c = Math.cos(0.5 * Math.PI * d / w);
    return ridge * Math.sqrt(c);
  };
  let xy, z, tris, loop;
  if (shape === 'circle') {
    const nr = Math.ceil(a / step), na = 8 * Math.ceil(2 * Math.PI * a / step / 8), nv = 1 + nr * na;
    xy = new Float32Array(2 * nv); z = new Float32Array(nv);
    z[0] = base + bump(0, 0);
    for (let i = 1; i <= nr; i++) {
      const r = i / nr;
      for (let j = 0; j < na; j++) {
        const t = 2 * Math.PI * j / na, v = 1 + (i - 1) * na + j, x = r * Math.cos(t), y = r * Math.sin(t);
        xy[2 * v] = a * x; xy[2 * v + 1] = a * y; z[v] = base + bump(x, y);
      }
      if (progress && i % 16 === 0) progress(0.9 * i / nr);
    }
    const T = [], ring = (i, j) => 1 + (i - 1) * na + ((j % na) + na) % na;
    for (let j = 0; j < na; j++) T.push(0, ring(1, j), ring(1, j + 1));
    for (let i = 1; i < nr; i++) for (let j = 0; j < na; j++) {
      const p = ring(i, j), q = ring(i, j + 1), r = ring(i + 1, j), s = ring(i + 1, j + 1);
      T.push(p, r, s, p, s, q);
    }
    tris = Uint32Array.from(T);
    loop = Array.from({ length: na }, (_, j) => ring(nr, j));
  } else {
    const N = Math.ceil(size / step) + 1, nv = N * N;
    xy = new Float32Array(2 * nv); z = new Float32Array(nv);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -1 + 2 * i / (N - 1), y = -1 + 2 * j / (N - 1), v = j * N + i;
        xy[2 * v] = a * x; xy[2 * v + 1] = a * y; z[v] = base + bump(x, y);
      }
      if (progress && j % 16 === 0) progress(0.9 * j / N);
    }
    tris = new Uint32Array(6 * (N - 1) * (N - 1));
    let p = 0;
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const v = j * N + i;
      // the diagonal alternates, so that the grid has no preferred direction
      if ((i + j) & 1) { tris.set([v, v + 1, v + N + 1, v, v + N + 1, v + N], p); }
      else { tris.set([v, v + 1, v + N, v + 1, v + N + 1, v + N], p); }
      p += 6;
    }
    loop = [];
    for (let i = 0; i < N - 1; i++) loop.push(i);
    for (let j = 0; j < N - 1; j++) loop.push(j * N + N - 1);
    for (let i = N - 1; i > 0; i--) loop.push((N - 1) * N + i);
    for (let j = N - 1; j > 0; j--) loop.push(j * N);
  }
  const m = onBed(plateMesh(xy, z, tris, loop));
  if (progress) progress(1);
  return m;
}

export const fileName = o => o.shape === 'circle'
  ? `chladni_circle_n${o.n}_m${o.m}_${o.size}mm`
  : `chladni_square_${o.n}_${o.m}${o.sign < 0 ? 'minus' : 'plus'}_${o.size}mm`;
