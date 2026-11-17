// The growth of the crystal off the main thread: frames of the grid while it
// grows (about 15 a second), then the plate at the resolution of the view.

import { simulate, plate } from './model.js';

onmessage = ({ data: { o, view } }) => {
  let last = 0;
  const frame = st => {
    const now = performance.now();
    if (now - last < 66) return;
    last = now;
    postMessage({ frame: true, s: st.s.slice(), age: st.age.slice(), R: st.R, W: st.W, steps: st.steps, radius: st.radius, frozen: st.frozen, band: st.band });
  };
  const sim = simulate(o, frame, 10);
  postMessage({ frame: true, done: true, s: sim.s, age: sim.age, R: sim.R, W: sim.W, steps: sim.steps, radius: sim.radius, frozen: sim.frozen, hist: sim.hist, band: sim.hist.length - 1 });
  const m = plate(sim, { ...view, size: 80, h: 0.35 });
  postMessage({ mesh: true, pos: m.pos, idx: m.idx }, [m.pos.buffer, m.idx.buffer]);
};
