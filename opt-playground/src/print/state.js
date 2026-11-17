// The parameters of a scene in its address (#W=3&D=0.2&ap=drop), so that a
// link restores the scene as it was: the request of a print sends that link.
// spec: { key: { def, min, max, int } } for numbers, { def: true } for a
// switch, { def: 'a', values: ['a', 'b'] } for a choice, { def: '' } for text.
//   const state = readState(SPEC);           // on load: defaults, then the address
//   writeState(SPEC, state);                  // after every change
//   shareUrl(SPEC, state)                     // the full link, every parameter written

function parse(s, v) {
  if (v === null || v === undefined) return s.def;
  if (typeof s.def === 'boolean') return v === '1' || v === 'true';
  if (typeof s.def === 'number') {
    let x = parseFloat(v);
    if (!isFinite(x)) return s.def;
    if (s.int) x = Math.round(x);
    return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, x));
  }
  if (s.values) return s.values.includes(v) ? v : s.def;
  return String(v);
}
const show = (s, v) => (typeof s.def === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(+v.toPrecision(6)) : String(v));

export function readState(spec, hash = location.hash) {
  const h = new URLSearchParams(hash.replace(/^#/, '')), out = {};
  for (const [k, s] of Object.entries(spec)) out[k] = parse(s, h.get(k));
  return out;
}

// the parameters as a query; all = false leaves out those at their default
export function stateQuery(spec, state, all = false) {
  const q = new URLSearchParams();
  for (const [k, s] of Object.entries(spec)) if (all || state[k] !== s.def) q.set(k, show(s, state[k]));
  return q.toString();
}

export function writeState(spec, state) {
  const q = stateQuery(spec, state);
  history.replaceState(history.state, '', location.pathname + location.search + (q ? '#' + q : ''));
}

export function shareUrl(spec, state) {
  return location.origin + location.pathname + '#' + stateQuery(spec, state, true);
}
