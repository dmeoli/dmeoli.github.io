// The tree of a branch-and-bound lane: the nodes the trace has sent so far,
// drawn by treeview.js as the other trees of the arena (a node new at this
// step grows out of its parent, a big tree folds the subtrees off the path
// of the current node), filled in the color of the worker that branched
// them, gold when feasible, grey when pruned or infeasible, the current
// node ringed, the bound in the tooltip and under the nodes of a small tree.

import { renderTree } from './treeview.js';
import { WORKERS } from './search.js';

const fmt = v => +(+v).toPrecision(4);

export function drawTree(box, nodes, current, sym = []) {
  const order = [...nodes.keys()];
  const m = new Map();
  // the item that a node fixes, from the last literal of its fixings
  const what = n => {
    const l = n.fix && n.fix.length ? n.fix[n.fix.length - 1] : 0, s = l ? sym[Math.abs(l) - 1] || '' : '';
    const ks = /^(.*)_(in|out)$/.exec(s);
    return !l ? 'root' : ks ? (ks[2] === 'in' ? '+' : '−') + ks[1] : s;
  };
  for (const n of nodes.values()) {
    m.set(n.id, { id: n.id, p: n.parent ?? null, cls: 'bb ' + (n.status || ''),
      fill: n.w !== undefined && n.status === 'branched' ? WORKERS[n.w % WORKERS.length] : '',
      label: n.bound !== null && n.bound !== undefined ? String(fmt(n.bound)) : '',
      title: `${what(n)}: ${n.status}${n.bound !== null && n.bound !== undefined ? ', bound ' + fmt(n.bound) : ''}${n.w !== undefined ? ', worker ' + (n.w + 1) : ''}` });
  }
  // the path from the root to the current node, in ink
  for (let id = current; id !== null && id !== undefined && m.has(id); id = m.get(id).p) { m.get(id).cls += ' path'; m.get(id).ecls = 'path'; }
  return renderTree(box, { nodes: m, order, cur: current, small: true });
}
