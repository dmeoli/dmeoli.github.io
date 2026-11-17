// The worker that grows the scene: the coral particle by particle or the
// pattern step by step, in chunks, posting a snapshot after each so that the
// page shows the growth while it stays responsive.
//   in:  { cmd: 'start', mode, o, target } | { cmd: 'play' } | { cmd: 'pause' } | { cmd: 'step' }
//   out: { mode, data, done, extra }

import { DLA, GrayScott, massRadius } from './model.js';

let sim = null, mode = 'coral', target = 0, playing = false, timer = 0, gen = 0;

function snapshot() {
  if (mode === 'coral') {
    const data = sim.data();
    postMessage({ mode, data, done: sim.n >= target, extra: { mr: massRadius(data), walks: sim.walks } });
  } else {
    postMessage({ mode, data: sim.data(), done: sim.t >= target, extra: { u: sim.u.slice() } });
  }
}

// one chunk of work, about 40 ms
function chunk() {
  const t0 = performance.now();
  if (mode === 'coral') {
    while (sim.n < target && performance.now() - t0 < 40) sim.grow(Math.min(target, sim.n + 20), 4000);
  } else {
    while (sim.t < target && performance.now() - t0 < 40) sim.step(Math.min(50, target - sim.t));
  }
}

function run(g) {
  if (g !== gen || !playing) return;
  chunk(); snapshot();
  const left = mode === 'coral' ? sim.n < target : sim.t < target;
  if (left) timer = setTimeout(() => run(g), 0); else playing = false;
}

onmessage = ({ data: m }) => {
  if (m.cmd === 'start') {
    clearTimeout(timer); gen++;
    mode = m.mode; target = m.target;
    sim = mode === 'coral' ? new DLA(m.o) : new GrayScott(m.o);
    playing = m.play !== false; snapshot();
    if (playing) run(gen);
  } else if (m.cmd === 'play') {
    if (m.target) target = m.target;
    if (!playing) { playing = true; run(gen); }
  } else if (m.cmd === 'pause') {
    playing = false; clearTimeout(timer);
  } else if (m.cmd === 'step') {
    playing = false; clearTimeout(timer);
    // a fixed amount of growth: 100 particles or 200 steps, past the target too
    if (mode === 'coral') { target = Math.max(target, sim.n + 100); sim.grow(sim.n + 100, 40000); }
    else { target = Math.max(target, sim.t + 200); sim.step(200); }
    snapshot();
  }
};
