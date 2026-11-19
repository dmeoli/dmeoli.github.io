// The traces of the arena (docs/study-search-games.md, section 5.1): a file
// of JSON lines, header, events, result, read as it arrives, from a file of
// traces/games/<game>/ or, once the service of section 3 exists, from its
// stream; and the replay of the events into the state of a board, which only
// applies what the trace says (no solving here).

// the service of section 3: off until it is deployed and paid for
export const LIVE = { enabled: false, url: '' };

// reads a stream of JSON lines, calling onLine for each complete line
async function lines(body, onLine) {
  const reader = body.getReader(), dec = new TextDecoder();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read();
    rest += done ? dec.decode() : dec.decode(value, { stream: true });
    let i;
    while ((i = rest.indexOf('\n')) >= 0) {
      const s = rest.slice(0, i).trim();
      rest = rest.slice(i + 1);
      if (s) onLine(JSON.parse(s));
    }
    if (done) break;
  }
  if (rest.trim()) onLine(JSON.parse(rest));
}

// a trace being filled: header, events and result, and onUpdate called as
// they come (a live stream grows while the replay runs)
export function openTrace(source, onUpdate = () => {}) {
  const tr = { header: null, events: [], result: null, done: false, error: null };
  const take = o => {
    if (!tr.header) {
      if (o.kind !== 'arena') throw new Error('not an arena trace');
      tr.header = o;
    } else if (o.type === 'result') tr.result = o;
    else tr.events.push(o);
  };
  let req;
  if (source.live) {
    if (!LIVE.enabled) return Promise.reject(new Error('the live service is off'));
    req = fetch(LIVE.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source.live) });
  } else req = fetch(source.url);
  return req.then(async r => {
    if (!r.ok) throw new Error(r.status + ' ' + (source.url || LIVE.url));
    let n = 0;
    await lines(r.body, o => { take(o); if (++n % 200 === 0) onUpdate(tr); });
    tr.done = true;
    onUpdate(tr);
    return tr;
  });
}

// the state of a colouring board after the first k events of a trace
export class Replay {
  constructor(trace) {
    this.tr = trace;
    const h = trace.header;
    this.k = h.instance.colours.length;
    this.verts = h.instance.vertices;
    this.nvars = h.encoding ? h.encoding.variables : 0;
    this.snaps = [];
    this.reset();
  }
  reset() {
    this.pos = 0;
    this.val = new Int8Array(this.nvars + 1);   // 1 true, -1 false, 0 not set
    this.lev = new Int32Array(this.nvars + 1);
    this.set = new Map();                        // the board as set/unset say
    this.nodes = new Map();
    this.node = null; this.lb = null; this.ub = null;
    this.x = null; this.n = {}; this.last = null; this.value = null;
    this.decs = []; this.undone = null;          // the decisions open, by level; the variables a backtrack undid
  }
  assign(lit, level) {
    const v = Math.abs(lit);
    if (v < 1 || v > this.nvars) return;
    this.val[v] = lit > 0 ? 1 : -1; this.lev[v] = level || 0;
  }
  apply(e) {
    if (e.n) this.n = e.n;
    this.last = e;
    this.undone = null;
    switch (e.type) {
      case 'decide':
        this.assign(e.lit, e.level);
        this.decs = this.decs.filter(d => d.level < e.level).concat([{ level: e.level, lit: e.lit }]);
        break;
      case 'propagate': case 'split': for (const l of e.lits || []) this.assign(l, e.level); break;
      case 'flip': for (const l of e.lits || []) this.assign(l, 0); break;   // WalkSAT
      case 'backtrack': {
        const und = new Set();
        for (let v = 1; v <= this.nvars; v++) if (this.val[v] && this.lev[v] > e.level) { this.val[v] = 0; und.add(Math.floor((v - 1) / this.k)); }
        this.undone = und;
        this.decs = this.decs.filter(d => d.level <= e.level);
        break;
      }
      case 'node': {
        const old = this.nodes.get(e.id);
        this.nodes.set(e.id, { ...old, ...e });
        if ('lb' in e) this.lb = e.lb;
        if ('ub' in e) this.ub = e.ub;
        if (e.status === 'open' || !old) {      // the board shows the fixings of the node
          this.node = e.id;
          this.val.fill(0);
          for (const l of e.fix || []) this.assign(l, 0);
        }
        break;
      }
      case 'bound':
        if ('lb' in e) this.lb = e.lb;
        if ('ub' in e) this.ub = e.ub;
        break;
      case 'iterate':
        this.value = e.value;
        if ('lb' in e) this.lb = e.lb;
        if ('ub' in e) this.ub = e.ub;
        break;
    }
    if (e.x) this.x = e.x;
    if (e.set) for (const [a, b] of Object.entries(e.set)) this.set.set(a, b);
    if (e.unset) for (const a of e.unset) this.set.delete(a);
  }
  snapshot() {
    return { pos: this.pos, val: this.val.slice(), lev: this.lev.slice(), set: new Map(this.set),
      nodes: new Map(this.nodes), node: this.node, lb: this.lb, ub: this.ub, x: this.x, n: this.n,
      last: this.last, value: this.value, decs: this.decs, undone: this.undone };
  }
  // moves to the state after the first k events (snapshots every 256 events
  // make a step back cheap)
  seek(k) {
    const ev = this.tr.events;
    k = Math.max(0, Math.min(k, ev.length));
    if (k < this.pos) {
      const s = this.snaps.filter(s => s.pos <= k).pop();
      if (s) Object.assign(this, { ...s, val: s.val.slice(), lev: s.lev.slice(), set: new Map(s.set), nodes: new Map(s.nodes) });
      else this.reset();
    }
    while (this.pos < k) {
      this.apply(ev[this.pos++]);
      if (this.pos % 256 === 0 && !this.snaps.some(s => s.pos === this.pos)) this.snaps.push(this.snapshot());
    }
    return this;
  }
  // the board: for each vertex the colour (index, -1 if none), the colours
  // still possible (a bit mask) and, from x, the share of each colour
  board() {
    const { k } = this, cols = this.tr.header.instance.colours, out = [];
    const sym = this.tr.header.encoding ? this.tr.header.encoding.symbols : null;
    // after the last event, the solution of the result (or its model, the
    // true variables in the numbering of DIMACS)
    const r = this.tr.result, last = this.pos === this.tr.events.length && r && /^(sat|optimal|feasible)$/.test(r.status);
    const end = last && r.solution ? { solution: r.solution } : last && r.model && sym ? { model: new Set(r.model) } : null;
    this.verts.forEach((v, i) => {
      let colour = -1, mask = 0, frac = null;
      if (sym) {
        for (let j = 0; j < k; j++) {
          const s = this.val[i * k + j + 1];
          if (s > 0) colour = j;
          if (s >= 0) mask |= 1 << j;
        }
        if (this.x) frac = cols.map((_, j) => this.x[i * k + j] || 0);
      }
      if (this.set.has(v)) { colour = cols.indexOf(this.set.get(v)); mask = 1 << colour; }
      if (end) {
        const c = end.solution ? cols.indexOf(end.solution[v]) : cols.findIndex((_, j) => end.model.has(i * k + j + 1));
        if (c >= 0) { colour = c; mask = 1 << c; frac = null; }
      }
      out.push({ id: v, colour, mask, frac });
    });
    return out;
  }
  // what the current event acts on, for the board to mark: a list of
  // { v, j, kind }, v the index of a variable, j that of its value (-1 for
  // the whole variable) and kind 'decide' (the value tried, or the item a
  // node of the branch-and-bound branches on), 'prop' (a value propagation
  // forces or rules out), 'hot' (a variable of a conflict) or 'undo' (a
  // variable whose value a backtrack takes back)
  focus() {
    const e = this.last, out = [], k = this.k;
    if (!e) return out;
    const lit = (l, kind) => { const a = Math.abs(l) - 1; if (a >= 0 && a < this.nvars) out.push({ v: Math.floor(a / k), j: a % k, kind }); };
    switch (e.type) {
      case 'decide': lit(e.lit, 'decide'); break;
      case 'split': case 'flip': for (const l of e.lits || []) lit(l, 'decide'); break;
      case 'propagate': if (e.reason !== 'random start') for (const l of e.lits || []) lit(l, 'prop'); break;
      case 'assign': {
        const v = this.verts.indexOf(e.var);
        if (v >= 0) out.push({ v, j: this.tr.header.instance.colours.indexOf(String(e.value)), kind: 'decide' });
        break;
      }
      case 'node': if (e.fix && e.fix.length) lit(e.fix[e.fix.length - 1], 'decide'); break;
      case 'backtrack': for (const v of this.undone || []) out.push({ v, j: -1, kind: 'undo' }); break;
      case 'conflict': {
        const hot = this.hot();
        if (hot.size) this.verts.forEach((id, v) => { if (hot.has(id)) out.push({ v, j: -1, kind: 'hot' }); });
        else {       // no clause in the trace: the last decision taken, which fails
          const d = this.decs[this.decs.length - 1];
          if (d) { const a = Math.abs(d.lit) - 1; out.push({ v: Math.floor(a / k), j: -1, kind: 'hot' }); }
        }
        break;
      }
    }
    return out;
  }
  // the vertices of the clause of a conflict at the current event
  hot() {
    const e = this.last;
    if (!e || e.type !== 'conflict') return new Set();
    if (e.vars) return new Set(e.vars);
    return new Set((e.clause || []).map(l => this.verts[Math.floor((Math.abs(l) - 1) / this.k)]));
  }
}

export const timed = tr => tr.events.length > 0 && tr.events.every(e => typeof e.t === 'number');
