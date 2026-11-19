// A tree drawn in SVG under the board of a lane: the decision tree of a
// backtracking search, the search tree of a state-space search, the tree of
// a branch-and-bound. The nodes keep their elements from one step to the
// next, so that a node new at this step grows out of its parent and the
// others slide to their new places (short CSS transitions, none with
// reduced motion). A big tree stays readable: past BUDGET nodes, the page
// draws the path from the root to the current node, the children of that
// path, the nodes made last and the top levels, and folds every other
// subtree into a pill with the number of nodes it holds.

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
export const BUDGET = 200;
const ST = new WeakMap();

// box: the element that scrolls; m: { nodes: Map id -> { id, p, cls, label,
// title, fill }, order: the ids, parents before children; cur: the id of
// the current node or null; arcs: [{ from, to, label }]; small: labels
// under every node }
export function renderTree(box, m) {
  let st = ST.get(box);
  if (!st) {
    const svg = el('svg', { class: 'tview' });
    const ge = el('g', { class: 'tedges' }), ga = el('g', { class: 'tarcs' }), gn = el('g', { class: 'tnodes' });
    svg.append(ge, ga, gn);
    box.replaceChildren(svg);
    st = { svg, ge, ga, gn, nodes: new Map(), edges: new Map(), pos: new Map() };
    ST.set(box, st);
  }
  const { nodes, order } = m;
  // the children of each node, in the order of the ids
  const kids = new Map();
  let root = null;
  for (const id of order) {
    const n = nodes.get(id);
    if (n.p === null || n.p === undefined || !nodes.has(n.p)) { if (root === null) root = id; continue; }
    if (!kids.has(n.p)) kids.set(n.p, []);
    kids.get(n.p).push(id);
  }
  if (root === null) { st.gn.replaceChildren(); st.ge.replaceChildren(); st.ga.replaceChildren(); st.nodes.clear(); st.edges.clear(); st.svg.setAttribute('width', 0); return { drawn: 0, folded: 0 }; }
  // the nodes drawn
  let show = null, size = null;
  if (order.length > BUDGET) {
    size = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i], s = (size.get(id) || 0) + 1, p = nodes.get(id).p;
      size.set(id, s);
      if (p !== null && p !== undefined && nodes.has(p)) size.set(p, (size.get(p) || 0) + s);
    }
    show = new Set();
    const up = id => { while (id !== null && id !== undefined && nodes.has(id) && !show.has(id) && show.size < BUDGET) { show.add(id); id = nodes.get(id).p; } };
    show.add(root);
    const path = [];
    for (let id = m.cur; id !== null && id !== undefined && nodes.has(id); id = nodes.get(id).p) path.push(id);
    for (const id of path.reverse()) show.add(id);
    for (const id of path) for (const c of (kids.get(id) || []).slice(-12)) if (show.size < BUDGET * 0.55) show.add(c);
    for (let i = order.length - 1; i >= 0 && show.size < BUDGET * 0.75; i--) up(order[i]);
    const queue = [root];
    while (queue.length && show.size < BUDGET) {
      const id = queue.shift();
      for (const c of kids.get(id) || []) { if (show.size >= BUDGET) break; show.add(c); queue.push(c); }
    }
  }
  const vis = id => !show || show.has(id);
  // the layout: the leaves one after the other, a parent over its children
  const pos = new Map(), stubs = [];
  let leaf = 0, depth = 0;
  // a deep tree would overflow the stack of a recursive walk: walk it with
  // an explicit stack, children before their parent
  const walkIter = () => {
    const todo = [[root, 0, false]];
    while (todo.length) {
      const [id, d, done] = todo.pop();
      if (!done) {
        depth = Math.max(depth, d);
        todo.push([id, d, true]);
        // the fold of the hidden children first, on the left, so that the
        // labels beside the path on the right stay clear
        const hidden = show ? (kids.get(id) || []).filter(c => !show.has(c)) : [];
        if (hidden.length) {
          const sid = 'fold:' + id, n = hidden.reduce((a, c) => a + size.get(c), 0);
          stubs.push({ id: sid, p: id, n });
          pos.set(sid, [leaf++, d + 1]);
          depth = Math.max(depth, d + 1);
        }
        const real = (kids.get(id) || []).filter(vis);
        for (let i = real.length - 1; i >= 0; i--) todo.push([real[i], d + 1, false]);
        continue;
      }
      const ch = (kids.get(id) || []).filter(vis);
      if (pos.has('fold:' + id)) ch.push('fold:' + id);
      if (!ch.length) pos.set(id, [leaf++, d]);
      else { const xs = ch.map(c => pos.get(c)[0]); pos.set(id, [(Math.min(...xs) + Math.max(...xs)) / 2, d]); }
    }
  };
  walkIter();
  const drawn = pos.size - stubs.length;
  const small = !!m.small && drawn <= 40;
  let lw = 0;
  if (small) for (const id of pos.keys()) { const n = nodes.get(id); if (n && n.label) lw = Math.max(lw, String(n.label).length); }
  const dx = small ? Math.max(34, lw * 6 + 8) : Math.max(9, Math.min(18, 900 / Math.max(1, leaf)));
  const dy = small ? 31 : Math.max(10, Math.min(26, 240 / (depth + 1)));
  const r = small ? 7 : Math.max(2.6, Math.min(5.5, dx * 0.34, dy * 0.3));
  const pad = small ? 22 : 14;
  const bw = box.clientWidth || 300, tw = leaf * dx + 2 * pad;
  const W = Math.max(bw, tw), H = depth * dy + 2 * pad + (small ? 14 : 4);
  const off = (W - tw) / 2;
  const at = id => { const [x, d] = pos.get(id); return [off + pad + dx / 2 + x * dx, pad + d * dy]; };
  st.svg.setAttribute('width', W); st.svg.setAttribute('height', H);
  st.svg.style.width = W + 'px'; st.svg.style.height = H + 'px';
  st.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const later = [];
  const place = (g, x, y) => { g._to = `translate(${x}px, ${y}px)`; };
  // nodes
  const seen = new Set();
  const all = [...pos.keys()];
  for (const id of all) {
    const stub = String(id).startsWith('fold:');
    const n = stub ? stubs.find(s => s.id === id) : nodes.get(id);
    const [x, y] = at(id);
    let g = st.nodes.get(id);
    const fresh = !g;
    if (fresh) {
      g = el('g');
      if (stub) { g.append(el('rect'), el('text', { class: 'tcount' })); }
      else g.append(el('circle'), el('title'));
      st.gn.append(g);
      st.nodes.set(id, g);
      const pp = n.p !== null && n.p !== undefined && st.pos.get(n.p);
      g.style.transform = pp ? `translate(${pp[0]}px, ${pp[1]}px)` : `translate(${x}px, ${y}px)`;
    }
    seen.add(id);
    place(g, x, y);
    if (fresh) later.push(g); else g.style.transform = g._to;
    if (stub) {
      g.setAttribute('class', 'tn fold');
      const txt = '+' + n.n, w = 7 + txt.length * 5.6;
      const R = g.firstChild;
      R.setAttribute('x', -w / 2); R.setAttribute('y', -6); R.setAttribute('width', w); R.setAttribute('height', 12); R.setAttribute('rx', 6);
      const T = g.lastChild; T.textContent = txt; T.setAttribute('y', 3.5);
      continue;
    }
    g.setAttribute('class', 'tn ' + (n.cls || '') + (id === m.cur ? ' hot' : ''));
    const c = g.querySelector('circle');
    c.setAttribute('r', n.cls && /\bconflict\b/.test(n.cls) ? r * 0.8 : r);
    c.style.fill = n.fill || '';
    g.querySelector('title').textContent = n.title || '';
    // the label: under every node of a small tree, else beside the nodes of
    // the current path
    let lab = g.querySelector('text.tl');
    const want = n.label && (small || (n.cls && /\bpath\b/.test(n.cls)) || id === m.cur) ? n.label : '';
    if (want) {
      if (!lab) { lab = el('text', { class: 'tl' }); g.append(lab); }
      lab.textContent = want;
      if (small) { lab.setAttribute('x', 0); lab.setAttribute('y', r + 11); lab.setAttribute('text-anchor', 'middle'); }
      else { lab.setAttribute('x', r + 3); lab.setAttribute('y', 3.5); lab.setAttribute('text-anchor', 'start'); }
    } else if (lab) lab.remove();
  }
  for (const [id, g] of st.nodes) if (!seen.has(id)) { g.remove(); st.nodes.delete(id); }
  // edges, from each drawn node to its parent
  const eseen = new Set();
  for (const id of all) {
    const n = String(id).startsWith('fold:') ? stubs.find(s => s.id === id) : nodes.get(id);
    if (n.p === null || n.p === undefined || !pos.has(n.p)) continue;
    const [x1, y1] = at(n.p), [x2, y2] = at(id), d = `M${x1} ${y1}L${x2} ${y2}`;
    let p = st.edges.get(id);
    const fresh = !p;
    if (fresh) {
      p = el('path');
      st.ge.append(p); st.edges.set(id, p);
      const pp = st.pos.get(n.p);
      const d0 = pp ? `M${pp[0]} ${pp[1]}L${pp[0]} ${pp[1]}` : d;
      p.setAttribute('d', d0); p.style.d = `path("${d0}")`;
      p._d = d; later.push(p);
    } else { p.setAttribute('d', d); p.style.d = `path("${d}")`; }
    p.setAttribute('class', 'te' + (n.ecls ? ' ' + n.ecls : ''));
    eseen.add(id);
  }
  for (const [id, p] of st.edges) if (!eseen.has(id)) { p.remove(); st.edges.delete(id); }
  // the arcs (a backjump: from the conflict to the node kept)
  st.ga.replaceChildren();
  for (const a of m.arcs || []) {
    if (!pos.has(a.from) || !pos.has(a.to)) continue;
    const [x1, y1] = at(a.from), [x2, y2] = at(a.to), bend = Math.max(30, Math.abs(y1 - y2) * 0.6);
    const cx = Math.max(x1, x2) + bend;
    st.ga.append(el('path', { class: 'tarc', d: `M${x1 + r} ${y1}Q${cx} ${(y1 + y2) / 2} ${x2 + r} ${y2}` }));
    if (a.label) { const t = el('text', { class: 'tarcl', x: Math.max(x1, x2) + bend * 0.55 + 4, y: (y1 + y2) / 2 + 3 }); t.textContent = a.label; st.ga.append(t); }
  }
  // the places of this step, for the nodes of the next to grow out of
  st.pos = new Map(all.map(id => [id, at(id)]));
  if (later.length) requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const e of later) {
      if (e._to) e.style.transform = e._to;
      if (e._d) { e.setAttribute('d', e._d); e.style.d = `path("${e._d}")`; }
    }
  }));
  // the current node in view
  if (m.cur !== null && m.cur !== undefined && pos.has(m.cur)) {
    const [x, y] = at(m.cur), L = box.scrollLeft, T = box.scrollTop, bwv = box.clientWidth, bh = box.clientHeight;
    const left = x < L + bwv * 0.2 || x > L + bwv * 0.8 ? x - bwv / 2 : L;
    const top = y < T + bh * 0.2 || y > T + bh * 0.8 ? y - bh / 2 : T;
    if (left !== L || top !== T) box.scrollTo({ left, top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return { drawn, folded: show ? order.length - drawn : 0 };
}
