// The print panel of polarity.html, shown when the page is opened from Forms
// as polarity.html?print (theme.js): the polytope of the scene and its polar
// as two solids, built from the vertices that the scene draws
// (window.__polarity, set by src/polarity.js at every change).

import { printPanel } from '../../print/index.js';
import { solid, fileName } from './model.js';

const $ = id => document.getElementById(id);

printPanel($('print'), {
  size: { value: 60, min: 20, max: 200, what: { en: 'largest side of the larger solid', it: 'lato più grande del solido maggiore' } },
  fields: [
    { key: 'which', type: 'select', label: { en: 'solids', it: 'solidi' }, value: 'both',
      options: [{ value: 'both', en: 'P and its polar', it: 'P e il suo polare' }, { value: 'P', en: 'P only', it: 'solo P' },
        { value: 'polar', en: 'the polar only', it: 'solo il polare' }] },
    { key: 'gap', label: { en: 'gap, mm', it: 'distanza, mm' }, value: 8, min: 2, max: 40, step: 1 },
  ],
  build: o => solid({ V: window.__polarity.V, ...o }),
  name: o => fileName({ shape: $('shape').value, ...o }),
  head: 'binary STL, millimetres, a polytope and its polar',
  object: 'polarity',
  share: () => location.origin + location.pathname + location.search + '#shape=' + $('shape').value + '&scale=' + $('scale').value,
});
