// A small neural-network library for the scene F, in the spirit of nn.ts of the
// TensorFlow Playground: fully connected layers, a few activations, square
// loss, L1 or L2 regularization, dropout, mini-batches, and the optimizers of
// optiml.

export const activations = {
  relu: { f: x => Math.max(0, x), d: x => (x > 0 ? 1 : 0) },
  tanh: { f: x => Math.tanh(x), d: x => 1 - Math.tanh(x) ** 2 },
  sigmoid: { f: x => 1 / (1 + Math.exp(-x)), d: x => { const s = 1 / (1 + Math.exp(-x)); return s * (1 - s); } },
  linear: { f: x => x, d: () => 1 },
};

// a seeded generator, so that two networks can start from the same weights
export function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// shape: [inputs, hidden..., 1]; every node has a bias, every link a weight
export function build(shape, act, outAct, seed = 7) {
  const r = rng(seed), layers = [];
  shape.forEach((n, l) => {
    const layer = [];
    for (let i = 0; i < n; i++) {
      const node = { id: `${l}_${i}`, bias: l ? 0.1 : 0, out: 0, total: 0, d: 0, inputs: [], outputs: [], keep: 1, m: 1,
                     act: l === shape.length - 1 ? outAct : act, acc: 0, st: {} };
      if (l) for (const prev of layers[l - 1]) {
        const link = { src: prev, dst: node, w: r() - 0.5, acc: 0, st: {} };
        node.inputs.push(link); prev.outputs.push(link);
      }
      layer.push(node);
    }
    layers.push(layer);
  });
  return layers;
}

// with masked true the hidden units are multiplied by their factor `keep` of
// the dropout mask (see dropMask); without it every unit is on, as at test time
export function forward(net, x, masked = false) {
  net[0].forEach((n, i) => { n.out = x[i]; });
  for (let l = 1; l < net.length; l++)
    for (const n of net[l]) {
      n.total = n.bias + n.inputs.reduce((s, k) => s + k.w * k.src.out, 0);
      n.m = masked ? n.keep : 1;
      n.out = n.m * activations[n.act].f(n.total);
    }
  return net.at(-1)[0].out;
}

// inverted dropout: every hidden unit is dropped with probability p (keep = 0)
// or kept and scaled by 1 / (1 - p), so that its mean is unchanged and nothing
// has to be rescaled at test time; the inputs and the output are never dropped
export function dropMask(net, p, r) {
  for (let l = 1; l < net.length - 1; l++)
    for (const n of net[l]) n.keep = p > 0 && r() < p ? 0 : 1 / (1 - p);
}

// the derivatives of 1/2 (out - y)^2, accumulated over a batch, through the
// mask of the last forward
export function backward(net, y) {
  const out = net.at(-1)[0];
  out.d = out.out - y;
  for (let l = net.length - 1; l >= 1; l--) {
    for (const n of net[l]) {
      const dt = n.d * n.m * activations[n.act].d(n.total);
      n.acc += dt;
      for (const k of n.inputs) k.acc += dt * k.src.out;
      n._dt = dt;
    }
    for (const p of net[l - 1]) p.d = p.outputs.reduce((s, k) => s + k.w * k.dst._dt, 0);
  }
}

// one update of every parameter with the chosen optimizer
export const optimizers = {
  sgd: { name: 'SGD', upd: (g, st, lr) => -lr * g },
  momentum: { name: 'Momentum (Polyak)', upd: (g, st, lr) => (st.v = 0.9 * (st.v || 0) - lr * g) },
  nesterov: { name: 'Nesterov', upd: (g, st, lr) => { const v0 = st.v || 0; st.v = 0.9 * v0 - lr * g; return -0.9 * v0 + 1.9 * st.v; } },
  adagrad: { name: 'AdaGrad', upd: (g, st, lr) => { st.G = (st.G || 0) + g * g; return -lr * g / (Math.sqrt(st.G) + 1e-8); } },
  rmsprop: { name: 'RMSProp', upd: (g, st, lr) => { st.E = 0.9 * (st.E || 0) + 0.1 * g * g; return -lr * g / (Math.sqrt(st.E) + 1e-8); } },
  adam: { name: 'Adam', upd: (g, st, lr) => {
    st.t = (st.t || 0) + 1; st.m = 0.9 * (st.m || 0) + 0.1 * g; st.u = 0.999 * (st.u || 0) + 0.001 * g * g;
    return -lr * (st.m / (1 - 0.9 ** st.t)) / (Math.sqrt(st.u / (1 - 0.999 ** st.t)) + 1e-8);
  } },
};

export function update(net, opt, lr, reg, regRate, n) {
  const o = optimizers[opt];
  for (let l = 1; l < net.length; l++)
    for (const node of net[l]) {
      node.bias += o.upd(node.acc / n, node.st, lr);
      node.acc = 0;
      for (const k of node.inputs) {
        const rg = reg === 'L1' ? Math.sign(k.w) : reg === 'L2' ? k.w : 0;
        k.w += o.upd(k.acc / n + regRate * rg, k.st, lr);
        k.acc = 0;
      }
    }
}

// ------------------------------------------------------------------ data
// the data sets of the TensorFlow Playground, points in [-6, 6]^2
export function dataset(kind, n, noise, r) {
  const pts = [], gauss = () => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const push = (x, y, label) => pts.push({ x, y, label });
  if (kind === 'circle') {
    for (let i = 0; i < n; i++) {
      const inner = i < n / 2, rad = inner ? r() * 2.5 : 3.5 + r() * 1.5, a = r() * 2 * Math.PI;
      const x = rad * Math.sin(a) + noise * 3 * (r() - 0.5), y = rad * Math.cos(a) + noise * 3 * (r() - 0.5);
      push(x, y, Math.hypot(x, y) < 3 ? 1 : -1);
    }
  } else if (kind === 'xor') {
    for (let i = 0; i < n; i++) {
      let x = 10 * r() - 5, y = 10 * r() - 5;
      x += x > 0 ? 0.3 : -0.3; y += y > 0 ? 0.3 : -0.3;
      push(x + noise * 3 * (r() - 0.5), y + noise * 3 * (r() - 0.5), x * y >= 0 ? 1 : -1);
    }
  } else if (kind === 'gauss') {
    for (let i = 0; i < n; i++) {
      const pos = i < n / 2, c = pos ? 2 : -2, s = 0.6 + noise * 2;
      push(c + s * gauss(), c + s * gauss(), pos ? 1 : -1);
    }
  } else if (kind === 'spiral') {
    for (let i = 0; i < n; i++) {
      const pos = i < n / 2, j = pos ? i : i - n / 2, t = 1.75 * j / (n / 2) * 2 * Math.PI, rad = 5 * j / (n / 2), d = pos ? 0 : Math.PI;
      push(rad * Math.sin(t + d) + noise * 2 * (r() - 0.5), rad * Math.cos(t + d) + noise * 2 * (r() - 0.5), pos ? 1 : -1);
    }
  } else if (kind === 'plane') {
    for (let i = 0; i < n; i++) {
      const x = 12 * r() - 6, y = 12 * r() - 6;
      push(x, y, (x + y) / 12 + noise * (r() - 0.5));
    }
  } else if (kind === 'gaussreg') {
    const centres = [[-4, 2.5, 1], [0, 2.5, -1], [4, 2.5, 1], [-4, -2.5, -1], [0, -2.5, 1], [4, -2.5, -1]];
    for (let i = 0; i < n; i++) {
      const x = 12 * r() - 6, y = 12 * r() - 6;
      let label = 0;
      for (const [cx, cy, s] of centres) label += s * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / 4);
      push(x, y, label + noise * (r() - 0.5));
    }
  }
  return pts;
}

// label for the drawing, tex for the controls
export const features = {
  x1: { label: 'X₁', tex: 'X_1', f: (x) => x },
  x2: { label: 'X₂', tex: 'X_2', f: (x, y) => y },
  x1sq: { label: 'X₁²', tex: 'X_1^2', f: (x) => x * x },
  x2sq: { label: 'X₂²', tex: 'X_2^2', f: (x, y) => y * y },
  x1x2: { label: 'X₁X₂', tex: 'X_1 X_2', f: (x, y) => x * y },
  sinx1: { label: 'sin(X₁)', tex: '\\sin(X_1)', f: (x) => Math.sin(x) },
  sinx2: { label: 'sin(X₂)', tex: '\\sin(X_2)', f: (x, y) => Math.sin(y) },
};
