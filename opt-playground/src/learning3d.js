// The surface of scene E: the test function over its box as a lit surface in
// the violet scale of the site, its level lines projected on the floor of the
// box (as the offset contours of matplotlib) and, if asked, drawn on the
// surface; the runs as markers sitting on it, with a fading trail lifted a
// little above it and a drop line to the floor. The box is the unit square in
// the plane, the height goes from 0 to ZH; the page gives the height of a
// point in [0, 1] and the colours, and is told where the pointer is.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ZH = 0.6, FLOOR = -0.16, M = 150, LIFT = 0.012, RING = 6;
const HOME = { pos: [2.1, -1.78, 1.5], target: [0.5, 0.48, 0.1] };

const srgb = c => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
const tcol = s => new THREE.Color().setStyle(s, THREE.SRGBColorSpace);

// a text label as a sprite, of height h in the units of the box
function label(text, color, h = 0.045) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'), px = 64;
  g.font = `${px}px "IBM Plex Mono", monospace`;
  cv.width = Math.ceil(g.measureText(text).width) + 8; cv.height = px + 16;
  g.font = `${px}px "IBM Plex Mono", monospace`; g.fillStyle = color; g.textBaseline = 'middle';
  g.fillText(text, 4, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(h * cv.width / cv.height, h, 1);
  return s;
}

// a tube around a polyline, with a colour and an alpha per point: rings of
// RING vertices, the frame from the tangent and the vertical
function tube(pts, rgba, r) {
  const n = pts.length, pos = new Float32Array(n * RING * 3), col = new Float32Array(n * RING * 4), idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    N.crossVectors(T, up); if (N.lengthSq() < 1e-8) N.set(1, 0, 0); N.normalize();
    B.crossVectors(T, N).normalize();
    for (let k = 0; k < RING; k++) {
      const a = 2 * Math.PI * k / RING, q = (i * RING + k);
      pos[3 * q] = pts[i].x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x);
      pos[3 * q + 1] = pts[i].y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y);
      pos[3 * q + 2] = pts[i].z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z);
      col.set(rgba[i], 4 * q);
      if (i < n - 1) {
        const k2 = (k + 1) % RING, a0 = i * RING + k, a1 = i * RING + k2, b0 = a0 + RING, b1 = a1 + RING;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

export function niceTicks(a, b, n = 5) {
  const raw = (b - a) / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const st = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(Math.abs(v) < 1e-12 ? 0 : v);
  return out;
}
export const fmt = v => (Math.abs(v) >= 1e4 ? v.toExponential(0).replace('+', '') : +v.toPrecision(3)).toString();

export function createSurface(box, { onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.domElement.className = 'gl';
  box.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.01, 50);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.autoRotateSpeed = 1.2;
  const home = () => { camera.position.set(...HOME.pos); controls.target.set(...HOME.target); controls.update(); dirty = true; };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8070a0, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-0.6, -1.2, 1.4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(1.5, 1.2, 0.6);
  scene.add(hemi, sun, fill);

  const still = new THREE.Group(), moving = new THREE.Group(), hoverG = new THREE.Group();
  scene.add(still, moving, hoverG);
  let L = null, colors = null, surface = null, surfLines = null, showSurfLines = false, dirty = true, last = null;

  const dispose = g => { g.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } }); g.clear(); };
  // the height in the box of a point of the plane, and its place
  const zAt = (x, y) => ZH * L.height(x, y);
  const U = x => (x - L.box[0]) / (L.box[1] - L.box[0]), V = y => (y - L.box[2]) / (L.box[3] - L.box[2]);
  const P = (x, y, z) => new THREE.Vector3(U(x), V(y), z);
  const inside = p => isFinite(p[0]) && isFinite(p[1]) && p[0] >= L.box[0] && p[0] <= L.box[1] && p[1] >= L.box[2] && p[1] <= L.box[3];

  function resize() {
    const w = box.clientWidth || 480, h = box.clientHeight || w;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  new ResizeObserver(resize).observe(box);
  resize();

  // the parts that change with the function, the scale or the theme
  function build() {
    dispose(still); cache.clear();
    if (!L || !colors) return;
    const [x0, x1, y0, y1] = L.box;
    const g = new THREE.PlaneGeometry(1, 1, M, M), pos = g.attributes.position, cc = new Float32Array(pos.count * 3);
    for (let q = 0; q < pos.count; q++) {
      const i = q % (M + 1), j = M - Math.floor(q / (M + 1)), x = x0 + i / M * (x1 - x0), y = y0 + j / M * (y1 - y0);
      const t = L.height(x, y);
      pos.setXYZ(q, i / M, j / M, ZH * t);
      const c = srgb(colors.scale(Math.min(1, t))); cc.set([c.r, c.g, c.b], 3 * q);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeVertexNormals();
    surface = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    still.add(surface);

    // the floor and the frame of the box
    const ink = tcol(colors.ink), soft = tcol(colors.inkSoft), rule = tcol(colors.rule);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: tcol(colors.panel), transparent: true, opacity: 0.7, depthWrite: false }));
    floor.position.set(0.5, 0.5, FLOOR - 0.001); still.add(floor);
    const fr = [[0, 0, FLOOR], [1, 0, FLOOR], [1, 0, FLOOR], [1, 1, FLOOR], [1, 1, FLOOR], [0, 1, FLOOR], [0, 1, FLOOR], [0, 0, FLOOR],
      [0, 0, FLOOR], [0, 0, ZH], [0, 1, FLOOR], [0, 1, ZH], [1, 1, FLOOR], [1, 1, ZH], [0, 0, ZH], [0, 1, ZH], [0, 1, ZH], [1, 1, ZH]];
    const frame = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fr.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: rule }));
    still.add(frame);

    // the level lines on the floor, coloured by level, and on the surface
    const fl = [], fc = [], sl = [];
    for (const { t, segs } of L.contours) {
      const c = srgb(colors.scale(0.62 * t)), z = ZH * t + 0.003;
      for (let s = 0; s < segs.length; s += 4) {
        fl.push(U(segs[s]), V(segs[s + 1]), FLOOR, U(segs[s + 2]), V(segs[s + 3]), FLOOR);
        fc.push(c.r, c.g, c.b, c.r, c.g, c.b);
        sl.push(U(segs[s]), V(segs[s + 1]), z, U(segs[s + 2]), V(segs[s + 3]), z);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    still.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ vertexColors: true })));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sl, 3));
    surfLines = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.35 }));
    surfLines.visible = showSurfLines; still.add(surfLines);

    // the axes: x1 along the front edge, x2 along the right one, f on the
    // vertical edge at the front left, with ticks and their values
    const tk = [], col = colors.inkSoft;
    for (const v of niceTicks(x0, x1)) {
      tk.push(U(v), 0, FLOOR, U(v), -0.025, FLOOR);
      const s = label(fmt(v), col); s.position.set(U(v), -0.07, FLOOR); still.add(s);
    }
    for (const v of niceTicks(y0, y1)) {
      tk.push(1, V(v), FLOOR, 1.025, V(v), FLOOR);
      const s = label(fmt(v), col); s.position.set(1.08, V(v), FLOOR); still.add(s);
    }
    for (const { t, text } of L.fticks) {
      tk.push(0, 0, ZH * t, -0.025, -0.025, ZH * t);
      const s = label(text, col); s.position.set(-0.07, -0.07, ZH * t); still.add(s);
    }
    tk.push(0, 0, FLOOR, 0, 0, ZH);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tk, 3));
    still.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: soft })));
    const ax = [['x₁', 0.5, -0.16, FLOOR], ['x₂', 1.17, 0.5, FLOOR], [L.fname, 0, 0, ZH + 0.1]];
    for (const [t, x, y, z] of ax) { const s = label(t, colors.ink, 0.06); s.position.set(x, y, z); still.add(s); }

    // the minima, as small stars of gold on the surface
    for (const m of L.minima || []) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), new THREE.MeshStandardMaterial({ color: tcol(colors.gold), emissive: tcol(colors.gold), emissiveIntensity: 0.35 }));
      s.position.copy(P(m[0], m[1], zAt(m[0], m[1]) + 0.02)); still.add(s);
    }
    dirty = true;
    if (last) setRuns(last);
  }

  // the pieces of the path between two iterates, kept per run: the chord,
  // raised onto the surface where it would go under it, lifted by LIFT
  const cache = new Map();
  function piece(a, b) {
    const ua = [U(a[0]), V(a[1])], ub = [U(b[0]), V(b[1])];
    const n = Math.max(1, Math.min(32, Math.ceil(Math.hypot(ub[0] - ua[0], ub[1] - ua[1]) / 0.012)));
    const za = zAt(a[0], a[1]), zb = zAt(b[0], b[1]), out = [];
    for (let s = 1; s <= n; s++) {
      const w = s / n, x = a[0] + w * (b[0] - a[0]), y = a[1] + w * (b[1] - a[1]);
      out.push(P(x, y, Math.max(za + w * (zb - za), zAt(x, y)) + LIFT));
    }
    return out;
  }

  // runs: [{ id, color, path: [[x, y]...] up to the shown iteration, marker:
  // 'ball' | 'cube', trail }]
  function setRuns(runs) {
    last = runs;
    dispose(moving);
    if (!L || !colors) return;
    for (const r of runs) {
      const c = tcol(r.color), n = r.path.length, k = n - 1;
      let pc = cache.get(r.id);
      if (!pc || pc.src !== r.src) { pc = { src: r.src, pieces: [] }; cache.set(r.id, pc); }
      // the strips of the path that stay inside the box
      let pts = [], rgba = [];
      const flush = () => {
        if (pts.length > 1) moving.add(new THREE.Mesh(tube(pts, rgba, r.marker === 'cube' ? 0.0042 : 0.0055), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
        pts = []; rgba = [];
      };
      const alpha = i => Math.max(0.22, 1 - (k - i) / r.trail);
      for (let i = 0; i < n; i++) {
        const p = r.path[i];
        if (!inside(p)) { flush(); continue; }
        if (!pts.length) { pts.push(P(p[0], p[1], zAt(p[0], p[1]) + LIFT)); rgba.push([c.r, c.g, c.b, alpha(i)]); continue; }
        if (!pc.pieces[i]) pc.pieces[i] = piece(r.path[i - 1], p);
        const seg = pc.pieces[i], a0 = alpha(i - 1), a1 = alpha(i);
        seg.forEach((q, s) => { pts.push(q); const w = (s + 1) / seg.length; rgba.push([c.r, c.g, c.b, a0 + w * (a1 - a0)]); });
      }
      flush();
      const p = r.path[k];
      if (!inside(p)) continue;
      const z = zAt(p[0], p[1]), rad = r.marker === 'cube' ? 0.016 : 0.02;
      const geo = r.marker === 'cube' ? new THREE.BoxGeometry(rad * 1.6, rad * 1.6, rad * 1.6) : new THREE.SphereGeometry(rad, 18, 14);
      const mk = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: c, emissiveIntensity: 0.15 }));
      mk.position.copy(P(p[0], p[1], z + rad * 0.85)); moving.add(mk);
      // the drop line to the floor and the shadow of the iterate there
      const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(p[0], p[1], z), P(p[0], p[1], FLOOR)]), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.6 }));
      moving.add(drop);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), new THREE.MeshBasicMaterial({ color: c }));
      dot.position.copy(P(p[0], p[1], FLOOR + 0.001)); moving.add(dot);
    }
    dirty = true;
  }

  // a small cross on the surface where the pointer is on the map
  function setHover(p) {
    dispose(hoverG);
    if (p && L && colors && inside(p)) {
      const d = 0.035 * (L.box[1] - L.box[0]), e = 0.035 * (L.box[3] - L.box[2]), m = new THREE.LineBasicMaterial({ color: tcol(colors.gold) });
      for (const [a, b] of [[[p[0] - d, p[1]], [p[0] + d, p[1]]], [[p[0], p[1] - e], [p[0], p[1] + e]]]) {
        const pts = [];
        for (let s = 0; s <= 8; s++) { const x = a[0] + s / 8 * (b[0] - a[0]), y = a[1] + s / 8 * (b[1] - a[1]); pts.push(P(x, y, zAt(x, y) + LIFT)); }
        hoverG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m));
      }
      const z = zAt(p[0], p[1]);
      hoverG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(p[0], p[1], z), P(p[0], p[1], FLOOR)]),
        new THREE.LineDashedMaterial({ color: tcol(colors.gold), dashSize: 0.01, gapSize: 0.008 })));
      hoverG.children.at(-1).computeLineDistances();
    }
    dirty = true;
  }

  // the pointer on the surface, told to the page as a point of the plane
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pending = null;
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.buttons || !onHover) return;
    pending = e;
  });
  renderer.domElement.addEventListener('pointerleave', () => { pending = null; onHover?.(null); });

  const loop = () => {
    if (pending && surface && L) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set((pending.clientX - r.left) / r.width * 2 - 1, -(pending.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(surface)[0];
      onHover(hit ? [L.box[0] + hit.point.x * (L.box[1] - L.box[0]), L.box[2] + hit.point.y * (L.box[3] - L.box[2])] : null);
      pending = null;
    }
    if (controls.update() || dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  };
  home(); loop();

  return {
    setLandscape(l) { L = l; build(); },
    setColors(c) { colors = c; build(); },
    setRuns, setHover,
    setSurfaceLines(on) { showSurfLines = on; if (surfLines) surfLines.visible = on; dirty = true; },
    setAutoRotate(on) { controls.autoRotate = on; dirty = true; },
    resetCamera: home,
  };
}
