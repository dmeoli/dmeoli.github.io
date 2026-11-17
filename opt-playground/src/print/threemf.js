// 3MF: a zip package (Open Packaging Conventions) holding the content
// types, the relationship to the model and the model itself, one object
// whose mesh is in millimetres.

import { zip, concat } from './zip.js';

const enc = new TextEncoder();
const esc = s => String(s).replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

// the 3D model part of a 3MF package, in millimetres
export function model3mf({ pos, idx }, name = 'solid') {
  const parts = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n<object id="1" name="${esc(name)}" type="model">\n<mesh>\n<vertices>\n`];
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

export function pack3mf(mesh, name = 'solid') {
  return zip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n') },
    { name: '3D/3dmodel.model', data: model3mf(mesh, name) },
  ]);
}
