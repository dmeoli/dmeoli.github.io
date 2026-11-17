// Antigravity castle: the castle seen from the eye or turned freely, a ball
// rolling on each wall walk (down in the solid, up in the picture), the side
// view of the walk facing the eye, and the print panel.

import * as THREE from 'three';
import { t, onLang, onTheme } from '../../i18n.js';
import { fantasyScene } from '../fantasy/scene.js';
import { writeState } from '../../print/index.js';
import { DEFAULTS, castle, eye, warp, walkZ, solveBeta } from './model.js';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SPEC = {
  az: { def: DEFAULTS.az, min: -180, max: 180, int: true },
  el: { def: DEFAULTS.el, min: 35, max: 65, int: true },
  dist: { def: DEFAULTS.dist, min: 250, max: 600, int: true },
  slope: { def: DEFAULTS.slope, min: 2, max: 8 },
  rise: { def: DEFAULTS.rise, min: 6, max: 16 },
  mode: { def: 'eye', values: ['eye', 'orbit'] },
};

let mesh = null, balls = [], ray = null;

// the side view of the walk that points most towards the eye: the walk as it
// is seen (dashed), the walk of the solid, and the rays from the eye through
// a few of its points
function side(st, b) {
  const c = castle(st), E = eye(st), beta = b ?? solveBeta(E, c, st.slope), W = warp(E, c, beta);
  const arms = [[1, 0], [0, 1], [-1, 0], [0, -1]], a = st.az * Math.PI / 180;
  const d = arms.reduce((b, x) => (x[0] * Math.cos(a) + x[1] * Math.sin(a) > b[0] * Math.cos(a) + b[1] * Math.sin(a) ? x : b));
  const seen = [], real = [];
  for (let i = 0; i <= 20; i++) {
    const r = c.R0 + (c.R1 - c.R0) * i / 20, p = [d[0] * r, d[1] * r, walkZ(c, r)];
    seen.push(p); real.push(W(p));
  }
  const U = p => p[0] * d[0] + p[1] * d[1];
  const pts = [...seen, ...real];
  const u0 = Math.min(...pts.map(U)) - 6, u1 = Math.max(...pts.map(U)) + 6, z1 = Math.max(...pts.map(p => p[2])) + 8;
  const w = 330, h = 220, s = Math.min((w - 20) / (u1 - u0), (h - 30) / z1);
  const X = p => 10 + (U(p) - u0) * s, Y = p => h - 18 - p[2] * s;
  const line = (P, attr) => `<polyline points="${P.map(p => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')}" fill="none" ${attr}/>`;
  let rays = '';
  for (const i of [0, 10, 20]) {
    const p = seen[i], q = real[i], e = [p[0] + (E[0] - p[0]) * 0.12, p[1] + (E[1] - p[1]) * 0.12, p[2] + (E[2] - p[2]) * 0.12];
    const far = q[2] < p[2] ? q : p, near = far === q ? e : (U(q) > U(e) ? q : e);
    rays += `<line x1="${X(far)}" y1="${Y(far)}" x2="${X(near)}" y2="${Y(near)}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3"/>`;
  }
  $('side').innerHTML = `<line x1="0" x2="${w}" y1="${h - 18}" y2="${h - 18}" stroke="var(--rule)"/>` + rays +
    line(seen, 'stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5 4"') + line(real, 'stroke="var(--accent)" stroke-width="3"') +
    `<text x="${X(seen[0]) + 4}" y="${Y(seen[0]) - 6}" class="lab">${t('seen', 'vista')}</text>` +
    `<text x="${X(real[0]) + 4}" y="${Y(real[0]) + 14}" class="lab">${t('real', 'reale')}</text>` +
    `<text x="${X(seen[0])}" y="${h - 4}" class="lab" text-anchor="middle">${t('keep', 'mastio')}</text>` +
    `<text x="${X(seen[20])}" y="${h - 4}" class="lab" text-anchor="middle">${t('tower', 'torre')}</text>`;
}

function stats(m) {
  $('stats').innerHTML = `<span>${t('seen rising', 'salita apparente')} <b>${m.apparent.toFixed(1)}°</b></span>` +
    `<span>${t('real descent', 'discesa reale')} <b>${m.slope.toFixed(1)}°</b>${m.capped ? t(' (less than asked: more would fold the castle)', ' (meno del richiesto: di più ripiegherebbe il castello)') : ''}</span>` +
    `<span>β <b>${m.beta.toFixed(1)}%</b></span>` +
    `<span>${t('smallest det J', 'det J minimo')} <b>${m.det.toFixed(2)}</b></span>` +
    `<span>${t('surface over 45°', 'superficie oltre 45°')} <b>${(100 * m.overhang).toFixed(1)}%</b></span>`;
}

const s = fantasyScene({
  spec: SPEC,
  model: new URL('./model.js', import.meta.url).href,
  eye: [0.9, -1.5, 1.1],
  onChange: side,
  onMesh: m => { mesh = m; stats(m); side(s.state, m.beta); place(); },
  panel: {
    size: { value: 120, min: 80, max: 250, label: { en: 'side of the base, mm', it: 'lato della base, mm' } },
    fields: [
      { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
        options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] },
    ],
    name: o => `antigravity_castle_az${o.az}_el${o.el}_${o.size}mm`,
    head: 'binary STL, millimetres, antigravity castle',
    object: 'antigravity castle',
    note: info => ` · ${t('real descent', 'discesa reale')} ${info.slope.toFixed(1)}°`,
  },
  panelKeys: ['size'],
});
const view = s.view;

// the balls and the line of sight
const ballMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.6 });
const rayMat = new THREE.LineDashedMaterial({ dashSize: 3, gapSize: 3 });
const colours = () => { ballMat.color.set(css('--gold') || '#c9a227'); rayMat.color.set(css('--ink-soft') || '#888'); view.render(); };
colours(); onTheme(colours);

function place() {
  if (!mesh) return;
  const k = mesh.ball;
  for (const b of balls) { view.scene.remove(b); b.geometry.dispose(); }
  balls = [0, 1, 2, 3].map(() => { const b = new THREE.Mesh(new THREE.SphereGeometry(k, 24, 16), ballMat); view.scene.add(b); return b; });
  if (ray) { view.scene.remove(ray); ray.geometry.dispose(); }
  const c = mesh.center, E = mesh.eye, T = mesh.target;
  const a = new THREE.Vector3(T[0] - c[0], T[1] - c[1], T[2] - c[2]), e = new THREE.Vector3(E[0] - c[0], E[1] - c[1], E[2] - c[2]);
  ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, a.clone().lerp(e, 0.35)]), rayMat);
  ray.computeLineDistances(); view.scene.add(ray);
  camera();
}

// the camera at the eye (the controls off) or free
function camera() {
  if (!mesh) return;
  const cam = view.camera, c = mesh.center, E = mesh.eye, T = mesh.target, atEye = s.state.mode === 'eye';
  ray.visible = !atEye;
  view.controls.enabled = !atEye;
  if (atEye) {
    view.controls.autoRotate = false; $('spin').checked = false;
    cam.position.set(E[0] - c[0], E[1] - c[1], E[2] - c[2]);
    view.controls.target.set(T[0] - c[0], T[1] - c[1], T[2] - c[2]);
    const d = cam.position.distanceTo(view.controls.target), r = 0.5 * Math.hypot(...mesh.dims.slice(0, 2));
    cam.fov = Math.min(60, 2.1 * Math.atan(r / d) * 180 / Math.PI);
    cam.near = d / 20; cam.far = d * 4;
    cam.lookAt(view.controls.target); cam.updateProjectionMatrix();
  } else {
    cam.fov = 30; cam.updateProjectionMatrix();
    view.reset();
  }
  view.render();
}

for (const id of ['eye', 'orbit']) $('m' + id).addEventListener('click', () => {
  s.state.mode = id; press();
  writeState(SPEC, s.state); camera();
});
function press() { $('meye').setAttribute('aria-pressed', s.state.mode === 'eye'); $('morbit').setAttribute('aria-pressed', s.state.mode === 'orbit'); }
press();

// the balls roll from the towers to the keep, faster as they go
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
function roll(now) {
  if (mesh && balls.length) {
    const P = mesh.path, c = mesh.center, n = 31, f = still ? 0.5 : ((now / 4200) % 1.25);
    const u = Math.min(1, f * f) * (n - 1), i = Math.min(n - 2, Math.floor(u)), w = u - i;
    balls.forEach((b, a) => {
      const o = 3 * (a * n + i), q = 3 * (a * n + i + 1);
      b.position.set(P[o] + w * (P[q] - P[o]) - c[0], P[o + 1] + w * (P[q + 1] - P[o + 1]) - c[1], P[o + 2] + w * (P[q + 2] - P[o + 2]) - c[2]);
    });
    view.render();
  }
  requestAnimationFrame(roll);
}
requestAnimationFrame(roll);
onLang(() => { side(s.state, mesh && mesh.beta); if (mesh) stats(mesh); });
