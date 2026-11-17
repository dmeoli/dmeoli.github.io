// Scene H: superposition in a toy model, after Elhage et al., "Toy Models of
// Superposition" (Anthropic, 2022), https://transformer-circuits.pub/2022/toy_model/
// (the model rebuilt from its equations; no figure or code of the paper is used).
// n features x_i, each zero with probability S and uniform in [0, 1] otherwise,
// are squeezed into m = 2 or 3 dimensions h = W x and read back as
// x' = ReLU(W'W x + b), with the loss sum_i I_i (x_i - x'_i)^2 and importances
// I_i = r^i. Dense features get the m most important directions and the rest
// are dropped; sparse ones are packed in superposition, antipodal pairs first,
// then pentagons, because two rarely active features rarely interfere. With
// m = 3 the columns of W are arrows in a ball, and the packings are solids:
// antipodal pairs along three orthogonal axes make an octahedron.

import * as SM from './superposition-model.js';
import { THREE, stage3d, axes, label, tok, onTheme } from './stage3d-b.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const S = { n: 5, m: 2, sparsity: 0, decay: 0.9, out: 'relu', seed: 1 };
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S) S[k] = typeof S[k] === 'number' ? +v : v; });
let model, W, b, steps, timer = null;

function reset() {
  stop();
  model = SM.init(S.n, S.m, S.seed); W = model.W; b = model.b; steps = 0;
  $('arrows').hidden = S.m === 3; $('arrows3d').hidden = S.m !== 3; g3 = null;
  save(); draw();
}

// 1 - S is the probability that a feature is active; the slider is its log10
const density = () => 10 ** (-S.sparsity);
function trainSteps(k) {
  SM.trainSteps(model, k, { p: density(), decay: S.decay, relu: S.out === 'relu' });
  steps = model.steps;
}

// ------------------------------------------------------------------ drawing
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, c, t) => `rgb(${a.map((v, i) => Math.round(v + t * (c[i] - v))).join(',')})`;
const col = j => { const n = S.n; return mix(hex(css('--lilac')), hex(css('--accent')), n > 1 ? 1 - j / (n - 1) : 1); };

function draw() {
  const n = S.n, m = S.m, norms = SM.norms(W), dotW = (i, j) => SM.gram(W, i, j);
  const interf = Array.from({ length: n }, (_, i) => {
    if (norms[i] < 1e-9) return 0;
    let s = 0;
    for (let j = 0; j < n; j++) if (j !== i) s += (dotW(i, j) / norms[i]) ** 2;
    return s;
  });
  if (m === 3) draw3d(norms);
  else draw2d(norms);
  // W'W and b, in a diverging map: violet positive, gold negative
  let cv = $('gram'), ctx = cv.getContext('2d'); const G = cv.width, cell = Math.min((G - 30) / n, cv.height / n);
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, G, cv.height);
  const A = hex(css('--accent')), Gd = hex(css('--gold')), Bg = hex(css('--ground'));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = dotW(i, j);
      ctx.fillStyle = mix(Bg, v > 0 ? A : Gd, Math.min(1, Math.abs(v))); ctx.fillRect(j * cell, i * cell, cell - 1, cell - 1);
    }
    ctx.fillStyle = mix(Bg, b[i] > 0 ? A : Gd, Math.min(1, Math.abs(b[i]) * 2)); ctx.fillRect(n * cell + 8, i * cell, 22, cell - 1);
  }
  // the norm of every feature, coloured by how much it interferes with the others
  cv = $('bars'); ctx = cv.getContext('2d'); const Bw = cv.width, Bh = cv.height, bh = (Bh - 10) / n;
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, Bw, Bh);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = mix(hex(css('--accent')), hex(css('--gold')), Math.min(1, interf[i]));
    ctx.fillRect(28, 5 + i * bh, Math.min(1.3, norms[i]) / 1.3 * (Bw - 36), bh - 3);
    ctx.fillStyle = css('--ink-soft'); ctx.font = '11px IBM Plex Mono, monospace'; ctx.fillText(i + 1, 4, 5 + i * bh + bh / 2 + 3);
  }
  const rep = norms.filter(v => v > 0.5).length;
  $('rep').textContent = t(`${rep} of ${n} features represented in ${m} dimensions` + (rep > m ? ' (superposition)' : ''),
    `${rep} feature su ${n} rappresentate in ${m} dimensioni` + (rep > m ? ' (sovrapposizione)' : ''));
  $('steps').textContent = steps;
  $('dens').textContent = density().toPrecision(2);
}

// the columns of W as arrows in the plane of the hidden layer
function draw2d(norms) {
  const n = S.n, cv = $('arrows'), ctx = cv.getContext('2d'), Wd = cv.width, R = Wd / 2 - 24;
  ctx.fillStyle = css('--ground'); ctx.fillRect(0, 0, Wd, Wd);
  const sc = R / Math.max(1.2, ...norms);
  ctx.strokeStyle = css('--rule'); ctx.beginPath(); ctx.arc(Wd / 2, Wd / 2, sc, 0, 2 * Math.PI); ctx.stroke();
  for (let i = n - 1; i >= 0; i--) {
    const x = Wd / 2 + sc * W[0][i], y = Wd / 2 - sc * W[1][i];
    ctx.strokeStyle = col(i); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Wd / 2, Wd / 2); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = col(i); ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = css('--ink-soft'); ctx.font = '11px IBM Plex Mono, monospace';
    ctx.fillText(i + 1, x + 7 * Math.sign(W[0][i] || 1), y - 7 * Math.sign(W[1][i] || 1));
  }
}

// the columns of W as arrows in the ball of the hidden space, and the hull of
// the tips of the represented features (norm above 0.5), where the solids show
let st = null, g3 = null;
function build3d() {
  if (!st) st = stage3d($('arrows3d'), { position: [2.95, -3.7, 2.3], label: 'hidden space' });
  st.clear();
  const T = THREE, n = S.n, arrows = [];
  const ball = new T.Mesh(new T.SphereGeometry(1, 48, 32), new T.MeshBasicMaterial({ color: tok('--accent'), transparent: true, opacity: 0.05, depthWrite: false }));
  st.group.add(ball);
  for (const ax of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    const c = new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) => new T.Vector3(Math.cos(k / 96 * 2 * Math.PI), Math.sin(k / 96 * 2 * Math.PI), 0))), new T.LineBasicMaterial({ color: tok('--rule') }));
    c.rotation.set(...ax); st.group.add(c);
  }
  st.group.add(axes({ x: [-1.25, 1.25, 'h\u2081'], y: [-1.25, 1.25, 'h\u2082'], z: [-1.25, 1.25, 'h\u2083'] }, [0, 0, 0]));
  for (let i = 0; i < n; i++) {
    const color = new T.Color(col(i)), mat = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1, 12), mat), head = new T.Mesh(new T.ConeGeometry(0.05, 0.12, 16), mat);
    const g = new T.Group(); g.add(shaft, head);
    const tag = label(String(i + 1), [0, 0, 0], 'feat');
    st.group.add(g, tag); arrows.push({ g, shaft, head, tag });
  }
  const hull = new T.Group(); st.group.add(hull);
  g3 = { arrows, hull };
}
function draw3d(norms) {
  if (!g3) build3d();
  const T = THREE, up = new T.Vector3(0, 1, 0);
  g3.arrows.forEach(({ g, shaft, head, tag }, i) => {
    const v = new T.Vector3(W[0][i], W[1][i], W[2][i]), len = v.length();
    g.visible = len > 0.02; tag.visible = len > 0.05;
    if (!g.visible) return;
    g.quaternion.setFromUnitVectors(up, v.clone().normalize());
    const k = Math.min(1, 3 * len), sl = Math.max(0.001, len - 0.12 * k);
    shaft.scale.set(1, sl, 1); shaft.position.set(0, sl / 2, 0); head.scale.setScalar(k); head.position.set(0, sl + 0.06 * k, 0);
    tag.position.copy(v.clone().multiplyScalar(1 + 0.14 / len));
  });
  st.clear(g3.hull);
  const tips = norms.map((r, i) => [r, new T.Vector3(W[0][i], W[1][i], W[2][i])]).filter(([r]) => r > 0.5).map(([, v]) => v);
  if (spans3d(tips)) {
    const h = new ConvexHull().setFromPoints(tips), seg = [], tri = [];
    for (const f of h.faces) {
      let e = f.edge; const loop = [];
      do { seg.push(e.tail().point, e.head().point); loop.push(e.head().point); e = e.next; } while (e !== f.edge);
      for (let k = 1; k + 1 < loop.length; k++) tri.push(loop[0], loop[k], loop[k + 1]);
    }
    g3.hull.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(seg), new T.LineBasicMaterial({ color: tok('--accent-2'), transparent: true, opacity: 0.7 })),
      new T.Mesh(new T.BufferGeometry().setFromPoints(tri), new T.MeshBasicMaterial({ color: tok('--accent-2'), transparent: true, opacity: 0.08, side: T.DoubleSide, depthWrite: false })));
  } else if (tips.length >= 2) {
    // fewer than four tips off a plane: the polygon of the tips, in their plane
    // (a segment for an antipodal pair, a pentagon for five in a plane)
    const c = tips.reduce((a, v) => a.add(v), new T.Vector3()).multiplyScalar(1 / tips.length);
    const nrm = tips.length > 2 ? new T.Vector3().crossVectors(tips[0].clone().sub(c), tips[1].clone().sub(c)) : null;
    let ord = tips;
    if (nrm && nrm.lengthSq() > 1e-8) {
      const u = tips[0].clone().sub(c).normalize(), w = new T.Vector3().crossVectors(nrm.normalize(), u);
      ord = [...tips].sort((p, q) => Math.atan2(p.clone().sub(c).dot(w), p.clone().sub(c).dot(u)) - Math.atan2(q.clone().sub(c).dot(w), q.clone().sub(c).dot(u)));
    }
    g3.hull.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(ord), new T.LineBasicMaterial({ color: tok('--accent-2'), transparent: true, opacity: 0.7 })));
  }
  st.render();
}
// whether the points span space: a triangle of the largest area and a point off its plane
function spans3d(P) {
  if (P.length < 4) return false;
  let best = 0, nrm = null, o = null;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    const c = new THREE.Vector3().crossVectors(P[j].clone().sub(P[i]), P[k].clone().sub(P[i]));
    if (c.length() > best) { best = c.length(); nrm = c.normalize(); o = P[i]; }
  }
  return best > 1e-3 && P.some(p => Math.abs(p.clone().sub(o).dot(nrm)) > 0.08);
}
onTheme(() => { g3 = null; draw(); });

function save() { history.replaceState(null, '', '#' + new URLSearchParams(S)); }
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }

for (const k of ['n', 'm', 'sparsity', 'decay', 'out']) {
  $(k).value = S[k];
  $(k).oninput = e => { S[k] = k === 'out' ? e.target.value : +e.target.value; reset(); };
}
$('seed').onclick = () => { S.seed++; reset(); };
$('reset').onclick = reset;
$('step').onclick = () => { trainSteps(20); draw(); };
$('play').onclick = () => {
  if (timer) return stop();
  $('play').textContent = t('Pause', 'Pausa');
  timer = setInterval(() => { trainSteps(20); draw(); if (steps >= 4000) stop(); }, 30);
};
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const t = e.target;
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
  if (e.key === 'ArrowRight' && t.type !== 'range') $('step').click();
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
});
// the texts of the language: the title, the options of the read-out, the buttons
function words() {
  document.title = t('Superposition playground', 'Laboratorio della sovrapposizione');
  const o = { relu: ['ReLU', 'ReLU'], linear: ['linear', 'lineare'] };
  for (const op of $('out').options) op.textContent = t(...o[op.value]);
  $('seed').textContent = t('New weights', 'Nuovi pesi');
  $('reset').textContent = t('Reset', 'Ricomincia');
  $('step').textContent = t('Step', 'Passo'); $('step').title = t('20 steps of Adam', '20 passi di Adam');
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
}
onLang(() => { words(); draw(); });
words();
reset();
