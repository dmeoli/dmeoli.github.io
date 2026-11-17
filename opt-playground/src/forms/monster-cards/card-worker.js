// Builds the data of a card off the main thread: the invariants of the
// figurine and the face of the card (see model.js).
import { cardData } from './model.js';

onmessage = ({ data }) => {
  try {
    const d = cardData(data);
    postMessage({ d }, [d.grid.buffer, d.face.lum.buffer]);
  } catch (e) {
    postMessage({ error: String(e && e.message || e) });
  }
};
