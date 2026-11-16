// The model of shell coiling of D. M. Raup (1966): a generating curve (the
// aperture, an ellipse in the plane through the coiling axis) swept along a
// logarithmic helico-spiral. Three numbers fix the form: W, the expansion of
// the whorl per revolution; D, the distance of the generating curve from the
// axis, as the ratio of its inner to its outer edge; T, the translation along
// the axis per revolution, relative to the distance of the centre of the
// curve from the axis. S is the shape of the aperture, axial over radial axis;
// a drop is an ellipse narrowed to a point at its lower end, as in a cone shell.

export const PHI = (1 + Math.sqrt(5)) / 2;

export const presets = {
  nautilus:   { en: 'Nautilus',        it: 'Nautilus',        W: 3,     D: 0,    T: 0,   S: 0.85, n: 3 },
  ammonite:   { en: 'Ammonite',        it: 'Ammonite',        W: 2.2,   D: 0.46, T: 0,   S: 0.8,  n: 5 },
  snail:      { en: 'Garden snail',    it: 'Chiocciola',      W: 2.6,   D: 0.06, T: 1.1, S: 1,    n: 4.5 },
  turritella: { en: 'Turritella',      it: 'Turritella',      W: 1.3,   D: 0.12, T: 4.5, S: 1,    n: 12 },
  cone:       { en: 'Cone shell',      it: 'Cono',            W: 2.8,   D: 0,    T: 2.4, S: 2.2,  n: 6, drop: true },
  bivalve:    { en: 'Bivalve valve',   it: 'Valva di bivalve', W: 1000, D: 0.05, T: 0.1, S: 0.6,  n: 1 },
  horn:       { en: 'Open horn',       it: 'Corno aperto',    W: 2.6,   D: 0.6,  T: 1.6, S: 1,    n: 3 },
  golden:     { en: 'Golden, W = φ⁴',  it: 'Aurea, W = φ⁴',   W: PHI ** 4, D: 0, T: 0, S: 1,   n: 3 },
};

// the surface of the shell, its last aperture of unit radial half-axis at
// theta = 0 and the apex n revolutions before; rings of nPhi + 1 points (the
// seam closed by repeating the first), nTheta + 1 rings from apex to aperture.
// Returns positions, uv (u in revolutions, v the turn of the aperture) and the
// growth g of each ring, for the shading.
export function shell({ W, D, T, S, n, drop = false }, nTheta, nPhi) {
  const a = 1, R0 = a * (1 + D) / (1 - D);
  const pos = new Float32Array((nTheta + 1) * (nPhi + 1) * 3);
  const uv = new Float32Array((nTheta + 1) * (nPhi + 1) * 2);
  const gr = new Float32Array((nTheta + 1) * (nPhi + 1));
  const lw = Math.log(W) / (2 * Math.PI);
  let k = 0;
  for (let i = 0; i <= nTheta; i++) {
    const th = -2 * Math.PI * n * (1 - i / nTheta), g = Math.exp(lw * th);
    const c = Math.cos(th), s = Math.sin(th), rc = R0 * g, zc = -T * R0 * g;
    for (let j = 0; j <= nPhi; j++) {
      const ph = 2 * Math.PI * j / nPhi, w = drop ? (1 + Math.sin(ph)) / 2 : 1, r = rc + a * g * w * Math.cos(ph);
      pos[3 * k] = r * c; pos[3 * k + 1] = -r * s; pos[3 * k + 2] = zc + a * g * S * Math.sin(ph);
      uv[2 * k] = th / (2 * Math.PI); uv[2 * k + 1] = j / nPhi;
      gr[k] = g; k++;
    }
  }
  const idx = new Uint32Array(nTheta * nPhi * 6);
  let m = 0;
  for (let i = 0; i < nTheta; i++) for (let j = 0; j < nPhi; j++) {
    const p = i * (nPhi + 1) + j, q = p + nPhi + 1;
    idx[m++] = p; idx[m++] = p + 1; idx[m++] = q;
    idx[m++] = p + 1; idx[m++] = q + 1; idx[m++] = q;
  }
  return { pos, uv, gr, idx };
}

// the whorls of a planispiral shell (T = 0) with a circular aperture touch
// when the inner edge of one falls on the outer edge of the one before:
// D * W = 1; below that curve they overlap
export const overlaps = (W, D) => D * W < 1;

// the Fibonacci spiral drawn by a turtle: a quarter circle of radius F_k in
// each square, turning left; returns the squares, the arcs (start, end,
// centre, radius) and the eye, the fixed point of the similarity that maps a
// junction of two arcs to the next one (a quarter turn and a factor F_k+1/F_k)
export function fibonacci(N) {
  const F = [1, 1];
  while (F.length < N) F.push(F.at(-1) + F.at(-2));
  let p = [0, 0], h = [1, 0];
  const squares = [], arcs = [], joins = [p];
  for (const r of F) {
    const left = [-h[1], h[0]], c = [p[0] + r * left[0], p[1] + r * left[1]];
    const v = [p[0] - c[0], p[1] - c[1]], q = [c[0] - v[1], c[1] + v[0]];
    squares.push([c, p, [p[0] + q[0] - c[0], p[1] + q[1] - c[1]], q]);
    arcs.push({ from: p, to: q, c, r });
    p = q; h = left; joins.push(p);
  }
  // P_{k+1} - O = lambda i (P_k - O), solved for O in complex numbers
  const k = joins.length - 2, lam = F[k] / F[k - 1], P = joins[k], Q = joins[k + 1];
  const num = [Q[0] + lam * P[1], Q[1] - lam * P[0]], den = [1, -lam], d2 = 1 + lam * lam;
  const eye = [(num[0] * den[0] + num[1] * den[1]) / d2, (num[1] * den[0] - num[0] * den[1]) / d2];
  return { F, squares, arcs, joins, eye };
}

// a logarithmic spiral about the eye through the point P at angle 0, growing
// by W per counterclockwise revolution, sampled back over `turns` revolutions
export function logSpiral(eye, P, W, turns, steps = 400) {
  const v = [P[0] - eye[0], P[1] - eye[1]], lw = Math.log(W) / (2 * Math.PI), out = [];
  for (let i = 0; i <= steps; i++) {
    const th = -2 * Math.PI * turns * (1 - i / steps), g = Math.exp(lw * th), c = Math.cos(th), s = Math.sin(th);
    out.push([eye[0] + g * (c * v[0] - s * v[1]), eye[1] + g * (s * v[0] + c * v[1])]);
  }
  return out;
}
