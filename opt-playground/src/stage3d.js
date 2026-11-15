// A 3D figure for teaching, shared by lp3d.html and svm.html: a three.js scene
// with OrbitControls (z up), a bar with auto-rotate, camera reset and full
// screen, labelled axes, and colours read from the palette of style.css, read
// again (and the figure redrawn by its owner) when the theme changes.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t, onLang } from './i18n.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function palette() {
  const c = (n, d) => new THREE.Color(css(n) || d);
  return { ink: c('--ink', '#2e2040'), soft: c('--ink-soft', '#5f4b76'), rule: c('--rule', '#d4c9e6'),
    accent: c('--accent', '#7338a8'), accent2: c('--accent-2', '#9363be'), lilac: c('--lilac', '#d4b9eb'),
    gold: c('--gold', '#6c5920'), ground: c('--ground', '#e8e2f3'), red: new THREE.Color('#c0281e') };
}

// a text label that always faces the camera; size is its height in world units
export function label(text, color, size = 0.06) {
  const fs = 56, cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font = `500 ${fs}px "IBM Plex Mono", monospace`;
  g.font = font;
  cv.width = Math.ceil(g.measureText(text).width) + 12; cv.height = Math.ceil(fs * 1.3);
  g.font = font; g.fillStyle = '#' + color.getHexString(); g.textBaseline = 'middle';
  g.fillText(text, 6, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(size * cv.width / cv.height, size, 1);
  s.renderOrder = 10;
  return s;
}

// a thick segment (lines in WebGL are one pixel wide, too thin for a projector)
const Y = new THREE.Vector3(0, 1, 0);
export function rod(a, b, r, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(L, 1e-6), 10, 1), material);
  m.position.copy(A).addScaledVector(d, 0.5);
  if (L > 1e-9) m.quaternion.setFromUnitVectors(Y, d.normalize());
  return m;
}
export function ball(p, r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material);
  m.position.set(...p);
  return m;
}

export function clear(group) {
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  group.clear();
}

// box: an empty element; opts: { camera, target, aspect (height / width),
// onTheme (redraws the figure), onFrame (dt, called before every render) }
export function stage3d(box, opts = {}) {
  box.classList.add('stage3d');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const bar = document.createElement('div');
  bar.className = 'view3d';
  bar.innerHTML = '<label><input type="checkbox"> <span></span></label><button type="button"></button><button type="button"></button>';
  box.replaceChildren(renderer.domElement, bar);
  const [spin, resetB, fullB] = [bar.querySelector('input'), ...bar.querySelectorAll('button')];
  const words = () => {
    bar.querySelector('span').textContent = t('rotate', 'ruota');
    resetB.textContent = t('Reset view', 'Ripristina vista');
    fullB.textContent = document.fullscreenElement === box ? t('Exit full screen', 'Esci da schermo intero') : t('Full screen', 'Schermo intero');
  };
  words();

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 1.5;
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(2, -1, 3);
  scene.add(sun);
  const content = new THREE.Group(), axesG = new THREE.Group();
  scene.add(content, axesG);

  const S = { renderer, scene, camera, controls, content, colors: palette(), axes: null };
  S.aim = (pos, target) => {
    camera.position.set(...pos); controls.target.set(...target); controls.update(); controls.saveState();
  };
  S.aim(opts.camera || [2.4, -2.2, 1.8], opts.target || [0.5, 0.5, 0.4]);

  // axes from an origin, with an arrow head and a name at the end of each (a
  // name may be a function, called at every drawing, for a name in words)
  S.setAxes = ax => { S.axes = ax; drawAxes(); };
  function drawAxes() {
    clear(axesG);
    if (!S.axes) return;
    const { origin, ends, names, size = 0.07 } = S.axes, col = S.colors.soft;
    const mat = new THREE.MeshBasicMaterial({ color: col });
    ends.forEach((e, i) => {
      axesG.add(rod(origin, e, 0.004, mat));
      const d = new THREE.Vector3(...e).sub(new THREE.Vector3(...origin)).normalize();
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 12), mat);
      head.position.set(...e); head.quaternion.setFromUnitVectors(Y, d);
      axesG.add(head);
      const l = label(typeof names[i] === 'function' ? names[i]() : names[i], col, size);
      l.position.set(...e).addScaledVector(d, 0.09);
      axesG.add(l);
    });
  }

  const resize = () => {
    const full = document.fullscreenElement === box || document.webkitFullscreenElement === box;
    const w = box.clientWidth || 480;
    const h = full ? Math.max(200, window.innerHeight - bar.offsetHeight - 24) : Math.round(w * (opts.aspect || 0.9));
    renderer.setSize(w, h, false);
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(box);
  resize();

  spin.onchange = () => { controls.autoRotate = spin.checked; };
  resetB.onclick = () => { spin.checked = false; controls.autoRotate = false; controls.reset(); };
  const req = box.requestFullscreen || box.webkitRequestFullscreen;
  if (!req) fullB.hidden = true;
  fullB.onclick = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else req.call(box);
  };
  const onFull = () => { words(); resize(); };
  document.addEventListener('fullscreenchange', onFull);
  document.addEventListener('webkitfullscreenchange', onFull);

  // the theme: the system one, or the one chosen on the site (data-theme)
  const theme = () => { S.colors = palette(); drawAxes(); if (opts.onTheme) opts.onTheme(); };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  // the language: the words of the bar and the names of the axes
  onLang(() => { words(); drawAxes(); });
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // render only while on screen
  let visible = true, last = performance.now();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(box);
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (visible) { if (opts.onFrame) opts.onFrame(dt); controls.update(); renderer.render(scene, camera); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return S;
}
