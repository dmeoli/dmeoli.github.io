// Binary STL: an 80-byte header, the count, then per triangle its unit
// normal (from the winding), its three vertices and two zero bytes. STL has no
// unit; slicers read millimetres. The header must not start with "solid".

export function stl({ pos, idx }, head = 'binary STL, millimetres') {
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
