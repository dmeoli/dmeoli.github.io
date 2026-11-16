// A printable solid for the shell of Raup's model: the wall between the
// aperture and the same aperture narrowed by the thickness, swept along the
// helico-spiral, as a closed triangle mesh in millimetres, written as binary
// STL, as 3MF and as a zip of both.
//
// The surface of the scene is not used: its whorls run through one another
// (in the nautilus each whorl holds the one before), so offsetting it would
// give a mesh that crosses itself. Each aperture lies in a plane through the
// coiling axis, hence the section of the solid by the half-plane at azimuth
// psi is exactly the union of the walls of the apertures at the angles
// theta = -psi + 2 pi m; this gives an implicit function of every point,
// negative inside the wall, whose zero set is extracted by marching
// tetrahedra on a regular grid. The result is closed, every edge is shared by
// two triangles and nothing crosses, whatever the numbers; near the apex,
// where the aperture is thinner than the wall, the whorl is solid, and the
// part smaller than a cell vanishes.

const TAU = 2 * Math.PI;

// approximate signed distance from an ellipse of semi-axes A (radial), B
// (axial), and from the drop, an ellipse whose radial half-width is narrowed by
// (1 + sin phi) / 2 to a point at its lower end
function sdEllipse(u, v, A, B) {
  const p = u / A, q = v / B, rho = Math.hypot(p, q);
  if (rho < 1e-9) return -Math.min(A, B);
  const gr = Math.hypot(u / (A * A), v / (B * B)) / rho;
  return (rho - 1) / gr;
}
// the drop has a cusp at its lower end, where no offset of the same shape
// keeps the wall thick: its distance is measured from a polyline of its right
// half (it is symmetric in u), and its cavity is the set of points deeper than
// the thickness, so that the wall is solid where the drop is thinner than it
const DROP = (() => {
  const k = 64, a = [];
  for (let i = 0; i <= k; i++) {
    const ph = -Math.PI / 2 + Math.PI * i / k;
    a.push([(1 + Math.sin(ph)) / 2 * Math.cos(ph), Math.sin(ph)]);
  }
  return a;
})();
function sdDrop(u, v, A, B) {
  const x = Math.abs(u) / A, y = v / B, sy = B / A;
  // distance in units of A, the axial coordinate stretched back by B / A
  let d2 = Infinity;
  for (let i = 0; i < DROP.length - 1; i++) {
    const px = DROP[i][0], py = DROP[i][1] * sy, qx = DROP[i + 1][0], qy = DROP[i + 1][1] * sy;
    const ex = qx - px, ey = qy - py, wx = x - px, wy = y * sy - py;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const dx = wx - t * ex, dy = wy - t * ey, dd = dx * dx + dy * dy;
    if (dd < d2) d2 = dd;
  }
  const s = Math.max(-1, Math.min(1, y)), inside = Math.abs(y) < 1 && x < (1 + s) / 2 * Math.sqrt(1 - s * s);
  return (inside ? -A : A) * Math.sqrt(d2);
}

// the implicit function of the wall, in model units (aperture of unit radial
// half-axis at theta = 0, apex n revolutions before), clamped at +-cap
export function wallField({ W, D, T, S, n, drop = false }, thick, cap) {
  const lw = Math.log(W) / TAU, R0 = (1 + D) / (1 - D), tmin = -TAU * n;
  return (x, y, z) => {
    const r = Math.hypot(x, y), th0 = -Math.atan2(y, x);
    const m0 = Math.ceil((tmin - Math.PI - th0) / TAU), m1 = Math.floor((Math.PI - th0) / TAU);
    let f = cap, th = th0 + TAU * m0, g = Math.exp(lw * th);
    for (let m = m0; m <= m1; m++, th += TAU, g *= W) {
      const A = g, B = S * g, u = r - R0 * g, v = z + T * R0 * g;
      if (Math.abs(u) - A > f || Math.abs(v) - B > f) continue;
      let w;
      if (drop) { const d = sdDrop(u, v, A, B); w = Math.max(d, -d - thick); }
      else {
        w = sdEllipse(u, v, A, B);
        const Ai = A - thick, Bi = B - thick;
        if (Ai > 0 && Bi > 0) w = Math.max(w, -sdEllipse(u, v, Ai, Bi));
      }
      // beyond the last aperture or before the apex, the distance from the
      // half-plane that ends the sweep
      const dl = th > 0 ? th : th < tmin ? tmin - th : 0;
      if (dl > 0) w = Math.max(w, dl < Math.PI / 2 ? r * Math.sin(dl) : r);
      if (w < f) f = w;
    }
    return Math.max(-cap, f);
  };
}

/* ---------------------------------------------------- marching tetrahedra -- */

// the six tetrahedra of a cube along its main diagonal (Kuhn), corners coded
// by bits x = 1, y = 2, z = 4: the same split in every cube, so that the faces
// of neighbouring cubes match
const TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];

class Grow {
  constructor(T, n = 1 << 16) { this.T = T; this.a = new T(n); this.n = 0; }
  push3(a, b, c) {
    if (this.n + 3 > this.a.length) { const b2 = new this.T(this.a.length * 2); b2.set(this.a); this.a = b2; }
    this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c;
  }
  get() { return this.a.slice(0, this.n); }
}

// the zero set of f over the box [x0, x0 + nx h] x ..., f > 0 on the border;
// triangles counterclockwise seen from outside (where f > 0)
export function isosurface(f, x0, y0, z0, h, nx, ny, nz, progress) {
  const P = new Grow(Float32Array), I = new Grow(Uint32Array);
  const NX = nx + 1, NY = ny + 1, plane = NX * NY;
  const eps = 1e-7 * h;
  const layer = k => {
    const a = new Float32Array(plane), z = z0 + k * h;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      let v = (i === 0 || j === 0 || k === 0 || i === nx || j === ny || k === nz) ? h : f(x0 + i * h, y0 + j * h, z);
      if (Math.abs(v) < eps) v = eps;
      a[j * NX + i] = v;
    }
    return a;
  };
  let lo = layer(0), hi, mapLo = new Map(), mapHi = new Map();
  const val = new Float64Array(8), cx = new Float64Array(8), cy = new Float64Array(8), cz = new Float64Array(8);
  const gid = new Float64Array(8);
  const vert = (a, b) => {
    // a's bits are a subset of b's: the edge from corner a to corner b
    const dir = a ^ b, key = gid[a] * 8 + dir, map = (a & 4) ? mapHi : mapLo;
    let id = map.get(key);
    if (id === undefined) {
      let t = val[a] / (val[a] - val[b]);
      t = Math.min(0.98, Math.max(0.02, t));
      id = P.n / 3;
      P.push3(cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]), cz[a] + t * (cz[b] - cz[a]));
      map.set(key, id);
    }
    return id;
  };
  const tri = (p, q, r, ox, oy, oz) => {
    const A = P.a;
    const ux = A[3 * q] - A[3 * p], uy = A[3 * q + 1] - A[3 * p + 1], uz = A[3 * q + 2] - A[3 * p + 2];
    const vx = A[3 * r] - A[3 * p], vy = A[3 * r + 1] - A[3 * p + 1], vz = A[3 * r + 2] - A[3 * p + 2];
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    if (nxv * ox + nyv * oy + nzv * oz < 0) I.push3(p, r, q); else I.push3(p, q, r);
  };
  for (let k = 0; k < nz; k++) {
    hi = layer(k + 1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const b = j * NX + i;
      val[0] = lo[b]; val[1] = lo[b + 1]; val[2] = lo[b + NX]; val[3] = lo[b + NX + 1];
      val[4] = hi[b]; val[5] = hi[b + 1]; val[6] = hi[b + NX]; val[7] = hi[b + NX + 1];
      let neg = 0;
      for (let c = 0; c < 8; c++) if (val[c] < 0) neg++;
      if (neg === 0 || neg === 8) continue;
      for (let c = 0; c < 8; c++) {
        const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
        cx[c] = x0 + (i + di) * h; cy[c] = y0 + (j + dj) * h; cz[c] = z0 + (k + dk) * h;
        gid[c] = ((k + dk) * NY + (j + dj)) * NX + (i + di);
      }
      for (const t of TETS) {
        const ins = [], out = [];
        for (const c of t) (val[c] < 0 ? ins : out).push(c);
        if (!ins.length || !out.length) continue;
        // outward: from the corners inside to those outside
        let ox = 0, oy = 0, oz = 0;
        for (const c of out) { ox += cx[c] / out.length; oy += cy[c] / out.length; oz += cz[c] / out.length; }
        for (const c of ins) { ox -= cx[c] / ins.length; oy -= cy[c] / ins.length; oz -= cz[c] / ins.length; }
        const e = (a, b) => (a < b ? vert(a, b) : vert(b, a));
        if (ins.length === 1 || out.length === 1) {
          const [s, o] = ins.length === 1 ? [ins[0], out] : [out[0], ins];
          tri(e(s, o[0]), e(s, o[1]), e(s, o[2]), ox, oy, oz);
        } else {
          const [a, b] = ins, [c, d] = out;
          const p = e(a, c), q = e(a, d), r = e(b, d), s = e(b, c);
          tri(p, q, r, ox, oy, oz); tri(p, r, s, ox, oy, oz);
        }
      }
    }
    lo = hi; mapLo = mapHi; mapHi = new Map();
    if (progress && (k & 7) === 0) progress((k + 1) / nz);
  }
  return { pos: P.get(), idx: I.get() };
}

/* ---------------------------------------------------- the printable solid -- */

// the solid of the shell `p` ({W, D, T, S, n, drop}) for a print of largest
// dimension `size` mm, wall `thick` mm, with a stand when `base`; `fine`
// halves the cell. The shell lies on its aperture when all of it is on one
// side of the aperture's plane (a bivalve valve), else with the coiling axis
// upright, apex up.
export function printMesh(p, { size = 80, thick = 1.6, base = true, fine = false } = {}, progress) {
  // samples of the outer surface, to place and scale the solid
  const lw = Math.log(p.W) / TAU, R0 = (1 + p.D) / (1 - p.D), nT = 600, nP = 48, pts = [];
  for (let i = 0; i <= nT; i++) {
    const th = -TAU * p.n * (1 - i / nT), g = Math.exp(lw * th), c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < nP; j++) {
      const ph = TAU * j / nP, w = p.drop ? (1 + Math.sin(ph)) / 2 : 1, r = R0 * g + g * w * Math.cos(ph);
      pts.push([r * c, -r * s, -p.T * R0 * g + g * p.S * Math.sin(ph)]);
    }
  }
  let ymin = Infinity, ymax = -Infinity;
  for (const q of pts) { ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]); }
  const onLip = -ymin < 0.06 * (ymax - ymin);
  // model -> upright frame: on the lip, (x, y, z) -> (x, -z, y)
  const rot = onLip ? q => [q[0], -q[2], Math.max(0, q[1])] : q => q;
  const unrot = onLip ? (X, Y, Z) => [X, Z, -Y] : (X, Y, Z) => [X, Y, Z];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const up = pts.map(rot);
  for (const q of up) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); }
  const s = size / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h = Math.min(thick / (fine ? 2.6 : 1.8), size / (fine ? 190 : 120)), cap = 2 * h;
  const wf = wallField(p, thick / s, cap / s);
  // the stand: a disc under the part of the shell that is lower than its
  // thickness, the shell sunk into it
  let disc = null;
  if (base && !onLip) {
    const c = Math.min(4, Math.max(1.2, 0.03 * size)), low = up.filter(q => (q[2] - lo[2]) * s < c);
    let mx = 0, my = 0;
    for (const q of low) { mx += (q[0] - lo[0]) * s / low.length; my += (q[1] - lo[1]) * s / low.length; }
    let R = 0;
    for (const q of low) R = Math.max(R, Math.hypot((q[0] - lo[0]) * s - mx, (q[1] - lo[1]) * s - my));
    disc = { x: mx, y: my, c, R: Math.max(R + 1.5, 0.12 * size) };
  }
  const f = (X, Y, Z) => {
    const q = unrot(X / s + lo[0], Y / s + lo[1], Z / s + lo[2]);
    let v = s * wf(q[0], q[1], q[2]);
    if (onLip) v = Math.max(v, -s * q[1]);
    if (disc) v = Math.min(v, Math.max(-Z, Z - disc.c, Math.hypot(X - disc.x, Y - disc.y) - disc.R));
    return v;
  };
  const b0 = [0, 0, 0], b1 = [(hi[0] - lo[0]) * s, (hi[1] - lo[1]) * s, (hi[2] - lo[2]) * s];
  if (disc) {
    b0[0] = Math.min(b0[0], disc.x - disc.R); b0[1] = Math.min(b0[1], disc.y - disc.R);
    b1[0] = Math.max(b1[0], disc.x + disc.R); b1[1] = Math.max(b1[1], disc.y + disc.R);
  }
  const pad = 2 * h, n = [0, 1, 2].map(a => Math.ceil((b1[a] - b0[a] + 2 * pad) / h));
  const mesh = pieces(isosurface(f, b0[0] - pad, b0[1] - pad, b0[2] - pad, h, n[0], n[1], n[2], progress));
  // exactly `size` mm along the largest side, from the origin
  const P = mesh.pos, mn = [Infinity, Infinity, Infinity], mxv = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k++) { const a = k % 3; mn[a] = Math.min(mn[a], P[k]); mxv[a] = Math.max(mxv[a], P[k]); }
  const k2 = size / Math.max(mxv[0] - mn[0], mxv[1] - mn[1], mxv[2] - mn[2]);
  for (let k = 0; k < P.length; k++) P[k] = (P[k] - mn[k % 3]) * k2;
  return { ...mesh, dims: [0, 1, 2].map(a => (mxv[a] - mn[a]) * k2), cell: h, onLip, disc: !!disc };
}

// the crumbs that the grid leaves where the whorls get thinner than a cell
// (near the apex) are dropped: only the pieces with at least 5% of the
// vertices of the largest stay, each of them closed
function pieces({ pos, idx }) {
  const nv = pos.length / 3, up = new Int32Array(nv).map((_, i) => i);
  const find = i => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let k = 0; k < idx.length; k += 3) {
    const a = find(idx[k]), b = find(idx[k + 1]), c = find(idx[k + 2]);
    up[b] = a; up[find(c)] = a;
  }
  const size = new Int32Array(nv);
  for (let i = 0; i < nv; i++) size[find(i)]++;
  let big = 0;
  for (let i = 0; i < nv; i++) big = Math.max(big, size[i]);
  const keep = new Int32Array(nv).fill(-1);
  let m = 0;
  for (let i = 0; i < nv; i++) if (size[find(i)] >= 0.05 * big) keep[i] = m++;
  const P = new Float32Array(3 * m);
  for (let i = 0; i < nv; i++) if (keep[i] >= 0) P.set(pos.subarray(3 * i, 3 * i + 3), 3 * keep[i]);
  const I = [];
  for (let k = 0; k < idx.length; k += 3) if (keep[idx[k]] >= 0) I.push(keep[idx[k]], keep[idx[k + 1]], keep[idx[k + 2]]);
  return { pos: P, idx: Uint32Array.from(I) };
}

/* ------------------------------------------------------------- the files -- */

export function stl({ pos, idx }, head = 'binary STL, millimetres, shell after Raup (1966)') {
  const nt = idx.length / 3, buf = new ArrayBuffer(84 + 50 * nt), dv = new DataView(buf);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = 3 * idx[3 * t], b = 3 * idx[3 * t + 1], c = 3 * idx[3 * t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
    for (const q of [a, b, c]) { dv.setFloat32(o, pos[q], true); dv.setFloat32(o + 4, pos[q + 1], true); dv.setFloat32(o + 8, pos[q + 2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

const enc = new TextEncoder();

// the 3D model part of a 3MF package, in millimetres
export function model3mf({ pos, idx }, name = 'shell') {
  const parts = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n<object id="1" name="${name}" type="model">\n<mesh>\n<vertices>\n`];
  const chunk = 20000;
  for (let v = 0; v < pos.length / 3; v += chunk) {
    let s = '';
    for (let k = v; k < Math.min(pos.length / 3, v + chunk); k++)
      s += `<vertex x="${+pos[3 * k].toFixed(4)}" y="${+pos[3 * k + 1].toFixed(4)}" z="${+pos[3 * k + 2].toFixed(4)}"/>\n`;
    parts.push(s);
  }
  parts.push('</vertices>\n<triangles>\n');
  for (let t = 0; t < idx.length / 3; t += chunk) {
    let s = '';
    for (let k = t; k < Math.min(idx.length / 3, t + chunk); k++)
      s += `<triangle v1="${idx[3 * k]}" v2="${idx[3 * k + 1]}" v3="${idx[3 * k + 2]}"/>\n`;
    parts.push(s);
  }
  parts.push('</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="1"/>\n</build>\n</model>\n');
  return concat(parts.map(s => enc.encode(s)));
}

export function pack3mf(mesh, name) {
  return zip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n') },
    { name: '3D/3dmodel.model', data: model3mf(mesh, name) },
  ]);
}

function concat(arrs) {
  const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ------------------------------------------- a zip writer, deflate if any -- */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(d) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflate(d) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([d]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// entries [{name, data}] -> the bytes of a zip archive
export async function zip(entries) {
  const files = [], central = [];
  let off = 0;
  for (const { name, data } of entries) {
    const nm = enc.encode(name), crc = crc32(data), z = await deflate(data);
    const method = z && z.length < data.length ? 8 : 0, body = method ? z : data;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, method, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    files.push(new Uint8Array(lh.buffer), nm, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + body.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return concat([...files, ...central, new Uint8Array(end.buffer)]);
}

// the name of the files: the numbers of the shell and of the print
export function fileName(p, o) {
  const r = x => +(+x).toPrecision(4);
  return `shell_W${r(p.W)}_D${r(p.D)}_T${r(p.T)}_S${r(p.S)}_n${r(p.n)}${p.drop ? '_drop' : ''}_${r(o.size)}mm_t${r(o.thick)}${o.base ? '_base' : ''}${o.fine ? '_fine' : ''}`;
}
