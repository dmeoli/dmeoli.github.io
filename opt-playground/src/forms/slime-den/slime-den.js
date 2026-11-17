// Slime den: the agents of Jones growing the network on a canvas, step by
// step, the den in 3D (built in a worker from the same seed and number of
// steps) and the print panel.

import { t, onTheme, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { Physarum, network } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  seed: { def: 1, min: 1, max: 99999, int: true },
  food: { def: 5, min: 2, max: 9, int: true },
  slimes: { def: 4, min: 0, max: 8, int: true },
  SA: { def: 22.5, min: 5, max: 60 },
  RA: { def: 45, min: 5, max: 90 },
  SO: { def: 9, min: 3, max: 20 },
  steps: { def: 400, min: 50, max: 1200, int: true },
};

const hex = s => { const m = s.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); };
let sim = null, st = null, running = false;
function restart(state) {
  st = state;
  sim = new Physarum({ seed: st.seed, food: st.food, SA: st.SA, RA: st.RA, SO: st.SO });
  if (!running) { running = true; requestAnimationFrame(tick); }
}
function tick() {
  if (!sim) return;
  const per = /[#&]sync\b/.test(location.hash) ? st.steps : 4;
  for (let k = 0; k < per && sim.steps < st.steps; k++) sim.step();
  draw();
  if (sim.steps < st.steps) requestAnimationFrame(tick); else running = false;
}
function draw() {
  const cv = $('trail'), n = sim.n, g = cv.getContext('2d');
  if (cv.width !== n) { cv.width = n; cv.height = n; }
  const img = g.createImageData(n, n), bg = hex(css('--panel') || '#f2edf8'), fg = hex(css('--accent') || '#7338a8'), au = hex(css('--gold') || '#6c5920');
  const vals = [];
  for (let q = 0; q < n * n; q += 7) if (sim.inside[q]) vals.push(sim.T[q]);
  vals.sort((a, b) => a - b);
  const top = vals[Math.floor(0.985 * vals.length)] || 1;
  const done = sim.steps >= st.steps, M = done ? network(sim) : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = j * n + i, o = 4 * ((n - 1 - j) * n + i), v = Math.min(1, sim.T[q] / top) ** 0.6;
    const c = M && M[q] ? au : fg;
    for (let k = 0; k < 3; k++) img.data[o + k] = sim.inside[q] ? bg[k] + (c[k] - bg[k]) * v : bg[k];
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = css('--ink');
  for (const [x, y] of sim.F) { g.beginPath(); g.arc(x, n - y, 3.5, 0, 2 * Math.PI); g.fill(); }
  $('stats').innerHTML = `<span>${t('step', 'passo')} <b>${sim.steps}</b> / ${st.steps}</span><span>${t('agents', 'agenti')} <b>${sim.A.length / 3}</b></span>` +
    (done ? `<span>${t('network', 'rete')} <b>${(100 * M.reduce((a, b) => a + b, 0) / sim.inside.reduce((a, b) => a + b, 0)).toFixed(1)}%</b> ${t('of the disc', 'del disco')}</span>` : '');
}

fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.8, -1.4, 1.1],
  onChange: restart,
  panel: {
    size: { value: 100, min: 40, max: 250, label: { en: 'diameter, mm', it: 'diametro, mm' } },
    fields: [
      { key: 'ridge', label: { en: 'network height, mm', it: 'altezza della rete, mm' }, value: 1.6, min: 0.6, max: 4, step: 0.1 },
      { key: 'base', label: { en: 'plate, mm', it: 'piastra, mm' }, value: 2, min: 1, max: 5, step: 0.2 },
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `slime_den_s${o.seed}_f${o.food}_${o.size}mm`,
    head: 'binary STL, millimetres, slime den',
    object: 'slime den',
  },
  panelKeys: ['ridge', 'base'],
});
onTheme(() => sim && draw()); onLang(() => sim && draw());
