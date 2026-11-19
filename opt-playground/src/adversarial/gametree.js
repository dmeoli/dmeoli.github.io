// The game tree under a board, drawn in SVG for a step of a replay
// (replay.js). A tree of thousands of nodes stays readable because only
// the path to the node of the current event is unfolded: each row holds
// the children of the node of the path above it (a MAX node a triangle
// pointing up, a MIN node one pointing down, a node of the tree search a
// disc as large as its visits), and a node off the path folds its subtree
// into a count "+n". The values come back up level by level: a node done
// shows its value, a node still open the bound its children have given so
// far (≥ for MAX, ≤ for MIN); moves pruned by alpha-beta are drawn dashed
// and greyed, and the window α, β of the node of the path is written at the
// left of its row. The move chosen turns gold. Nodes keep their element
// from one step to the next, so that they slide to their new places.

import { t } from '../i18n.js';
import { fmt, same } from './replay.js';

const NS = 'http://www.w3.org/2000/svg';
const SP = 30, ROW0 = 74, GUT = 56, TOP = 24;
const el = (tag, cls) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); return e; };
const short = v => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : fmt(v));

export class TreePanel {
  constructor(box) {
    this.box = box;
    this.svg = el('svg', 'gtree');
    this.edges = el('g'); this.nodesG = el('g'); this.gut = el('g', 'gtgut');
    this.svg.append(this.edges, this.nodesG, this.gut);
    box.replaceChildren(this.svg);
    this.nodeEls = new Map(); this.edgeEls = new Map();
  }
  draw(R, k) {
    const F = R.focus(k), done = R.events[k].type === 'choose' || R.events[k].type === 'result';
    const chosen = done ? R.events[k].move : null;
    // the rows: the root, then the children of each node of the path
    const rows = [[{ id: 0, n: R.nodes.get(0) }]];
    for (let d = 0; d < F.length; d++) {
      const p = R.nodes.get(F[d]);
      const kids = p.kids.map(id => R.nodes.get(id)).filter(n => R.seen(n, k)).map(n => ({ id: n.id, n }));
      if (R.kind === 'tree' && p.pruned && R.done(p, k)) p.pruned.forEach((m, i) => kids.push({ id: `p${p.id}.${i}`, pruned: m, parent: p.id }));
      if (!kids.length) break;
      rows.push(kids);
    }
    const ROW = R.kind === 'mcts' ? 84 : ROW0;
    this.ROW = ROW;
    const wmax = Math.max(...rows.map(r => r.length)) * SP;
    const W = GUT + wmax + 8, H = TOP + (rows.length - 1) * ROW + 40;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const z = Math.max(1, Math.min(1.4, ((this.box.clientWidth || W) - 2) / W));
    this.svg.style.width = W * z + 'px'; this.svg.style.height = H * z + 'px';
    const pos = new Map();
    rows.forEach((r, d) => { const x0 = GUT + (wmax - r.length * SP) / 2; r.forEach((q, i) => pos.set(q.id, [x0 + (i + 0.5) * SP, TOP + d * ROW])); });
    const onPath = new Set(F), hot = F.at(-1);
    const rootN = R.kind === 'mcts' ? Math.max(1, R.stats(R.nodes.get(0), k)[0]) : 1;
    const keepN = new Set(), keepE = new Set();
    rows.forEach((r, d) => r.forEach(q => {
      const [x, y] = pos.get(q.id);
      let g = this.nodeEls.get(q.id);
      const fresh = !g;
      if (fresh) {
        g = el('g', 'gtn'); g.append(el('path', 'gs'), el('text', 'gm'), el('text', 'gv'), el('text', 'gf'), el('text', 'gp'));
        this.nodeEls.set(q.id, g); this.nodesG.append(g);
        g.style.transform = `translate(${x}px, ${y}px)`;
      }
      keepN.add(q.id);
      requestAnimationFrame(() => { g.style.transform = `translate(${x}px, ${y}px)`; });
      const n = q.n, [sh, mv, vl, fd, pc] = g.children;
      let pct = '';
      const isMax = d % 2 === 0;
      let cls = 'gtn', value = '', fold = '';
      if (q.pruned) {
        cls += ' pruned';
        sh.setAttribute('d', tri(isMax, 6));
        mv.textContent = R.name(q.pruned);
        value = '✂';
      } else if (R.kind === 'tree') {
        sh.setAttribute('d', tri(isMax, d === 0 ? 9 : 7));
        mv.textContent = d === 0 ? t('root', 'radice') : R.name(n.move);
        if (R.done(n, k)) { cls += ' done'; value = fmt(n.v); }
        else { const b = R.bound(n, k); value = b === null ? '' : (n.max ? '≥' : '≤') + fmt(b); }
        if (n.leaf && !n.terminal) cls += ' cut';
      } else {
        const [N, U] = R.stats(n, k);
        const rad = 3 + 8 * Math.sqrt(N / rootN);
        sh.setAttribute('d', `M ${-rad} 0 a ${rad} ${rad} 0 1 0 ${2 * rad} 0 a ${rad} ${rad} 0 1 0 ${-2 * rad} 0`);
        mv.textContent = d === 0 ? t('root', 'radice') : R.name(n.move);
        value = String(N);
        if (N && d > 0) pct = Math.round(100 * U / N) + '%';
        if (N) cls += ' done';
      }
      if (!q.pruned && !onPath.has(q.id)) { const u = R.under(n, k); if (u) fold = '+' + u; }
      if (onPath.has(q.id)) cls += ' path';
      if (q.id === hot && !done) cls += ' hot';
      if (chosen && d === 1 && !q.pruned && same(n.move, chosen)) cls += ' chosen';
      g.setAttribute('class', cls);
      mv.setAttribute('y', -11); vl.setAttribute('y', 19); pc.setAttribute('y', 29); fd.setAttribute('y', pct ? 39 : 29);
      vl.textContent = value; fd.textContent = fold; pc.textContent = pct;
      if (d > 0) {
        const pid = q.pruned ? q.parent : n.parent, [px, py] = pos.get(pid);
        let e = this.edgeEls.get(q.id);
        if (!e) { e = el('path', 'gte'); this.edgeEls.set(q.id, e); this.edges.append(e); }
        keepE.add(q.id);
        e.setAttribute('class', 'gte' + (q.pruned ? ' pruned' : '') + (onPath.has(q.id) ? ' path' : '') + (chosen && d === 1 && !q.pruned && same(n.move, chosen) ? ' chosen' : ''));
        const off = R.kind === 'mcts' ? 42 : 33; // below the labels of the parent
        e.style.d = `path("M ${px} ${py + off} L ${x} ${y - 20}")`;
      }
    }));
    for (const [id, g] of this.nodeEls) if (!keepN.has(id)) { g.remove(); this.nodeEls.delete(id); }
    for (const [id, e] of this.edgeEls) if (!keepE.has(id)) { e.remove(); this.edgeEls.delete(id); }
    // the gutter: who moves in each row and, for alpha-beta, the window of the node of the path
    this.gut.replaceChildren();
    rows.forEach((r, d) => {
      const y = TOP + d * ROW, tx = (s, dy, c) => { const e = el('text', c); e.setAttribute('x', 4); e.setAttribute('y', y + dy); e.textContent = s; this.gut.append(e); };
      if (R.kind === 'tree') {
        tx(d % 2 === 0 ? 'MAX' : 'MIN', -3, 'gk');
        const id = F[d];
        if (R.ab && id !== undefined) {
          const n = R.nodes.get(id);
          if (!R.done(n, k) || d === 0) { const [a, b] = R.window(n, k); tx(`α ${short(a)}`, 9, 'gw'); tx(`β ${short(b)}`, 20, 'gw'); }
        }
      } else if (d > 0) {
        const p = R.pathPlayer(d - 1);
        tx(t(`${p} plays`, `gioca ${p}`), 2, 'gk');
      } else tx(t('visits', 'visite'), 2, 'gk');
    });
  }
}

function tri(up, s) {
  return up ? `M 0 ${-s} L ${s} ${s * 0.75} L ${-s} ${s * 0.75} Z` : `M 0 ${s} L ${s} ${-s * 0.75} L ${-s} ${-s * 0.75} Z`;
}
