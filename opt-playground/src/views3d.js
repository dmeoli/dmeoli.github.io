// The dual in three dimensions: the Lagrangian function of two multipliers is a
// concave roof made of flat faces, one per column (dimmed, as a wire), and the
// model is the roof of the cuts found so far (colored per column), which comes
// down onto the true one as cuts are added. Iterates sit on the true roof.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const N = 90;
const contexts = new Map();   // per box: the renderer and the scene, kept across draws
let ctx = null;

// a color per column: the violet scale of the site, spread by the golden ratio
// so that neighbouring faces differ, with a gold face every fifth
function tint(i) {
  const c = new THREE.Color();
  if (i % 5 === 4) return c.setHSL(44 / 360, 0.5, 0.55);
  c.setHSL((250 + 50 * ((i * 0.618) % 1)) / 360, 0.5, (42 + 36 * ((i * 0.382) % 1)) / 100);
  return c;
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function setup(box) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.domElement.className = 'gl';
  renderer.setPixelRatio(window.devicePixelRatio);
  box.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
  camera.position.set(1.55, -1.05, 1.25);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.5, 0.5, 0.3);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(1, -1, 2);
  scene.add(sun);
  const group = new THREE.Group();
  scene.add(group);
  const resize = () => {
    const w = box.clientWidth || 480;
    renderer.setSize(w, w, false);
    camera.aspect = 1; camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(box);
  resize();
  ctx = { box, renderer, scene, camera, controls, group, raf: 0 };
  const mine = ctx;
  const loop2 = () => { mine.controls.update(); mine.renderer.render(mine.scene, mine.camera); mine.raf = requestAnimationFrame(loop2); };
  contexts.set(box, mine);
  loop2();
}

// the grid of the true function, computed once per problem
function trueGrid(problem) {
  if (problem._grid) return problem._grid;
  const v = new Float64Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++)
      v[j * (N + 1) + i] = problem.L([i / N * problem.lmax, j / N * problem.lmax]);
  // the vertical scale follows the values near the maximum: below the lowest
  // third the roof rests on the floor
  const lo = [...v].sort((a, b) => a - b)[Math.floor(0.35 * v.length)];
  problem._grid = { v, lo };
  return problem._grid;
}

export function dual3d(box, problem, state, hover, params, algo) {
  ctx = contexts.get(box);
  if (!ctx || !box.contains(ctx.renderer.domElement)) setup(box);
  const { group } = ctx;
  // aim at the maximum the first time a problem is drawn
  if (ctx.aimed !== problem) {
    const t = problem.optimum.lam;
    ctx.controls.target.set(t[0] / problem.lmax, t[1] / problem.lmax, 0.45);
    ctx.camera.position.set(t[0] / problem.lmax + 0.95, t[1] / problem.lmax - 1.15, 1.25);
    ctx.aimed = problem;
  }
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  group.clear();
  const m = problem.lmax, { v: Lv, lo } = trueGrid(problem), hi = problem.optimum.value;
  const top = hi + 0.6 * (hi - lo);
  const Z = val => 0.75 * (Math.min(Math.max(val, lo), top) - lo) / (top - lo || 1);
  const ink = new THREE.Color(css('--ink') || '#2e2040');

  // the true roof, as a wire
  const tg = new THREE.PlaneGeometry(1, 1, N, N);
  const tp = tg.attributes.position;
  for (let q = 0; q < tp.count; q++) {
    const i = q % (N + 1), j = Math.floor(q / (N + 1));
    tp.setXYZ(q, i / N, j / N, Z(Lv[j * (N + 1) + i]));
  }
  group.add(new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: ink, wireframe: true, transparent: true, opacity: 0.08 })));

  // the model, colored per column, cut at the top of the view
  const cuts = state.cuts, mg = new THREE.PlaneGeometry(1, 1, N, N);
  const mp = mg.attributes.position, colors = new Float32Array(mp.count * 3);
  for (let q = 0; q < mp.count; q++) {
    const i = q % (N + 1), j = Math.floor(q / (N + 1)), l = [i / N * m, j / N * m];
    let bv = Infinity, bk = 0;
    cuts.forEach((k, h) => { const x = k.value + k.slope[0] * l[0] + k.slope[1] * l[1]; if (x < bv) { bv = x; bk = h; } });
    mp.setXYZ(q, i / N, j / N, Z(bv));
    const c = tint(bk);
    colors.set([c.r, c.g, c.b], q * 3);
  }
  mg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mg.computeVertexNormals();
  group.add(new THREE.Mesh(mg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })));

  // the floor, the iterates on the true roof, their path, the maximum
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.05 }));
  floor.position.set(0.5, 0.5, 0);
  group.add(floor);
  const P = o => new THREE.Vector3(o.lam[0] / m, o.lam[1] / m, Z(o.value) + 0.006);
  const pathPts = state.trace.map(P);
  if (pathPts.length > 1)
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), new THREE.LineBasicMaterial({ color: ink })));
  const accent = new THREE.Color(css('--accent') || '#7338a8'), gold = new THREE.Color(css('--gold') || '#6c5920');
  state.trace.forEach((o, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(i === hover ? 0.024 : 0.016, 16, 12),
      new THREE.MeshStandardMaterial({ color: i === hover ? gold : accent, emissive: o.serious ? accent : 0x000000, emissiveIntensity: 0.25 }));
    s.position.copy(P(o));
    group.add(s);
    // a drop line to the floor, so the position in the plane reads
    const d = P(o).clone(); d.z = 0;
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(o), d]), new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.18 })));
  });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), new THREE.MeshStandardMaterial({ color: gold, emissive: gold, emissiveIntensity: 0.4 }));
  star.position.copy(P({ lam: problem.optimum.lam, value: hi }));
  group.add(star);
  if (algo === 'bundle' || algo === 'level') {
    const c = state.center, ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 8, 40), new THREE.MeshBasicMaterial({ color: gold }));
    ring.position.copy(P({ lam: c, value: problem.L(c) }));
    group.add(ring);
  }
}

export function dispose3d(box) {
  const c = contexts.get(box);
  if (!c) return;
  cancelAnimationFrame(c.raf);
  c.renderer.dispose();
  contexts.delete(box);
}
