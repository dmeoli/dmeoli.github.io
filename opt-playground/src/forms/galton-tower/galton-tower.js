// Galton dice tower: balls falling on the unrolled surface of the cylinder,
// the histogram of the bins against the wrapped binomial law, the tower in
// 3D and the print panel.

import { t, onTheme, onLang } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { wrapped, tv, geometry, pegAngle, binAngle } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  M: { def: 10, min: 4, max: 20, int: true },
  n: { def: 10, min: 3, max: 24, int: true },
  p: { def: 0.5, min: 0.05, max: 0.95 },
  sleeve: { def: false },
};

let counts = [], total = 0, flying = [], playing = false, last = 0, st = null;
const reset = () => { counts = new Array(st.M).fill(0); total = 0; flying = []; };

// one ball: the turns at each row (1 right, 0 left), drawn with probability p
const ball = now => ({ steps: Array.from({ length: st.n }, () => (Math.random() < st.p ? 1 : 0)), t0: now });
const landed = b => { const k = b.steps.reduce((a, x) => a + x, 0); counts[(((k - Math.ceil(st.n / 2)) % st.M) + st.M) % st.M]++; total++; };

function frame(now) {
  const dt = now - last; last = now;
  if (playing && Math.random() < dt / 90) flying.push(ball(now));
  const rate = 220;                       // ms per row
  flying = flying.filter(b => { if ((now - b.t0) / rate > st.n + 1) { landed(b); return false; } return true; });
  draw(now, rate);
  requestAnimationFrame(frame);
}

function draw(now, rate) {
  const g = geometry({ size: 6, M: st.M, n: st.n });
  const cv = $('board'), W = cv.clientWidth || 600, H = Math.round(W * 0.55), dpr = Math.min(2, devicePixelRatio);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const X = a => ((a / (2 * Math.PI) + 0.5 + (st.n % 2 ? 0 : 0.5 / st.M)) % 1 + 1) % 1 * W, rowY = i => 16 + (H - 46) * i / st.n;
  c.fillStyle = css('--accent');
  for (let i = 0; i < st.n; i++) {
    const js = i === 0 ? [0] : [...Array(st.M).keys()];
    for (const j of js) { c.beginPath(); c.arc(X(pegAngle(g, i, j)), rowY(i), 3, 0, 2 * Math.PI); c.fill(); }
  }
  c.strokeStyle = css('--rule');
  for (let j = 0; j < st.M; j++) { const x = X(binAngle(g, j) + Math.PI / st.M); c.beginPath(); c.moveTo(x, H - 26); c.lineTo(x, H - 4); c.stroke(); }
  c.fillStyle = css('--ink-soft'); c.font = '11px "IBM Plex Mono", monospace'; c.textAlign = 'center';
  for (let j = 0; j < st.M; j++) c.fillText(String(j + 1), X(binAngle(g, j)), H - 8);
  c.fillStyle = css('--gold');
  for (const b of flying) {
    const f = (now - b.t0) / rate, i = Math.min(st.n, Math.floor(f)), fr = f - i;
    let k = 0;
    for (let q = 0; q < i; q++) k += b.steps[q] ? 1 : -1;
    const dir = i < st.n ? (b.steps[i] ? 1 : -1) : 0;
    const a = (k + dir * Math.min(1, fr)) * Math.PI / st.M;
    const y = i < st.n ? rowY(i) - 7 + fr * (rowY(1) - rowY(0)) : H - 30 + 18 * Math.min(1, fr);
    c.beginPath(); c.arc(X(a), y, 4, 0, 2 * Math.PI); c.fill();
  }
  hist();
}

function hist() {
  const P = wrapped(st.n, st.M, st.p), cv = $('hist'), W = cv.clientWidth || 600, H = 170, dpr = Math.min(2, devicePixelRatio);
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const emp = counts.map(x => x / (total || 1)), top = Math.max(...P, ...emp, 1 / st.M) * 1.15, bw = W / st.M;
  // the bins in the same places as under the board
  const g = geometry({ size: 6, M: st.M, n: st.n }), cx = j => ((binAngle(g, j) / (2 * Math.PI) + 0.5 + (st.n % 2 ? 0 : 0.5 / st.M)) % 1 + 1) % 1 * W;
  const Y = v => H - 20 - (H - 30) * v / top;
  c.fillStyle = css('--lilac');
  emp.forEach((v, j) => c.fillRect(cx(j) - bw / 2 + 3, Y(v), bw - 6, H - 20 - Y(v)));
  c.strokeStyle = css('--ink-soft'); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, Y(1 / st.M)); c.lineTo(W, Y(1 / st.M)); c.stroke(); c.setLineDash([]);
  c.fillStyle = css('--accent');
  P.forEach((v, j) => { c.beginPath(); c.arc(cx(j), Y(v), 4, 0, 2 * Math.PI); c.fill(); });
  c.fillStyle = css('--ink-soft'); c.font = '11px "IBM Plex Mono", monospace'; c.textAlign = 'center';
  P.forEach((_, j) => c.fillText(String(j + 1), cx(j), H - 5));
  const U = new Array(st.M).fill(1 / st.M);
  $('stats').innerHTML = `<span>${t('balls', 'palline')} <b>${total}</b></span>` +
    `<span>TV(${t('bins', 'scomparti')}, ${t('wrapped', 'avvolta')}) <b>${total ? tv(emp, P).toFixed(3) : '–'}</b></span>` +
    `<span>TV(${t('wrapped', 'avvolta')}, ${t('uniform', 'uniforme')}) <b>${tv(P, U).toFixed(4)}</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [1, -1.6, 0.7],
  onChange: state => { const changed = !st || st.M !== state.M || st.n !== state.n || st.p !== state.p; st = state; if (changed) reset(); },
  panel: {
    size: { value: 6, min: 3, max: 16, step: 0.5, label: { en: 'ball diameter, mm', it: 'diametro della pallina, mm' } },
    fields: [],
    name: o => `galton_tower_M${o.M}_n${o.n}_ball${o.size}mm`,
    head: 'binary STL, millimetres, Galton dice tower',
    object: 'galton tower',
    note: info => (info.note ? ` · ${info.note}` : ''),
  },
  panelKeys: ['size'],
});
st = s.state;
$('drop').addEventListener('click', () => flying.push(ball(performance.now())));
$('thousand').addEventListener('click', () => { for (let k = 0; k < 1000; k++) landed(ball(0)); });
$('play').addEventListener('click', () => { playing = !playing; $('play').classList.toggle('main', !playing); });
$('reset').addEventListener('click', reset);
onTheme(() => hist()); onLang(() => hist());
requestAnimationFrame(now => { last = now; frame(now); });
