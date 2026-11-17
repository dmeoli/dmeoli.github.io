// Scene G: a polytope and its polar. The polar of P = conv(V), with the origin
// inside, is {y : v.y <= 1 for v in V}; its vertices are a/b for the facets
// a.x <= b of P, so a facet of P is a vertex of the polar and the other way.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { setTex } from './tex.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);
const phi = (1 + Math.sqrt(5)) / 2;
const perms = (a, b, c) => [[a, b, c], [b, c, a], [c, a, b]];
const signs = v => {
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const p = [v[0] * sx, v[1] * sy, v[2] * sz];
    if (!out.some(q => q.every((x, i) => Math.abs(x - p[i]) < 1e-9))) out.push(p);
  }
  return out;
};

const shapes = {
  cube: { label: 'Cube (polar: octahedron)', it: 'Cubo (polare: ottaedro)', v: signs([1, 1, 1]) },
  octahedron: { label: 'Octahedron (polar: cube)', it: 'Ottaedro (polare: cubo)', v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(p => p.map(x => x * 1.5)) },
  tetrahedron: { label: 'Tetrahedron (self-polar)', it: 'Tetraedro (autopolare)', v: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] },
  dodecahedron: { label: 'Dodecahedron (polar: icosahedron)', it: 'Dodecaedro (polare: icosaedro)', v: [...signs([1, 1, 1]), ...perms(0, 1 / phi, phi).flatMap(signs)] },
  icosahedron: { label: 'Icosahedron (polar: dodecahedron)', it: 'Icosaedro (polare: dodecaedro)', v: perms(0, 1, phi).flatMap(signs).map(p => p.map(x => x * 0.85)) },
  triprism: { label: 'Triangular prism (polar: triangular bipyramid)', it: 'Prisma triangolare (polare: bipiramide triangolare)', v: [0, 1, 2].flatMap(i => [[Math.cos(i * 2 * Math.PI / 3 + Math.PI / 2) * 1.3, Math.sin(i * 2 * Math.PI / 3 + Math.PI / 2) * 1.3, 0.9], [Math.cos(i * 2 * Math.PI / 3 + Math.PI / 2) * 1.3, Math.sin(i * 2 * Math.PI / 3 + Math.PI / 2) * 1.3, -0.9]]) },
  prism: { label: 'Hexagonal prism (polar: bipyramid)', it: 'Prisma esagonale (polare: bipiramide)', v: [0, 1, 2, 3, 4, 5].flatMap(i => [[Math.cos(i * Math.PI / 3) * 1.2, Math.sin(i * Math.PI / 3) * 1.2, 0.9], [Math.cos(i * Math.PI / 3) * 1.2, Math.sin(i * Math.PI / 3) * 1.2, -0.9]]) },
  random: { label: 'Random polytope', it: 'Politopo casuale', v: null },
};

// the facets of the hull of points: planes n.x = d (n unit, d > 0) with their
// polygons, coplanar triangles merged
function facets(points) {
  const hull = new ConvexHull().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const out = [];
  for (const f of hull.faces) {
    const n = f.normal.clone(), d = n.dot(f.edge.head().point);
    let F = out.find(g => g.n.distanceTo(n) < 1e-6 && Math.abs(g.d - d) < 1e-6);
    if (!F) { F = { n, d, tris: [] }; out.push(F); }
    let e = f.edge; const tri = [];
    do { tri.push(e.head().point.clone()); e = e.next; } while (e !== f.edge);
    F.tris.push(tri);
  }
  return out;
}

let renderer, scene, camera, controls, group, raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(2, 2);
let pickable = [], hot = -1, model = null;

function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function setup() {
  const stage = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(5.6, 4.3, 4.5);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(3, 4, 5); scene.add(sun);
  group = new THREE.Group(); scene.add(group);
  const resize = () => { const w = stage.clientWidth; renderer.setSize(w, Math.min(w, 640), false); camera.aspect = w / Math.min(w, 640); camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(stage); resize();
  renderer.domElement.addEventListener('pointermove', e => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  renderer.domElement.addEventListener('pointerleave', () => pointer.set(2, 2));
  const loop = () => {
    if ($('spin').checked) group.rotation.z += 0.0025;
    controls.update(); pick(); renderer.render(scene, camera); requestAnimationFrame(loop);
  };
  loop();
}

// draw one polytope: translucent faces (pickable), edges, vertices
function polytope(F, color, opacity, pick) {
  const faces = [];
  F.forEach((f, i) => {
    const pos = f.tris.flat().flatMap(p => [p.x, p.y, p.z]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    mesh.userData.facet = i;
    group.add(mesh);
    faces.push(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    group.add(edges);
  });
  if (pick) pickable = faces;
  return faces;
}

function build() {
  group.clear(); hot = -1;
  const sh = shapes[$('shape').value];
  let V = sh.v;
  if (!V) {
    V = Array.from({ length: 14 }, () => { const u = new THREE.Vector3().randomDirection().multiplyScalar(0.9 + 0.5 * Math.random()); return [u.x, u.y, u.z]; });
  }
  const sc = +$('scale').value;
  V = V.map(p => p.map(x => x * sc));
  const FP = facets(V);
  const W = FP.map(f => [f.n.x / f.d, f.n.y / f.d, f.n.z / f.d]);    // the vertices of the polar
  const FD = facets(W);
  const outerP = $('outer').value === 'P';
  const violet = new THREE.Color(css('--accent') || '#7338a8'), gold = new THREE.Color('#b59a45');
  const [Fo, Fi, Vo, Vi] = outerP ? [FP, FD, V, W] : [FD, FP, W, V];
  polytope(Fo, violet, 0.16, true);
  polytope(Fi, gold, 0.35, false);
  // the vertices of the inner polytope, one per face of the outer
  const dots = Vi.map(p => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshLambertMaterial({ color: gold }));
    s.position.set(...p); group.add(s); return s;
  });
  model = { Fo, dots, Vi, counts: [Fo.length, Vo.length, Fi.length, Vi.length], outerP };
  // which inner vertex belongs to which outer face: the polar maps facet i of
  // the outer to the vertex n_i/d_i, i.e., Vi[i] when the outer is P; when the
  // outer is the polar, match the inner vertex with the facet normal
  model.match = Fo.map(f => {
    let best = 0, bd = Infinity;
    Vi.forEach((p, j) => { const q = new THREE.Vector3(...p).normalize(); const dd = q.distanceTo(f.n); if (dd < bd) { bd = dd; best = j; } });
    return best;
  });
  explain();
}

// the counts of faces and vertices, in the language of the page
function explain() {
  const [po, pi] = model.outerP ? ['P', 'P^\\circ'] : ['P^\\circ', 'P'], [fo, vo, fi, vi] = model.counts;
  setTex($('explain'), t(`\\(${po}\\) has ${fo} faces and ${vo} vertices; \\(${pi}\\) has ${fi} faces and ${vi} vertices.`,
    `\\(${po}\\) ha ${fo} facce e ${vo} vertici; \\(${pi}\\) ha ${fi} facce e ${vi} vertici.`));
}

function pick() {
  if (!model) return;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickable)[0];
  const h = hit ? hit.object.userData.facet : -1;
  if (h === hot) return;
  if (hot >= 0) { pickable[hot].material.opacity = 0.16; const d = model.dots[model.match[hot]]; d.scale.setScalar(1); }
  hot = h;
  if (hot >= 0) { pickable[hot].material.opacity = 0.5; const d = model.dots[model.match[hot]]; d.scale.setScalar(2.4); }
}

for (const [k, s] of Object.entries(shapes)) $('shape').append(new Option(s.label, k));
// #shape=<id> opens that polytope (e.g. #shape=triprism, the prism of a logo)
{ const k = new URLSearchParams(location.hash.slice(1)).get('shape'); if (k && shapes[k]) $('shape').value = k; }
// the words that depend on the language: title and options
function words() {
  document.title = t('Polarity playground', 'Laboratorio di polarità');
  for (const o of $('shape').options) o.textContent = t(shapes[o.value].label, shapes[o.value].it);
  for (const o of $('outer').options) o.textContent = o.value === 'P' ? t('P (the primal)', 'P (il primale)') : t('P° (the polar)', 'P° (il polare)');
}
words();
onLang(() => { words(); if (model) explain(); });
$('shape').addEventListener('change', build);
$('outer').addEventListener('change', build);
$('scale').addEventListener('input', e => { $('scaleOut').textContent = e.target.value; build(); });
// space starts and stops the spin, as it plays and pauses the other scenes
document.addEventListener('keydown', e => {
  if (e.key !== ' ' || ['SELECT', 'INPUT'].includes(e.target.tagName)) return;
  e.preventDefault(); $('spin').checked = !$('spin').checked;
});
setup();
build();
