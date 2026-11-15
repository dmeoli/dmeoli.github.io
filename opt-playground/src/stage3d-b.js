// A three.js stage for the 3D figures of the network, manifolds and
// superposition scenes: orbit controls, a bar with auto-rotate, camera reset and
// full screen, axes with labels, and colours read from the palette tokens of
// style.css, read again when the theme changes. The scene draws into `group`
// and calls render() when something changed; nothing is drawn otherwise.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t, onLang } from './i18n.js';

export { THREE };
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const tok = v => new THREE.Color(css(v) || '#7338a8');

// calls fn when the theme changes, by the system or by the data-theme attribute
export function onTheme(fn) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// a text given as a string or as a function of the language (() => t(en, it))
const say = s => (typeof s === 'function' ? s() : s);
// the names of the figures given by the scenes as plain English strings
const FIG_IT = { figure: 'figura', 'hidden space': 'spazio nascosto', 'loss landscape': 'paesaggio della loss' };
const figName = l => { const s = say(l); return t(s, FIG_IT[s] || s); };

export function stage3d(box, { position = [2.2, -2.6, 1.8], target = [0, 0, 0], fov = 35, label = 'figure' } = {}) {
  box.classList.add('view3d');
  box.replaceChildren();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.localClippingEnabled = true;
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels3d';
  box.append(renderer.domElement, labels.domElement);
  const scene = new THREE.Scene(), group = new THREE.Group();
  scene.add(group, new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2, -3, 4); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 100);
  camera.up.set(0, 0, 1); camera.position.set(...position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target); controls.enableDamping = true; controls.autoRotateSpeed = 1.5;
  controls.update(); controls.saveState();

  // the bar: auto-rotate, reset of the camera, full screen
  const bar = document.createElement('div'); bar.className = 'tools3d';
  const btn = (f) => { const b = document.createElement('button'); b.type = 'button'; b.onclick = f; bar.append(b); return b; };
  const spin = btn(() => { controls.autoRotate = !controls.autoRotate; spin.setAttribute('aria-pressed', controls.autoRotate); dirty = true; });
  spin.setAttribute('aria-pressed', 'false');
  const back = btn(() => { controls.reset(); dirty = true; });
  const full = btn(() => {
    if (document.fullscreenElement === box) document.exitFullscreen(); else box.requestFullscreen?.();
  });
  const words = () => {
    spin.textContent = t('rotate', 'ruota'); spin.title = t('turn the figure by itself', 'fa girare la figura da sola');
    back.textContent = t('reset', 'reset'); back.title = t('back to the first view', 'torna alla prima vista');
    const L = figName(label);
    full.textContent = document.fullscreenElement === box ? t('exit', 'esci') : t('full screen', 'schermo intero');
    full.title = t(`the ${L} on the whole screen, to project it`, `${L[0].toUpperCase() + L.slice(1)} a schermo intero, da proiettare`);
  };
  words();
  document.addEventListener('fullscreenchange', words);
  onLang(() => { words(); dirty = true; });
  box.append(bar);

  let dirty = true;
  const resize = () => {
    const w = box.clientWidth || 300, h = box.clientHeight || w;
    renderer.setSize(w, h); labels.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(box);
  resize();
  controls.addEventListener('change', () => { dirty = true; });
  const loop = () => {
    controls.update();
    if (dirty) { renderer.render(scene, camera); labels.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  loop();

  // empties the group (or a given one), freeing geometries, materials and labels
  const clear = (g = group) => {
    g.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); if (o.isCSS2DObject) o.element.remove(); });
    g.clear();
  };
  const st = { scene, group, camera, controls, renderer, render: () => { dirty = true; }, clear };
  box.stage = st;                        // for the tests
  return st;
}

// a label at a point of space, coloured by the CSS (so by the theme); the text
// may be a function of the language (() => t(en, it)), written again when the
// language changes
export function label(text, at, cls = '') {
  const el = document.createElement('span'); el.className = 'lab3d ' + cls; el.textContent = say(text);
  if (typeof text === 'function') el.sayText = text;
  const o = new CSS2DObject(el); o.position.set(...at); return o;
}

onLang(() => document.querySelectorAll('.lab3d').forEach(el => { if (el.sayText) el.textContent = el.sayText(); }));

// a line through points, with a colour and an opacity
export function line(pts, color, opacity = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

// three axes from lo to hi in each coordinate, axes({ x: [lo, hi, 'name'], ... })
// (a name may be a function of the language, as for label),
// with the names past their ends (written from there to the right, so that
// they stay inside the figure); the axes meet at the corner of the lows, or at
// the origin given
export function axes(ranges, origin = null) {
  const g = new THREE.Group(), ink = tok('--ink-soft'), names = ['x', 'y', 'z'];
  const at = (k, v) => { const p = names.map((n, j) => (origin ? origin[j] : ranges[n][0])); p[k] = v; return p; };
  names.forEach((n, k) => {
    const [lo, hi, name] = ranges[n];
    g.add(line([at(k, lo), at(k, hi)], ink, 0.8));
    const l = label(name, at(k, hi + 0.06 * (hi - lo)), 'name'); l.center.set(0, 0.5); g.add(l);
  });
  return g;
}
