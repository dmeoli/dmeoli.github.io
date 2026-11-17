// The drawing of creatures with three.js: a mesh with vertex colours from
// model.js, on a soft round shadow, framed by a camera at three quarters;
// one renderer can shoot many still pictures for the grid of offspring.

import * as THREE from 'three';
import { screenMesh } from './model.js';

const cache = new Map();
// the mesh of genome g at a stage, at a number of cells, kept for reuse
export function meshOf(g, stage, cells) {
  const key = g.join('') + '|' + stage + '|' + cells;
  if (cache.has(key)) { const m = cache.get(key); cache.delete(key); cache.set(key, m); return m; }
  const m = screenMesh(g, stage, cells);
  cache.set(key, m);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return m;
}

export function geometry(m) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
  geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
  geo.computeVertexNormals();
  return geo;
}

let shadowTex = null;
function shadow() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,10,40,0.42)'); gr.addColorStop(0.6, 'rgba(20,10,40,0.16)'); gr.addColorStop(1, 'rgba(20,10,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

// a group holding the creature of mesh m and its shadow, centred on x, y
export function creatureObject(m, { glow = 0 } = {}) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.0, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: glow });
  const mesh = new THREE.Mesh(geometry(m), mat);
  const cx = (m.lo[0] + m.hi[0]) / 2, cy = (m.lo[1] + m.hi[1]) / 2;
  mesh.position.set(-cx, -cy, 0);
  grp.add(mesh);
  const w = (m.hi[0] - m.lo[0]) * 1.25, d = (m.hi[1] - m.lo[1]) * 1.25;
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadow(), transparent: true, depthWrite: false }));
  sh.position.z = 0.05;
  grp.add(sh);
  grp.userData = { mesh, size: [m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2]] };
  return grp;
}

export function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff6ff, 0x5a4a70, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(3, -2, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8c8ff, 0.9); rim.position.set(-3, 2, 2); scene.add(rim);
}

// the camera looking at the box of size [w, d, h] from the front-right side,
// a little above
export function frame(camera, size, { az = -0.5, el = 0.28, pad = 1.08 } = {}) {
  const [w, d, h] = size, r = 0.5 * Math.hypot(w, d, h) * pad;
  const dist = r / Math.sin(camera.fov * Math.PI / 360) * (camera.aspect < 1 ? 1 / camera.aspect : 1);
  const t = new THREE.Vector3(0, 0, h * 0.45);
  camera.up.set(0, 0, 1);
  camera.position.set(t.x + dist * Math.cos(el) * Math.cos(az), t.y + dist * Math.cos(el) * Math.sin(az), t.z + dist * Math.sin(el));
  camera.lookAt(t);
  camera.near = dist / 20; camera.far = dist * 4; camera.updateProjectionMatrix();
  return t;
}

// one renderer for still pictures: shoot(g, stage, canvas) draws into a 2D canvas
export function stills(px = 240) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(px, px, false);
  const scene = new THREE.Scene(); lights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  return (g, stage, canvas, cells = 46) => {
    const obj = creatureObject(meshOf(g, stage, cells));
    scene.add(obj);
    frame(camera, obj.userData.size, stage === 'c' ? { az: -0.2, el: 0.22, pad: 0.82 } : { pad: 0.9 });
    renderer.render(scene, camera);
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
    scene.remove(obj); obj.userData.mesh.geometry.dispose();
  };
}
