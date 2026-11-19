// The charts under the scoreboard of the arena, in a section that opens on
// demand: for the searches, the expansions by depth of each lane (from its
// trace, and only where the trace keeps every expansion), the effective
// branching factor b* solved from N = 1 + b* + ... + b*^d, and for the cube
// the size of the tree by depth with and without the heuristic; for the CSP
// and SAT solvers, their counters as bars. One color per lane (the token
// --lane-<slot> of arena.css, which also marks the top of its lane), small
// multiples on shared axes, no number that the traces do not give.

import { t } from '../i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => (Math.abs(v) >= 1e4 ? Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') : String(+(+v).toPrecision(4)));
const nice = (raw) => { const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9))); return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw); };
// the ticks of a linear axis from 0 to about hi
function ticks(hi, n = 4) {
  const s = nice(Math.max(hi, 1) / n), out = [];
  for (let v = 0; v <= hi + 1e-9; v += s) out.push(+v.toPrecision(12));
  if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + s).toPrecision(12));
  return out;
}
const svg = (w, h, body, label) => `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

// the states a lane expanded, by g, when its trace keeps them all
export function depthCounts(tr) {
  const ex = tr.events.filter(e => e.type === 'expand');
  const N = tr.result && tr.result.stats && tr.result.stats.expanded !== undefined ? tr.result.stats.expanded
    : ex.length ? ex[ex.length - 1].n.expanded : 0;
  return { ex, N, kept: ex.length, complete: ex.length > 0 && ex.length === N && ex.every(e => typeof e.g === 'number') };
}
// the solution depth d (moves of the path) and the expansions N of a lane
export function bstar(N, d) {
  if (!(N > 0) || !(d > 0)) return null;
  const F = b => { let s = 0, p = 1; for (let i = 0; i <= d; i++) { s += p; p *= b; } return s - N; };
  let lo = 0, hi = Math.max(1, N);
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (F(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
// the nodes at each depth of the tree of all move sequences of the cube in
// the half-turn metric with the redundant pairs pruned, as PBeFS searches it
// (RubiksCube.h, for_each_tree_successor): no turn of the face just turned,
// and after a face that comes second in its opposite pair (D, L, B) no turn
// of the first (U, R, F); a: the nodes whose last face is a first one, b: a
// second one
export function cubeTree(D) {
  const out = [1];
  let a = 9, b = 9;
  for (let d = 1; d <= D; d++) { out.push(a + b); [a, b] = [6 * a + 6 * b, 9 * a + 6 * b]; }
  return out;
}

// lanes: [{ name, slot, tr }] (slot: the lane select, from 0, which picks the color)
export function drawCharts(box, lanes, game) {
  const real = lanes.filter(L => !L.tr.header.sample && L.tr.result);
  if (!real.length) { box.innerHTML = ''; return false; }
  const search = real.every(L => L.tr.header.solver.paradigm === 'heuristic search');
  box.innerHTML = search ? searchCharts(real, game) : counterCharts(real);
  return true;
}
const color = L => `var(--lane-${L.slot + 1})`;
const key = ls => `<p class="ckey">${ls.map(L => `<span class="lchip" style="--lane:${color(L)}">${esc(L.name)}</span>`).join(' ')}</p>`;

function searchCharts(lanes, game) {
  const unit = game === 'grid' ? t('g, the cost from the start', 'g, il costo dalla partenza')
    : game === 'romania' ? t('g, km from Arad', 'g, km da Arad')
    : game === 'planning' ? t('g, actions', 'g, azioni') : t('g, moves from the start', 'g, mosse dalla partenza');
  const D = lanes.map(L => ({ L, ...depthCounts(L.tr) }));
  let html = key(lanes);
  // 1. the expansions by depth, one small multiple per lane on shared axes
  const full = D.filter(x => x.complete);
  if (full.length) {
    const gmax = Math.max(...full.flatMap(x => x.ex.map(e => e.g)));
    const allInt = full.every(x => x.ex.every(e => Number.isInteger(e.g)));
    const bw = allInt && gmax <= 40 ? 1 : nice(gmax / 30);
    const nb = Math.floor(gmax / bw) + 1;
    const hist = x => { const h = new Array(nb).fill(0); for (const e of x.ex) h[Math.min(nb - 1, Math.floor(e.g / bw + 1e-9))]++; return h; };
    // the same g axis for all; each its own vertical scale, since the
    // counts of two lanes can differ by orders of magnitude
    const H = full.map(x => ({ x, h: hist(x) }));
    const W = 300, Ht = 150, l = 40, r = 8, top = 10, bot = 34, pw = W - l - r, ph = Ht - top - bot;
    const cells = H.map(({ x, h }) => {
      const yt = ticks(Math.max(1, ...h)), Y = v => top + ph * (1 - v / yt[yt.length - 1]);
      const bwPx = pw / nb, gap = bwPx > 4 ? 1 : 0;
      let b = yt.map(v => `<line class="grid" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${l - 4}" y="${Y(v) + 3}" text-anchor="end">${num(v)}</text>`).join('');
      h.forEach((c, i) => {
        if (!c) return;
        const lo = +(i * bw).toPrecision(6), hi = +((i + 1) * bw).toPrecision(6);
        b += `<rect class="bar" x="${l + i * bwPx + gap}" y="${Y(c)}" width="${Math.max(0.8, bwPx - 2 * gap)}" height="${top + ph - Y(c)}" rx="${bwPx > 8 ? 2 : 0}" style="fill:${color(x.L)}"><title>${esc(x.L.name)}: ${c} ${t('expansions', 'espansioni')}, g ${bw === 1 ? lo : `${lo} – ${hi}`}</title></rect>`;
      });
      for (const v of ticks(gmax, 4)) if (v <= gmax) b += `<text class="tick" x="${l + pw * (v / bw + 0.5) / nb}" y="${top + ph + 12}" text-anchor="middle">${num(v)}</text>`;
      b += `<line class="axis" x1="${l}" x2="${W - r}" y1="${top + ph}" y2="${top + ph}"/><text class="alab" x="${l + pw / 2}" y="${Ht - 4}" text-anchor="middle">${esc(unit)}</text>`;
      return `<figure class="cm"><figcaption><span class="lchip" style="--lane:${color(x.L)}">${esc(x.L.name)}</span> · ${num(x.N)} ${t('expanded', 'espansi')}</figcaption>${svg(W, Ht, b, x.L.name)}</figure>`;
    }).join('');
    html += `<section class="cset"><h3>${t('States expanded by depth', 'Stati espansi per profondità')}</h3>
      <p class="cnote">${t(`One chart per lane, on the same axis of g: the expansions of the trace by their g${bw > 1 ? `, in bins of ${bw}` : ''}; the vertical axis, the expansions, has the scale of each lane, whose total is in its title. An IDA* lane counts the states of every iteration, so a shallow state counts once per iteration.`,
        `Un grafico per corsia, sullo stesso asse di g: le espansioni della traccia secondo il loro g${bw > 1 ? `, in intervalli di ${bw}` : ''}; l'asse verticale, le espansioni, ha la scala di ogni corsia, il cui totale è nel titolo. Una corsia di IDA* conta gli stati di ogni iterazione, quindi uno stato poco profondo conta una volta per iterazione.`)}</p>
      <div class="cgrid">${cells}</div></section>`;
  }
  const part = D.filter(x => !x.complete);
  if (part.length && !full.length) html += `<section class="cset"><h3>${t('States expanded by depth', 'Stati espansi per profondità')}</h3></section>`;
  if (part.length) html += `<p class="cnote">${part.map(x => x.kept
    ? t(`${esc(x.L.name)}: the trace is sampled (${num(x.kept)} of the ${num(x.N)} expansions kept), so its expansions by depth are not drawn; its count of ${num(x.N)} is exact.`,
      `${esc(x.L.name)}: la traccia è campionata (${num(x.kept)} delle ${num(x.N)} espansioni conservate), quindi le sue espansioni per profondità non sono disegnate; il suo conteggio di ${num(x.N)} è esatto.`)
    : t(`${esc(x.L.name)}: the trace records no expansion (the planning graph is built level by level).`, `${esc(x.L.name)}: la traccia non registra espansioni (il grafo di pianificazione è costruito livello per livello).`)).join(' ')}</p>`;
  // 2. the effective branching factor
  const B = D.map(x => { const p = x.L.tr.result.path, d = p ? p.length - 1 : 0; return { ...x, d, b: x.kept ? bstar(x.N, d) : null }; }).filter(x => x.b !== null);
  if (B.length) {
    const W = 300, rh = 26, l = 8, r = 34, top = 6, Ht = top + rh * B.length + 30, bmax = Math.max(...B.map(x => x.b)), xt = ticks(bmax, 4), xm = xt[xt.length - 1];
    const lab = 132, pw = W - lab - l - r, X = v => lab + pw * v / xm;
    let b = xt.map(v => `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${top + rh * B.length}"/><text class="tick" x="${X(v)}" y="${top + rh * B.length + 12}" text-anchor="middle">${num(v)}</text>`).join('');
    B.forEach((x, i) => {
      const y = top + i * rh;
      b += `<text class="rlab" x="${lab - 6}" y="${y + rh / 2 + 4}" text-anchor="end">${esc(x.L.name.length > 18 ? x.L.name.slice(0, 17) + '…' : x.L.name)}</text>`;
      b += `<rect class="bar" x="${lab}" y="${y + 5}" width="${Math.max(1, X(x.b) - lab)}" height="${rh - 10}" rx="3" style="fill:${color(x.L)}"><title>${esc(x.L.name)}: b* ${x.b.toFixed(3)}, N ${x.N}, d ${x.d}</title></rect>`;
      b += `<text class="vlab" x="${X(x.b) + 4}" y="${y + rh / 2 + 4}">${x.b.toFixed(2)}</text>`;
    });
    b += `<text class="alab" x="${lab + pw / 2}" y="${Ht - 4}" text-anchor="middle">b*</text>`;
    html += `<section class="cset"><h3>${t('Effective branching factor', 'Fattore di ramificazione effettivo')}</h3>
      <p class="cnote">${t('b* is the branching factor that a uniform tree of depth d, the moves of the solution, would need to hold the N states the lane expanded: N = 1 + b* + b*² + ... + b*^d, solved for b*. The closer to 1, the more the search goes straight to the goal.',
        'b* è il fattore di ramificazione che un albero uniforme di profondità d, le mosse della soluzione, dovrebbe avere per contenere gli N stati espansi dalla corsia: N = 1 + b* + b*² + ... + b*^d, risolta in b*. Più è vicino a 1, più la ricerca va dritta all\'obiettivo.')}</p>
      <div class="cgrid one"><figure class="cm">${svg(W, Ht, b, 'b*')}<figcaption class="ctab">${B.map(x => `${esc(x.L.name)}: N ${num(x.N)}, d ${x.d}`).join(' · ')}</figcaption></figure></div></section>`;
  }
  // 3. the cube: the tree by depth, without heuristic and with it
  if (game === 'cube' && full.length) html += cubeChart(full);
  return html;
}

function cubeChart(full) {
  const D = Math.max(...full.flatMap(x => x.ex.map(e => e.g)));
  const tree = cubeTree(D), series = full.map(x => { const h = new Array(D + 1).fill(0); for (const e of x.ex) h[e.g]++; return { L: x.L, h }; });
  const W = 300, Ht = 190, l = 46, r = 10, top = 10, bot = 34, pw = W - l - r, ph = Ht - top - bot;
  const ymax = Math.ceil(Math.log10(Math.max(...tree))), X = d => l + pw * d / Math.max(1, D), Y = v => top + ph * (1 - Math.log10(v) / ymax);
  let b = '';
  const every = ymax > 6 ? 2 : 1;
  for (let k = 0; k <= ymax; k++) {
    b += `<line class="grid" x1="${l}" x2="${W - r}" y1="${Y(10 ** k)}" y2="${Y(10 ** k)}"/>`;
    if (k % every === 0) b += `<text class="tick" x="${l - 4}" y="${Y(10 ** k) + 3}" text-anchor="end">${k === 0 ? '1' : k === 1 ? '10' : `10<tspan dy="-3" font-size="6.5">${k}</tspan>`}</text>`;
  }
  for (let d = 0; d <= D; d++) b += `<text class="tick" x="${X(d)}" y="${top + ph + 12}" text-anchor="middle">${d}</text>`;
  const line = (h, cls, st) => {
    const pts = h.map((v, d) => (v > 0 ? [X(d), Y(v), v, d] : null)).filter(Boolean);
    return `<polyline class="${cls}" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}" style="${st}"/>` +
      pts.map(p => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="3.2" style="${st.replace('stroke', 'fill')}"><title>${t('depth', 'profondità')} ${p[3]}: ${num(p[2])}</title></circle>`).join('');
  };
  b += line(tree, 'ref', 'stroke:var(--ink-soft)');
  for (const s of series) b += line(s.h, 'ser', `stroke:${color(s.L)}`);
  b += `<line class="axis" x1="${l}" x2="${W - r}" y1="${top + ph}" y2="${top + ph}"/><text class="alab" x="${l + pw / 2}" y="${Ht - 4}" text-anchor="middle">${t('depth (moves from the start)', 'profondità (mosse dalla partenza)')}</text>`;
  return `<section class="cset"><h3>${t('The tree of the cube by depth, with and without the heuristic', 'L\'albero del cubo per profondità, con e senza euristica')}</h3>
    <p class="cnote">${t('Grey: the nodes at each depth of the tree of all move sequences in the half-turn metric, counted in the page from the rule by which PBeFS prunes redundant moves (no turn of the face just turned, and opposite faces in one order only; RubiksCube.h, which states that these counts are those of table 1 of Korf 1997), with a branching that tends to 13.35. In the color of each lane: the states that lane expanded at each depth, from its trace. Vertical axis logarithmic.',
      'In grigio: i nodi a ogni profondità dell\'albero di tutte le sequenze di mosse nella metrica dei mezzi giri, contati nella pagina dalla regola con cui PBeFS pota le mosse ridondanti (nessuna rotazione della faccia appena girata, e le facce opposte in un solo ordine; RubiksCube.h, che dichiara che questi conteggi sono quelli della tabella 1 di Korf 1997), con una ramificazione che tende a 13,35. Nel colore di ogni corsia: gli stati che quella corsia ha espanso a ogni profondità, dalla sua traccia. Asse verticale logaritmico.')}</p>
    <div class="cgrid one"><figure class="cm">${svg(W, Ht, b, 'tree')}<figcaption class="ctab"><span class="lchip ref">${t('no heuristic', 'senza euristica')}</span> ${series.map(s => `<span class="lchip" style="--lane:${color(s.L)}">${esc(s.L.name)}</span>`).join(' ')}</figcaption></figure></div></section>`;
}

// the counters of the CSP, SAT, B&B and local search lanes: one small
// multiple per counter, the lanes that report it as bars
function counterCharts(lanes) {
  const first = ['decisions', 'conflicts', 'propagations'];
  const keys = [...new Set(lanes.flatMap(L => Object.keys(L.tr.result.stats || {}).filter(k => typeof L.tr.result.stats[k] === 'number')))];
  keys.sort((a, b) => (first.indexOf(a) + 1 || 99) - (first.indexOf(b) + 1 || 99));
  if (!keys.length) return '';
  const W = 300, rh = 22, lab = 120, l = 8, r = 44;
  const cells = keys.map(k => {
    const has = lanes.filter(L => typeof L.tr.result.stats[k] === 'number'), miss = lanes.filter(L => !has.includes(L));
    const vmax = Math.max(1, ...has.map(L => L.tr.result.stats[k])), xt = ticks(vmax, 3), xm = xt[xt.length - 1], pw = W - lab - l - r;
    const X = v => lab + pw * v / xm, top = 4, Ht = top + rh * has.length + 18;
    let b = xt.map(v => `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${top + rh * has.length}"/><text class="tick" x="${X(v)}" y="${top + rh * has.length + 12}" text-anchor="middle">${num(v)}</text>`).join('');
    has.forEach((L, i) => {
      const v = L.tr.result.stats[k], y = top + i * rh;
      b += `<text class="rlab" x="${lab - 6}" y="${y + rh / 2 + 4}" text-anchor="end">${esc(L.name.length > 17 ? L.name.slice(0, 16) + '…' : L.name)}</text>`;
      b += `<rect class="bar" x="${lab}" y="${y + 4}" width="${Math.max(v ? 1.5 : 0, X(v) - lab)}" height="${rh - 8}" rx="3" style="fill:${color(L)}"><title>${esc(L.name)}: ${k} ${v}</title></rect>`;
      b += `<text class="vlab" x="${X(v) + 4}" y="${y + rh / 2 + 4}">${num(v)}</text>`;
    });
    return `<figure class="cm"><figcaption>${esc(k)}</figcaption>${svg(W, Ht, b, k)}${miss.length ? `<p class="cnote">${t('not counted by', 'non contato da')} ${miss.map(L => esc(L.name)).join(', ')}</p>` : ''}</figure>`;
  }).join('');
  return key(lanes) + `<section class="cset"><h3>${t('The counters of each lane', 'I contatori di ogni corsia')}</h3>
    <p class="cnote">${t('One chart per counter, as each solver reports it at the end of its run; a solver counts only what its algorithm does (a SAT solver its decisions, conflicts and propagations, a backtracking search its assignments, prunings and backtracks), so a lane appears only in the charts of its own counters, and the scale of each chart is its own.',
      'Un grafico per contatore, come ogni solutore lo riporta alla fine della sua esecuzione; un solutore conta solo ciò che il suo algoritmo fa (un solutore SAT le sue decisioni, i conflitti e le propagazioni, una ricerca con ritorno indietro gli assegnamenti, le potature e i ritorni), quindi una corsia compare solo nei grafici dei suoi contatori, e ogni grafico ha la sua scala.')}</p>
    <div class="cgrid">${cells}</div></section>`;
}
