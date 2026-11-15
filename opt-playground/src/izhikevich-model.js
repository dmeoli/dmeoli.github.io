// The model of scene U (izhikevich.html): the neuron of Izhikevich (2003),
//   v' = j v^2 + k v + l - u + I,   u' = a (b v - u),
//   if v > 30 then v <- c, u <- u + d,
// with j, k, l = 0.04, 5, 140 (4.1 and 108 for class 1 excitability and the
// integrator, and u' = a b (v + 65) for accommodation, as in the figure code of
// Izhikevich 2004), integrated as in the lab of the course of Computational
// Neuroscience (LAB1/Assignment 1 of dmeoli/ComputationalNeuroscience): one
// explicit step of v, then one of u with the new v, the reset after both.
// The 20 behaviours carry the a, b, c, d, the protocol I(t), the step tau, the
// length and the initial state of the 20 scripts of the lab.

// the times of the lab, 0:tau:T as MATLAB builds them (the first half from 0,
// the second half back from T), so that the tests t > T1 fall on the same steps
export function times(tau, T) {
  const n = Math.floor(T / tau + 1e-10), t = new Float64Array(n + 1);
  for (let q = 0; q <= n; q++) t[q] = q <= n / 2 ? q * tau : T - (n - q) * tau;
  return t;
}

// the protocols of the scripts, literally; P is the amplitude of the protocol
// (the level of its step or pulse, the top of its ramp), and a P other than the
// one of the lab scales the protocol around its base
const B = (id, fam, en, it, p) => ({ id, fam, en, it, j: 0.04, k: 5, l: 140, acc: false, u0: null, ...p });
export const BEHAVIOURS = [
  B('A', 'spiking', 'Tonic spiking', 'Scarica tonica', { a: 0.02, b: 0.2, c: -65, d: 6, v0: -70, tau: 0.25, T: 100, base: 0, P: 14,
    lab: t => (t > 10 ? 14 : 0) }),
  B('B', 'spiking', 'Phasic spiking', 'Scarica fasica', { a: 0.02, b: 0.25, c: -65, d: 6, v0: -64, tau: 0.25, T: 200, base: 0, P: 0.5,
    lab: t => (t > 20 ? 0.5 : 0) }),
  B('C', 'bursting', 'Tonic bursting', 'Burst tonici', { a: 0.02, b: 0.2, c: -50, d: 2, v0: -70, tau: 0.25, T: 220, base: 0, P: 15,
    lab: t => (t > 22 ? 15 : 0) }),
  B('D', 'bursting', 'Phasic bursting', 'Burst fasico', { a: 0.02, b: 0.25, c: -55, d: 0.05, v0: -64, tau: 0.2, T: 200, base: 0, P: 0.6,
    lab: t => (t > 20 ? 0.6 : 0) }),
  B('E', 'bursting', 'Mixed Mode', 'Modo misto', { a: 0.02, b: 0.2, c: -55, d: 4, v0: -70, tau: 0.25, T: 160, base: 0, P: 10,
    lab: t => (t > 16 ? 10 : 0) }),
  B('F', 'spiking', 'Spike Frequency Adaptation', 'Adattamento della frequenza', { a: 0.01, b: 0.2, c: -65, d: 8, v0: -70, tau: 0.25, T: 85, base: 0, P: 30,
    lab: t => (t > 8.5 ? 30 : 0) }),
  B('G', 'excitability', 'Class 1 Excitable', 'Eccitabilità di classe 1', { a: 0.02, b: -0.1, c: -55, d: 6, k: 4.1, l: 108, v0: -60, tau: 0.25, T: 300, base: 0, P: 20.25,
    lab: t => (t > 30 ? 0.075 * (t - 30) : 0) }),
  B('H', 'excitability', 'Class 2 Excitable', 'Eccitabilità di classe 2', { a: 0.2, b: 0.26, c: -65, d: 0, v0: -64, tau: 0.25, T: 300, base: -0.5, P: 3.55,
    lab: t => (t > 30 ? -0.5 + 0.015 * (t - 30) : -0.5) }),
  B('I', 'excitability', 'Spike Latency', 'Latenza dell\'impulso', { a: 0.02, b: 0.2, c: -65, d: 6, v0: -70, tau: 0.2, T: 100, base: 0, P: 7.04,
    lab: t => (t > 10 && t < 13 ? 7.04 : 0) }),
  B('J', 'resonance', 'Subthreshold Oscillations', 'Oscillazioni sottosoglia', { a: 0.05, b: 0.26, c: -60, d: 0, v0: -62, tau: 0.25, T: 200, base: 0, P: 2,
    lab: t => (t > 20 && t < 25 ? 2 : 0) }),
  B('K', 'resonance', 'Resonator', 'Risonatore', { a: 0.1, b: 0.26, c: -60, d: -1, v0: -62, tau: 0.25, T: 400, base: 0, P: 0.65,
    lab: t => ((t > 40 && t < 44) || (t > 60 && t < 64) || (t > 280 && t < 284) || (t > 320 && t < 324) ? 0.65 : 0) }),
  B('L', 'resonance', 'Integrator', 'Integratore', { a: 0.02, b: -0.1, c: -55, d: 6, k: 4.1, l: 108, v0: -60, tau: 0.25, T: 100, base: 0, P: 9,
    lab: t => { const T1 = 100 / 11, T2 = T1 + 5, T3 = 0.7 * 100, T4 = T3 + 10;
      return (t > T1 && t < T1 + 2) || (t > T2 && t < T2 + 2) || (t > T3 && t < T3 + 2) || (t > T4 && t < T4 + 2) ? 9 : 0; } }),
  B('M', 'rebound', 'Rebound Spike', 'Impulso di rimbalzo', { a: 0.03, b: 0.25, c: -60, d: 4, v0: -64, tau: 0.2, T: 200, base: 0, P: -15,
    lab: t => (t > 20 && t < 25 ? -15 : 0) }),
  B('N', 'rebound', 'Rebound Burst', 'Burst di rimbalzo', { a: 0.03, b: 0.25, c: -52, d: 0, v0: -64, tau: 0.2, T: 200, base: 0, P: -15,
    lab: t => (t > 20 && t < 25 ? -15 : 0) }),
  B('O', 'excitability', 'Threshold Variability', 'Soglia variabile', { a: 0.03, b: 0.25, c: -60, d: 4, v0: -64, tau: 0.25, T: 100, base: 0, P: 1,
    lab: t => ((t > 10 && t < 15) || (t > 80 && t < 85) ? 1 : t > 70 && t < 75 ? -6 : 0) }),
  B('P', 'bistability', 'Bistability', 'Bistabilità', { a: 0.1, b: 0.26, c: -60, d: 0, v0: -61, tau: 0.25, T: 300, base: 0.24, P: 1.24,
    lab: t => ((t > 300 / 8 && t < 300 / 8 + 5) || (t > 216 && t < 221) ? 1.24 : 0.24) }),
  B('Q', 'bistability', 'Depolarizing After-Potential', 'Post-potenziale depolarizzante', { a: 1, b: 0.2, c: -60, d: -21, v0: -70, tau: 0.25, T: 50, base: 0, P: 20,
    lab: t => (Math.abs(t - 10) < 1 ? 20 : 0) }),
  B('R', 'accommodation', 'Accommodation', 'Accomodazione', { a: 0.02, b: 1, c: -55, d: 4, acc: true, v0: -65, u0: -16, tau: 0.5, T: 400, base: 0, P: 8,
    lab: t => (t < 200 ? t / 25 : t < 300 ? 0 : t < 312.5 ? (t - 300) / 12.5 * 4 : 0) }),
  B('S', 'inhibition', 'Inhibition-Induced Spiking', 'Scarica indotta dall\'inibizione', { a: -0.02, b: -1, c: -60, d: 8, v0: -63.8, tau: 0.5, T: 350, base: 80, P: 75,
    lab: t => (t < 50 || t > 250 ? 80 : 75) }),
  B('T', 'inhibition', 'Inhibition-Induced Bursting', 'Burst indotti dall\'inibizione', { a: -0.026, b: -1, c: -45, d: -2, v0: -63.8, tau: 0.5, T: 350, base: 80, P: 75,
    lab: t => (t < 50 || t > 250 ? 80 : 75) }),
].sort((x, y) => (x.id < y.id ? -1 : 1));
export const byId = id => BEHAVIOURS.find(q => q.id === id);

// the parameters of a behaviour as the lab sets them
export const labPars = bh => ({ a: bh.a, b: bh.b, c: bh.c, d: bh.d, P: bh.P });

// the input at time t with amplitude P: the lab's own when P is the lab's
export function input(bh, P, t) {
  const x = bh.lab(t);
  return P === bh.P ? x : bh.base + (x - bh.base) * (P - bh.base) / (bh.P - bh.base);
}

// the right-hand side, for the vector field and the nullclines
export const dv = (bh, v, u, I) => bh.j * v * v + bh.k * v + bh.l - u + I;
export const du = (bh, p, v, u) => (bh.acc ? p.a * p.b * (v + 65) : p.a * (p.b * v - u));
// the v-nullcline u = j v^2 + k v + l + I, and the u-nullcline: u = b v, or the
// vertical line v = -65 when u' = a b (v + 65)
export const vNull = (bh, v, I) => bh.j * v * v + bh.k * v + bh.l + I;
export const uNull = (bh, p, v) => (bh.acc ? NaN : p.b * v);

// one step of the lab from the state s = {v, u} under the input I, in place;
// returns true when the neuron fires (the peak, recorded as 30, is s.peak)
export function step(bh, p, s, I, tau) {
  let v = s.v + tau * (bh.j * s.v * s.v + bh.k * s.v + bh.l - s.u + I);
  let u = bh.acc ? s.u + tau * p.a * (p.b * (v + 65)) : s.u + tau * p.a * (p.b * v - s.u);
  if (!Number.isFinite(v) || !Number.isFinite(u)) { v = p.c; u = p.b * p.c; }
  s.vpre = v; s.upre = u;
  const fire = v > 30;
  if (fire) { v = p.c; u += p.d; }
  s.v = v; s.u = u;
  return fire;
}

export const init = (bh, p) => ({ v: bh.v0, u: bh.u0 === null ? p.b * bh.v0 : bh.u0 });

// a whole run of the protocol: the times, the input, the recorded potential
// (30 at a spike, as the lab plots it), the recovery variable before the reset,
// and the spike times; tau and T default to the lab's
export function simulate(bh, p = labPars(bh), tau = bh.tau, T = bh.T) {
  const t = times(tau, T), n = t.length, I = new Float64Array(n), v = new Float64Array(n), u = new Float64Array(n);
  const s = init(bh, p), spikes = [];
  for (let q = 0; q < n; q++) {
    I[q] = input(bh, p.P, t[q]);
    const f = step(bh, p, s, I[q], tau);
    v[q] = f ? 30 : s.vpre; u[q] = s.upre;
    if (f) spikes.push(t[q]);
  }
  return { t, I, v, u, spikes };
}

// the same protocol with each step of the lab split in m substeps of tau/m,
// the input held over the step as the lab holds it; the spike times are the
// ends of the substeps that fire, to compare with t + tau of the lab
export function simulateFine(bh, p, m) {
  const t = times(bh.tau, bh.T), h = bh.tau / m, s = init(bh, p), spikes = [];
  for (let q = 0; q < t.length; q++) {
    const I = input(bh, p.P, t[q]);
    for (let r = 0; r < m; r++) if (step(bh, p, s, I, h)) spikes.push(t[q] + (r + 1) * h);
  }
  return spikes;
}

// the fixed points under a constant I, with their type from the Jacobian
// [[2 j v + k, -1], [a b, -a]] (or [[2 j v + k, -1], [a b, 0]] for u' = a b (v + 65))
export function fixedPoints(bh, p, I) {
  const vs = [];
  if (bh.acc) vs.push(-65);
  else {
    const A = bh.j, Bq = bh.k - p.b, C = bh.l + I, D = Bq * Bq - 4 * A * C;
    if (D >= 0) { const r = Math.sqrt(D); vs.push((-Bq - r) / (2 * A), (-Bq + r) / (2 * A)); }
  }
  return vs.map(v => {
    const J = [[2 * bh.j * v + bh.k, -1], [p.a * p.b, bh.acc ? 0 : -p.a]];
    return { v, u: vNull(bh, v, I), J, ...classify(J) };
  });
}

export function classify(J) {
  const tr = J[0][0] + J[1][1], det = J[0][0] * J[1][1] - J[0][1] * J[1][0], disc = tr * tr - 4 * det;
  const eig = disc >= 0 ? [(tr - Math.sqrt(disc)) / 2, (tr + Math.sqrt(disc)) / 2] : [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }];
  let type;
  if (det < 0) type = 'saddle';
  else if (disc < 0) type = Math.abs(tr) < 1e-12 ? 'centre' : tr < 0 ? 'stable focus' : 'unstable focus';
  else type = tr < 0 ? 'stable node' : 'unstable node';
  return { tr, det, disc, eig, type, stable: det > 0 && tr < 0 };
}

// the f-I curve: the rate in Hz (the time is in ms) under a constant input,
// from the initial state of the behaviour, counted over the second half of a
// run of len ms
export function rate(bh, p, I, len = 1000) {
  const s = init(bh, p), n = Math.round(len / bh.tau), half = n >> 1;
  let c = 0;
  for (let q = 0; q < n; q++) if (step(bh, p, s, I, bh.tau) && q >= half) c++;
  return c / ((n - half) * bh.tau) * 1000;
}

// the range of the amplitude slider: the protocol between its base and its
// amplitude, widened by as much on each side
export function ampRange(bh) {
  const span = Math.max(0.5, Math.abs(bh.P - bh.base)), lo = Math.min(bh.base, bh.P) - span, hi = Math.max(bh.base, bh.P) + span;
  let st = Math.pow(10, Math.floor(Math.log10(span / 100)));
  const on = x => Math.abs(x / st - Math.round(x / st)) < 1e-9;
  while (!(on(bh.P) && on(bh.base))) st /= 10;   // the lab's values stay on the grid
  return { lo: Math.floor(lo / st) * st, hi: Math.ceil(hi / st) * st, step: st };
}
