// A lithophane: a plate whose thickness follows the darkness of a picture,
// so that a light behind it shows the picture. The light that crosses a
// thickness t of plastic falls about as exp(-mu t); the thickness of each
// point is chosen so that the light coming through is proportional to the
// linear luminance of the picture, between the thinnest and the thickest
// wall. Flat (a height field on a plate, read from its smooth side) or
// curved (the same field bent on an arc of a cylinder, which stands by
// itself, the smooth side outwards), always in a frame.

import { heightfield, transform, outwards, onBed } from '../../print/index.js';

// the thickness of a pixel of linear luminance L in [0, 1]
export function thickness(L, { thin = 0.8, thick = 3, mu = 1.2, curve = 'light' } = {}) {
  const D = thick - thin;
  if (curve === 'linear') return thick - L * D;
  const lo = Math.exp(-mu * D);
  return thin + Math.log(1 / (lo + L * (1 - lo))) / mu;
}

// sRGB to linear light
export const linear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

// the grid of the print: the picture of gw x gh luminances (0..1, row 0 at
// the top) in a frame; returns { H (thickness), nx, ny, dx } in mm
export function grid({ lum, gw, gh, size = 100, frame = 3, frameThick = 4, thin = 0.8, thick = 3, mu = 1.2, curve = 'light', mirror = true }) {
  const step = (size - 2 * frame) / Math.max(gw, gh), nf = Math.max(1, Math.round(frame / step));
  const nx = gw + 2 * nf, ny = gh + 2 * nf, H = new Float32Array(nx * ny).fill(frameThick);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
    // column mirrored, so that the picture reads right from the smooth side
    const i = nf + (mirror ? gw - 1 - c : c), j = nf + (gh - 1 - r);
    H[j * nx + i] = thickness(lum[r * gw + c], { thin, thick, mu, curve });
  }
  return { H, nx, ny, dx: step, nf };
}

// o: { lum, gw, gh (the picture), size (mm, largest side), shape ('flat' |
// 'curved'), angle (degrees of the arc), frame (mm), thin, thick (mm), curve
// ('light' | 'linear') }
export function solid(o = {}, progress) {
  const { shape = 'flat', angle = 120, thin = 0.8 } = o;
  const curved = shape === 'curved';
  const g = grid({ ...o, mirror: !curved });
  // the height field stands on z = 0 with its thickness above it
  const H = g.H.map(t => t - thin);
  const m = heightfield(H, g.nx, g.ny, { dx: g.dx, dy: g.dx, base: thin });
  if (progress) progress(0.6);
  if (curved) {
    // x along an arc of radius R, y up, the flat side (z = 0) outwards
    const W = (g.nx - 1) * g.dx, R = W / (angle * Math.PI / 180);
    transform(m, ([x, y, z]) => {
      const th = (x - W / 2) / R, r = R - z;
      return [r * Math.sin(th), R - r * Math.cos(th), y];
    });
    outwards(m);
  }
  onBed(m);
  m.cells = (g.nx - 2 * g.nf) + ' x ' + (g.ny - 2 * g.nf);
  m.pixel = +g.dx.toFixed(2);
  return m;
}

export const fileName = o => `lithophane_${o.name || 'image'}_${o.shape || 'flat'}_${o.size}mm`;
