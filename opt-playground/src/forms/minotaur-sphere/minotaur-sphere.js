// The Minotaur's spherical labyrinth: the two hemispheres mapped flat with
// the walls and the way from the start to the goal, the ball in 3D and the
// print panel.

import { t, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';

const $ = id => document.getElementById(id);
const SPEC = {
  freq: { def: 6, min: 2, max: 10, int: true },
  seed: { def: 1, min: 1, max: 99999, int: true },
  mode: { def: 'halves', values: ['halves', 'cut'] },
};

// the azimuthal equidistant map of a hemisphere (north: z >= 0), radius 1
// at the equator; the point (x, y, z) at distance acos(+-z) / (pi / 2)
const proj = (p, north, cx) => {
  const z = north ? p[2] : -p[2], r = Math.acos(Math.max(-1, Math.min(1, z))) / (Math.PI / 2), a = Math.atan2(p[1], north ? p[0] : -p[0]);
  return [cx + 100 * r * Math.cos(a), 110 - 100 * r * Math.sin(a)];
};
const slerp = (a, b, k) => {
  const w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), s = Math.sin(w) || 1;
  return Array.from({ length: k + 1 }, (_, i) => { const t2 = i / k, p = Math.sin((1 - t2) * w) / s, q = Math.sin(t2 * w) / s; return [0, 1, 2].map(c => p * a[c] + q * b[c]); });
};

let last = null, show = false;
function draw(m) {
  if (m) last = m;
  m = last;
  if (!m) return;
  let s = '';
  for (const [north, cx] of [[true, 110], [false, 330]]) {
    s += `<circle cx="${cx}" cy="110" r="100" class="disc"/>`;
    const line = pts => {
      let d = '', pen = false;
      for (const p of pts) {
        const ok = north ? p[2] >= -0.02 : p[2] <= 0.02;
        if (!ok) { pen = false; continue; }
        const [x, y] = proj(p, north, cx);
        d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); pen = true;
      }
      return d;
    };
    let w = '';
    for (const [a, b] of m.walls) w += line(slerp(a, b, 4));
    s += `<path d="${w}" class="wall"/>`;
    if (show) {
      const pts = [];
      for (let i = 0; i + 1 < m.way.length; i++) pts.push(...slerp(m.way[i], m.way[i + 1], 4));
      s += `<path d="${line(pts)}" class="way"/>`;
    }
    for (const [p, cls] of [[m.start, 'start'], [m.goal, 'goal']]) {
      if (north ? p[2] < 0 : p[2] > 0) continue;
      const [x, y] = proj(p, north, cx);
      s += `<circle cx="${x}" cy="${y}" r="4" class="${cls}"/>`;
    }
  }
  $('maps').innerHTML = s;
  $('stats').innerHTML = `<span>${t('cells', 'celle')} <b>${m.cells}</b></span><span>${t('walls', 'muri')} <b>${m.walls.length}</b></span>` +
    `<span>${t('cells on the way', 'celle del percorso')} <b>${m.length + 1}</b></span>`;
}

const sc = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  preview: 'preview',
  eye: [1, -1.5, 0.9],
  onMesh: draw,
  panel: {
    size: { value: 80, min: 30, max: 200, what: { en: 'diameter with the walls', it: 'diametro con i muri' }, label: { en: 'diameter, mm', it: 'diametro, mm' } },
    fields: [
      { key: 'wall', label: { en: 'wall height, mm', it: 'altezza dei muri, mm' }, value: 2.4, min: 1, max: 6, step: 0.1 },
      { key: 'width', label: { en: 'wall width, mm', it: 'spessore dei muri, mm' }, value: 1.6, min: 0.8, max: 4, step: 0.1 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `minotaur_sphere_f${o.freq}_s${o.seed}_${o.mode}_${o.size}mm`,
    head: 'binary STL, millimetres, spherical labyrinth',
    object: 'spherical labyrinth',
  },
  panelKeys: ['wall', 'width'],
});
onLang(() => draw());
$('showway').addEventListener('change', e => { show = e.target.checked; draw(); });
