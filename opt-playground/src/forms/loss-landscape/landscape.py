"""The loss landscapes of the scene loss-landscape, computed offline.

Two models are trained by full-batch gradient descent on the same 200 points
of two interleaved half moons: a network with eight hidden layers of 16 tanh
units and no skip connections, whose loss is far from convex in its weights,
and a logistic regression, whose loss is convex.
After Li, Xu, Taylor, Studer and Goldstein, "Visualizing the Loss Landscape of
Neural Nets" (NeurIPS 2018), the loss is evaluated on the plane
theta* + a d1 + b d2 through the trained weights theta*, for three choices of
the directions: (i) two random Gaussian directions, filter-normalized (each
row of a weight matrix, the weights into one unit, rescaled to the norm of
the same row of theta*, the biases left out), for a, b in [-1.5, 1.5] (in
[-2, 2] for the regression); (ii) the first two principal components of the
descent path theta_k - theta*, the plane where the path lies best (their
section 7); (iii) the segment from theta* to the initial weights theta_0 (as
in Goodfellow, Vinyals and Saxe, 2015) and a random filter-normalized
direction orthogonal to it, so that the plane holds both ends of the path.
The path is projected on every plane by least squares. Plain numpy, a few
minutes; the result is written to data.js next to this file.

    python3 src/forms/loss-landscape/landscape.py
"""

import json
import os

import numpy as np

N, GRID = 200, 121
rng = np.random.default_rng(7)


def moons(n, noise=0.12):
    t = rng.uniform(0, np.pi, n)
    up = rng.random(n) < 0.5
    x = np.where(up, np.cos(t), 1 - np.cos(t))
    y = np.where(up, np.sin(t), 0.5 - np.sin(t))
    X = np.stack([x, y], 1) + noise * rng.standard_normal((n, 2))
    X = (X - X.mean(0)) / X.std(0)
    return X, up.astype(float)


X, Y = moons(N)


class Net:
    """A multilayer perceptron as a list of (W, b), sigmoid output, binary
    cross-entropy plus wd/2 |W|^2; layers = [2, 16, 16, 1] or [2, 1]."""

    def __init__(self, layers, wd):
        self.layers, self.wd = layers, wd
        self.shapes = [(layers[i + 1], layers[i]) for i in range(len(layers) - 1)]

    def unpack(self, th):
        out, k = [], 0
        for (o, i) in self.shapes:
            W = th[k:k + o * i].reshape(o, i); k += o * i
            b = th[k:k + o]; k += o
            out.append((W, b))
        return out

    def size(self):
        return sum(o * i + o for (o, i) in self.shapes)

    def init(self, scale=1.0):
        parts = []
        for (o, i) in self.shapes:
            parts += [rng.standard_normal(o * i) * scale * np.sqrt(1 / i), np.zeros(o)]
        return np.concatenate(parts)

    def loss_grad(self, th, grad=True):
        P = self.unpack(th)
        acts, h = [X], X
        for li, (W, b) in enumerate(P):
            z = h @ W.T + b
            h = np.tanh(z) if li < len(P) - 1 else z
            acts.append(h)
        z = acts[-1][:, 0]
        p = 1 / (1 + np.exp(-z))
        ce = np.mean(np.logaddexp(0, z) - Y * z)
        reg = 0.5 * self.wd * sum((W ** 2).sum() for W, _ in P)
        if not grad:
            return ce + reg, np.mean((p > 0.5) == (Y > 0.5))
        g, dz = [], ((p - Y) / N)[:, None]
        for li in range(len(P) - 1, -1, -1):
            W, b = P[li]
            g.append((dz.T @ acts[li] + self.wd * W, dz.sum(0)))
            if li:
                dz = (dz @ W) * (1 - acts[li] ** 2)
        g.reverse()
        return ce + reg, np.concatenate([np.concatenate([gw.ravel(), gb]) for gw, gb in g])

    def filter_normalized(self, th):
        d = []
        for (W, _) in self.unpack(th):
            D = rng.standard_normal(W.shape)
            D *= np.linalg.norm(W, axis=1, keepdims=True) / np.linalg.norm(D, axis=1, keepdims=True)
            d += [D.ravel(), np.zeros(W.shape[0])]
        return np.concatenate(d)


def descend(net, th, lr, steps, every, mom=0.0):
    path, v = [th.copy()], np.zeros_like(th)
    for k in range(1, steps + 1):
        _, g = net.loss_grad(th)
        v = mom * v - lr * g
        th = th + v
        if k % every == 0:
            path.append(th.copy())
    return th, np.array(path)


def plane(net, th, D, lo, hi):
    a = np.linspace(lo[0], hi[0], GRID)
    b = np.linspace(lo[1], hi[1], GRID)
    L = np.empty((GRID, GRID))
    for j, bj in enumerate(b):
        for i, ai in enumerate(a):
            L[j, i] = net.loss_grad(th + ai * D[0] + bj * D[1], grad=False)[0]
    return L


def model(name, layers, wd, th0, lr, steps, every, mom, span):
    net = Net(layers, wd)
    l0, acc0 = net.loss_grad(th0, grad=False)
    th, path = descend(net, th0, lr, steps, every, mom)
    l1, acc1 = net.loss_grad(th, grad=False)
    print(f'{name}: {net.size()} weights, loss {l0:.3f} -> {l1:.4f}, accuracy {acc0:.2f} -> {acc1:.2f}')
    out = {'weights': net.size(), 'loss0': round(l0, 4), 'loss': round(l1, 5), 'acc': round(acc1, 3), 'steps': steps}
    R = path - th
    # (i) random filter-normalized directions
    D = np.stack([net.filter_normalized(th), net.filter_normalized(th)])
    # (ii) principal directions of the path, scaled to unit norm
    _, _, Vt = np.linalg.svd(R, full_matrices=False)
    E = Vt[:2]
    d1 = path[0] - th
    r = net.filter_normalized(th)
    r -= (r @ d1) / (d1 @ d1) * d1
    F = np.stack([d1, r])
    for key, Dk in (('random', D), ('pca', E), ('interp', F)):
        co, *_ = np.linalg.lstsq(Dk.T, R.T, rcond=None)
        co = co.T
        if key == 'random':
            lo, hi = np.array([-span, -span]), np.array([span, span])
        elif key == 'interp':
            lo, hi = np.array([-0.6, -1.1]), np.array([1.6, 1.1])
        else:
            c = (co.max(0) + co.min(0)) / 2
            r = 0.62 * (co.max(0) - co.min(0)).max()
            lo, hi = c - r, c + r
        L = plane(net, th, Dk, lo, hi)
        pl = [[round(float(p[0]), 4), round(float(p[1]), 4),
               round(float(net.loss_grad(th + p[0] * Dk[0] + p[1] * Dk[1], grad=False)[0]), 4)]
              for p in co]
        out[key] = {'lo': [round(float(v), 4) for v in lo], 'hi': [round(float(v), 4) for v in hi],
                    'n': GRID, 'loss': [round(float(v), 4) for v in L.ravel()], 'path': pl}
        print(f'  {key}: loss on the plane {L.min():.3f} .. {L.max():.3f}, path spans '
              f'{np.ptp(co[:, 0]):.3f} x {np.ptp(co[:, 1]):.3f}')
    return out


def main():
    deep = [2] + [16] * 8 + [1]
    nn = Net(deep, 0.0)
    out = {
        'data': {'n': N, 'X': [[round(float(a), 3), round(float(b), 3)] for a, b in X], 'y': [int(v) for v in Y]},
        'net': model('net', deep, 0.0, nn.init(1.0), 0.05, 3000, 30, 0.9, 1.5),
        'logreg': model('logreg', [2, 1], 1e-3, np.array([-3.0, 3.0, 2.5]), 0.5, 300, 3, 0.0, 2.0),
    }
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'data.js'), 'w') as f:
        f.write('// written by landscape.py: the two losses on two planes each, with the descent paths\n')
        f.write('export default ' + json.dumps(out, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main()
