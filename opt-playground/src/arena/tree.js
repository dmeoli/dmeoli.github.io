// The tree of a branch-and-bound lane as an SVG: the nodes the trace has sent
// so far, placed by depth and by the order of their leaves, coloured by
// status, the current node ringed, the bound under each node.

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

import { WORKERS } from './search.js';

export function drawTree(svg, nodes, current) {
  svg.replaceChildren();
  if (!nodes.size) { svg.setAttribute('viewBox', '0 0 100 30'); return; }
  const kids = new Map();
  let root = null;
  for (const n of nodes.values()) {
    if (n.parent === null || n.parent === undefined || !nodes.has(n.parent)) { if (root === null) root = n.id; continue; }
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n.id);
  }
  const pos = new Map();
  let leaf = 0, depth = 0;
  const walk = (id, d) => {
    depth = Math.max(depth, d);
    const ch = kids.get(id) || [];
    if (!ch.length) pos.set(id, [leaf++, d]);
    else {
      ch.forEach(c => walk(c, d + 1));
      pos.set(id, [(pos.get(ch[0])[0] + pos.get(ch[ch.length - 1])[0]) / 2, d]);
    }
  };
  walk(root, 0);
  // a large tree (the knapsack) is drawn small, without the labels
  const big = nodes.size > 40;
  const dx = big ? 12 : 34, dy = big ? 14 : 40, W = Math.max(1, leaf) * dx + 20, H = (depth + 1) * dy + 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W * 1.3); svg.setAttribute('height', H * 1.3);
  const at = id => { const [x, d] = pos.get(id); return [10 + dx / 2 + x * dx, 16 + d * dy]; };
  for (const [p, ch] of kids) for (const c of ch) {
    if (!pos.has(c) || !pos.has(p)) continue;
    const [x1, y1] = at(p), [x2, y2] = at(c);
    svg.append(el('line', { x1, y1, x2, y2, class: 'treeedge' }));
  }
  for (const n of nodes.values()) {
    if (!pos.has(n.id)) continue;
    const [x, y] = at(n.id), g = el('g', { class: `anode ${n.status}${n.id === current ? ' hot' : ''}` });
    const c = el('circle', { cx: x, cy: y, r: big ? 4.5 : 9 });
    if (n.w !== undefined && n.status === 'branched') c.style.fill = WORKERS[n.w % WORKERS.length];
    g.append(c);
    if (big) { svg.append(g); continue; }
    // the ids of the knapsack (items fixed:items taken) say little: no label
    if (!String(n.id).includes(':')) { const tx = el('text', { x, y: y + 3.5, class: 'tval' }); tx.textContent = n.id; g.append(tx); }
    if (n.bound !== null && n.bound !== undefined) {
      const b = el('text', { x, y: y + 21, class: 'tick' }); b.textContent = +(+n.bound).toPrecision(4); g.append(b);
    }
    svg.append(g);
  }
}
