// The 3D view shared by the forms of the group Mathematics: a three.js stage
// that shows the very mesh that is printed (z up, millimetres), framed to fit,
// in the colours of the theme, turned by the mouse or the fingers; and a
// builder that runs the meshing in a worker (mesher.js), dropping a build
// when a newer one is asked for.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { onTheme, t } from '../../i18n.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const still = matchMedia('(prefers-reduced-motion: reduce)');

// stage: the element that holds the canvas; eye: the direction the camera
// looks from; ratio: height over width of the canvas (at most 560 px)
export function createView(stage, { eye = [0.95, -1.5, 0.85], fov = 30, ratio = 0.68, extra } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  stage.style.position = 'relative';
  stage.appendChild(renderer.domElement);
  const badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;left:10px;bottom:10px;font:12px "IBM Plex Mono",monospace;color:var(--ink-soft);pointer-events:none';
  stage.appendChild(badge);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 5000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !still.matches;
  controls.autoRotateSpeed = 1.1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a80, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(2, -3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-3, 2, -1); scene.add(rim);
  const head = new THREE.DirectionalLight(0xffffff, 0.5); scene.add(head);
  const front = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.02 });
  const group = new THREE.Group(); scene.add(group);
  let obj = null, dirty = true, framed = false, radius = 50;
  const colours = () => {
    front.color.set(css('--accent-2') || '#9363be');
    if (extra) extra(css);
    dirty = true;
  };
  colours(); onTheme(colours);
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = stage.clientWidth || 600, h = Math.round(Math.min(w * ratio, 560));
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage); resize();
  const loop = () => {
    if (controls.update()) dirty = true;
    if (dirty) { head.position.copy(camera.position); renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // the camera at the distance that fits a sphere of radius r
  const fit = (r, keepDir) => {
    const dir = keepDir ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...eye).normalize();
    const v = (fov / 2) * Math.PI / 180, dist = r / Math.sin(Math.min(v, Math.atan(Math.tan(v) * camera.aspect))) * 1.04;
    controls.target.set(0, 0, 0);
    camera.position.copy(dir.multiplyScalar(dist)); camera.near = dist / 50; camera.far = dist * 10; camera.updateProjectionMatrix();
    controls.update(); dirty = true;
  };

  return {
    scene, camera, controls, renderer, group,
    material: front,
    render() { dirty = true; },
    // m: { pos, idx } in mm; the box is centred on the origin of the view
    show(m, { material = front, refit = false } = {}) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeVertexNormals(); g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
      if (obj) { group.remove(obj); obj.geometry.dispose(); }
      obj = new THREE.Mesh(g, material); group.add(obj);
      const r = g.boundingSphere.radius;
      if (!framed || refit || Math.abs(r - radius) > 0.25 * radius) { fit(r, framed); framed = true; radius = r; }
      dirty = true;
      return obj;
    },
    reset() { framed = false; fit(radius, false); framed = true; },
    spin(on) { controls.autoRotate = !!on && !still.matches; dirty = true; },
    status(s) { badge.textContent = s || ''; },
  };
}

// a builder of meshes in a worker: build(module, fn, args) gives a promise
// of the mesh, or null when a newer build replaced it; onProgress(f) shows
// its progress; with #sync in the address of the page the first build runs
// on the main thread, for the thumbnails shot by headless Chrome, whose
// virtual time does not wait for workers
export function workerBuilder(onProgress) {
  let worker = null, seq = 0, pending = null, sync = /[#&]sync\b/.test(location.hash);
  const direct = async (module, fn, args) => { sync = false; return (await import(module))[fn](...args); };
  const make = () => new Worker(new URL('./mesher.js', import.meta.url), { type: 'module' });
  return (module, fn, args) => {
    if (sync) return direct(module, fn, args);
    if (pending) { worker.terminate(); worker = null; pending.resolve(null); pending = null; }
    if (!worker) worker = make();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending = { resolve };
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.progress !== undefined) { if (onProgress) onProgress(data.progress); return; }
        pending = null;
        if (data.error) reject(new Error(data.error));
        else resolve({ pos: data.pos, idx: data.idx, ...data.info });
      };
      worker.onerror = e => { pending = null; reject(new Error(e.message || 'worker')); };
      worker.postMessage({ id, module, fn, args });
    });
  };
}

// the line under the view while a mesh is built
export const building = f => `${t('building', 'costruzione')} ${Math.round(100 * f)}%`;
