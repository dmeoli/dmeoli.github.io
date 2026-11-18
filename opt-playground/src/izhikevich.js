// Scene U: the neuron of Izhikevich. The twenty behaviours of the lab
// (src/izhikevich-model.js) to pick, each with a sparkline of its run; the
// potential and the input drawn as they are integrated; the phase plane with
// the two nullclines, the vector field, the trajectory with its resets and the
// fixed points of the current input; the sliders of a, b, c, d and of the
// amplitude of the protocol, live; the equations; the f-I curve. The colours
// are the tokens of style.css, read at every drawing.

import { BEHAVIOURS, byId, labPars, input, init, step, simulate, times, dv, du, vNull, fixedPoints, rate, ampRange } from './izhikevich-model.js';
import { t as tx, onLang, onTheme, bi } from './i18n.js';
import { texClear, texSet, setTex } from './tex.js';

const $ = id => document.getElementById(id);
const S = { id: 'A', speed: 50, field: 'on' };
let p = null;   // a, b, c, d, P of the neuron on the screen

// ------------------------------------------------------------------ drawing kit
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function rgb(c) {
  if (c[0] === '#') {
    if (c.length === 4) c = '#' + [...c.slice(1)].map(x => x + x).join('');
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
}
const col = (a, al = 1) => `rgba(${a.join(',')},${al})`;
let P = null;
function palette() {
  P = {};
  for (const k of ['ground', 'ink', 'ink-soft', 'rule', 'accent', 'accent-2', 'lilac', 'gold', 'panel']) P[k] = rgb(css('--' + k));
}
const MONO = "'IBM Plex Mono', monospace";
function fit(cv, h, wmax) {
  const w = Math.max(220, Math.round(Math.min(wmax || 1e9, cv.parentNode.clientWidth || 500)));
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  cv.style.height = h + 'px'; cv.style.width = w + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = col(P.panel); ctx.fillRect(0, 0, w, h);
  return { ctx, W: w };
}
function ticks(a, b, n) {
  const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (k * st) <= n) * st, out = [];
  for (let v = Math.ceil(a / m - 1e-9) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6));
  return out;
}
function axes(ctx, box, X, Y, xt, yt, xl, yl) {
  const [x0, y0, x1, y1] = box;
  ctx.strokeStyle = col(P.rule); ctx.lineWidth = 1; ctx.fillStyle = col(P['ink-soft']); ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt) { const y = Y(v); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(String(v), x0 - 4, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of xt) { const x = X(v); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); if (xl !== null) ctx.fillText(String(v), x, y1 + 4); }
  if (xl) { ctx.textAlign = 'right'; ctx.fillText(xl, x1, y1 + 16); }
  if (yl) { ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(yl, x0, y0 - 4); }
}
// a legend of HTML items, with MathJax in the labels: [[colour token, kind, en, it]]
function key(el, items) {
  const html = items.map(([c, k, en, it]) => `<li style="color:var(--${c})"><i class="${k}"></i><span style="color:var(--ink-soft)">${bi(en, it)}</span></li>`).join('');
  if (el.dataset.html === html) return;
  texClear(el); el.innerHTML = html; el.dataset.html = html; texSet(el);
}
const fmt = (x, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d).replace('-', '−');
const num = x => String(+x.toFixed(4));   // a number for TeX, as short as it is

// ------------------------------------------------------------------ the families and the notes
const FAMS = [
  ['spiking', 'Spiking', 'Scarica'], ['bursting', 'Bursting', 'Burst'], ['excitability', 'Excitability and Threshold', 'Eccitabilità e soglia'],
  ['resonance', 'Resonance and Integration', 'Risonanza e integrazione'], ['rebound', 'Rebound', 'Rimbalzo'], ['bistability', 'Bistability', 'Bistabilità'],
  ['accommodation', 'Accommodation', 'Accomodazione'], ['inhibition', 'Inhibition-Induced', 'Indotti dall\'inibizione'],
];
const NOTES = {
  A: ['The step of 14 at \\(t = 10\\) makes the neuron fire repetitively, at first fast and then at a steady rate, as \\(u\\) grows by \\(d\\) at each spike: the step lifts the parabola above the line \\(u = bv\\), the two fixed points (the rest and the saddle that acts as a threshold) merge and disappear, and the trajectory, with nothing left to stop at, turns around the cycle of spike and reset.',
    'Il gradino di 14 a \\(t = 10\\) fa scaricare il neurone ripetutamente, prima in fretta e poi a frequenza costante, mentre \\(u\\) cresce di \\(d\\) a ogni impulso: il gradino alza la parabola sopra la retta \\(u = bv\\), i due punti fissi (il riposo e la sella che fa da soglia) si fondono e scompaiono, e la traiettoria, senza più nulla a cui fermarsi, percorre il ciclo di impulso e reset.'],
  B: ['The step of 0.5 at \\(t = 20\\) gives a single spike at the onset, and then the neuron stays silent: with \\(b = 0.25\\) the parabola still cuts the line \\(u = bv\\) under the step, so the fixed points survive it; the transient of the onset crosses the threshold once, and after the reset the trajectory falls into the basin of the new rest.',
    'Il gradino di 0.5 a \\(t = 20\\) dà un solo impulso all\'inizio, poi il neurone tace: con \\(b = 0.25\\) la parabola taglia ancora la retta \\(u = bv\\) sotto il gradino, così i punti fissi sopravvivono; il transitorio dell\'inizio supera la soglia una volta, e dopo il reset la traiettoria cade nel bacino del nuovo riposo.'],
  C: ['With a reset \\(c = -50\\) close to the threshold and a small \\(d = 2\\), each spike puts \\(v\\) back where it fires again within 2 or 3 ms, and only the growth of \\(u\\), by \\(d\\) at each spike, closes the burst, when the reset point \\((c, u + d)\\) rises above the parabola, where \\(v\' < 0\\); during the silence \\(u\\) decays at the slow rate \\(a = 0.02\\) until the next burst, about every 53 ms in the lab\'s run.',
    'Con un reset \\(c = -50\\) vicino alla soglia e un piccolo \\(d = 2\\), ogni impulso rimette \\(v\\) dove scarica di nuovo entro 2 o 3 ms, e solo la crescita di \\(u\\), di \\(d\\) a ogni impulso, chiude il burst, quando il punto di reset \\((c, u + d)\\) sale sopra la parabola, dove \\(v\' < 0\\); durante il silenzio \\(u\\) decade con la lenta velocità \\(a = 0.02\\) fino al burst successivo, circa ogni 53 ms nell\'esecuzione del laboratorio.'],
  D: ['One burst at the onset of the step of 0.6, then the rest: as in phasic spiking the fixed points survive the step, but the high reset \\(c = -55\\) and the tiny \\(d = 0.05\\) let the trajectory come back to the threshold several times (six spikes in the lab\'s run) before \\(u\\) has grown enough to hold it at the new rest.',
    'Un burst all\'inizio del gradino di 0.6, poi il riposo: come nella scarica fasica i punti fissi sopravvivono al gradino, ma il reset alto \\(c = -55\\) e il minimo \\(d = 0.05\\) lasciano che la traiettoria torni alla soglia più volte (sei impulsi nell\'esecuzione del laboratorio) prima che \\(u\\) sia cresciuta abbastanza da trattenerla nel nuovo riposo.'],
  E: ['A burst of three spikes at the onset of the step, then tonic spiking: while \\(u\\) is still low the reset point \\((c, u + d)\\), with \\(c = -55\\), lies under the parabola, where \\(v\' > 0\\), and the neuron fires again at once; after a few spikes, each adding \\(d = 4\\), it lies above, and from then on every spike is followed by a slow passage along the parabola.',
    'Un burst di tre impulsi all\'inizio del gradino, poi una scarica tonica: finché \\(u\\) è bassa il punto di reset \\((c, u + d)\\), con \\(c = -55\\), sta sotto la parabola, dove \\(v\' > 0\\), e il neurone scarica subito di nuovo; dopo pochi impulsi, ciascuno dei quali aggiunge \\(d = 4\\), sta sopra, e da allora ogni impulso è seguito da un lento passaggio lungo la parabola.'],
  F: ['The step of 30 makes the neuron fire at a high rate that falls spike after spike (the intervals grow from 2 to 29 ms in the lab\'s run): each spike adds \\(d = 8\\) to \\(u\\), which with \\(a = 0.01\\) forgets it slowly, so the recovery accumulates and the time needed to climb back to the threshold grows.',
    'Il gradino di 30 fa scaricare il neurone a una frequenza alta che cala impulso dopo impulso (gli intervalli crescono da 2 a 29 ms nell\'esecuzione del laboratorio): ogni impulso aggiunge \\(d = 8\\) a \\(u\\), che con \\(a = 0.01\\) lo dimentica lentamente, così il recupero si accumula e il tempo per risalire alla soglia cresce.'],
  G: ['Under a slow ramp of the current the neuron starts firing at a low rate, which then grows with \\(I\\): this is class 1 excitability, whose f-I curve rises continuously from zero, since the rest disappears in a saddle-node bifurcation on the cycle and near it the trajectory lingers as long as one likes. The lab, after Izhikevich, uses here \\(4.1 v + 108\\) in place of \\(5 v + 140\\), and \\(b = -0.1\\), which makes the rest a node.',
    'Sotto una lenta rampa di corrente il neurone comincia a scaricare a bassa frequenza, che poi cresce con \\(I\\): è l\'eccitabilità di classe 1, la cui curva f-I sale con continuità da zero, poiché il riposo scompare in una biforcazione sella-nodo sul ciclo e vicino a essa la traiettoria indugia quanto si vuole. Il laboratorio, come Izhikevich, usa qui \\(4.1 v + 108\\) al posto di \\(5 v + 140\\), e \\(b = -0.1\\), che fa del riposo un nodo.'],
  H: ['Under a ramp from \\(-0.5\\) the neuron is silent for a long time and then fires at once at about 50 Hz: this is class 2 excitability, whose f-I curve jumps from zero to a positive rate, since the rest, a stable focus, loses its stability at \\(I = 0.4\\) in an Andronov-Hopf bifurcation, before the two fixed points meet, and the oscillation that takes over has a frequency of its own; the delay of the first spike is that of the slow passage of the ramp.',
    'Sotto una rampa da \\(-0.5\\) il neurone tace a lungo e poi scarica subito a circa 50 Hz: è l\'eccitabilità di classe 2, la cui curva f-I salta da zero a una frequenza positiva, poiché il riposo, un fuoco stabile, perde la stabilità a \\(I = 0.4\\) in una biforcazione di Andronov-Hopf, prima che i due punti fissi si incontrino, e l\'oscillazione che subentra ha una frequenza propria; il ritardo del primo impulso è quello del lento passaggio della rampa.'],
  I: ['A pulse of 7.04 for 3 ms, just above the threshold, gives a spike about 14 ms after the pulse ends: the pulse leaves the trajectory just past the stable manifold of the saddle, where \\(v\'\\) is small, and it leaves that region slowly, the more slowly the smaller the excess over the threshold. The run is so close to the threshold that, with half the step of the lab, the spike is lost.',
    'Uno stimolo di 7.04 per 3 ms, appena sopra la soglia, dà un impulso circa 14 ms dopo la sua fine: lo stimolo lascia la traiettoria appena oltre la varietà stabile della sella, dove \\(v\'\\) è piccola, e la traiettoria ne esce lentamente, tanto più lentamente quanto minore è l\'eccesso sulla soglia. L\'esecuzione è così vicina alla soglia che, con metà del passo del laboratorio, l\'impulso si perde.'],
  J: ['A pulse of 2 for 5 ms gives one spike, and after it \\(v\\) returns to the rest through damped oscillations, since the rest is a stable focus, whose complex eigenvalues and period the box under the phase plane gives; the lab\'s plot magnifies the tail of \\(v\\) by 20 to show them, and in the phase plane they are the spiral around the rest.',
    'Uno stimolo di 2 per 5 ms dà un impulso, e dopo di questo \\(v\\) torna al riposo con oscillazioni smorzate, poiché il riposo è un fuoco stabile, i cui autovalori complessi e il cui periodo sono riportati sotto il piano delle fasi; il grafico del laboratorio ingrandisce di 20 volte la coda di \\(v\\) per mostrarle, e nel piano delle fasi sono la spirale attorno al riposo.'],
  K: ['Two pairs of brief pulses of 0.65, one 20 ms apart and one 40 ms apart: the first pair does nothing and the second gives a spike, because the rest is a stable focus whose damped oscillation has a period of about 41 ms, and a second pulse that arrives in phase with the oscillation left by the first adds to it. Such a neuron, a resonator, is selective to the timing of its input.',
    'Due coppie di brevi stimoli di 0.65, una a 20 ms di distanza e una a 40 ms: la prima coppia non fa nulla e la seconda dà un impulso, perché il riposo è un fuoco stabile la cui oscillazione smorzata ha un periodo di circa 41 ms, e un secondo stimolo che arriva in fase con l\'oscillazione lasciata dal primo si somma a essa. Un neurone così, un risonatore, è selettivo rispetto ai tempi del suo ingresso.'],
  L: ['Two pairs of pulses of 9 for 2 ms, the first 5 ms apart and the second 10 ms apart: only the close pair fires, since the rest is a node (with the parameters of class 1, real eigenvalues) and the effect of a pulse decays without oscillating, so the second pulse adds to what is left of the first, which is more the closer they are. This is an integrator, the counterpart of the resonator.',
    'Due coppie di stimoli di 9 per 2 ms, la prima a 5 ms di distanza e la seconda a 10 ms: solo la coppia vicina fa scaricare il neurone, poiché il riposo è un nodo (con i parametri della classe 1, autovalori reali) e l\'effetto di uno stimolo decade senza oscillare, così il secondo stimolo si somma a ciò che resta del primo, che è tanto più quanto più sono vicini. È un integratore, la controparte del risonatore.'],
  M: ['A negative pulse of \\(-15\\) for 5 ms is followed, after a while, by one spike: during the inhibition \\(v\\) falls and \\(u\\), which follows \\(bv\\) with \\(b > 0\\), falls with it, so that at the release the recovery is low and the trajectory overshoots the threshold on its way back to the rest. This is the post-inhibitory, or rebound, spike.',
    'Uno stimolo negativo di \\(-15\\) per 5 ms è seguito, dopo un po\', da un impulso: durante l\'inibizione \\(v\\) scende e \\(u\\), che segue \\(bv\\) con \\(b > 0\\), scende con essa, così che al rilascio il recupero è basso e la traiettoria oltrepassa la soglia tornando verso il riposo. È l\'impulso post-inibitorio, o di rimbalzo.'],
  N: ['The same negative pulse, with \\(c = -52\\) and \\(d = 0\\): the rebound is now a burst of seven spikes, since the high reset and the zero increment of \\(u\\) put the trajectory back past the threshold after each spike, until \\(u\\), growing with \\(v\\), closes the burst.',
    'Lo stesso stimolo negativo, con \\(c = -52\\) e \\(d = 0\\): il rimbalzo è ora un burst di sette impulsi, poiché il reset alto e l\'incremento nullo di \\(u\\) riportano la traiettoria oltre la soglia dopo ogni impulso, finché \\(u\\), crescendo con \\(v\\), chiude il burst.'],
  O: ['The same pulse of 1 for 5 ms is given at \\(t = 10\\) and at \\(t = 80\\): alone it does nothing, after the inhibitory pulse of \\(-6\\) at \\(t = 70\\) it fires, because the inhibition has lowered \\(u\\) and with it the threshold. The threshold of this neuron is a property of its state, which its recent input sets.',
    'Lo stesso stimolo di 1 per 5 ms è dato a \\(t = 10\\) e a \\(t = 80\\): da solo non fa nulla, dopo lo stimolo inibitorio di \\(-6\\) a \\(t = 70\\) fa scaricare il neurone, perché l\'inibizione ha abbassato \\(u\\) e con essa la soglia. La soglia di questo neurone è una proprietà del suo stato, che l\'ingresso recente determina.'],
  P: ['On a base current of 0.24 the neuron has a stable rest and a stable cycle of spikes together: the pulse at \\(t = 37.5\\) moves the state into the basin of the cycle and the neuron fires tonically, and the same pulse at \\(t = 216\\), arriving in the right phase, sends it back to the rest, so which of the two attractors one sees depends on the history of the input.',
    'Su una corrente di base di 0.24 il neurone ha insieme un riposo stabile e un ciclo stabile di impulsi: lo stimolo a \\(t = 37.5\\) porta lo stato nel bacino del ciclo e il neurone scarica in modo tonico, e lo stesso stimolo a \\(t = 216\\), arrivando nella fase giusta, lo rimanda al riposo, così quale dei due attrattori si vede dipende dalla storia dell\'ingresso.'],
  Q: ['A short pulse of 20 gives a spike, and after the reset \\(v\\) does not return to the rest at once but stays depolarized for a few ms, the after-potential: with \\(a = 1\\) the recovery \\(u\\) is as fast as \\(v\\), and the negative \\(d = -21\\) lowers it at the reset, so that \\(v\' > 0\\) after the spike. A second pulse in that window would need less current to fire.',
    'Un breve stimolo di 20 dà un impulso, e dopo il reset \\(v\\) non torna subito al riposo ma resta depolarizzato per qualche ms, il post-potenziale: con \\(a = 1\\) il recupero \\(u\\) è veloce quanto \\(v\\), e il \\(d = -21\\) negativo lo abbassa al reset, così che \\(v\' > 0\\) dopo l\'impulso. Un secondo stimolo in quella finestra avrebbe bisogno di meno corrente per far scaricare il neurone.'],
  R: ['A slow ramp up to 8 does not make the neuron fire, while a fast ramp up to only 4 does: \\(u\\) is slow (\\(a = 0.02\\)) but fast enough to follow the slow ramp and keep the neuron below threshold, which is accommodation, and too slow to follow the fast one. Here, as in the code of Izhikevich, \\(u\' = a b (v + 65)\\) has no decay, so its nullcline is the vertical line \\(v = -65\\).',
    'Una lenta rampa fino a 8 non fa scaricare il neurone, mentre una rampa veloce fino a soli 4 sì: \\(u\\) è lenta (\\(a = 0.02\\)) ma abbastanza veloce da seguire la rampa lenta e tenere il neurone sotto soglia, che è l\'accomodazione, e troppo lenta per seguire quella veloce. Qui, come nel codice di Izhikevich, \\(u\' = a b (v + 65)\\) non ha decadimento, così la sua isoclina è la retta verticale \\(v = -65\\).'],
  S: ['The neuron rests at \\(I = 80\\) and fires tonically while the current is lowered to 75: with \\(a < 0\\) and \\(b < 0\\) the roles of excitation and inhibition are swapped, and the rest, a stable fixed point at the high current, becomes unstable at the low one, as the type of the fixed points under the phase plane shows when the current changes.',
    'Il neurone riposa a \\(I = 80\\) e scarica in modo tonico mentre la corrente è abbassata a 75: con \\(a < 0\\) e \\(b < 0\\) i ruoli di eccitazione e inibizione si scambiano, e il riposo, un punto fisso stabile alla corrente alta, diventa instabile a quella bassa, come mostra il tipo dei punti fissi sotto il piano delle fasi quando la corrente cambia.'],
  T: ['The same swapped neuron with \\(c = -45\\) and \\(d = -2\\) fires two bursts while the current is lowered: the reset above the threshold and the negative \\(d\\) make each spike call the next, until the slow \\(u\\) closes the burst. Of the twenty behaviours this is the one that depends most on the step of the lab, \\(\\tau = 0.5\\): with a smaller step the bursts merge into a fast tonic discharge.',
    'Lo stesso neurone scambiato con \\(c = -45\\) e \\(d = -2\\) emette due burst mentre la corrente è abbassata: il reset sopra la soglia e il \\(d\\) negativo fanno sì che ogni impulso chiami il successivo, finché la lenta \\(u\\) chiude il burst. Dei venti comportamenti è quello che dipende di più dal passo del laboratorio, \\(\\tau = 0.5\\): con un passo più piccolo i burst si fondono in una scarica tonica veloce.'],
};

// ------------------------------------------------------------------ the run
let bh = null, run = null, playing = false;
function reset() {
  stop();
  const t = times(bh.tau, bh.T), n = t.length;
  run = { t, n, k: 0, s: init(bh, p), v: new Float64Array(n), u: new Float64Array(n), I: new Float64Array(n),
    vr: new Float64Array(n), ur: new Float64Array(n), fire: new Uint8Array(n), spikes: [], v0: 0, u0: 0, acc: 0 };
  run.v0 = run.s.v; run.u0 = run.s.u;
  ranges(true); drawAll();
}
function advance() {
  if (run.k >= run.n) return false;
  const q = run.k, I = input(bh, p.P, run.t[q]), f = step(bh, p, run.s, I, bh.tau);
  run.I[q] = I; run.v[q] = f ? 30 : run.s.vpre; run.u[q] = run.s.upre; run.vr[q] = run.s.v; run.ur[q] = run.s.u; run.fire[q] = f ? 1 : 0;
  if (f) run.spikes.push(q);
  run.k++;
  return true;
}
// the frames of the two plots, from a whole run with the parameters of now,
// widened (never narrowed) when the parameters change during a run
let R = null;
function ranges(fresh) {
  const sim = simulate(bh, p);
  let vlo = Math.min(-90, p.c - 5), ilo = Math.min(...sim.I), ihi = Math.max(...sim.I), ulo = Infinity, uhi = -Infinity, pmin = Infinity;
  for (let q = 0; q < sim.t.length; q++) { vlo = Math.min(vlo, sim.v[q] - 3); ulo = Math.min(ulo, sim.u[q]); uhi = Math.max(uhi, sim.u[q]); }
  if (!fresh) for (let q = 0; q < run.k; q++) { vlo = Math.min(vlo, run.v[q] - 3); ulo = Math.min(ulo, run.u[q], run.ur[q]); uhi = Math.max(uhi, run.u[q], run.ur[q]); }
  // the vertex of the parabola under the inputs of the protocol, and the fixed points
  const vtx = bh.l - bh.k * bh.k / (4 * bh.j);
  pmin = Math.min(vtx + ilo, ulo);
  for (const I of [ilo, ihi]) for (const f of fixedPoints(bh, p, I)) if (f.v > vlo && f.v < 30) { ulo = Math.min(ulo, f.u); uhi = Math.max(uhi, f.u); }
  ulo = Math.min(ulo, pmin);
  const us = Math.max(4, uhi - ulo), is = Math.max(1, ihi - ilo);
  const nr = { vlo: Math.max(vlo, -200), vhi: 35, ulo: ulo - 0.12 * us, uhi: uhi + 0.12 * us, ilo: ilo - 0.15 * is, ihi: ihi + 0.15 * is };
  if (!fresh && R) for (const k of ['vlo', 'ulo', 'ilo']) nr[k] = Math.min(nr[k], R[k]);
  if (!fresh && R) for (const k of ['uhi', 'ihi']) nr[k] = Math.max(nr[k], R[k]);
  R = nr;
}

// ------------------------------------------------------------------ the potential and the input
function drawScope() {
  const cv = $('scope'), { ctx, W } = fit(cv, 330), x0 = 40, x1 = W - 10;
  const bands = [[22, 222], [244, 300]], X = t => x0 + t / bh.T * (x1 - x0);
  const Yv = v => bands[0][1] - (v - R.vlo) / (R.vhi - R.vlo) * (bands[0][1] - bands[0][0]);
  const Yi = v => bands[1][1] - (v - R.ilo) / (R.ihi - R.ilo) * (bands[1][1] - bands[1][0]);
  const xt = ticks(0, bh.T, 8);
  axes(ctx, [x0, bands[0][0], x1, bands[0][1]], X, Yv, xt, ticks(R.vlo, R.vhi, 5), null, tx('v (mV)', 'v (mV)'));
  axes(ctx, [x0, bands[1][0], x1, bands[1][1]], X, Yi, xt, ticks(R.ilo, R.ihi, 2), tx('t (ms)', 't (ms)'), '');
  ctx.fillStyle = col(P['ink-soft']); ctx.font = `11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('I', x0 + 4, bands[1][0] - 2);
  // the whole protocol, faint, and what has been integrated so far
  ctx.strokeStyle = col(P['accent-2'], 0.3); ctx.lineWidth = 1.2; ctx.beginPath();
  for (let q = 0; q < run.n; q++) { const x = X(run.t[q]), y = Yi(input(bh, p.P, run.t[q])); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  if (run.k) {
    ctx.strokeStyle = col(P['accent-2']); ctx.lineWidth = 1.6; ctx.beginPath();
    for (let q = 0; q < run.k; q++) { const x = X(run.t[q]), y = Yi(run.I[q]); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = col(P.accent); ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(X(0), Yv(run.v0));
    for (let q = 0; q < run.k; q++) {
      ctx.lineTo(X(run.t[q]), Yv(run.v[q]));
      if (run.fire[q]) ctx.lineTo(X(run.t[q]), Yv(run.vr[q]));
    }
    ctx.stroke();
    // the spikes, marked above the potential
    ctx.strokeStyle = col(P.gold); ctx.lineWidth = 2;
    for (const q of run.spikes) { const x = X(run.t[q]); ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, 17); ctx.stroke(); }
    const x = X(run.t[run.k - 1]);
    ctx.strokeStyle = col(P.ink, 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, bands[0][0]); ctx.lineTo(x, bands[1][1]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = col(P['ink-soft']); ctx.font = `10px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  const n = run.spikes.length;
  ctx.fillText(tx(`${n} spike${n === 1 ? "" : "s"}`, `${n} impuls${n === 1 ? "o" : "i"}`), x1, bands[1][0] - 2);
}

// ------------------------------------------------------------------ the phase plane
const TYPE_IT = { 'stable node': 'nodo stabile', 'unstable node': 'nodo instabile', 'stable focus': 'fuoco stabile', 'unstable focus': 'fuoco instabile', saddle: 'sella', centre: 'centro' };
const nowI = () => (run.k ? run.I[run.k - 1] : input(bh, p.P, 0));
function drawPhase() {
  const cv = $('phase'), side = Math.min(520, cv.parentNode.clientWidth || 420), H = Math.round(side * 0.82);
  const { ctx, W } = fit(cv, H, 520), box = [44, 18, W - 12, H - 30];
  const X = v => box[0] + (v - R.vlo) / (R.vhi - R.vlo) * (box[2] - box[0]);
  const Y = u => box[3] - (u - R.ulo) / (R.uhi - R.ulo) * (box[3] - box[1]);
  axes(ctx, box, X, Y, ticks(R.vlo, R.vhi, 6), ticks(R.ulo, R.uhi, 5), tx('v (mV)', 'v (mV)'), 'u');
  const I = nowI();
  ctx.save(); ctx.beginPath(); ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); ctx.clip();
  // the vector field, as short strokes of fixed length on the screen
  if (S.field === 'on') {
    const nx = 22, ny = 16, sx = (box[2] - box[0]) / (R.vhi - R.vlo), sy = (box[3] - box[1]) / (R.uhi - R.ulo);
    ctx.strokeStyle = col(P['ink-soft'], 0.35); ctx.fillStyle = col(P['ink-soft'], 0.35); ctx.lineWidth = 1;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const v = R.vlo + (i + 0.5) / nx * (R.vhi - R.vlo), u = R.ulo + (j + 0.5) / ny * (R.uhi - R.ulo);
      let dx = dv(bh, v, u, I) * sx, dy = -du(bh, p, v, u) * sy;
      const L = Math.hypot(dx, dy);
      if (!(L > 0)) continue;
      dx = dx / L * 8; dy = dy / L * 8;
      const cx = X(v), cy = Y(u);
      ctx.beginPath(); ctx.moveTo(cx - dx / 2, cy - dy / 2); ctx.lineTo(cx + dx / 2, cy + dy / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + dx / 2, cy + dy / 2, 1.3, 0, 2 * Math.PI); ctx.fill();
    }
  }
  // the two nullclines
  ctx.strokeStyle = col(P['accent-2']); ctx.lineWidth = 2; ctx.beginPath();
  for (let q = 0; q <= 240; q++) { const v = R.vlo + q / 240 * (R.vhi - R.vlo), y = Y(vNull(bh, v, I)); q ? ctx.lineTo(X(v), y) : ctx.moveTo(X(v), y); }
  ctx.stroke();
  ctx.strokeStyle = col(P.gold); ctx.lineWidth = 2; ctx.beginPath();
  if (bh.acc) { ctx.moveTo(X(-65), box[1]); ctx.lineTo(X(-65), box[3]); }
  else { ctx.moveTo(X(R.vlo), Y(p.b * R.vlo)); ctx.lineTo(X(R.vhi), Y(p.b * R.vhi)); }
  ctx.stroke();
  // the trajectory, solid between the resets, dashed across them
  if (run.k) {
    ctx.strokeStyle = col(P.accent); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(run.v0), Y(run.u0));
    for (let q = 0; q < run.k; q++) {
      ctx.lineTo(X(run.v[q]), Y(run.u[q]));
      if (run.fire[q]) ctx.moveTo(X(run.vr[q]), Y(run.ur[q]));
    }
    ctx.stroke();
    ctx.strokeStyle = col(P['ink-soft'], 0.8); ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath();
    for (const q of run.spikes) { ctx.moveTo(X(run.v[q]), Y(run.u[q])); ctx.lineTo(X(run.vr[q]), Y(run.ur[q])); }
    ctx.stroke(); ctx.setLineDash([]);
    const q = run.k - 1;
    ctx.fillStyle = col(P.ink); ctx.strokeStyle = col(P.panel); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(run.vr[q]), Y(run.ur[q]), 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  // the fixed points of the input of now
  const fps = fixedPoints(bh, p, I);
  for (const f of fps) {
    const x = X(f.v), y = Y(f.u);
    ctx.lineWidth = 2; ctx.strokeStyle = col(P.ink); ctx.fillStyle = f.stable ? col(P.ink) : col(P.panel);
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (f.type === 'saddle') { ctx.beginPath(); ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5); ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5); ctx.stroke(); }
  }
  ctx.restore();
  ctx.fillStyle = col(P['accent-2']); ctx.font = `10px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`I = ${fmt(I)}`, box[2], box[1] - 3);
  fpNote(fps, I);
}
function fpNote(fps, I) {
  const el = $('fp');
  let s;
  if (!fps.length) s = tx(`Under \\(I = ${fmt(I, 2).replace("−", "-")}\\) the nullclines do not cross: no fixed point, and the trajectory can only fire.`,
    `Sotto \\(I = ${fmt(I, 2).replace("−", "-")}\\) le isocline non si incontrano: nessun punto fisso, e la traiettoria può solo scaricare.`);
  else {
    const one = f => {
      const ty = tx(f.type, TYPE_IT[f.type]);
      let e;
      if (f.disc < 0) {
        const w = f.eig[0].im, per = 2 * Math.PI / w;
        e = `\\(\\lambda = ${fmt(f.eig[0].re, 3)} \\pm ${fmt(w, 3)}\\,i\\), ` + tx(`period ${per.toFixed(0)} ms`, `periodo ${per.toFixed(0)} ms`);
      } else e = `\\(\\lambda = ${fmt(f.eig[0], 3)},\\ ${fmt(f.eig[1], 3)}\\)`;
      return `<b>${ty}</b> ` + tx('at', 'in') + ` \\((${fmt(f.v, 1)}, ${fmt(f.u, 2)})\\), ${e}`;
    };
    s = tx(`Under \\(I = ${fmt(I, 2).replace("−", "-")}\\): `, `Sotto \\(I = ${fmt(I, 2).replace("−", "-")}\\): `) + fps.map(one).join('; ') + '.';
  }
  s = s.replace(/−/g, '-');
  if (el.dataset.html === s) return;
  texClear(el); el.innerHTML = s; el.dataset.html = s; texSet(el);
}

// ------------------------------------------------------------------ the f-I curve
let fiCache = null;
function fiRange() { const r = ampRange(bh); return [r.lo, r.hi]; }
function drawFI() {
  const cv = $('fi'), { ctx, W } = fit(cv, 260), box = [46, 20, W - 12, 222], [lo, hi] = fiRange();
  const id = `${bh.id},${p.a},${p.b},${p.c},${p.d}`;
  if (!fiCache || fiCache.id !== id) {
    const Is = [], r = [];
    for (let q = 0; q <= 80; q++) { const I = lo + q / 80 * (hi - lo); Is.push(I); r.push(rate(bh, p, I)); }
    fiCache = { id, Is, r };
  }
  const inst = [];
  for (let k = 1; k < run.spikes.length; k++) {
    const q = run.spikes[k], dt = run.t[q] - run.t[run.spikes[k - 1]];
    inst.push([run.I[q], 1000 / dt]);
  }
  const rmax = Math.max(10, ...fiCache.r, ...inst.map(x => x[1]).filter(x => x < 2000)) * 1.08;
  const X = I => box[0] + (I - lo) / (hi - lo) * (box[2] - box[0]), Y = r => box[3] - r / rmax * (box[3] - box[1]);
  axes(ctx, box, X, Y, ticks(lo, hi, 7), ticks(0, rmax, 5), tx('constant input I', 'corrente costante I'), tx('rate (Hz)', 'frequenza (Hz)'));
  ctx.save(); ctx.beginPath(); ctx.rect(box[0], box[1] - 4, box[2] - box[0], box[3] - box[1] + 4); ctx.clip();
  ctx.strokeStyle = col(P.accent); ctx.lineWidth = 2.2; ctx.beginPath();
  fiCache.Is.forEach((I, q) => (q ? ctx.lineTo(X(I), Y(fiCache.r[q])) : ctx.moveTo(X(I), Y(fiCache.r[q]))));
  ctx.stroke();
  ctx.fillStyle = col(P.gold);
  for (const [I, r] of inst) { ctx.beginPath(); ctx.arc(X(I), Y(Math.min(r, rmax)), 3, 0, 2 * Math.PI); ctx.fill(); }
  const I = nowI(), x = X(I);
  ctx.strokeStyle = col(P.ink, 0.5); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x, box[1]); ctx.lineTo(x, box[3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  key($('fikey'), [['accent', '', 'rate under a constant \\(I\\)', 'frequenza sotto \\(I\\) costante'],
    ['gold', 'dot', 'instantaneous rates of the run', 'frequenze istantanee dell\'esecuzione'], ['ink-soft', 'dash', '\\(I(t)\\) of now', '\\(I(t)\\) del momento']]);
}

// ------------------------------------------------------------------ the equations, the cards, the note
function equations() {
  setTex($('eqv'), `\\(v' = ${num(bh.j)}\\, v^2 + ${num(bh.k)}\\, v + ${num(bh.l)} - u + I(t)\\)`);
  $('eqv').insertAdjacentHTML('beforeend', `<small>${bi('the membrane potential, in mV; time in ms', 'il potenziale di membrana, in mV; tempo in ms')}</small>`);
  setTex($('equ'), bh.acc ? `\\(u' = a\\, b\\, (v + 65), \\quad a = ${num(p.a)},\\ b = ${num(p.b)}\\)`
    : `\\(u' = a\\,(b v - u), \\quad a = ${num(p.a)},\\ b = ${num(p.b)}\\)`);
  $('equ').insertAdjacentHTML('beforeend', `<small>${bh.acc ? bi('the recovery, without decay, as in the code of Izhikevich for accommodation', 'il recupero, senza decadimento, come nel codice di Izhikevich per l\'accomodazione')
    : bi('the recovery: \\(a\\) its speed, \\(b\\) its sensitivity to \\(v\\)', 'il recupero: \\(a\\) la sua velocità, \\(b\\) la sua sensibilità a \\(v\\)')}</small>`);
  const uS = bh.acc ? 'u_k + \\tau\\, a b\\,(v_{k+1} + 65)' : 'u_k + \\tau\\, a\\,(b\\, v_{k+1} - u_k)';
  setTex($('eqstep'), `\\(v_{k+1} = v_k + \\tau\\, v'(v_k, u_k), \\quad u_{k+1} = ${uS}, \\quad \\tau = ${num(bh.tau)}\\)`);
  $('eqstep').insertAdjacentHTML('beforeend', `<small>${bi(`the step of the lab: \\(u\\) moves with the new \\(v\\), then the reset; from \\(v_0 = ${num(bh.v0)}\\), \\(u_0 = ${bh.u0 === null ? 'b v_0' : num(bh.u0)}\\), up to ${bh.T} ms; \\(c = ${num(p.c)}\\), \\(d = ${num(p.d)}\\)`,
    `il passo del laboratorio: \\(u\\) si muove con la nuova \\(v\\), poi il reset; da \\(v_0 = ${num(bh.v0)}\\), \\(u_0 = ${bh.u0 === null ? 'b v_0' : num(bh.u0)}\\), fino a ${bh.T} ms; \\(c = ${num(p.c)}\\), \\(d = ${num(p.d)}\\)`)}</small>`);
  setTex($('eqnull'), `\\(u = ${num(bh.j)}\\, v^2 + ${num(bh.k)}\\, v + ${num(bh.l)} + I, \\qquad ${bh.acc ? 'v = -65' : 'u = b\\, v'}\\)`);
  $('eqnull').insertAdjacentHTML('beforeend', `<small>${bh.acc ? bi('the two nullclines; they cross once, at \\(v = -65\\)', 'le due isocline; si incontrano una volta, in \\(v = -65\\)')
    : bi(`the two nullclines; they cross where \\(${num(bh.j)}\\, v^2 + (${num(bh.k)} - b)\\, v + ${num(bh.l)} + I = 0\\), so at most twice`,
      `le due isocline; si incontrano dove \\(${num(bh.j)}\\, v^2 + (${num(bh.k)} - b)\\, v + ${num(bh.l)} + I = 0\\), quindi al più due volte`)}</small>`);
  for (const id of ['eqv', 'equ', 'eqstep', 'eqnull']) { const sm = $(id).querySelector('small'); texSet(sm); delete $(id).dataset.tex; }
}
const spark = {};
function cards() {
  const el = $('picker');
  el.innerHTML = FAMS.map(([f, en, it]) => `<div class="fam"><h3>${bi(en, it)}</h3><div class="cards">` +
    BEHAVIOURS.filter(q => q.fam === f).map(q => `<button type="button" class="card" data-id="${q.id}"><b>${q.id}</b><span>${bi(q.en, q.it)}</span><canvas></canvas></button>`).join('') +
    '</div></div>').join('');
  for (const b of el.querySelectorAll('.card')) b.onclick = () => choose(b.dataset.id);
  for (const q of BEHAVIOURS) spark[q.id] = simulate(q);
}
function drawCards() {
  for (const b of $('picker').querySelectorAll('.card')) {
    b.setAttribute('aria-pressed', b.dataset.id === bh.id);
    const cv = b.querySelector('canvas'), w = 84, h = 26, d = window.devicePixelRatio || 1;
    cv.width = w * d; cv.height = h * d;
    const ctx = cv.getContext('2d'), s = spark[b.dataset.id];
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = col(P.ground); ctx.fillRect(0, 0, w, h);
    let lo = Math.min(...s.v), T = s.t[s.t.length - 1];
    ctx.strokeStyle = col(b.dataset.id === bh.id ? P.accent : P['accent-2']); ctx.lineWidth = 1; ctx.beginPath();
    for (let q = 0; q < s.t.length; q++) { const x = 1 + s.t[q] / T * (w - 2), y = h - 2 - (s.v[q] - lo) / (30 - lo) * (h - 4); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
}
function note() {
  const s = `<b>${bh.id}. ${tx(bh.en, bh.it)}.</b> ` + tx(...NOTES[bh.id]);
  const el = $('note');
  if (el.dataset.html === s) return;
  texClear(el); el.innerHTML = s; el.dataset.html = s; texSet(el);
}
function phaseKey() {
  key($('phasekey'), [['accent-2', '', '\\(v\\)-nullcline', 'isoclina di \\(v\\)'], ['gold', '', '\\(u\\)-nullcline', 'isoclina di \\(u\\)'],
    ['accent', '', 'trajectory', 'traiettoria'], ['ink-soft', 'dash', 'reset', 'reset'], ['ink', 'dot', 'stable', 'stabile'], ['ink', 'ring', 'unstable', 'instabile']]);
}

// ------------------------------------------------------------------ the sliders
const KN = { a: 3, b: 2, c: 1, d: 2 };
function digitsP() { const st = ampRange(bh).step; return Math.max(0, Math.min(4, -Math.floor(Math.log10(st) + 1e-9))); }
function sliders() {
  for (const k of Object.keys(KN)) { $(k).value = p[k]; $(k + 'v').textContent = fmt(p[k], KN[k]); }
  const r = ampRange(bh), el = $('P');
  el.min = r.lo; el.max = r.hi; el.step = r.step; el.value = p.P; $('Pv').textContent = fmt(p.P, digitsP());
}
function edited() {
  fiCache = null; ranges(false); equations(); save(); drawAll();
}
for (const k of [...Object.keys(KN), 'P']) {
  $(k).oninput = e => {
    p[k] = +e.target.value; $(k + 'v').textContent = fmt(p[k], k === 'P' ? digitsP() : KN[k]);
    edited();
  };
}
$('lab').onclick = () => { p = labPars(bh); sliders(); fiCache = null; equations(); save(); reset(); };

// ------------------------------------------------------------------ transport
function drawAll() { drawScope(); drawPhase(); drawFI(); $('clock').textContent = run.k ? run.t[run.k - 1].toFixed(1) : '0.0'; }
function stop() { playing = false; $('play').textContent = tx('Play', 'Avvia'); }
let last = 0;
function frame(ts) {
  if (!playing) return;
  const dt = Math.min(100, ts - last); last = ts;
  run.acc += dt / 1000 * S.speed / bh.tau;
  let m = 0;
  while (run.acc >= 1 && m < 4000) { if (!advance()) break; run.acc -= 1; m++; }
  drawAll();
  if (run.k >= run.n) return stop();
  requestAnimationFrame(frame);
}
function play() {
  if (playing) return stop();
  if (run.k >= run.n) reset();
  playing = true; run.acc = 0; $('play').textContent = tx('Pause', 'Pausa');
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(frame); });
}
function choose(id) {
  bh = byId(id); S.id = id; p = labPars(bh);
  sliders(); equations(); note(); drawCards(); fiCache = null; save(); reset();
}

function save() {
  const o = { id: S.id, speed: S.speed, field: S.field, a: p.a, b: p.b, c: p.c, d: p.d, P: p.P };
  history.replaceState(null, '', '#' + new URLSearchParams(o));
}

$('speed').onchange = e => { S.speed = +e.target.value; save(); };
$('field').onchange = e => { S.field = e.target.value; save(); drawPhase(); };
$('reset').onclick = reset;
$('step').onclick = () => { stop(); if (run.k >= run.n) reset(); advance(); drawAll(); };
$('play').onclick = play;
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); $('step').onclick(); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});

function words() {
  document.title = tx('Izhikevich Neurons', 'Neuroni di Izhikevich');
  $('field').options[0].textContent = tx('shown', 'mostrato'); $('field').options[1].textContent = tx('hidden', 'nascosto');
  $('reset').textContent = tx('Reset', 'Ricomincia'); $('step').textContent = tx('Step', 'Passo');
  $('play').textContent = playing ? tx('Pause', 'Pausa') : tx('Play', 'Avvia');
}
function redrawAll() { palette(); drawCards(); if (run) drawAll(); }
onLang(() => { words(); note(); redrawAll(); });
onTheme(redrawAll);
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redrawAll, 100); });

// ------------------------------------------------------------------ start, from the hash if any
palette(); words(); cards(); phaseKey();
{
  const h = new URLSearchParams(location.hash.slice(1));
  const id = h.get('id');
  bh = byId(id && byId(id) ? id : 'A'); S.id = bh.id; p = labPars(bh);
  if (['10', '25', '50', '100', '250'].includes(h.get('speed'))) S.speed = +h.get('speed');
  if (['on', 'off'].includes(h.get('field'))) S.field = h.get('field');
  for (const k of ['a', 'b', 'c', 'd', 'P']) { const x = parseFloat(h.get(k)); if (Number.isFinite(x)) p[k] = x; }
  $('speed').value = String(S.speed); $('field').value = S.field;
  sliders(); equations(); note(); drawCards(); save(); reset();
}
