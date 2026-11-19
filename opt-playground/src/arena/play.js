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
    const btns = this.game.panelButtons || [];
    art.querySelector('.panel').innerHTML = `<p class="howto"></p><div class="playbar"><button type="button" class="preset">${bi('Reset', 'Ricomincia')}</button>${
      btns.map(b => `<button type="button" data-btn="${b.id}">${bi(b.en, b.it)}</button>`).join('')}${
      opts.map(o => `<label><input type="checkbox" data-opt="${o.id}"${o.on ? ' checked' : ''}> ${bi(o.en, o.it)}</label>`).join('')}</div>`;
    art.querySelector('.preset').onclick = () => this.reset();
    art.querySelectorAll('[data-btn]').forEach(b => b.onclick = () => this.act(this.game.button(b.dataset.btn)));
    art.querySelectorAll('[data-opt]').forEach(b => b.onchange = () => { this.game.opt[b.dataset.opt] = b.checked; this.game.hover(null); });
    this.wire(this.game.view.S);
    this.reset();
  }
  reset() {
    this.moves = 0; this.mistakes = 0; this.solved = false;
    this.game.reset();
    this.say = ['Your board, at the start of the instance.', 'La tua tavola, all\'inizio dell\'istanza.'];
    this.kind = '';
    this.texts();
  }
  // an action, from a click, a key or a test
  act(a) {
    if (!a) return null;
    const r = this.game.act(a);
    if (!r) return null;
    if (r.moved) this.moves++;
    if (r.mistake) this.mistakes++;
    this.solved = !!r.solved;
    this.say = r.say;
    this.kind = r.mistake ? 'conflict' : r.solved ? 'solved' : r.moved ? '' : 'note';
    this.texts();
    return r;
  }
  texts() {
    const c = [[t(...(this.game.moveName || ['moves', 'mosse'])), this.moves], [t('mistakes', 'errori'), this.mistakes],
      ...this.game.counters().map(([en, it, v]) => [t(en, it), v])];
    this.art.querySelector('.counters').innerHTML = c.map(([n, v]) => `<div><dt>${esc(n)}</dt><dd>${v}</dd></div>`).join('');
    this.art.querySelector('h3').textContent = t('You', 'Tu');
    this.art.querySelector('.where').textContent = t('your moves, on the same instance', 'le tue mosse, sulla stessa istanza');
    const ev = this.art.querySelector('.evline');
    ev.textContent = t(...this.say);
    this.art.classList.toggle('conflict', this.kind === 'conflict');
    this.art.classList.toggle('solved', this.kind === 'solved');
    this.art.querySelector('.howto').textContent = t(...this.game.help);
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
