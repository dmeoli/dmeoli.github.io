// The order of the group of a puzzle, off the main thread: the message is
// the puzzle { solid, kind, depth }, the answer { order } as a decimal string.
import { puzzle, moves, groupOrder } from './model.js';

onmessage = ({ data }) => {
  try {
    const Z = puzzle(data), g = moves(Z);
    postMessage({ key: data.key, order: String(groupOrder(g, Z.facelets.length)) });
  } catch (e) { postMessage({ key: data.key, error: String(e && e.message || e) }); }
};
