// The print panel of lp3d.html, shown when the page is opened from Forms as
// lp3d.html?print (theme.js): the polytope of the instance chosen in the
// scene with the path of its method, built off the page by model.js. The
// scene keeps its own state in the address, so the link of a request
// restores it.

import { printPanel } from '../../print/index.js';
import { layout, fileName } from './model.js';

const $ = id => document.getElementById(id);
const seed = () => +(new URLSearchParams(location.hash.slice(1)).get('seed') || 7);
const now = () => ({ inst: $('inst').value, seed: seed(), mode: $('mode').value, rule: $('rule').value });

printPanel($('print'), {
  size: { value: 80, min: 30, max: 250, what: { en: 'side of the polytope', it: 'lato del politopo' } },
  fields: [
    { key: 'style', type: 'select', label: { en: 'print', it: 'stampa' }, value: 'auto',
      options: [{ value: 'auto', en: 'solid for the simplex, frame for the barrier', it: 'pieno per il simplesso, telaio per la barriera' },
        { value: 'solid', en: 'solid, edges engraved', it: 'pieno, spigoli incisi' }, { value: 'struts', en: 'frame of struts', it: 'telaio di aste' }] },
    { key: 'tube', label: { en: 'path radius, mm', it: 'raggio del cammino, mm' }, value: 1.6, min: 0.8, max: 4, step: 0.1 },
    { key: 'base', type: 'check', label: { en: 'base', it: 'base' }, value: false,
      thick: { key: 'baseThick', label: { en: 'base, mm', it: 'base, mm' }, value: 2, min: 1, max: 6, step: 0.2 } },
  ],
  worker: { module: new URL('./model.js', import.meta.url).href, fn: 'solid',
    args: o => { const s = now(); return [layout(s), { ...o, style: o.style === 'auto' ? undefined : o.style }]; } },
  name: o => { const s = now(); return fileName({ ...s, ...o, style: o.style === 'auto' ? (s.mode === 'ipm' ? 'struts' : 'solid') : o.style }); },
  head: 'binary STL, millimetres, a polytope with the path of the simplex or of the barrier method',
  object: 'LP in 3D',
});
