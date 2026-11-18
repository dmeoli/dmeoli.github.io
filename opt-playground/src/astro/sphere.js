// The celestial sphere of the chart in three.js, and its projection onto the
// wheel. Everything is built in the frame of the true ecliptic of date (x
// toward 0° Aries, z toward the north pole of the ecliptic), inside a group
// that a rotation carries into the world: at the start the sky of the place
// (the zenith up, seen from the north, so that the east is on the left), at
// the end the ecliptic facing the camera with the Ascendant on the left, as
// in the wheel. The flattening is a scale of the ecliptic z toward 0, under
// which the circles of longitude through the cusps become radii.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLYPH, SIGN_GLYPH } from './core.js';

const D = Math.PI / 180;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function makeSphere(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  stage.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const SKYCAM = V(0, 1.7, 4.9), WHEELCAM = V(0, 0, 5.3);
  camera.position.copy(SKYCAM);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.5; controls.maxDistance = 9;

  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner); scene.add(outer);
  let dirty = true, u = 0, qSky = new THREE.Quaternion(), qWheel = new THREE.Quaternion();
  const fading = [];   // [material, kind] that fade with the flattening
  const mats = {};

  const mat = (key, opts = {}) => {
    const m = opts.dashed ? new THREE.LineDashedMaterial({ dashSize: 0.025, gapSize: 0.025, transparent: true })
      : opts.mesh ? new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.LineBasicMaterial({ transparent: true });
    m.userData = { key, alpha: opts.alpha ?? 1, fade: opts.fade ?? 0 };
    m.opacity = m.userData.alpha;
    (mats[key] = mats[key] || []).push(m);
    return m;
  };
  const curve = (pts, m, closed = false) => {
    const g = new THREE.BufferGeometry().setFromPoints(closed ? pts.concat([pts[0]]) : pts);
    const l = new THREE.Line(g, m);
    if (m.isLineDashedMaterial) l.computeLineDistances();
    inner.add(l);
    return l;
  };
  const label = (text, cls, pos) => {
    const div = document.createElement('div');
    div.className = 'lab3 ' + cls; div.textContent = text;
    const o = new CSS2DObject(div); o.position.copy(pos);
    inner.add(o);
    return o;
  };

  function clear() {
    for (const o of [...inner.children]) {
      inner.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.element) o.element.remove();
    }
    for (const k in mats) delete mats[k];
  }

  function colours() {
    const col = { ink: css('--ink'), soft: css('--ink-soft'), accent: css('--accent'), accent2: css('--accent-2'),
      rule: css('--rule'), gold: css('--gold'), lilac: css('--lilac') };
    const map = { horizon: col.soft, disc: col.soft, equator: col.soft, meridian: col.soft, ecliptic: col.accent,
      band: col.accent2, cusp: col.soft, axis: col.ink, placidus: col.gold, body: col.ink, lum: col.accent, obs: col.ink };
    for (const k in mats) for (const m of mats[k]) m.color.set(map[k] || col.ink);
    dirty = true;
  }

  // the chart: rebuild every line in the frame of the ecliptic
  function update(ch) {
    clear();
    const e = ch.eps * D, ce = Math.cos(e), se = Math.sin(e);
    const eq2ecl = v => V(v.x, v.y * ce + v.z * se, -v.y * se + v.z * ce);
    const A = ch.armc * D, f = ch.lat * D;
    const xm = V(Math.cos(A), Math.sin(A), 0), east = V(-Math.sin(A), Math.cos(A), 0), np = V(0, 0, 1);
    const zen = eq2ecl(xm.clone().multiplyScalar(Math.cos(f)).addScaledVector(np, Math.sin(f)));
    const south = eq2ecl(xm.clone().multiplyScalar(Math.sin(f)).addScaledVector(np, -Math.cos(f)));
    const E = eq2ecl(east);
    const N = 192, circle = (a, b, r = 1) => Array.from({ length: N }, (_, i) => {
      const t = 2 * Math.PI * i / N;
      return a.clone().multiplyScalar(r * Math.cos(t)).addScaledVector(b, r * Math.sin(t));
    });

    // the sky of the place: rows of the rotation are -E, zenith, -S
    const m4 = new THREE.Matrix4().set(
      -E.x, -E.y, -E.z, 0, zen.x, zen.y, zen.z, 0, -south.x, -south.y, -south.z, 0, 0, 0, 0, 1);
    qSky.setFromRotationMatrix(m4);
    qWheel.setFromAxisAngle(V(0, 0, 1), (180 - ch.asc) * D);

    // horizon: the circle, a faint disc, the four points
    const hz = circle(south, E);
    curve(hz, mat('horizon', { fade: 1 }), true);
    const disc = new THREE.BufferGeometry(), pos = [];
    for (let i = 0; i < N; i++) { const a = hz[i], b = hz[(i + 1) % N]; pos.push(0, 0, 0, a.x, a.y, a.z, b.x, b.y, b.z); }
    disc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    inner.add(new THREE.Mesh(disc, mat('disc', { mesh: true, alpha: 0.1, fade: 1 })));
    const cmp = [];
    for (const [v, en, it] of [[south, 'S', 'S'], [E, 'E', 'E'], [south.clone().negate(), 'N', 'N'], [E.clone().negate(), 'W', 'O']]) {
      const o = label(en, 'cmp', v.clone().multiplyScalar(1.1));
      o.userData = { en, it }; cmp.push(o);
    }
    // equator (dotted) and meridian
    curve(circle(eq2ecl(V(1, 0, 0)), eq2ecl(V(0, 1, 0))), mat('equator', { dashed: true, fade: 1, alpha: 0.9 }), true);
    curve(circle(zen, south), mat('meridian', { fade: 1, alpha: 0.75 }), true);

    // the ecliptic, its band of signs and their glyphs
    curve(circle(V(1, 0, 0), V(0, 1, 0)), mat('ecliptic'), true);
    const band = new THREE.Mesh(new THREE.RingGeometry(1, 1.09, 144, 1), mat('band', { mesh: true, alpha: 0.18 }));
    inner.add(band);
    for (let s = 0; s < 12; s++) {
      const l = 30 * s * D;
      curve([V(Math.cos(l), Math.sin(l), 0), V(1.09 * Math.cos(l), 1.09 * Math.sin(l), 0)], mat('ecliptic'));
      const m = (30 * s + 15) * D;
      label(SIGN_GLYPH[s], 'sign', V(1.19 * Math.cos(m), 1.19 * Math.sin(m), 0));
    }

    // through each cusp the half circle of longitude from pole to pole; the
    // axes darker
    const cu = ch.houses.cusps;
    for (let k = 1; k <= 12; k++) {
      const l = cu[k] * D, quad = ch.houses.used === 'P' || ch.houses.used === 'K';
      const axis = k === 1 || k === 7 || (quad && (k === 4 || k === 10));
      const pts = [];
      for (let i = 0; i <= 60; i++) { const b = (-90 + 3 * i) * D; pts.push(V(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b))); }
      curve(pts, mat(axis ? 'axis' : 'cusp', { alpha: axis ? 0.9 : 0.55 }));
    }
    // the angles named outside the band, moved off the glyph of their sign
    // when they fall near its middle
    for (const [name, l0] of [['AC', ch.asc], ['MC', ch.mc]]) {
      const off = (l0 % 30) - 15, l = (Math.abs(off) < 6 ? l0 + (off < 0 ? -1 : 1) * (6 - Math.abs(off)) : l0) * D;
      label(name, 'ang', V(1.3 * Math.cos(l), 1.3 * Math.sin(l), 0));
    }

    // Placidus: the lines in the sky where a point has run the same fraction
    // of its semi-arc (diurnal above the horizon, nocturnal below)
    if (ch.houses.used === 'P') {
      const tf = Math.tan(f), lim = Math.atan(1 / Math.abs(tf || 1e-9)) - 1e-4;
      const ha = { 11: d => -d / 3, 12: d => -2 * d / 3, 9: d => d / 3, 8: d => 2 * d / 3,
        2: d => -(d + (180 - d) / 3), 3: d => -(d + 2 * (180 - d) / 3), 6: d => d + (180 - d) / 3, 5: d => d + 2 * (180 - d) / 3 };
      for (const k in ha) {
        const pts = [];
        for (let i = 0; i <= 120; i++) {
          const dl = -lim + 2 * lim * i / 120;
          const dsa = Math.acos(Math.max(-1, Math.min(1, -tf * Math.tan(dl)))) / D;
          const ra = (ch.armc - ha[k](dsa)) * D;
          pts.push(eq2ecl(V(Math.cos(dl) * Math.cos(ra), Math.cos(dl) * Math.sin(ra), Math.sin(dl))));
        }
        curve(pts, mat('placidus', { fade: 1.6, alpha: 0.85 }));
      }
    }

    // the bodies on the sphere, at their ecliptic latitude, with their glyphs
    const dot = new THREE.SphereGeometry(0.02, 16, 12);
    for (const b of ch.bodies) {
      const l = b.lon * D, bt = b.lat * D, p = V(Math.cos(bt) * Math.cos(l), Math.cos(bt) * Math.sin(l), Math.sin(bt));
      const lum = b.name === 'Sun' || b.name === 'Moon';
      const m = new THREE.Mesh(dot, new THREE.MeshBasicMaterial());
      m.material.userData = { key: lum ? 'lum' : 'body', alpha: 1, fade: 0 };
      (mats[m.material.userData.key] = mats[m.material.userData.key] || []).push(m.material);
      m.position.copy(p); inner.add(m);
      label(GLYPH[b.name], lum ? 'lum' : '', p.clone().multiplyScalar(0.9));
    }
    const obs = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial());
    obs.material.userData = { key: 'obs', alpha: 1, fade: 1 };
    (mats.obs = mats.obs || []).push(obs.material);
    inner.add(obs);
    update.cmp = cmp;
    colours();
    setProjection(u);
  }

  // u in [0, 1]: the rotation and the camera in the first two thirds, the
  // flattening in the last half, the sky of the place fading with it
  function setProjection(x) {
    u = x;
    const r = smooth(0, 0.65, u), fl = smooth(0.5, 1, u);
    outer.quaternion.slerpQuaternions(qSky, qWheel, r);
    inner.scale.set(1, 1, Math.max(1e-3, 1 - fl));
    camera.position.lerpVectors(SKYCAM, WHEELCAM, r);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = u === 0;
    for (const k in mats) for (const m of mats[k]) {
      const d = m.userData;
      m.opacity = d.alpha * Math.max(0, 1 - d.fade * fl);
      m.visible = m.opacity > 0.01;
    }
    for (const o of update.cmp || []) o.visible = fl < 0.3;
    dirty = true;
  }

  function relabel(lang) {
    for (const o of update.cmp || []) o.element.textContent = lang === 'it' ? o.userData.it : o.userData.en;
  }

  function resize() {
    const w = stage.clientWidth;
    renderer.setSize(w, w, false);
    renderer.domElement.style.width = renderer.domElement.style.height = w + 'px';
    labels.setSize(w, w);
    camera.aspect = 1; camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  controls.addEventListener('change', () => { dirty = true; });
  (function loop() {
    requestAnimationFrame(loop);
    if (controls.enabled) controls.update();
    if (dirty) { renderer.render(scene, camera); labels.render(scene, camera); dirty = false; }
  })();

  return { update, setProjection, colours, relabel, get u() { return u; } };
}
