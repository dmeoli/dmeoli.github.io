// The box "Draw your own instance" of map coloring and grid paths (the
// level "constructing"): the reader draws a planar graph by clicking points
// and joining them, or picks regions of a blank map, or paints the walls of a
// small grid and places its start and goal; the page checks the instance
// (a connected graph, a goal that can be reached) and says what is wrong,
// and "Play and run it" makes it the instance of the page, whose id in the
// address holds it whole (ownrun.js), so that the link shares it. Drawn in
// SVG with the colors of the theme (the tokens of style.css).

import { t, bi, onLang } from '../i18n.js';
import { encodeGraph, encodeMap, encodeGrid, maps, instanceOf, custom, isCustom } from './ownrun.js';

const NS = 'http://www.w3.org/2000/svg';
const MAXV = 30, GW = 16, GH = 16;
const T = (en, it) => () => t(en, it);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// true if the open segments pq and rs cross (shared ends do not count), as
// _cross of translate.py
function cross(p, q, r, s) {
  const o = (a, b, c) => { const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return (v > 1e-12) - (v < -1e-12); };
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
}
// the vertices that a walk over adj from 0 cannot reach
function unreached(n, adj) {
  const seen = new Set(n ? [0] : []), st = n ? [0] : [];
  while (st.length) { const v = st.pop(); for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } }
  return Array.from({ length: n }, (_, i) => i).filter(i => !seen.has(i));
}
const list = (xs, more) => xs.slice(0, 6).join(', ') + (xs.length > 6 ? more(xs.length - 6) : '');

export function attach(box, api) {
  const det = document.createElement('details');
  det.className = 'owndraw'; det.id = 'owndraw';
  box.before(det);
  const coloring = api.game === 'coloring';
  det.innerHTML = `<summary>${bi('Draw your own instance', 'Disegna la tua istanza')}</summary>
    <p class="onote"></p>
    <div class="dtools"></div>
    <div class="dwrap"><svg class="dsvg" role="img"></svg></div>
    <p class="dmsg" role="status" aria-live="polite"></p>
    <div class="dbar"><button type="button" class="duse"></button><button type="button" class="dclear"></button><button type="button" class="dlink"></button></div>
    <p class="dshare" hidden><input type="text" readonly aria-label="link"></p>`;
  const svg = det.querySelector('svg'), msg = det.querySelector('.dmsg');
  let say = null;
  const tell = (f, bad) => { say = f; msg.textContent = f ? f() : ''; msg.classList.toggle('bad', !!bad); };
  const E = coloring ? graphEditor(det, svg, tell, api) : gridEditor(det, svg, tell, api);
  const texts = () => {
    det.querySelector('.onote').textContent = coloring
      ? t('Click on the empty board to add a point, click on two points in turn to join them with a line (a border between two regions, so the lines may not cross), click on a line to remove it; with a point selected, Delete removes it. Or pick the regions of a blank map. "Play and run it" checks the graph (it must be connected), makes it the instance of the page, for the lane "You" and for your runs below, and writes it in the address of the page, which "Copy the link" copies.',
        'Fai clic sul tabellone vuoto per aggiungere un punto, su due punti di seguito per unirli con una linea (un confine fra due regioni, quindi le linee non possono incrociarsi), su una linea per toglierla; con un punto selezionato, Canc lo toglie. Oppure scegli le regioni di una mappa vuota. "Gioca ed esegui" controlla il grafo (deve essere connesso), ne fa l\'istanza della pagina, per la corsia "Tu" e per le tue esecuzioni qui sotto, e lo scrive nell\'indirizzo della pagina, che "Copia il link" copia.')
      : t(`Paint the walls of a grid of ${GW} by ${GH} cells by clicking or dragging (a click on a wall clears it), and place the start and the goal with their tools. "Play and run it" checks that the goal can be reached from the start (8 moves, a diagonal may not cut the corner of a wall), makes the grid the instance of the page, for the lane "You" and for your runs below, and writes it in the address of the page, which "Copy the link" copies.`,
        `Dipingi i muri di una griglia di ${GW} per ${GH} celle con un clic o trascinando (un clic su un muro lo toglie), e metti la partenza e l'obiettivo con i loro strumenti. "Gioca ed esegui" controlla che l'obiettivo si possa raggiungere dalla partenza (8 mosse, una diagonale non può tagliare l'angolo di un muro), fa della griglia l'istanza della pagina, per la corsia "Tu" e per le tue esecuzioni qui sotto, e la scrive nell'indirizzo della pagina, che "Copia il link" copia.`);
    det.querySelector('.duse').textContent = t('Play and run it', 'Gioca ed esegui');
    det.querySelector('.dclear').textContent = t('Clear', 'Svuota');
    det.querySelector('.dlink').textContent = t('Copy the link', 'Copia il link');
    svg.setAttribute('aria-label', coloring ? t('the graph you draw', 'il grafo che disegni') : t('the grid you draw', 'la griglia che disegni'));
    E.texts();
    if (say) msg.textContent = say();
  };
  det.querySelector('.duse').onclick = async () => {
    if (E.ready) await E.ready();
    const bad = E.check();
    if (bad) { tell(bad, true); return; }
    const id = E.encode();
    tell(T('This instance is now the one of the page.', 'Questa istanza è ora quella della pagina.'));
    await api.choose(id);
  };
  det.querySelector('.dclear').onclick = () => { E.clear(); tell(null); };
  det.querySelector('.dlink').onclick = async () => {
    const id = api.inst();
    const sh = det.querySelector('.dshare'), inp = sh.querySelector('input');
    if (!isCustom(id)) { tell(T('Press "Play and run it" first: the link holds the instance of the page.', 'Premi prima "Gioca ed esegui": il link contiene l\'istanza della pagina.'), true); return; }
    inp.value = location.href; sh.hidden = false; inp.select();
    try { await navigator.clipboard.writeText(location.href); tell(T('The link is copied: it opens the page on this instance.', 'Il link è copiato: apre la pagina su questa istanza.')); }
    catch (err) { tell(T('Copy the link from the field below.', 'Copia il link dal campo qui sotto.')); }
  };
  // the instance of the page, if it is one of the reader, opens in the editor
  const cur = custom(api.inst());
  if (cur) { E.load(cur); det.open = true; }
  texts();
  onLang(texts);
  return { load: inst => E.load(inst) };
}

// ---------------------------------------------------------------- graphs and maps
function graphEditor(det, svg, tell, api) {
  const tools = det.querySelector('.dtools');
  tools.innerHTML = `<label><span class="tmode"></span><select class="dmode"><option value="points"></option><option value="map"></option></select></label>
    <label class="dmapl" hidden><span class="tmap"></span><select class="dmap"><option value="australia">Australia</option><option value="usa">USA</option><option value="france"></option></select></label>
    <label><span class="tk"></span><select class="dk"><option value="3">3</option><option value="4" selected>4</option></select></label>
    <button type="button" class="ddel" hidden></button>`;
  const S = { mode: 'points', k: 4, xy: [], edges: [], sel: -1, map: 'australia', pick: new Set(), M: null, full: new Map(), bad: null };
  const mode = tools.querySelector('.dmode'), mapSel = tools.querySelector('.dmap'), kSel = tools.querySelector('.dk'), del = tools.querySelector('.ddel');
  const R = 0.045;
  svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2');
  const at = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, -q.y]; };
  const has = (a, b) => S.edges.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  function draw() {
    let s = '<rect class="dbg" x="-1.1" y="-1.1" width="2.2" height="2.2"/>';
    if (S.mode === 'map') {
      if (!S.M) { svg.innerHTML = s; return; }
      for (const [id, r] of Object.entries(S.M.regions)) {
        const d = r.polygons.map(poly => poly.map(ring => 'M' + ring.map(([x, y]) => `${x},${-y}`).join('L') + 'Z').join('')).join('');
        s += `<path class="dreg${S.pick.has(id) ? ' on' : ''}" data-r="${esc(id)}" d="${d}"><title>${esc(r.name || id)}</title></path>`;
      }
      for (const [id, r] of Object.entries(S.M.regions)) if (S.pick.has(id))
        s += `<text class="dlab" x="${r.label[0]}" y="${-r.label[1]}">${esc(id)}</text>`;
    } else {
      S.edges.forEach(([a, b], i) => {
        const A = S.xy[a], B = S.xy[b];
        s += `<line class="dedge" data-e="${i}" x1="${A[0]}" y1="${-A[1]}" x2="${B[0]}" y2="${-B[1]}"/>`;
      });
      if (S.bad) { const [A, B] = S.bad; s += `<line class="dedge badl" x1="${A[0]}" y1="${-A[1]}" x2="${B[0]}" y2="${-B[1]}"/>`; }
      S.xy.forEach(([x, y], i) => {
        s += `<circle class="dv${i === S.sel ? ' sel' : ''}" data-v="${i}" cx="${x}" cy="${-y}" r="${R}"/><text class="dlab" x="${x}" y="${-y - R * 1.9}">v${i + 1}</text>`;
      });
    }
    svg.innerHTML = s;
    del.hidden = !(S.mode === 'points' && S.sel >= 0);
  }
  svg.addEventListener('click', ev => {
    const el = ev.target;
    S.bad = null;
    if (S.mode === 'map') {
      const r = el.dataset && el.dataset.r;
      if (!r) return;
      if (S.pick.has(r)) S.pick.delete(r); else S.pick.add(r);
      tell(null); draw(); return;
    }
    if (el.dataset.e !== undefined) { S.edges.splice(+el.dataset.e, 1); tell(null); draw(); return; }
    if (el.dataset.v !== undefined) {
      const v = +el.dataset.v;
      if (S.sel < 0 || S.sel === v) { S.sel = S.sel === v ? -1 : v; tell(null); draw(); return; }
      const j = has(S.sel, v);
      if (j >= 0) { S.edges.splice(j, 1); S.sel = v; tell(null); draw(); return; }
      const P = S.xy[S.sel], Q = S.xy[v];
      const hit = S.edges.find(([a, b]) => cross(P, Q, S.xy[a], S.xy[b]));
      if (hit) {
        S.bad = [P, Q];
        tell(T(`That line would cross the line v${hit[0] + 1} – v${hit[1] + 1}: two borders of a map never cross, so the graph must stay planar.`,
          `Quella linea incrocerebbe la linea v${hit[0] + 1} – v${hit[1] + 1}: due confini di una mappa non si incrociano mai, quindi il grafo deve restare planare.`), true);
        draw(); return;
      }
      S.edges.push([S.sel, v]); S.sel = v; tell(null); draw(); return;
    }
    const [x, y] = at(ev);
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return;
    if (S.xy.length >= MAXV) { tell(T(`At most ${MAXV} points.`, `Al più ${MAXV} punti.`), true); return; }
    if (S.xy.some(([a, b]) => Math.hypot(a - x, b - y) < 3 * R)) { tell(T('Too close to another point.', 'Troppo vicino a un altro punto.'), true); return; }
    // a point on a line would hide it: refused too
    if (S.edges.some(([a, b]) => segDist(S.xy[a], S.xy[b], [x, y]) < 1.5 * R)) { tell(T('That point would sit on a line.', 'Quel punto starebbe su una linea.'), true); return; }
    S.xy.push([+x.toFixed(3), +y.toFixed(3)]); S.sel = -1; tell(null); draw();
  });
  const removeSel = () => {
    if (S.sel < 0) return;
    const v = S.sel;
    S.xy.splice(v, 1);
    S.edges = S.edges.filter(([a, b]) => a !== v && b !== v).map(([a, b]) => [a > v ? a - 1 : a, b > v ? b - 1 : b]);
    S.sel = -1; draw();
  };
  del.onclick = removeSel;
  det.addEventListener('keydown', ev => { if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.mode === 'points' && S.sel >= 0 && ev.target.tagName !== 'INPUT') { ev.preventDefault(); removeSel(); } });
  svg.tabIndex = 0;
  function loadMap() { S.loadP = loadMap1(); return S.loadP; }
  async function loadMap1() {
    S.M = (await maps())[S.map];
    draw();
    if (!S.full.has(S.map)) {
      const name = S.map;
      tell(T('Loading the borders of the map from aima-python...', 'Caricamento dei confini della mappa da aima-python...'));
      try { const inst = await instanceOf(name); S.full.set(name, inst.edges); if (S.map === name) tell(null); }
      catch (err) { tell(T('The borders could not be loaded: ' + err.message, 'Non è stato possibile caricare i confini: ' + err.message), true); }
    }
  }
  mode.onchange = () => { S.mode = mode.value; tools.querySelector('.dmapl').hidden = S.mode !== 'map'; S.sel = -1; tell(null); if (S.mode === 'map') loadMap(); else draw(); };
  mapSel.onchange = () => { S.map = mapSel.value; S.pick = new Set(); tell(null); loadMap(); };
  kSel.onchange = () => { S.k = +kSel.value; };
  draw();
  return {
    texts() {
      const o = mode.options;
      o[0].textContent = t('points and lines', 'punti e linee'); o[1].textContent = t('regions of a map', 'regioni di una mappa');
      mapSel.options[2].textContent = t('France', 'Francia');
      tools.querySelector('.tmode').textContent = t('draw', 'disegna');
      tools.querySelector('.tmap').textContent = t('map', 'mappa');
      tools.querySelector('.tk').textContent = t('colors', 'colori');
      del.textContent = t('Remove the point', 'Togli il punto');
    },
    // the borders of the map, once they are here
    ready: () => S.loadP || Promise.resolve(),
    clear() { S.xy = []; S.edges = []; S.sel = -1; S.pick = new Set(); S.bad = null; draw(); },
    load(inst) {
      S.k = inst.colours.length; kSel.value = String(S.k);
      const m = /^mymap-([a-z]+)-/.exec(inst.id);
      if (m) {
        S.mode = 'map'; S.map = m[1]; mapSel.value = S.map; S.pick = new Set(inst.vertices);
        mode.value = 'map'; tools.querySelector('.dmapl').hidden = false; loadMap();
      } else {
        const ix = new Map(inst.vertices.map((v, i) => [v, i]));
        S.mode = 'points'; mode.value = 'points'; tools.querySelector('.dmapl').hidden = true;
        S.xy = inst.xy.map(p => [...p]); S.edges = inst.edges.map(([a, b]) => [ix.get(a), ix.get(b)]); draw();
      }
    },
    // what is wrong with the drawing, or null
    check() {
      if (S.mode === 'map') {
        const full = S.full.get(S.map);
        if (!full) return T('The borders of the map are still loading.', 'I confini della mappa si stanno ancora caricando.');
        const ids = Object.keys(S.M.regions).filter(r => S.pick.has(r));
        if (ids.length < 3) return T('Pick at least 3 regions.', 'Scegli almeno 3 regioni.');
        const ix = new Map(ids.map((r, i) => [r, i])), adj = ids.map(() => []);
        for (const [a, b] of full) if (ix.has(a) && ix.has(b)) { adj[ix.get(a)].push(ix.get(b)); adj[ix.get(b)].push(ix.get(a)); }
        const out = unreached(ids.length, adj).map(i => ids[i]);
        if (out.length) return T(`The regions picked are not connected: ${list(out, n => ` and ${n} more`)} share no border with the part of ${ids[0]}; pick the regions between them, or leave them out.`,
          `Le regioni scelte non sono connesse: ${list(out, n => ` e altre ${n}`)} non hanno confini con la parte di ${ids[0]}; scegli le regioni fra loro, o lasciale fuori.`);
        return null;
      }
      const n = S.xy.length;
      if (n < 3) return T('Draw at least 3 points.', 'Disegna almeno 3 punti.');
      const adj = S.xy.map(() => []);
      for (const [a, b] of S.edges) { adj[a].push(b); adj[b].push(a); }
      const out = unreached(n, adj).map(i => 'v' + (i + 1));
      if (out.length) return T(`The graph is not connected: ${list(out, n => ` and ${n} more`)} cannot be reached from v1 along the lines; join them to the rest.`,
        `Il grafo non è connesso: ${list(out, n => ` e altri ${n}`)} non si raggiungono da v1 lungo le linee; uniscili al resto.`);
      return null;
    },
    encode() {
      if (S.mode === 'map') {
        const keys = Object.keys(S.M.regions), ix = new Map(keys.map((r, i) => [r, i]));
        const edges = S.full.get(S.map).filter(([a, b]) => S.pick.has(a) && S.pick.has(b)).map(([a, b]) => [ix.get(a), ix.get(b)]);
        return encodeMap({ map: S.map, k: S.k, keys, pick: [...S.pick].map(r => ix.get(r)), edges });
      }
      return encodeGraph({ k: S.k, xy: S.xy, edges: S.edges });
    } };
}
function segDist(A, B, P) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L));
  return Math.hypot(A[0] + u * dx - P[0], A[1] + u * dy - P[1]);
}

// ---------------------------------------------------------------- grids
function gridEditor(det, svg, tell, api) {
  const tools = det.querySelector('.dtools');
  tools.innerHTML = `<span class="dtool" role="radiogroup"><label><input type="radio" name="dtool" value="wall" checked> <span class="twall"></span></label>
    <label><input type="radio" name="dtool" value="start"> <span class="tstart"></span></label>
    <label><input type="radio" name="dtool" value="goal"> <span class="tgoal"></span></label></span>
    <button type="button" class="drand"></button>`;
  const S = { walls: new Set(), start: (GH - 1) * GW, goal: GW - 1 };
  // a first grid to start from: a wall with a gap
  for (let y = 3; y < GH; y++) if (y !== 6) S.walls.add(y * GW + 8);
  svg.setAttribute('viewBox', `-0.2 -0.2 ${GW + 0.4} ${GH + 0.4}`);
  const tool = () => tools.querySelector('input[name=dtool]:checked').value;
  function draw() {
    let s = `<rect class="dbg" x="-0.2" y="-0.2" width="${GW + 0.4}" height="${GH + 0.4}"/>`;
    for (let c = 0; c < GW * GH; c++) {
      const x = c % GW, y = Math.floor(c / GW);
      const k = c === S.start ? 'st' : c === S.goal ? 'go' : S.walls.has(c) ? 'wall' : 'free';
      s += `<rect class="dcell ${k}" data-c="${c}" x="${x + 0.04}" y="${y + 0.04}" width="0.92" height="0.92" rx="0.12"/>`;
    }
    const lab = (c, txt) => `<text class="dglyph" x="${c % GW + 0.5}" y="${Math.floor(c / GW) + 0.56}">${txt}</text>`;
    s += lab(S.start, 'S') + lab(S.goal, 'G');
    svg.innerHTML = s;
  }
  let paint = null;
  const cellAt = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); return el && el.dataset && el.dataset.c !== undefined ? +el.dataset.c : -1; };
  const apply = c => {
    if (c < 0) return;
    const tl = tool();
    if (tl === 'wall') {
      if (c === S.start || c === S.goal) return;
      if (paint === null) paint = !S.walls.has(c);
      if (paint) S.walls.add(c); else S.walls.delete(c);
    } else if (tl === 'start') { if (c !== S.goal) { S.start = c; S.walls.delete(c); } }
    else if (c !== S.start) { S.goal = c; S.walls.delete(c); }
    draw();
  };
  svg.addEventListener('pointerdown', ev => { paint = null; try { svg.setPointerCapture(ev.pointerId); } catch (err) { /* a pointer the browser does not track */ } tell(null); apply(cellAt(ev)); ev.preventDefault(); });
  svg.addEventListener('pointermove', ev => { if (ev.buttons & 1 && tool() === 'wall') apply(cellAt(ev)); });
  svg.addEventListener('pointerup', () => { paint = null; });
  svg.style.touchAction = 'none';
  tools.querySelector('.drand').onclick = () => {
    S.walls = new Set();
    for (let c = 0; c < GW * GH; c++) if (c !== S.start && c !== S.goal && Math.random() < 0.25) S.walls.add(c);
    tell(null); draw();
  };
  draw();
  const free = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && !S.walls.has(y * GW + x);
  return {
    texts() {
      tools.querySelector('.twall').textContent = t('walls', 'muri');
      tools.querySelector('.tstart').textContent = t('start (S)', 'partenza (S)');
      tools.querySelector('.tgoal').textContent = t('goal (G)', 'obiettivo (G)');
      tools.querySelector('.drand').textContent = t('Random walls (a quarter)', 'Muri a caso (un quarto)');
    },
    clear() { S.walls = new Set(); draw(); },
    load(inst) {
      if (inst.width !== GW || inst.height !== GH) return;
      S.walls = new Set(); S.start = inst.start; S.goal = inst.goal;
      inst.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '@') S.walls.add(y * GW + x); }));
      draw();
    },
    check() {
      if (S.start === S.goal) return T('The start and the goal are the same cell.', 'La partenza e l\'obiettivo sono la stessa cella.');
      // the cells reachable from the start, with the moves of the page
      const seen = new Set([S.start]), st = [S.start];
      while (st.length) {
        const c = st.pop(), x = c % GW, y = Math.floor(c / GW);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || !free(x + dx, y + dy)) continue;
          if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
          const d = (y + dy) * GW + x + dx;
          if (!seen.has(d)) { seen.add(d); st.push(d); }
        }
      }
      if (!seen.has(S.goal)) return T(`The goal cannot be reached from the start: the walls close it off (the start reaches ${seen.size} cells; a diagonal step may not cut the corner of a wall). Open a gap.`,
        `L'obiettivo non si raggiunge dalla partenza: i muri lo chiudono (dalla partenza si raggiungono ${seen.size} celle; un passo in diagonale non può tagliare l'angolo di un muro). Apri un varco.`);
      return null;
    },
    encode() { return encodeGrid({ width: GW, height: GH, start: S.start, goal: S.goal, walls: S.walls }); } };
}
