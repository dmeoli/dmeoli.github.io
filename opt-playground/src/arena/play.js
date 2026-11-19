// The lane "You" of the arena: the board of the instance shown in the other
// lanes, played by the reader instead of replayed from a trace, with its own
// counters (moves, mistakes), an event line that says what the last action
// did and, on a mistake, why it is one, and a button that starts over. It
// does not follow the timeline. A game plugs in as a class (one module per
// family of boards: play-cells.js, play-stacks.js) with this interface:
//
//   constructor(box, inst, ctx)  builds this.view, a view of the arena on box
//                                (it has .S, its stage3d), at the start of
//                                inst; ctx.results() gives the solver lanes
//                                as [{ name, result, header }]
//   help                         [en, it]: how to play, one sentence
//   counters()                   [[en, it, value], ...], shown after the
//                                moves and the mistakes
//   targets()                    the meshes a pointer may pick; each, or an
//                                ancestor, carries userData.play
//   actionAt(play, hit)          the action of a picked userData.play (hit:
//                                the intersection of three.js), or null
//   act(a)                       plays a and returns { moved, mistake,
//                                solved, say: [en, it] }
//   hover(a)                     shows what a would do (a null: nothing)
//   key(e)                       the action of a key (or true when the key
//                                only moved a cursor, or null)
//   where(a)                     the point (or a list of points) of the
//                                scene where a is picked, for
//                                the tests that click on it
//   reset()                      back to the start
//   moveName                     optional: [en, it], the name of the moves
//   options                      optional: [{ id, en, it, on }], check boxes
//                                shown in the panel, read by the game as
//                                this.opt[id]
//   panelButtons, button(id)    optional: [{ id, en, it }], buttons shown
//                                next to Reset, whose click plays the action
//                                button(id) (e.g. closing the knapsack)
//
// Undo, Hint and Replay (the buttons after Reset) need, all optional:
//
//   snap(), restore(s)           a copy of the state of the board, and the
//                                board back to it (tweening); with them the
//                                lane keeps history, [{ snap, label }] the
//                                moves played, and undo() pops the last one
//                                (the mistakes stay counted)
//   label(s0, s1)                [en, it]: the short name of the move from
//                                the state s0 to the state s1
//   hint(o)                      frames in gold a right move without playing
//                                it, o = { states, labels, again } (the
//                                states from the start to now, again true
//                                when the hint before said that the reader
//                                had left the solutions of the lanes); it
//                                returns { say, shown } or { say, off } or
//                                { say, left: k } (the move k left them)
//   unhint()                     takes the gold frame of the hint away
//   replay(states, labels)       { by: [en, it], rows: [[en, it] or null],
//                                first: k, note: [en, it] }: the moves of
//                                the best lane next to those of the reader,
//                                and the first move k (1-based, 0: none)
//                                where they differ
//   undo(), hint()               a game may replace those of the lane
//   keepsBackspace               true when Backspace is a key of the game,
//                                which then leaves undo to Ctrl+Z
//
// The page solves nothing here either: a game checks the rules of its moves
// and compares the end with the results the traces recorded.

import * as THREE from 'three';
import { t, bi } from '../i18n.js';

// a list in words: "a, b and c", with the conjunction of the language
export const names = (xs, and) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ` ${and} ` + xs[xs.length - 1]);

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class PlayLane {
  constructor(art, Game, inst, ctx) {
    this.art = art;
    art.classList.add('play');
    const board = art.querySelector('.board');
    this.game = new Game(board, inst, ctx);
    this.game.opt = {};
    const opts = this.game.options || [];
    for (const o of opts) this.game.opt[o.id] = o.on;
    const btns = this.game.panelButtons || [], g = this.game;
    this.canUndo = !!(g.undo || (g.snap && g.restore));
    const extra = [this.canUndo ? `<button type="button" data-do="undo" title="Ctrl+Z">${bi('Undo', 'Annulla')}</button>` : '',
      g.hint ? `<button type="button" data-do="hint">${bi('Hint', 'Suggerimento')}</button>` : '',
      g.replay && g.snap ? `<button type="button" data-do="replay"></button>` : ''].join('');
    art.querySelector('.panel').innerHTML = `<p class="howto"></p><div class="playbar"><button type="button" class="preset">${bi('Reset', 'Ricomincia')}</button>${extra}${
      btns.map(b => `<button type="button" data-btn="${b.id}">${bi(b.en, b.it)}</button>`).join('')}${
      opts.map(o => `<label><input type="checkbox" data-opt="${o.id}"${o.on ? ' checked' : ''}> ${bi(o.en, o.it)}</label>`).join('')}</div>${
      g.replay && g.snap ? '<div class="replay" hidden><p class="rcap"></p><ol class="rlist"></ol></div>' : ''}`;
    art.querySelector('.preset').onclick = () => this.reset();
    art.querySelectorAll('[data-btn]').forEach(b => b.onclick = () => this.act(this.game.button(b.dataset.btn)));
    art.querySelectorAll('[data-opt]').forEach(b => b.onchange = () => { this.game.opt[b.dataset.opt] = b.checked; this.game.hover(null); });
    const on = (k, f) => { const b = art.querySelector(`[data-do="${k}"]`); if (b) b.onclick = f; };
    on('undo', () => this.undo()); on('hint', () => this.hint());
    on('replay', () => (this.playing ? this.stopReplay() : this.startReplay()));
    this.wire(this.game.view.S);
    this.reset();
  }
  reset() {
    this.stopReplay();
    this.moves = 0; this.mistakes = 0; this.hints = 0; this.solved = false;
    this.history = []; this.offered = -1; this.table = null;
    this.game.reset();
    if (this.game.unhint) this.game.unhint();
    this.say = ['Your board, at the start of the instance.', 'La tua tavola, all\'inizio dell\'istanza.'];
    this.kind = '';
    this.texts();
  }
  // an action, from a click, a key or a test; during a replay the first
  // action only stops it
  act(a) {
    if (!a) return null;
    if (this.playing) { this.stopReplay(); return null; }
    const g = this.game, s0 = g.snap ? g.snap() : null;
    const r = g.act(a);
    if (!r) return null;
    // the gold of a hint stays until a move is played
    if (r.moved && g.unhint) g.unhint();
    if (r.moved) this.moves++;
    if (r.mistake) this.mistakes++;
    if (r.moved && s0) this.history.push({ snap: s0, label: g.label ? g.label(s0, g.snap()) : null });
    if (r.moved || r.solved) this.table = null;
    const was = this.solved;
    this.solved = !!r.solved;
    this.say = r.say;
    this.kind = r.mistake ? 'conflict' : r.solved ? 'solved' : r.moved ? '' : 'note';
    this.texts();
    // at the end, the replay of the moves next to the best lane
    if (this.solved && !was && g.replay && g.snap && this.history.length && (g.replay(this.states(), []) || {}).by) {
      clearTimeout(this.auto);
      this.auto = setTimeout(() => { if (this.solved && !this.playing) this.startReplay(); }, 1800);
    }
    return r;
  }
  // the last move taken back, the board tweening to the state before it;
  // the mistakes stay counted
  undo() {
    const g = this.game;
    if (this.playing) this.stopReplay();
    clearTimeout(this.auto);
    if (g.undo) return g.undo();
    const h = this.history.pop();
    if (g.unhint) g.unhint();
    if (!h) {
      this.say = ['There is no move to undo: the board is at the start.', 'Non c\'è nessuna mossa da annullare: la tavola è all\'inizio.'];
      this.kind = 'note'; this.texts();
      return null;
    }
    g.restore(h.snap);
    this.moves = Math.max(0, this.moves - 1); this.solved = false; this.table = null;
    const l = h.label || ['the last move', 'l\'ultima mossa'], m = this.mistakes;
    this.say = [`Undone: ${l[0]}. ${m === 1 ? 'The mistake stays' : `The ${m} mistakes stay`} counted.`,
      `Annullata: ${l[1]}. ${m === 1 ? 'L\'errore resta contato' : `Gli errori, ${m}, restano contati`}.`];
    if (!m) this.say = [`Undone: ${l[0]}.`, `Annullata: ${l[1]}.`];
    this.kind = 'note';
    this.texts();
    return h;
  }
  states() { return [...this.history.map(h => h.snap), this.game.snap()]; }
  // a right move framed in gold, not played; when the reader has left the
  // solutions of the lanes, a second press says where
  hint() {
    const g = this.game;
    if (!g.hint) return null;
    if (this.playing) this.stopReplay();
    if (g.unhint) g.unhint();
    const labels = this.history.map(h => h.label);
    const r = g.hint({ states: g.snap ? this.states() : [], labels, again: this.offered === this.history.length });
    if (!r) return null;
    if (r.shown) this.hints++;
    this.offered = r.off ? this.history.length : -1;
    this.say = r.say;
    this.kind = r.shown ? 'hint' : 'note';
    // where the reader left: the list of the moves, that move marked
    if (r.left && g.replay) this.showTable(r.left, t('Your moves; the red one left the solutions of the lanes.', 'Le tue mosse; quella in rosso è uscita dalle soluzioni delle corsie.'));
    this.texts();
    return r;
  }
  // the replay: the states of the reader shown one per second on the
  // board, the list of the moves beside those of the best lane, the first
  // move where they differ in red
  showTable(mark, cap) {
    const g = this.game, labels = this.history.map(h => h.label);
    const R = g.replay(this.states(), labels) || { rows: [], first: 0 };
    this.table = { R, labels, now: -1, cap, mark: mark || R.first };
    this.drawTable();
  }
  drawTable() {
    const box = this.art.querySelector('.replay');
    if (!box) return;
    const T = this.table;
    box.hidden = !T;
    if (!T) return;
    const { R, labels } = T, n = Math.max(labels.length, R.rows.length);
    const by = R.by ? t(...R.by) : t('no lane', 'nessuna corsia');
    let html = `<li class="rhead"><span>#</span><span>${esc(t('you', 'tu'))}</span><span>${esc(by)}</span></li>`;
    for (let k = 1; k <= n; k++) {
      const you = labels[k - 1], lane = R.rows[k - 1];
      const cls = [k === T.mark ? 'first' : '', k === T.now ? 'now' : ''].filter(Boolean).join(' ');
      html += `<li${cls ? ` class="${cls}"` : ''}><span>${k}</span><span>${you ? esc(t(...you)) : '–'}</span><span>${lane ? esc(t(...lane)) : '–'}</span></li>`;
    }
    const list = box.querySelector('.rlist');
    list.innerHTML = html;
    let cap = T.cap || (T.mark ? t(`Your move ${T.mark} (red) is the first that differs from ${by}.`, `La tua mossa ${T.mark} (in rosso) è la prima diversa da ${by}.`)
      : t(`Your moves are those of ${by}.`, `Le tue mosse sono quelle di ${by}.`));
    if (R.note) cap += ' ' + t(...R.note);
    if (T.step) cap = t(...T.step);
    box.querySelector('.rcap').textContent = cap;
    box.classList.toggle('differs', !!T.step && T.now === T.mark);
    // the row of the step in view, inside the list only (not the page)
    const cur = list.querySelector('li.now') || (T.now < 0 ? list.querySelector('li.first') : null);
    if (cur) list.scrollTop = Math.max(0, cur.offsetTop - list.offsetTop - list.clientHeight / 2);
  }
  startReplay() {
    const g = this.game;
    if (!g.replay || !g.snap || this.playing) return;
    clearTimeout(this.auto);
    if (g.unhint) g.unhint();
    const states = this.states();
    this.showTable(0);
    const T = this.table, n = states.length - 1, by = T.R.by ? T.R.by : ['no lane', 'nessuna corsia'];
    this.playing = { states, k: 0 };
    const step = () => {
      const P = this.playing;
      if (!P) return;
      const k = P.k;
      if (k > n) { this.stopReplay(); return; }
      g.restore(states[k]);
      T.now = k;
      const you = T.labels[k - 1], lane = T.R.rows[k - 1];
      T.step = k === 0 ? ['Replay: the start.', 'Rivedi: l\'inizio.']
        : [`Replay, move ${k} of ${n}: you ${you ? you[0] : '–'}; ${by[0]}: ${lane ? lane[0] : '–'}.${k === T.mark ? ' Here the moves first differ.' : ''}`,
          `Rivedi, mossa ${k} di ${n}: tu ${you ? you[1] : '–'}; ${by[1]}: ${lane ? lane[1] : '–'}.${k === T.mark ? ' Qui le mosse si separano la prima volta.' : ''}`];
      this.drawTable();
      P.k++;
      P.timer = setTimeout(step, k === T.mark ? 2200 : 1100);
    };
    this.setReplayButton();
    step();
  }
  stopReplay() {
    const P = this.playing;
    if (!P) return;
    clearTimeout(P.timer);
    this.playing = null;
    this.game.restore(P.states[P.states.length - 1]);
    if (this.table) { this.table.now = -1; this.table.step = null; this.drawTable(); }
    this.setReplayButton();
  }
  setReplayButton() {
    const b = this.art.querySelector('[data-do="replay"]');
    if (b) b.innerHTML = this.playing ? bi('Stop', 'Ferma') : bi('Replay', 'Rivedi');
  }
  texts() {
    const c = [[t(...(this.game.moveName || ['moves', 'mosse'])), this.moves], [t('mistakes', 'errori'), this.mistakes],
      ...(this.game.hint ? [[t('hints', 'suggerimenti'), this.hints]] : []),
      ...this.game.counters().map(([en, it, v]) => [t(en, it), v])];
    this.art.querySelector('.counters').innerHTML = c.map(([n, v]) => `<div><dt>${esc(n)}</dt><dd>${v}</dd></div>`).join('');
    this.art.querySelector('h3').textContent = t('You', 'Tu');
    this.art.querySelector('.where').textContent = t('your moves, on the same instance', 'le tue mosse, sulla stessa istanza');
    const ev = this.art.querySelector('.evline');
    ev.textContent = t(...this.say);
    this.art.classList.toggle('conflict', this.kind === 'conflict');
    this.art.classList.toggle('solved', this.kind === 'solved');
    this.art.classList.toggle('hinted', this.kind === 'hint');
    const more = [this.canUndo ? ['Undo (or Ctrl+Z' + (this.game.keepsBackspace ? '' : ', Backspace') + ') takes back the last move, but the mistakes stay counted.',
      'Annulla (o Ctrl+Z' + (this.game.keepsBackspace ? '' : ', Backspace') + ') ritira l\'ultima mossa, ma gli errori restano contati.'] : null,
    this.game.hint ? ['Hint frames in gold a right move, without playing it.', 'Suggerimento incornicia in oro una mossa giusta, senza giocarla.'] : null,
    this.game.replay && this.game.snap ? ['Replay shows your moves again beside those of the best lane.', 'Rivedi ripercorre le tue mosse accanto a quelle della corsia migliore.'] : null].filter(Boolean);
    this.art.querySelector('.howto').textContent = [t(...this.game.help), ...more.map(m => t(...m))].join(' ');
    this.setReplayButton();
    this.drawTable();
  }
  // the pointer: a click (a press and release that barely moves, so that a
  // drag still turns the board) plays the action under it, a mouse over the
  // board shows what it would do; the keys go to the game when the board has
  // the focus
  wire(S) {
    const cv = S.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    cv.tabIndex = 0;
    cv.setAttribute('aria-label', t('your board', 'la tua tavola'));
    const pick = this.pick = e => {
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      // the matrices as now, even if the board has not been drawn since
      S.scene.updateMatrixWorld(); S.camera.updateMatrixWorld();
      ray.setFromCamera(ndc, S.camera);
      for (const h of ray.intersectObjects(this.game.targets(), true)) {
        let o = h.object;
        while (o && o.userData.play === undefined) o = o.parent;
        if (o) { const a = this.game.actionAt(o.userData.play, h); if (a) return a; }
      }
      return null;
    };
    let down = null;
    cv.addEventListener('pointerdown', e => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
    cv.addEventListener('pointerup', e => {
      if (!down || !e.isPrimary) return;
      const far = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 700;
      down = null;
      if (far) return;
      this.act(pick(e));
      if (e.pointerType === 'mouse') this.game.hover(pick(e));
    });
    cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) this.game.hover(pick(e)); });
    cv.addEventListener('pointerleave', () => this.game.hover(null));
    cv.addEventListener('keydown', e => {
      // Ctrl+Z (Cmd+Z), and Backspace where the game does not use it, undo
      if (this.canUndo && (((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z'))
        || (e.key === 'Backspace' && !this.game.keepsBackspace && !e.ctrlKey && !e.metaKey && !e.altKey))) {
        e.preventDefault(); this.undo(); return;
      }
      const a = this.game.key(e);
      if (!a) return;
      e.preventDefault();
      if (a !== true) this.act(a);
    });
    cv.addEventListener('blur', () => this.game.hover(null));
    this.cv = cv;
  }
  // the client coordinates of an action, for the tests: the first point
  // that where(a) gives (one, or a list) whose pick is that action
  screenOf(a) {
    const r = this.cv.getBoundingClientRect(), same = b => b && Object.keys(a).every(k => a[k] === b[k]);
    this.game.view.S.camera.updateMatrixWorld();
    const pts = [].concat(this.game.where(a)).map(w => {
      const p = w.clone().project(this.game.view.S.camera);
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    });
    return pts.find(p => same(this.pick({ clientX: p.x, clientY: p.y }))) || pts[0];
  }
}

// ------------------------------------------------- hints and replays
// The hint and the replay of the searches, from the solution paths that the
// lanes recorded. A game g gives key(s) and pkey(p), the same string for a
// state of its own and for the state p of a path that are alike;
// step(s, p) frames in gold the move from s to p and names it, [en, it];
// pname(p0, p1, L, i) names the move i of the path of L; skip(header), if
// any, leaves out lanes whose optimum is not that of the reader.
export function lanePaths(ctx, skip = () => false) {
  const out = [];
  for (const L of ctx.results()) {
    const r = L.result;
    if (!r || r.status !== 'optimal' || !Array.isArray(r.path) || !r.path.length || typeof r.cost !== 'number' || skip(L.header)) continue;
    out.push({ by: L.name, path: r.path, moves: r.moves, cost: r.cost });
  }
  const c = Math.min(...out.map(L => L.cost));
  return out.filter(L => Math.abs(L.cost - c) < 1e-3);
}
const plural = (k, one, many) => (k === 1 ? one : many);
export function pathHint(g, o) {
  const P = lanePaths(g.ctx, g.skip);
  if (!P.length) return { say: ['No lane holds a solution path proved optimal, so there is no move to suggest.', 'Nessuna corsia ha un cammino di soluzione dimostrato ottimo, quindi non c\'è una mossa da suggerire.'] };
  const on = s => { const k = g.key(s); for (const L of P) { const i = L.path.findIndex(p => g.pkey(p) === k); if (i >= 0) return [L, i]; } return null; };
  const n = o.states.length - 1, cur = o.states[n], hit = on(cur);
  if (hit) {
    const [L, i] = hit, m = L.path.length - 1;
    if (i === m) return { say: ['You are at the goal: there is no move left to suggest.', 'Sei all\'obiettivo: non resta nessuna mossa da suggerire.'] };
    const st = g.step(cur, L.path[i + 1], L, i);
    return { shown: true, acts: st.acts, say: [`Hint (gold): ${st[0]}. It is move ${i + 1} of the ${m} of the optimal path of ${L.by}.`,
      `Suggerimento (in oro): ${st[1]}. È la mossa ${i + 1} delle ${m} del cammino ottimo di ${L.by}.`] };
  }
  if (!o.again) return { off: true, say: ['You have left the optimal paths that the lanes found, so none of their moves goes on from here. Press Hint again to see where you left them.',
    'Sei uscito dai cammini ottimi trovati dalle corsie, quindi da qui non prosegue nessuna loro mossa. Premi di nuovo Suggerimento per vedere dove ne sei uscito.'] };
  let k = n;
  while (k > 0 && !on(o.states[k])) k--;
  const l = o.labels[k] || ['?', '?'], u = n - k;
  return { left: k + 1, say: [`You left the optimal paths with your move ${k + 1} (${l[0]}, red in the list): undo ${u} ${plural(u, 'move', 'moves')} to be back on them.`,
    `Sei uscito dai cammini ottimi con la tua mossa ${k + 1} (${l[1]}, in rosso nella lista): annulla ${u} ${plural(u, 'mossa', 'mosse')} per tornarci.`] };
}
export function pathReplay(g, states) {
  const P = lanePaths(g.ctx, g.skip);
  if (!P.length) return { by: null, rows: [], first: 0, note: ['No lane holds a solution path proved optimal to compare with.', 'Nessuna corsia ha un cammino di soluzione dimostrato ottimo con cui confrontarle.'] };
  // the lane whose path the reader follows longest
  const pre = L => { let k = 0; while (k < states.length && k < L.path.length && g.key(states[k]) === g.pkey(L.path[k])) k++; return k; };
  const L = P.reduce((a, b) => (pre(b) > pre(a) ? b : a)), p = pre(L), n = states.length - 1;
  return { by: [L.by, L.by], rows: L.path.slice(1).map((q, i) => g.pname(L.path[i], q, L, i)), first: p <= n ? p : 0,
    note: [`Its path is optimal, ${L.path.length - 1} ${plural(L.path.length - 1, 'move', 'moves')}.`, `Il suo cammino è ottimo, di ${L.path.length - 1} ${plural(L.path.length - 1, 'mossa', 'mosse')}.`] };
}

// The hint and the replay of the CSPs. A game g gives vals(s), the value
// (an index, -1 for none) of each variable in its state s; sols(), the
// solutions of the lanes, [{ by, x }] with x as vals; vname(i, j), the name
// of variable i taking value j (j -1: cleared); forced(s), a value that the
// rules force, { set: [[i, j], ...], say }, or null; show(set, kind) frames
// the cells of set (gold 'decide' for a hint, red 'hot' for a value off the
// solutions); open(i), if any, the variables the reader sets; pick(S, i),
// if any, the set to suggest from solution S for the empty variable i.
export function cspLabel(g, s0, s1) { return cspNames(g, g.vals(s0), g.vals(s1)); }
function cspNames(g, a, b) {
  const ch = [];
  b.forEach((v, i) => { if (v !== a[i]) ch.push(g.vname(i, v)); });
  if (!ch.length) return ['nothing', 'niente'];
  const head = ch.slice(0, 3);
  return [head.map(c => c[0]).join(', ') + (ch.length > 3 ? '...' : ''), head.map(c => c[1]).join(', ') + (ch.length > 3 ? '...' : '')];
}
export function cspHint(g, o) {
  const s = o.states[o.states.length - 1], x = g.vals(s), sols = g.sols();
  const fit = sols.filter(S => x.every((v, i) => v < 0 || S.x[i] === v));
  const f = g.forced(s);
  if (f) {
    g.showHint(f.set, 'decide');
    const acts = g.actsFor ? g.actsFor(f.set) : null;
    const tail = !fit.length && sols.length ? [' Your board, though, no longer extends to a solution that the lanes found.', ' La tua tavola però non si estende più a una soluzione trovata dalle corsie.'] : ['', ''];
    return { shown: true, acts, say: [`Hint (gold): ${f.say[0]}.${tail[0]}`, `Suggerimento (in oro): ${f.say[1]}.${tail[1]}`] };
  }
  if (fit.length) {
    const S = fit[0], i = x.findIndex((v, k) => v < 0 && S.x[k] >= 0 && (!g.open || g.open(k)));
    if (i >= 0) {
      const set = g.pick ? g.pick(S, i) : [[i, S.x[i]]], k = x.filter((v, j) => v >= 0 && (!g.open || g.open(j))).length;
      g.showHint(set, 'decide');
      const nm = g.setName ? g.setName(set) : cspNames(g, x, x.map((v, j) => { const e = set.find(z => z[0] === j); return e ? e[1] : v; }));
      const agree = k ? [`, which agrees with all ${k} of your values`, `, che concorda con tutti i tuoi ${k} valori`] : ['', ''];
      return { shown: true, acts: g.actsFor ? g.actsFor(set) : null, say: [`Hint (gold): ${nm[0]}. No value is forced by the rules now; this is the one of the solution of ${S.by}${agree[0]}.`,
        `Suggerimento (in oro): ${nm[1]}. Ora le regole non forzano nessun valore; questo è quello della soluzione di ${S.by}${agree[1]}.`] };
    }
  }
  if (!sols.length) return { say: ['No value is forced by the rules now, and no lane holds a solution to take one from.', 'Ora le regole non forzano nessun valore, e nessuna corsia ha una soluzione da cui prenderne uno.'] };
  if (!o.again) return { off: true, say: ['Your board no longer extends to a solution that the lanes found, and no value is forced by the rules. Press Hint again to see which of your values differ from the nearest solution.',
    'La tua tavola non si estende più a una soluzione trovata dalle corsie, e le regole non forzano nessun valore. Premi di nuovo Suggerimento per vedere quali tuoi valori differiscono dalla soluzione più vicina.'] };
  const diff = S => x.map((v, i) => (v >= 0 && S.x[i] !== v ? i : -1)).filter(i => i >= 0);
  const S = sols.reduce((a, b) => (diff(b).length < diff(a).length ? b : a)), d = diff(S);
  g.showHint(d.map(i => [i, x[i]]), 'hot');
  const ns = d.slice(0, 4).map(i => g.vname(i, x[i])), more = d.length > 4 ? ['...', '...'] : ['', ''];
  return { say: [`The nearest solution, that of ${S.by}, differs in ${d.length} of your values: ${ns.map(z => z[0]).join(', ')}${more[0]} (red). Undo them, or change them.`,
    `La soluzione più vicina, quella di ${S.by}, differisce in ${d.length} dei tuoi valori: ${ns.map(z => z[1]).join(', ')}${more[1]} (in rosso). Annullali, o cambiali.`] };
}
export function cspReplay(g, states) {
  const sols = g.sols(), xs = states.map(s => g.vals(s)), last = xs[xs.length - 1];
  if (!sols.length) return { by: null, rows: [], first: 0, note: ['No lane holds a solution to compare with.', 'Nessuna corsia ha una soluzione con cui confrontarle.'] };
  const agree = S => last.filter((v, i) => v >= 0 && S.x[i] === v).length;
  const S = sols.reduce((a, b) => (agree(b) > agree(a) ? b : a));
  let first = 0;
  const rows = xs.slice(1).map((b, k) => {
    const a = xs[k], ch = [];
    b.forEach((v, i) => { if (v !== a[i]) { ch.push(i); if (!first && v >= 0 && S.x[i] !== v) first = k + 1; } });
    const ns = ch.slice(0, 3).map(i => g.vname(i, S.x[i]));
    return ch.length ? [ns.map(z => z[0]).join(', ') + (ch.length > 3 ? '...' : ''), ns.map(z => z[1]).join(', ') + (ch.length > 3 ? '...' : '')] : null;
  });
  return { by: [S.by, S.by], rows, first,
    note: ['Beside each of your moves, the value of the same cells in its solution (a solver does not fill them in your order).', 'Accanto a ogni tua mossa, il valore delle stesse celle nella sua soluzione (un solutore non le riempie nel tuo ordine).'] };
}
