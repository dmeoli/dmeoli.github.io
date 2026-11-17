// The files of a download: 'stl', '3mf', or 'zip' (both in one archive, since
// a browser may stop a second download started by the same click).

import { stl } from './stl.js';
import { pack3mf } from './threemf.js';
import { zip } from './zip.js';

// name: the base of the file names; head: the STL header (at most 80 ASCII
// characters); object: the name of the object in the 3MF
export async function printFiles(m, what, { name = 'solid', head = 'binary STL, millimetres', object = 'solid' } = {}) {
  if (what === 'stl') return { file: name + '.stl', bytes: stl(m, head) };
  if (what === '3mf') return { file: name + '.3mf', bytes: await pack3mf(m, object) };
  return { file: name + '.zip', bytes: await zip([{ name: name + '.stl', data: stl(m, head) }, { name: name + '.3mf', data: await pack3mf(m, object) }]) };
}

// hands bytes to the browser as a download
export function save(bytes, file, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
