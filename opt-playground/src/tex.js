// the formulas set by the scenes: MathJax forgets the old ones of an element
// before it changes (texClear) and typesets the new ones after (texSet); both
// do nothing when MathJax is not there
const mj = () => window.MathJax && MathJax.typesetPromise ? MathJax : null;

export function texClear(...els) { const M = mj(); if (M) M.typesetClear(els); }

export function texSet(...els) {
  const M = mj();
  if (M) M.startup.promise = M.startup.promise.then(() => M.typesetPromise(els)).catch(e => console.error(e));
}

// sets the text of an element, typesetting it only when it changes
export function setTex(el, s) {
  if (el.dataset.tex === s) return;
  texClear(el); el.textContent = s; el.dataset.tex = s; texSet(el);
}
