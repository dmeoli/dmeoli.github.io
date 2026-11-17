// Wang-tile dungeon: the map of a dungeon laid by scanline and the tile set
// drawn on canvases, the relief tiles in 3D and the print panel.

import { t, onTheme, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { tileSet, tileCells, layout, N, DOOR } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  seed: { def: 1, min: 1, max: 99999, int: true },
  set: { def: 'cohen8', values: ['cohen8', 'full16'] },
  fill: { def: 'caves', values: ['caves', 'wfc'] },
  cols: { def: 6, min: 2, max: 10, int: true },
  rows: { def: 4, min: 2, max: 8, int: true },
  what: { def: 'set', values: ['set', 'dungeon'] },
};

// a tile at (x, y) in pixels, cell side c; the doors marked by color
function drawTile(g, G, T, x, y, c, ink) {
  const col = [ink.c0, ink.c1];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    g.fillStyle = G[j * N + i] ? ink.wall : ink.floor;
    // row N - 1 is the north: drawn at the top
    g.fillRect(x + i * c, y + (N - 1 - j) * c, c + 0.5, c + 0.5);
  }
  if (!T) return;
  const k = Math.max(2, c * 0.45);
  g.fillStyle = col[T[0]]; g.fillRect(x + DOOR[T[0]] * c, y, c, k);
  g.fillStyle = col[T[2]]; g.fillRect(x + DOOR[T[2]] * c, y + N * c - k, c, k);
  g.fillStyle = col[T[1]]; g.fillRect(x + N * c - k, y + (N - 1 - DOOR[T[1]]) * c, k, c);
  g.fillStyle = col[T[3]]; g.fillRect(x, y + (N - 1 - DOOR[T[3]]) * c, k, c);
}

function draw(state) {
  const ink = { wall: css('--accent'), floor: css('--panel'), c0: css('--gold'), c1: css('--accent-2'), rule: css('--rule') };
  const set = tileSet(state.set), cells = set.map((_, k) => tileCells(state, k)), D = layout(state);
  const map = $('map'), W = map.clientWidth || 600, c = Math.floor(Math.min(W / (state.cols * N), 520 / (state.rows * N)));
  const dpr = Math.min(2, devicePixelRatio);
  map.width = state.cols * N * c * dpr; map.height = state.rows * N * c * dpr;
  map.style.aspectRatio = `${state.cols} / ${state.rows}`;
  const g = map.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let j = 0; j < state.rows; j++) for (let i = 0; i < state.cols; i++) drawTile(g, cells[D[j * state.cols + i]], null, i * N * c, j * N * c, c, ink);
  g.strokeStyle = ink.rule; g.lineWidth = 1;
  for (let i = 1; i < state.cols; i++) { g.beginPath(); g.moveTo(i * N * c, 0); g.lineTo(i * N * c, state.rows * N * c); g.stroke(); }
  for (let j = 1; j < state.rows; j++) { g.beginPath(); g.moveTo(0, j * N * c); g.lineTo(state.cols * N * c, j * N * c); g.stroke(); }
  // the set, in one row (two for 16)
  const ts = $('tiles'), per = set.length > 8 ? 8 : set.length, lines = Math.ceil(set.length / per);
  const tw = Math.floor((ts.clientWidth || 600) / per), tc = Math.max(2, Math.floor((tw - 8) / N));
  ts.width = per * tw * dpr; ts.height = lines * (N * tc + 8) * dpr;
  ts.style.aspectRatio = `${per * tw} / ${lines * (N * tc + 8)}`;
  const h = ts.getContext('2d'); h.setTransform(dpr, 0, 0, dpr, 0, 0);
  set.forEach((T, k) => drawTile(h, cells[k], T, (k % per) * tw + 4, Math.floor(k / per) * (N * tc + 8) + 4, tc, ink));
  const used = new Set(D).size;
  $('stats').innerHTML = `<span>${t('tiles in the set', 'tessere nel set')} <b>${set.length}</b></span>` +
    `<span>${t('kinds used in the map', 'tipi usati nella mappa')} <b>${used}</b></span>` +
    `<span>${t('tiles in the map', 'tessere nella mappa')} <b>${D.length}</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.6, -1.4, 1.3],
  onChange: draw,
  panel: {
    size: { value: 40, min: 20, max: 100, label: { en: 'tile side, mm', it: 'lato della tessera, mm' } },
    fields: [
      { key: 'wall', label: { en: 'wall height, mm', it: 'altezza dei muri, mm' }, value: 10, min: 3, max: 25, step: 0.5 },
      { key: 'base', label: { en: 'floor, mm', it: 'pavimento, mm' }, value: 2.4, min: 1.2, max: 6, step: 0.2 },
      { key: 'gap', label: { en: 'gap between tiles, mm', it: 'distanza fra le tessere, mm' }, value: 4, min: 1, max: 20, step: 0.5 },
    ],
    name: o => `wang_dungeon_${o.what}_${o.set}_${o.fill}_s${o.seed}_${o.size}mm`,
    head: 'binary STL, millimetres, Wang-tile dungeon',
    object: 'wang dungeon',
  },
  panelKeys: ['size', 'wall', 'base'],
});
onTheme(() => draw(s.state)); onLang(() => draw(s.state));
new ResizeObserver(() => draw(s.state)).observe($('map'));
