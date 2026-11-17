// A height field as a solid block: the heights H (row by row, nx * ny values,
// H[j * nx + i] at x = i dx, y = j dy, not negative) stand on a base of
// thickness `base`; the bottom is flat at z = 0 and four walls close the
// sides. Good for a relief, a surface z = f(x, y), a landscape of a loss.

import { Grow } from './mesh.js';

export function heightfield(H, nx, ny, { dx = 1, dy = 1, base = 1 } = {}) {
  const P = new Grow(Float32Array, 6 * nx * ny), I = new Grow(Uint32Array, 12 * nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P.push3(i * dx, j * dy, base + Math.max(0, H[j * nx + i]));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P.push3(i * dx, j * dy, 0);
  const t = (i, j) => j * nx + i, b = (i, j) => nx * ny + j * nx + i;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    I.push3(t(i, j), t(i + 1, j), t(i + 1, j + 1)); I.push3(t(i, j), t(i + 1, j + 1), t(i, j + 1));
    I.push3(b(i, j), b(i + 1, j + 1), b(i + 1, j)); I.push3(b(i, j), b(i, j + 1), b(i + 1, j + 1));
  }
  // the border counterclockwise seen from above, and a wall on each side of it
  const loop = [];
  for (let i = 0; i < nx - 1; i++) loop.push([i, 0]);
  for (let j = 0; j < ny - 1; j++) loop.push([nx - 1, j]);
  for (let i = nx - 1; i > 0; i--) loop.push([i, ny - 1]);
  for (let j = ny - 1; j > 0; j--) loop.push([0, j]);
  for (let k = 0; k < loop.length; k++) {
    const [pi, pj] = loop[k], [qi, qj] = loop[(k + 1) % loop.length];
    I.push3(b(pi, pj), b(qi, qj), t(qi, qj)); I.push3(b(pi, pj), t(qi, qj), t(pi, pj));
  }
  return { pos: P.get(), idx: I.get() };
}
