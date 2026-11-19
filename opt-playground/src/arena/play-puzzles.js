// The n-ary CSPs of puzzles.js played in the lane "You" (play.js): Kakuro,
// cryptarithmetic and the crossword, on CellGridView as the other lanes draw
// them, with a row of tiles under the grid (the digits, or the words of the
// crossword) to play by pointer. A click on a cell selects it (gold), a
// click on a tile writes that value there; the keys do the same. A value
// that breaks a rule is refused, its cell and the cells it clashes with are
// framed in red, and the event line says which rule: a digit repeated in a
// run of Kakuro or a run whose sum goes over its clue (or misses it once
// full); a digit already given to another letter, a number that would begin
// with 0 or a column whose sum fails; a word that is not in the list, or a
// letter that clashes with the crossing word. Nothing is solved here: the
// end is compared with the solutions that the solver lanes recorded.

import * as THREE from 'three';
import { label } from '../stage3d.js';
import { CellGridView } from './puzzles.js';
import { Marks } from './cells.js';
import { names } from './play.js';

// the words of the crossword, which the instance of the traces does not
// carry: words1 of aima-python, the list of crossword-1
const WORDS = { 'crossword-1': ['ant', 'big', 'bus', 'car', 'has', 'book', 'buys', 'hold', 'lane', 'year', 'ginger', 'search', 'symbol', 'syntax'] };

function tileTex(text, fg, bg, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = Math.round(h * 0.62);
  g.font = `500 ${size}px "IBM Plex Mono", monospace`;
  while (g.measureText(text).width > w * 0.86 && size > 10) { size -= 2; g.font = `500 ${size}px "IBM Plex Mono", monospace`; }
  g.fillText(text, w / 2, h * 0.54);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// CellGridView with an invisible box over each cell to pick it, the names
// of the rows and columns (r1, c1) where the cells are named by them, and a
// pad of tiles under the grid: pad = { items: [{ play, text }], cols, tw, th }
class PlayGridView extends CellGridView {
  constructor(box, inst, pad) { PlayGridView.next = pad; super(box, inst); }
  build() {
    if (!this.pad) this.pad = PlayGridView.next;
    super.build();
    const { S, inst, u, pad } = this, P = S.colors;
    const c0 = Math.min(0, ...inst.cells.map(c => c[1])), cols = inst.cols - c0, rows = inst.rows;
    this.at = (r, c) => [(c - c0 - (cols - 1) / 2) * u, ((rows - 1) / 2 - r) * u];
    const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hgeo = new THREE.BoxGeometry(u * 0.96, u * 0.96, u * 0.56);
    hgeo.translate(0, 0, u * 0.28);
    this.hits = []; this.tags = [];
    const seen = new Map();
    for (const [r, c, what] of inst.cells) {
      if (typeof what !== 'number') continue;
      const [x, y] = this.at(r, c), m = new THREE.Mesh(hgeo, hit);
      m.position.set(x, y, 0); m.userData.play = { cell: what };
      S.content.add(m); this.hits.push(m);
      // the letter of a cryptarithm, in a corner of each of its cells
      if (inst.kind === 'crypto') {
        const l = label(inst.vertices[what], P.ink, u * 0.3), k = seen.get(what) || 0;
        seen.set(what, k + 1);
        l.position.set(x - u * 0.3, y + u * 0.28, 0.02); S.content.add(l);
        this.tags.push({ l, it: this.vars[what][k] });
      }
    }
    let top = rows * u / 2;
    if (inst.kind !== 'crypto') {
      const size = Math.min(0.07, u * 0.42);
      for (let r = 0; r < rows; r++) {
        const l = label(`r${r + 1}`, P.soft, size), [x, y] = this.at(r, c0);
        l.position.set(x - u * 0.5 - size * 0.9, y, 0.01); S.content.add(l);
      }
      for (let c = 0; c < inst.cols; c++) {
        const l = label(`c${c + 1}`, P.soft, size), [x] = this.at(0, c);
        l.position.set(x, top + u * 0.35 + size * 0.5, 0.01); S.content.add(l);
      }
      top += u * 0.35 + size;
    }
    // the pad, centred under the grid
    const ink = '#' + P.ink.getHexString(), bg = '#' + P.rule.getHexString();
    const { tw, th } = pad, per = pad.cols, y0 = -rows * u / 2 - 0.07 - th / 2;
    this.tiles = pad.items.map((it, k) => {
      const row = Math.floor(k / per), inRow = Math.min(per, pad.items.length - row * per);
      const x = ((k % per) - (inRow - 1) / 2) * tw, y = y0 - row * th * 1.12;
      const side = new THREE.MeshStandardMaterial({ color: P.rule, roughness: 0.8, transparent: true });
      const face = new THREE.MeshStandardMaterial({ map: tileTex(it.text, ink, bg, Math.round(128 * tw / th), 128), roughness: 0.8, transparent: true });
      const m = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.92, th * 0.88, 0.03), [side, side, side, side, face, side]);
      m.position.set(x, y, 0.015); m.userData.play = { pad: k };
      S.content.add(m);
      return { m, mats: [side, face], x, y, w: tw, h: th };
    });
    this.extent = { top, bottom: y0 - (Math.ceil(pad.items.length / per) - 1) * th * 1.12 - th / 2 };
    this.padMarks = new Marks(S, 0.035);
    if (this.padLast) this.showPad(...this.padLast);
  }
  // the frames on the tiles ([{ v: tile, kind }]) and the tiles dimmed
  showPad(focus, dim) {
    this.padLast = [focus, dim];
    this.tiles.forEach((t, k) => t.mats.forEach(m => { m.opacity = dim.has(k) ? 0.3 : 1; }));
    this.padMarks.show(focus.map(f => ({ ...f, j: 0 })), k => { const t = this.tiles[k]; return t ? [t.x, t.y, t.w * 0.96, t.h * 0.94] : null; });
  }
  frame(dt) { super.frame(dt); if (this.padMarks) this.padMarks.frame(dt); }
  // the letters ride on their cells
  place() { super.place(); for (const { l, it } of this.tags || []) l.position.z = Math.max(0.02, it.h + 0.01); }
  // the camera on the grid and the pad together
  frameAll() {
    const { top, bottom } = this.extent, yc = (top + bottom) / 2, f = Math.max(0.8, (top - bottom) / 1.75);
    this.S.aim([0, yc - 1.35 * f, 2.55 * f], [0, yc, 0]);
  }
}

// the solution of a solver lane, as the index of the value of each
// variable (or -1), from its solution or from the model of its CNF
function solutionOf(L, inst) {
  const r = L.result, h = L.header;
  if (!r || !/^(sat|optimal|feasible)$/.test(r.status)) return null;
  const vals = h.instance.colours, idx = new Map(inst.vertices.map((v, i) => [v, i]));
  const out = new Array(inst.vertices.length).fill(-1);
  if (r.solution) {
    for (const [v, a] of Object.entries(r.solution)) if (idx.has(v)) out[idx.get(v)] = vals.indexOf(String(a));
    return out;
  }
  if (r.model && h.encoding && h.encoding.symbols) {
    for (const l of r.model) {
      if (l <= 0) continue;
      const s = h.encoding.symbols[l - 1] || '', k = s.lastIndexOf('_');
      if (k > 0 && idx.has(s.slice(0, k))) out[idx.get(s.slice(0, k))] = vals.indexOf(s.slice(k + 1));
    }
    return out;
  }
  return null;
}

const plural = (k, one, many) => (k === 1 ? one : many);

// what the three puzzles share: the cells and the pad, the selection, the
// hover, the frames of a refusal, the move that undoes the one before, the
// comparison of the end with the solver lanes
class GridPlay {
  constructor(box, inst, ctx, pad) {
    this.inst = inst; this.ctx = ctx; this.nv = inst.vertices.length;
    this.view = new PlayGridView(box, inst, pad);
    this.view.frameAll();
    this.pos = [];
    for (const [r, c, what] of inst.cells) if (typeof what === 'number' && !this.pos[what]) this.pos[what] = [r, c];
  }
  cellName(v) { const [r, c] = this.pos[v]; return `r${r + 1} c${c + 1}`; }
  reset() { this.x = new Array(this.nv).fill(-1); this.sel = null; this.over = null; this.err = []; this.hot = new Set(); this.prevKey = null; this.show(); }
  targets() { return [...this.view.hits, ...this.view.tiles.map(t => t.m)]; }
  actionAt(p) {
    if (p.cell !== undefined) return { v: p.cell };
    if (p.pad !== undefined) return this.padAction(this.view.pad.items[p.pad].play);
    return null;
  }
  // a tile: a value for the selected cell (j -1: clear it)
  padAction(p) { return this.sel === null ? { j: p.j } : { v: this.sel, j: p.j }; }
  tileOf(a) { return this.view.pad.items.findIndex(it => Object.keys(it.play).every(k => it.play[k] === a[k])); }
  where(a) {
    const k = a.j !== undefined || a.w !== undefined || a.clear ? this.tileOf(a) : -1;
    if (k >= 0) { const t = this.view.tiles[k]; return new THREE.Vector3(t.x, t.y, 0.03); }
    const it = this.view.vars[a.v][0];
    return new THREE.Vector3(it.x, it.y, it.target + 0.005);
  }
  act(a) {
    const before = this.x.join(',');
    this.err = []; this.hot = new Set();
    const r = this.move(a);
    if (!r) { this.show(); return null; }
    if (r.mistake && !r.moved) {
      for (const f of this.err) this.hot.add(this.inst.vertices[f.v]);
      r.say = [`Refused: ${r.say[0]} (red).`, `Rifiutata: ${r.say[1]} (in rosso).`];
    }
    if (r.moved) {
      if (this.x.join(',') === this.prevKey && !r.solved) {
        r.mistake = true;
        r.say = [r.say[0] + ' This undoes your previous move.', r.say[1] + ' Questo annulla la tua mossa precedente.'];
      }
      this.prevKey = before;
      if (r.solved) r.say = this.verdict(r.say);
    }
    this.show();
    return r;
  }
  refuse(cells, say) { for (const v of cells) this.err.push({ v, j: -1, kind: 'hot' }); return { mistake: true, say }; }
  hover(a) { this.over = a; this.show(); }
  // the end: the board compared with the solutions of the solver lanes
  verdict(say) {
    const same = [], other = [], keep = this.compared();
    for (const L of this.ctx.results()) {
      const s = solutionOf(L, this.inst);
      if (s && keep.every(i => s[i] === this.x[i])) same.push(L.name);
      else if (s) other.push(L.name);
    }
    const head = [`Solved: ${this.solvedText[0]}.`, `Risolto: ${this.solvedText[1]}.`];
    if (!same.length) return [`${head[0]} The solver lanes found another solution.`, `${head[1]} Le corsie dei solutori hanno trovato un'altra soluzione.`];
    const said = [`${head[0]} It is the solution found by ${names(same, 'and')}`, `${head[1]} È la soluzione trovata da ${names(same, 'e')}`];
    return other.length
      ? [`${said[0]}; ${names(other, 'and')} found another one.`, `${said[1]}; ${names(other, 'e')} ne ${plural(other.length, 'ha', 'hanno')} trovata un'altra.`]
      : [`${said[0]}.`, `${said[1]}.`];
  }
  compared() { return this.inst.vertices.map((_, i) => i); }
  // the pegs of a cell: the values that the hint leaves to it, or none
  mask(i) {
    if (!this.opt || !this.opt.hint || this.x[i] >= 0) return 0;
    let m = 0;
    for (let j = 0; j < this.inst.colours.length; j++) if (this.allowed(i, j)) m |= 1 << j;
    return m;
  }
  show() {
    const focus = [...this.err], pf = [], a = this.over;
    if (this.sel !== null) {
      for (const v of this.around(this.sel)) if (v !== this.sel) focus.push({ v, j: -1, kind: 'undo' });
      focus.push({ v: this.sel, j: -1, kind: 'decide' });
    }
    if (a) {
      if (a.v !== undefined && a.j === undefined) focus.push({ v: a.v, j: -1, kind: 'decide' });
      const k = a.j !== undefined || a.w !== undefined || a.clear ? this.tileOf(a) : -1;
      if (k >= 0) pf.push({ v: k, kind: 'decide' });
    }
    const vals = this.values();
    this.view.show(this.inst.vertices.map((id, i) => ({ id, colour: vals[i], mask: this.mask(i) })), this.hot, focus);
    this.view.showPad(pf, this.dimmed());
  }
  values() { return this.x; }
  dimmed() { return new Set(); }
  // the cells framed in grey around the selected one (its runs, its word)
  around() { return []; }
  // the arrows: the nearest cell in that direction, past blocks and clues
  step(e) {
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!d) return null;
    const live = this.pos.map((p, v) => v).filter(v => this.selectable(v));
    if (this.sel === null) return live[0];
    const [r0, c0] = this.pos[this.sel];
    let best = null, bd = Infinity;
    for (const v of live) {
      const [r, c] = this.pos[v], dr = r - r0, dc = c - c0, along = dr * d[0] + dc * d[1], across = Math.abs(dr * d[1]) + Math.abs(dc * d[0]);
      if (along <= 0) continue;
      const dist = along + 3 * across;
      if (dist < bd) { bd = dist; best = v; }
    }
    return best === null ? this.sel : best;
  }
  selectable() { return true; }
}

// ------------------------------------------------------------------ Kakuro

export class KakuroPlay extends GridPlay {
  constructor(box, inst, ctx) {
    const items = inst.colours.map((d, j) => ({ play: { j }, text: d })).concat([{ play: { j: -1 }, text: '×' }]);
    const s = Math.min(0.15, 1.7 / items.length);
    super(box, inst, ctx, { items, cols: items.length, tw: s, th: s });
    const at = new Map();
    for (const [r, c, what] of inst.cells) if (typeof what === 'number') at.set(r + ',' + c, what);
    // the runs: the cells right of a clue across, under it down
    this.runs = [];
    for (const [r, c, what] of inst.cells) {
      if (!Array.isArray(what)) continue;
      const [down, right] = what;
      for (const [sum, dr, dc, dir] of [[right, 0, 1, 'across'], [down, 1, 0, 'down']]) {
        if (sum === null) continue;
        const vars = [];
        for (let i = r + dr, j = c + dc; at.has(i + ',' + j); i += dr, j += dc) vars.push(at.get(i + ',' + j));
        if (vars.length) this.runs.push({ sum, vars, dir, r, c });
      }
    }
    this.runsOf = inst.vertices.map((_, v) => this.runs.filter(R => R.vars.includes(v)));
    this.help = ['A click on a white cell selects it and a click on a digit under the grid writes it there (× clears it); the arrow keys move the selection and the digits write.',
      'Un clic su una cella bianca la seleziona e un clic su una cifra sotto la griglia ve la scrive (× la cancella); le frecce spostano la selezione e i tasti numerici scrivono.'];
    this.options = [{ id: 'hint', en: 'show the digits each cell may still take', it: 'mostra le cifre che ogni cella può ancora prendere', on: true }];
    this.solvedText = ['every run adds up to its clue with no digit repeated', 'ogni sequenza dà la sua somma senza cifre ripetute'];
  }
  runName(R) {
    return R.dir === 'across' ? [`the across run of sum ${R.sum} in row ${R.r + 1}`, `la sequenza orizzontale di somma ${R.sum} nella riga ${R.r + 1}`]
      : [`the down run of sum ${R.sum} in column ${R.c + 1}`, `la sequenza verticale di somma ${R.sum} nella colonna ${R.c + 1}`];
  }
  counters() { return [['cells', 'celle', `${this.x.filter(j => j >= 0).length} / ${this.nv}`]]; }
  around(v) { return this.runsOf[v].flatMap(R => R.vars); }
  allowed(v, j) {
    return this.runsOf[v].every(R => R.vars.every(w => w === v || this.x[w] !== j)
      && R.vars.reduce((s, w) => s + (w !== v && this.x[w] >= 0 ? this.x[w] + 1 : 0), 0) + j + 1 <= R.sum);
  }
  move(a) {
    const { x } = this;
    if (a.j === undefined) {
      this.sel = a.v;
      const runs = this.runsOf[a.v].map(R => [`${R.dir} ${R.sum} over ${R.vars.length} cells`, `${R.dir === 'across' ? 'orizzontale' : 'verticale'} ${R.sum} su ${R.vars.length} celle`]);
      return { say: [`${this.cellName(a.v)} selected (${runs.map(r => r[0]).join(', ')}): click a digit or type it.`,
        `${this.cellName(a.v)} selezionata (${runs.map(r => r[1]).join(', ')}): fai clic su una cifra o digitala.`] };
    }
    if (a.v === undefined) return { say: ['Select a cell first, then its digit.', 'Seleziona prima una cella, poi la sua cifra.'] };
    const v = a.v, j = a.j, cn = this.cellName(v);
    this.sel = v;
    if (j < 0) {
      if (x[v] < 0) return { say: [`${cn} is already empty.`, `${cn} è già vuota.`] };
      x[v] = -1;
      return { moved: true, say: [`You clear ${cn}.`, `Cancelli ${cn}.`] };
    }
    const d = j + 1;
    if (x[v] === j) return { say: [`${cn} already holds ${d}.`, `${cn} contiene già ${d}.`] };
    for (const R of this.runsOf[v]) {
      const w = R.vars.find(u => u !== v && x[u] === j);
      if (w !== undefined) {
        const n = this.runName(R);
        return this.refuse([v, w], [`${d} is already in ${this.cellName(w)}, in ${n[0]}`, `${d} c'è già in ${this.cellName(w)}, nel${n[1]}`]);
      }
    }
    for (const R of this.runsOf[v]) {
      const s = R.vars.reduce((t, u) => t + (u === v ? d : x[u] >= 0 ? x[u] + 1 : 0), 0);
      const full = R.vars.every(u => u === v || x[u] >= 0), n = this.runName(R);
      if (s > R.sum) return this.refuse([v, ...R.vars], [`with ${d} in ${cn}, ${n[0]} would add up to ${s}, more than ${R.sum}`, `con ${d} in ${cn}, ${n[1]} darebbe ${s}, più di ${R.sum}`]);
      if (full && s !== R.sum) return this.refuse([v, ...R.vars], [`with ${d} in ${cn}, ${n[0]} would be full and add up to ${s}, not ${R.sum}`, `con ${d} in ${cn}, ${n[1]} sarebbe piena e darebbe ${s}, non ${R.sum}`]);
    }
    x[v] = j;
    const done = this.runsOf[v].filter(R => R.vars.every(u => x[u] >= 0)).map(R => this.runName(R));
    const k = x.filter(i => i >= 0).length;
    const say = [`${d} in ${cn}: ${k} of ${this.nv} cells filled.`, `${d} in ${cn}: ${k} ${plural(k, 'cella piena', 'celle piene')} su ${this.nv}.`];
    if (done.length) {
      const cap = s => s[0].toUpperCase() + s.slice(1);
      say[0] += ` ${cap(names(done.map(n => n[0]), 'and'))} ${plural(done.length, 'is', 'are')} complete.`;
      say[1] += ` ${cap(names(done.map(n => n[1]), 'e'))} ${plural(done.length, 'è completa', 'sono complete')}.`;
    }
    return { moved: true, solved: k === this.nv, say };
  }
  key(e) {
    const s = this.step(e);
    if (s !== null && s !== undefined) { this.sel = s; this.over = null; this.show(); return true; }
    if (/^[1-9]$/.test(e.key)) return this.sel === null ? { j: +e.key - 1 } : { v: this.sel, j: +e.key - 1 };
    if (['0', 'Backspace', 'Delete'].includes(e.key)) return this.sel === null ? null : { v: this.sel, j: -1 };
    return null;
  }
}

// ------------------------------------------------------- cryptarithmetic

export class CryptoPlay extends GridPlay {
  constructor(box, inst, ctx) {
    const items = inst.colours.map((d, j) => ({ play: { j }, text: d })).concat([{ play: { j: -1 }, text: '×' }]);
    const s = Math.min(0.15, 1.7 / items.length);
    super(box, inst, ctx, { items, cols: items.length, tw: s, th: s });
    const V = inst.vertices, words = inst.words, idx = new Map(V.map((v, i) => [v, i]));
    this.isCarry = V.map(v => /^C\d+$/.test(v));
    this.letters = V.map((v, i) => i).filter(i => !this.isCarry[i]);
    this.words = words;
    this.width = Math.max(...words.map(w => w.length));
    this.carryInto = [];
    V.forEach((v, i) => { if (this.isCarry[i]) this.carryInto[+v.slice(1)] = i; });
    // the columns from the right: the letters added and the letter of the sum
    this.cols = [];
    for (let i = 0; i < this.width; i++) {
      const at = w => (w.length > i ? idx.get(w[w.length - 1 - i]) : -1);
      this.cols.push({ adds: words.slice(0, -1).map(at).filter(v => v >= 0), res: at(words[words.length - 1]) });
    }
    this.lead = new Map();
    for (const w of words) if (w.length > 1 && !this.lead.has(idx.get(w[0]))) this.lead.set(idx.get(w[0]), w);
    this.help = ['A click on a letter selects it and a click on a digit under the sum gives it that digit (× takes it back); a letter key selects that letter, the arrows the next one, and the digits write.',
      'Un clic su una lettera la seleziona e un clic su una cifra sotto la somma le dà quella cifra (× la ritira); il tasto di una lettera seleziona quella lettera, le frecce la successiva, e i tasti numerici scrivono.'];
    this.options = [{ id: 'hint', en: 'show the digits still free for each letter', it: 'mostra le cifre ancora libere per ogni lettera', on: true }];
  }
  get solvedText() {
    const w = this.words, sum = `${w.slice(0, -1).map(x => this.number(x)).join(' + ')} = ${this.number(w[w.length - 1])}`;
    return [sum, sum];
  }
  number(w) { return [...w].map(ch => this.x[this.inst.vertices.indexOf(ch)]).join(''); }
  selectable(v) { return !this.isCarry[v]; }
  counters() {
    const c = this.carries(this.x);
    return [['letters', 'lettere', `${this.letters.filter(i => this.x[i] >= 0).length} / ${this.letters.length}`],
      ['columns', 'colonne', `${c.ok} / ${this.width}`]];
  }
  around(v) { return this.cols.filter(C => C.adds.includes(v) || C.res === v).flatMap(C => [...C.adds, C.res]); }
  allowed(v, j) { return !this.isCarry[v] && !this.letters.some(u => u !== v && this.x[u] === j) && !(j === 0 && this.lead.has(v)); }
  // the carries that the digits set so far determine, column by column from
  // the right, and the first column whose sum fails
  carries(x) {
    const cin = [0], out = { cin, ok: 0, fail: null };
    for (let i = 0; i < this.width; i++) {
      const C = this.cols[i], set = [...C.adds, C.res].every(v => x[v] >= 0);
      if (!set) { cin[i + 1] = null; continue; }
      const s = C.adds.reduce((t, v) => t + x[v], 0), last = i === this.width - 1;
      if (cin[i] !== null) {
        const tot = s + cin[i];
        if (tot % 10 !== x[C.res] || (last && tot >= 10)) { if (!out.fail) out.fail = { i, s, c: cin[i], tot }; cin[i + 1] = null; continue; }
        cin[i + 1] = Math.floor(tot / 10); out.ok++;
      } else {
        if (![0, 1].some(c => (s + c) % 10 === x[C.res] && !(last && s + c >= 10)) && !out.fail) out.fail = { i, s, c: null };
        cin[i + 1] = null;
      }
    }
    return out;
  }
  values() {
    const c = this.carries(this.x).cin;
    return this.x.map((j, v) => (this.isCarry[v] ? (c[+this.inst.vertices[v].slice(1)] ?? -1) : j));
  }
  compared() { return this.letters; }
  colName(C) {
    const V = this.inst.vertices, l = C.adds.map(v => V[v]).join(' + ');
    return l ? `${l} = ${V[C.res]}` : V[C.res];
  }
  move(a) {
    const { x } = this, V = this.inst.vertices;
    if (a.j === undefined) {
      if (this.isCarry[a.v]) return { say: ['The carries follow from the columns on their right: give digits to the letters.', 'I riporti seguono dalle colonne alla loro destra: dai le cifre alle lettere.'] };
      this.sel = a.v;
      return { say: [`${V[a.v]} selected: click a digit or type it.`, `${V[a.v]} selezionata: fai clic su una cifra o digitala.`] };
    }
    if (a.v === undefined) return { say: ['Select a letter first, then its digit.', 'Seleziona prima una lettera, poi la sua cifra.'] };
    const v = a.v, j = a.j, L = V[v];
    this.sel = v;
    if (j < 0) {
      if (x[v] < 0) return { say: [`${L} has no digit yet.`, `${L} non ha ancora una cifra.`] };
      x[v] = -1;
      return { moved: true, say: [`You take back the digit of ${L}.`, `Ritiri la cifra di ${L}.`] };
    }
    if (x[v] === j) return { say: [`${L} is already ${j}.`, `${L} vale già ${j}.`] };
    const u = this.letters.find(w => w !== v && x[w] === j);
    if (u !== undefined) return this.refuse([v, u], [`${j} is already given to ${V[u]}`, `${j} è già data a ${V[u]}`]);
    if (j === 0 && this.lead.has(v)) {
      const w = this.lead.get(v);
      return this.refuse([v], [`${L} begins ${w}, and a number does not begin with 0`, `${L} è la prima lettera di ${w}, e un numero non comincia con 0`]);
    }
    const before = x[v];
    x[v] = j;
    const c = this.carries(x);
    if (c.fail) {
      x[v] = before;
      const C = this.cols[c.fail.i], f = c.fail, cells = [...C.adds, C.res], name = this.colName(C);
      const digits = C.adds.map(w => (w === v ? j : x[w]));
      if (f.c === null) {
        return this.refuse([v, ...cells], [`in the column ${name}, ${digits.join(' + ') || '0'} plus a carry of 0 or 1 never ends in ${V[C.res]} = ${C.res === v ? j : x[C.res]}`,
          `nella colonna ${name}, ${digits.join(' + ') || '0'} più un riporto di 0 o 1 non finisce mai con ${V[C.res]} = ${C.res === v ? j : x[C.res]}`]);
      }
      const expr = [...digits, ...(f.c ? [`${f.c} carried`] : [])].join(' + ') || '0', exprIt = [...digits, ...(f.c ? [`${f.c} di riporto`] : [])].join(' + ') || '0';
      const r = C.res === v ? j : x[C.res];
      if (f.tot % 10 === r) return this.refuse([v, ...cells], [`in the column ${name}, ${expr} = ${f.tot} would carry beyond the leftmost column`, `nella colonna ${name}, ${exprIt} = ${f.tot} darebbe un riporto oltre la prima colonna`]);
      return this.refuse([v, ...cells], [`in the column ${name}, ${expr} = ${f.tot}, which ends in ${f.tot % 10} and not in ${V[C.res]} = ${r}`,
        `nella colonna ${name}, ${exprIt} = ${f.tot}, che finisce con ${f.tot % 10} e non con ${V[C.res]} = ${r}`]);
    }
    const k = this.letters.filter(w => x[w] >= 0).length, n = this.letters.length;
    const say = [`${L} = ${j}: ${k} of ${n} letters set, ${c.ok} of ${this.width} ${plural(c.ok, 'column adds', 'columns add')} up.`, `${L} = ${j}: ${k} ${plural(k, 'lettera', 'lettere')} su ${n}, ${c.ok} ${plural(c.ok, 'colonna', 'colonne')} su ${this.width} ${plural(c.ok, 'torna', 'tornano')}.`];
    return { moved: true, solved: k === n && c.ok === this.width, say };
  }
  key(e) {
    const V = this.inst.vertices, up = e.key.length === 1 ? e.key.toUpperCase() : '';
    const li = this.letters.find(v => V[v] === up);
    if (li !== undefined) { this.sel = li; this.over = null; this.show(); return { v: li }; }
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (d) {
      const L = this.letters, k = this.sel === null ? (d > 0 ? -1 : 0) : L.indexOf(this.sel);
      this.sel = L[(k + d + L.length) % L.length]; this.over = null; this.show(); return true;
    }
    if (/^[0-9]$/.test(e.key)) return this.sel === null ? { j: +e.key } : { v: this.sel, j: +e.key };
    if (['Backspace', 'Delete'].includes(e.key)) return this.sel === null ? null : { v: this.sel, j: -1 };
    return null;
  }
}

// ------------------------------------------------------------- crossword

export class CrosswordPlay extends GridPlay {
  constructor(box, inst, ctx) {
    const list = (inst.words || WORDS[inst.id] || []).map(w => w.toLowerCase()).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    const items = list.map((w, k) => ({ play: { w: k }, text: w.toUpperCase() })).concat([{ play: { clear: true }, text: '×' }]);
    const cols = 5;
    super(box, inst, ctx, { items, cols, tw: 1.7 / cols, th: 0.12 });
    this.list = list;
    this.wordSet = new Set(list);
    const at = new Map();
    for (const [r, c, what] of inst.cells) if (typeof what === 'number') at.set(r + ',' + c, what);
    // the slots: the runs of two cells or more, across and down
    this.slots = [];
    for (const [dir, dr, dc] of [['across', 0, 1], ['down', 1, 0]]) {
      for (const [r, c, what] of inst.cells) {
        if (typeof what !== 'number' || at.has((r - dr) + ',' + (c - dc))) continue;
        const vars = [];
        for (let i = r, j = c; at.has(i + ',' + j); i += dr, j += dc) vars.push(at.get(i + ',' + j));
        if (vars.length > 1) this.slots.push({ dir, vars, r, c });
      }
    }
    this.slotOf = inst.vertices.map((_, v) => ({ across: this.slots.find(S => S.dir === 'across' && S.vars.includes(v)), down: this.slots.find(S => S.dir === 'down' && S.vars.includes(v)) }));
    this.help = ['A click on a cell selects its word (a second click turns it across or down) and a click on a word under the grid writes it there (× clears it); letters can also be typed, and the arrow keys move.',
      'Un clic su una cella seleziona la sua parola (un secondo clic la gira in orizzontale o in verticale) e un clic su una parola sotto la griglia ve la scrive (× la cancella); si possono anche digitare le lettere, e le frecce spostano.'];
    this.options = [{ id: 'hint', en: 'dim the words that do not fit the selected one', it: 'attenua le parole che non entrano in quella selezionata', on: true }];
    this.solvedText = ['every word of the grid is in the list', 'ogni parola della griglia è nell\'elenco'];
  }
  reset() { this.dir = 'across'; super.reset(); }
  padAction(p) { return { ...p }; }
  slot() { if (this.sel === null) return null; const s = this.slotOf[this.sel]; return s[this.dir] || s.across || s.down; }
  slotName(S) {
    return S.dir === 'across' ? [`the across word of row ${S.r + 1}`, `la parola orizzontale della riga ${S.r + 1}`]
      : [`the down word of column ${S.c + 1}`, `la parola verticale della colonna ${S.c + 1}`];
  }
  read(S, x = this.x) { return S.vars.map(v => (x[v] >= 0 ? this.inst.colours[x[v]].toUpperCase() : '·')).join(''); }
  full(S, x = this.x) { return S.vars.every(v => x[v] >= 0); }
  counters() {
    return [['letters', 'lettere', `${this.x.filter(j => j >= 0).length} / ${this.nv}`],
      ['words', 'parole', `${this.slots.filter(S => this.full(S)).length} / ${this.slots.length}`]];
  }
  around() { const S = this.slot(); return S ? S.vars : []; }
  allowed() { return false; }
  fits(w, S) { return w.length === S.vars.length && S.vars.every((v, i) => this.x[v] < 0 || this.inst.colours[this.x[v]] === w[i]); }
  dimmed() {
    const S = this.slot(), out = new Set();
    if (S && this.opt && this.opt.hint) this.list.forEach((w, k) => { if (!this.fits(w, S)) out.add(k); });
    return out;
  }
  where(a) {
    if (a.w !== undefined || a.clear) { const t = this.view.tiles[this.tileOf(a)]; return new THREE.Vector3(t.x, t.y, 0.03); }
    return super.where(a);
  }
  // the crossing slots of the cells of S that would read no word of the list
  broken(cells, x) {
    for (const v of cells) for (const S of [this.slotOf[v].across, this.slotOf[v].down]) {
      if (S && this.full(S, x) && !this.wordSet.has(S.vars.map(u => this.inst.colours[x[u]]).join(''))) return S;
    }
    return null;
  }
  move(a) {
    const { x } = this, col = this.inst.colours;
    if (a.v !== undefined && a.j === undefined) {
      const s = this.slotOf[a.v];
      if (this.sel === a.v && s.across && s.down) this.dir = this.dir === 'across' ? 'down' : 'across';
      else if (!s[this.dir]) this.dir = s.across ? 'across' : 'down';
      this.sel = a.v;
      const S = this.slot(), n = this.slotName(S);
      return { say: [`Selected ${n[0]}, of ${S.vars.length} letters: ${this.read(S)}.`,
        `Selezionata ${n[1]}, di ${S.vars.length} lettere: ${this.read(S)}.`] };
    }
    const S = this.slot();
    if (!S) return { say: ['Select a cell first, then a word or a letter.', 'Seleziona prima una cella, poi una parola o una lettera.'] };
    const n = this.slotName(S);
    if (a.clear) {
      const keep = v => [this.slotOf[v].across, this.slotOf[v].down].some(T => T && T !== S && this.full(T));
      const gone = S.vars.filter(v => x[v] >= 0 && !keep(v));
      if (!gone.length) return { say: [`Nothing to clear in ${n[0]}: its letters belong to complete crossing words.`, `Niente da cancellare nel${n[1]}: le sue lettere appartengono a parole incrociate complete.`] };
      gone.forEach(v => { x[v] = -1; });
      return { moved: true, say: [`You clear ${n[0]}: ${this.read(S)}.`, `Cancelli ${n[1]}: ${this.read(S)}.`] };
    }
    if (a.w !== undefined) {
      const w = this.list[a.w], W = w.toUpperCase();
      if (w.length !== S.vars.length) return this.refuse(S.vars, [`${W} has ${w.length} letters, and ${n[0]} has ${S.vars.length}`, `${W} ha ${w.length} lettere, e ${n[1]} ne ha ${S.vars.length}`]);
      for (let i = 0; i < w.length; i++) {
        const v = S.vars[i], T = S.dir === 'across' ? this.slotOf[v].down : this.slotOf[v].across;
        if (T && x[v] >= 0 && col[x[v]] !== w[i]) {
          const m = this.slotName(T);
          return this.refuse([v, ...T.vars], [`${W} would put ${w[i].toUpperCase()} in ${this.cellName(v)}, where ${m[0]} has ${col[x[v]].toUpperCase()}`,
            `${W} metterebbe ${w[i].toUpperCase()} in ${this.cellName(v)}, dove ${m[1]} ha ${col[x[v]].toUpperCase()}`]);
        }
      }
      const y = x.slice();
      S.vars.forEach((v, i) => { y[v] = col.indexOf(w[i]); });
      const T = this.broken(S.vars, y);
      if (T) {
        const m = this.slotName(T);
        return this.refuse([...S.vars, ...T.vars], [`with ${W}, ${m[0]} would read ${this.read(T, y)}, which is not in the list`, `con ${W}, ${m[1]} diventerebbe ${this.read(T, y)}, che non è nell'elenco`]);
      }
      if (S.vars.every((v, i) => col[x[v]] === w[i])) return { say: [`${n[0][0].toUpperCase() + n[0].slice(1)} already reads ${W}.`, `${n[1][0].toUpperCase() + n[1].slice(1)} è già ${W}.`] };
      S.vars.forEach((v, i) => { x[v] = y[v]; });
      return this.placed([`${W} in ${n[0]}.`, `${W} nel${n[1]}.`]);
    }
    // a letter typed in the selected cell, then the next cell of the word
    const v = this.sel, cn = this.cellName(v);
    if (a.j < 0) {
      if (x[v] < 0) return { say: [`${cn} is already empty.`, `${cn} è già vuota.`] };
      x[v] = -1;
      return { moved: true, say: [`You clear ${cn}.`, `Cancelli ${cn}.`] };
    }
    const L = col[a.j].toUpperCase();
    if (x[v] === a.j) { this.advance(S); return { say: [`${cn} already holds ${L}.`, `${cn} contiene già ${L}.`] }; }
    const y = x.slice(); y[v] = a.j;
    const T = this.broken([v], y);
    if (T) {
      const m = this.slotName(T);
      return this.refuse([v, ...T.vars], [`with ${L} in ${cn}, ${m[0]} would read ${this.read(T, y)}, which is not in the list`, `con ${L} in ${cn}, ${m[1]} diventerebbe ${this.read(T, y)}, che non è nell'elenco`]);
    }
    x[v] = a.j;
    this.advance(S);
    return this.placed([`${L} in ${cn}.`, `${L} in ${cn}.`]);
  }
  advance(S) { const i = S.vars.indexOf(this.sel); if (i >= 0 && i < S.vars.length - 1) this.sel = S.vars[i + 1]; }
  placed(say) {
    const k = this.slots.filter(S => this.full(S)).length, m = this.slots.length;
    return { moved: true, solved: k === m && this.x.every(j => j >= 0),
      say: [`${say[0]} ${k} of ${m} ${plural(k, 'word', 'words')} complete.`, `${say[1]} ${k} ${plural(k, 'parola completa', 'parole complete')} su ${m}.`] };
  }
  key(e) {
    const d = { ArrowLeft: 'across', ArrowRight: 'across', ArrowUp: 'down', ArrowDown: 'down' }[e.key];
    if (d) {
      const s = this.step(e);
      if (s !== null && s !== undefined) { this.sel = s; if (this.slotOf[s][d]) this.dir = d; else this.dir = this.slotOf[s].across ? 'across' : 'down'; }
      this.over = null; this.show(); return true;
    }
    if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) return this.sel === null ? { j: this.inst.colours.indexOf(e.key.toLowerCase()) } : { v: this.sel, j: this.inst.colours.indexOf(e.key.toLowerCase()) };
    if (['Backspace', 'Delete'].includes(e.key)) return this.sel === null ? null : { v: this.sel, j: -1 };
    if ((e.key === 'Enter' || e.key === ' ') && this.sel !== null) return { v: this.sel };
    return null;
  }
}
