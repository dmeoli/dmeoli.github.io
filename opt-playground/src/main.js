// The shell: it knows scenes, and in each scene only problems, algorithms and
// views. Controls are built from the parameters an algorithm declares; the
// state lives in the address. In a race two algorithms run on the same
// instance from the same start, each with its primal and its dual.

import * as p1 from './problems/lagrangian1d.js';
import * as p2 from './problems/lagrangian2d.js';
import { algorithms as a1 } from './algorithms/dual1d.js';
import { algorithms as a2 } from './algorithms/dual2d.js';
import { primal, dual, curve } from './views.js';
import { primal2, dualMap, curve2 } from './views2d.js';
import { dual3d, dispose3d } from './views3d.js';
import { texClear, texSet } from './tex.js';
import { t, onLang } from './i18n.js';

const $ = id => document.getElementById(id);

function svgIn(box, cls, viewBox) {
  let svg = box.querySelector('svg.' + cls);
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls); svg.setAttribute('viewBox', viewBox);
    svg.id = box.id + '-' + cls;
    box.replaceChildren(svg);
  }
  return svg;
}

const scenes = {
  a2: {
    get label() { return t('Two multipliers', 'Due moltiplicatori'); }, problems: p2, algorithms: a2, preset: 'ring',
    get dualCaption() {
      return t('Dual: the space of the two multipliers, split into the regions where each column found so far is the lowest in the model (a polyhedral complex, colored per column, darker where the model is lower); the star is the maximum of \\(L\\), the line the path of the iterates (hollow: null steps), the circle the stability center.',
        "Duale: lo spazio dei due moltiplicatori, diviso nelle regioni in cui ciascuna colonna trovata finora è la più bassa nel modello (un complesso poliedrale, colorato per colonna, più scuro dove il modello è più basso); la stella è il massimo di \\(L\\), la linea il cammino degli iterati (vuoti: passi nulli), il cerchio il centro di stabilità.");
    },
    get caption3d() {
      return t('Dual in 3D (drag to turn, wheel to zoom): the Lagrangian function is a concave roof of flat faces, one per column (the faint wire); the model is the roof of the cuts found so far, colored per column, which comes down onto the true one as cuts are added. The iterates sit on the true roof, with a line down to the plane of the multipliers; the gold octahedron is the maximum, the ring the stability center.',
        "Duale in 3D (trascina per ruotare, rotella per lo zoom): la funzione lagrangiana è un tetto concavo di facce piane, una per colonna (il reticolo tenue); il modello è il tetto dei tagli trovati finora, colorato per colonna, che scende sul tetto vero man mano che si aggiungono tagli. Gli iterati stanno sul tetto vero, con una linea che scende al piano dei moltiplicatori; l'ottaedro dorato è il massimo, l'anello il centro di stabilità.");
    },
    drawOne(run, k, ctx) {
      primal2($('primal' + k), ctx.problem, run.state, ctx.hover);
      const box = $('dualbox' + k);
      if (ctx.view === '3d') dual3d(box, ctx.problem, run.state, ctx.hover, run.params, run.algo);
      else { dispose3d(box); dualMap(box, ctx.problem, run.state, ctx.hover, ctx.onHover, run.params, run.algo); }
    },
    curve: (problem, runs) => curve2($('curve'), problem, runs),
  },
  a1: {
    get label() { return t('One multiplier', 'Un moltiplicatore'); }, problems: p1, algorithms: a1, preset: 'disc',
    get dualCaption() {
      return t('Dual: the Lagrangian function (dashed), the cuts, the model (their minimum), the iterates (hollow: null steps) and, for the bundle, the stability center and the proximal term.',
        'Duale: la funzione lagrangiana (tratteggiata), i tagli, il modello (il loro minimo), gli iterati (vuoti: passi nulli) e, per il bundle, il centro di stabilità e il termine prossimale.');
    },
    drawOne(run, k, ctx) {
      primal($('primal' + k), ctx.problem, run.state, ctx.hover);
      const box = $('dualbox' + k);
      dispose3d(box);
      dual(svgIn(box, 'd1', '0 0 560 440'), ctx.problem, run.state, ctx.hover, ctx.onHover, run.params, run.algo);
    },
    curve: (problem, runs) => curve($('curve'), problem, runs[0].state),
  },
};

const q = new URLSearchParams(location.hash.slice(1));
let sceneName = scenes[q.get('s')] ? q.get('s') : 'a2';
let scene = scenes[sceneName];
let presetName = scene.problems.presets[q.get('p')] ? q.get('p') : scene.preset;
let view = q.get('v') === '3d' ? '3d' : 'map';
let race = q.get('r') === '1' && sceneName === 'a2';
const runs = [
  { algo: scene.algorithms[q.get('a')] ? q.get('a') : 'bundle', params: {}, state: null },
  { algo: scene.algorithms[q.get('b')] ? q.get('b') : 'kelley', params: {}, state: null },
];
let problem, hover = null, timer = null;

function readParams(run, fromAddress, prefix = '') {
  run.params = {};
  for (const [k, s] of Object.entries(scene.algorithms[run.algo].params))
    run.params[k] = fromAddress && q.has(prefix + k) ? +q.get(prefix + k) : s.value;
}
// in a race the second algorithm starts where the first does
function shareStart() {
  for (const k of ['l0', 'l1', 'l2'])
    if (k in runs[0].params && k in runs[1].params) runs[1].params[k] = runs[0].params[k];
}

function fill(select, entries, current) {
  select.replaceChildren();
  for (const [k, label] of entries) select.append(new Option(label, k, false, k === current));
}

function sliders(box, run, others) {
  box.replaceChildren();
  for (const [k, s] of Object.entries(scene.algorithms[run.algo].params)) {
    if (others && ['l0', 'l1', 'l2'].includes(k)) continue;   // the start is shared
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${s.label}</span>`;
    if (s.options) {
      // a choice among named variants (the value is the index, as in SMS++)
      const sel = document.createElement('select');
      s.options.forEach((o, i) => sel.append(new Option(o, i, false, i === run.params[k])));
      sel.addEventListener('change', () => { run.params[k] = +sel.value; reset(); });
      lab.append(sel);
      box.appendChild(lab);
      continue;
    }
    const inp = Object.assign(document.createElement('input'), { type: 'range', min: s.min, max: s.max, step: s.step, value: run.params[k] });
    const out = Object.assign(document.createElement('output'), { textContent: run.params[k] });
    inp.addEventListener('input', () => { run.params[k] = +inp.value; out.textContent = inp.value; reset(); });
    lab.append(inp, out);
    box.appendChild(lab);
  }
}

function buildControls() {
  const texts = ['params', 'paramsB', 'explain', 'explainB', 'dualcap'].map($);
  texClear(...texts);
  fill($('scene'), Object.entries(scenes).map(([k, s]) => [k, s.label]), sceneName);
  fill($('preset'), Object.entries(scene.problems.presets).map(([k, s]) => [k, s.label]), presetName);
  const algos = Object.entries(scene.algorithms).map(([k, a]) => [k, a.name]);
  fill($('algo'), algos, runs[0].algo);
  fill($('algoB'), algos, runs[1].algo);
  fill($('view'), [['map', t('map', 'mappa')], ['3d', '3D']], view);
  $('view').parentElement.hidden = sceneName !== 'a2';
  $('race').parentElement.hidden = sceneName !== 'a2';
  $('race').checked = race;
  $('algoB').parentElement.hidden = !race;
  sliders($('params'), runs[0], false);
  sliders($('paramsB'), runs[1], true);
  $('paramsB').hidden = !race;
  document.body.classList.toggle('racing', race);
  $('explain').textContent = scene.algorithms[runs[0].algo].explain;
  $('explainB').textContent = race ? scene.algorithms[runs[1].algo].explain : '';
  $('dualcap').textContent = sceneName === 'a2' && view === '3d' ? scene.caption3d : scene.dualCaption;
  $('nameA').textContent = race ? scene.algorithms[runs[0].algo].name : '';
  $('nameB').textContent = scene.algorithms[runs[1].algo].name;
  texSet(...texts);
}

function save() {
  const s = { s: sceneName, p: presetName, a: runs[0].algo, v: view, ...runs[0].params };
  if (presetName === 'trace' && traceName) s.tr = traceName;
  if (race) {
    s.r = 1; s.b = runs[1].algo;
    for (const [k, v] of Object.entries(runs[1].params)) s['b' + k] = v;
  }
  history.replaceState(null, '', '#' + new URLSearchParams(s));
}

function draw() {
  const ctx = { problem, hover, view, onHover: h => { hover = h; draw(); } };
  const active = race ? runs : [runs[0]];
  active.forEach((run, i) => scene.drawOne(run, i ? 'B' : '', ctx));
  scene.curve(problem, active.map((r, i) => ({ state: r.state, cls: i ? 'b' : '' })));
  const st = runs[0].state, last = st.trace.at(-1);
  $('iter').textContent = st.k;
  $('best').textContent = st.best.toFixed(4) + (race ? ' / ' + runs[1].state.best.toFixed(4) : '');
  $('target').textContent = problem.optimum.value.toFixed(4);
  $('zlp').textContent = problem.lp ? problem.lp.value.toFixed(4) : '–';
  $('zip').textContent = problem.ip ? problem.ip.value.toFixed(4) : '–';
  $('status').textContent = st.done ? t('converged', 'convergenza raggiunta') : (last.serious ? t('serious step', 'passo serio') : t('null step', 'passo nullo'));
}

function reset() {
  stop();
  problem = scene.problems.make(presetName);
  if (race) shareStart();
  for (const run of race ? runs : [runs[0]]) run.state = scene.algorithms[run.algo].init(problem, run.params);
  hover = null;
  save();
  draw();
}
function step() {
  const active = race ? runs : [runs[0]];
  if (active.every(r => r.state.done)) { stop(); return; }
  for (const r of active) if (!r.state.done) r.state = scene.algorithms[r.algo].step(problem, r.state, r.params);
  draw();
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = t('Play', 'Avvia'); }
function play() {
  if (timer) return stop();
  $('play').textContent = t('Pause', 'Pausa');
  timer = setInterval(step, 1000);   // one iteration a second: the eye follows the new cut
}

$('scene').addEventListener('change', e => {
  sceneName = e.target.value; scene = scenes[sceneName];
  presetName = scene.preset;
  if (sceneName !== 'a2') race = false;
  for (const r of runs) { if (!scene.algorithms[r.algo]) r.algo = 'bundle'; readParams(r, false); }
  buildControls(); reset();
});
$('preset').addEventListener('change', e => { presetName = e.target.value; reset(); });
$('algo').addEventListener('change', e => { runs[0].algo = e.target.value; readParams(runs[0], false); buildControls(); reset(); });
$('algoB').addEventListener('change', e => { runs[1].algo = e.target.value; readParams(runs[1], false); buildControls(); reset(); });
$('race').addEventListener('change', e => { race = e.target.checked; readParams(runs[1], false); buildControls(); reset(); });
$('view').addEventListener('change', e => { view = e.target.value; buildControls(); save(); draw(); });
$('step').addEventListener('click', step);
// export the current run as a trace, import a trace to replay it
$('exportTrace').addEventListener('click', () => {
  const pr = scene.problems.presets[presetName];
  const tc = { kind: sceneName === 'a2' ? 'dual2d' : 'dual1d', source: 'opt-playground ' + scene.algorithms[runs[0].algo].name,
              config: runs[0].params, problem: { points: pr.points || null, polygon: pr.polygon, c: pr.c, A: pr.A || [pr.a], b: Array.isArray(pr.b) ? pr.b : [pr.b], lmax: pr.lmax },
              iterations: runs[0].state.trace.map(o => ({ lam: o.lam, value: o.value, subgradient: o.subgradient, column: o.column, serious: o.serious, center: o.center })) };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(tc)], { type: 'application/json' })), download: `trace-${presetName}-${runs[0].algo}.json` });
  a.click();
});
// a trace replayed in place of an algorithm; the traces of real runs shipped in
// traces/ are named in the address (#t=smspp-box-bundle), so that a link opens them
let traceName = '';
function loadTrace(tc, name = '') {
  if (tc.kind !== 'dual2d') return;
  window.dmeoliTrace = tc; traceName = name;
  p2.presets.trace = { get label() { return t('From the trace: ', 'Dalla traccia: ') + (tc.source || ''); }, ...tc.problem, points: tc.problem.points || undefined };
  sceneName = 'a2'; scene = scenes.a2; presetName = 'trace'; runs[0].algo = 'replay'; race = false;
  readParams(runs[0], false); buildControls(); reset();
}
const fetchTrace = async name => loadTrace(await (await fetch(`traces/${name}.json`)).json(), name);
$('importTrace').addEventListener('change', async e => {
  const f = e.target.files[0]; if (f) loadTrace(JSON.parse(await f.text()));
});
$('traceSel').addEventListener('change', e => { if (e.target.value) fetchTrace(e.target.value); });
$('play').addEventListener('click', play);
$('reset').addEventListener('click', reset);
document.addEventListener('keydown', e => {
  // not while typing or choosing; on a slider the arrows move the slider
  const tg = e.target;
  if (tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && tg.type !== 'range')) return;
  if (e.key === 'ArrowRight' && tg.type !== 'range') step();
  if (e.key === ' ') { e.preventDefault(); play(); }
});

// the texts that are not built with the controls: the title, the transport, the traces
function texts() {
  document.title = t('Decomposition playground', 'Laboratorio di decomposizione');
  $('play').textContent = timer ? t('Pause', 'Pausa') : t('Play', 'Avvia');
  $('step').textContent = t('Step', 'Passo');
  $('reset').textContent = t('Reset', 'Ricomincia');
  $('exportTrace').textContent = t('Export trace', 'Esporta la traccia');
  const real = t(' (real run)', ' (esecuzione reale)');
  for (const o of $('traceSel').options)
    o.textContent = !o.value ? t('none', 'nessuna') : { 'smspp-box-bundle': 'SMS++ BundleSolver', 'smspp-box-subgrad-volume': 'SMS++ SubGradSolver, Volume', 'smspp-box-subgrad': 'SMS++ SubGradSolver' }[o.value] + real;
}
onLang(() => { texts(); buildControls(); draw(); });

texts();
readParams(runs[0], true);
readParams(runs[1], true, 'b');
buildControls();
reset();
// the trace to replay is 'tr' ('t' is the prox parameter; an old link with a trace name in 't' still works)
const trq = q.get('tr') || (q.get('t') && isNaN(+q.get('t')) ? q.get('t') : null);
if (trq) { $('traceSel').value = trq; fetchTrace(trq); }
