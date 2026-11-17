// The wiring shared by the pages of the group Fantasy: the parameters of the
// scene kept in the address, one control per parameter (an element whose id is
// the key: a range with an <output id="<key>out">, a select, a checkbox, a
// number), the 3D view of the mathematics group showing the mesh built in a
// worker, and the print panel, which builds the same solid finer.
//
//   const s = fantasyScene({ spec, model, preview: 'preview', panel: {...}, onChange(state) {}, onMesh(m) {} });
// (onMesh receives the mesh built for the view with its plain fields, e.g.
// the data of a drawing computed in the worker)
//   s.state, s.rebuild(), s.view

import { t } from '../../i18n.js';
import { printPanel, readState, writeState, shareUrl } from '../../print/index.js';
import { createView, workerBuilder, building } from '../mathematics/view.js';

const $ = id => document.getElementById(id);
const fmt = v => (Number.isInteger(v) ? String(v) : (+v.toFixed(2)).toString());

export function fantasyScene({ spec, model, preview = 'solid', eye, panel, panelKeys = [], onChange, onMesh, previewArgs }) {
  const state = readState(spec);
  const view = createView($('stage'), eye ? { eye } : {});
  const build = workerBuilder(f => view.status(building(f)));
  let pnl = null;
  const sync = () => {
    for (const [k, s] of Object.entries(spec)) {
      const el = $(k);
      if (!el) continue;
      if (typeof s.def === 'boolean') el.checked = state[k];
      else el.value = state[k];
      if ($(k + 'out')) $(k + 'out').textContent = fmt(state[k]);
    }
  };
  let ticket = 0;
  async function rebuild() {
    writeState(spec, state);
    if (onChange) onChange(state);
    const o = { ...state, ...(pnl ? pnl.read() : {}), res: 'preview' };
    const me = ++ticket;
    view.status(building(0));
    try {
      const m = await build(model, preview, previewArgs ? previewArgs(o) : [o]);
      if (!m || me !== ticket) return;
      view.show(m);
      if (onMesh) onMesh(m);
      view.status(`${(m.idx.length / 3 / 1000).toFixed(0)} k ${t('triangles', 'triangoli')}` + (m.note ? ' · ' + m.note : ''));
    } catch (e) { view.status(t('failed: ', 'non riuscito: ') + e.message); }
  }
  for (const [k, s] of Object.entries(spec)) {
    const el = $(k);
    if (!el) continue;
    const read = () => (typeof s.def === 'boolean' ? el.checked : typeof s.def === 'number'
      ? Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, s.int ? Math.round(+el.value) : +el.value)) : el.value);
    el.addEventListener('input', () => { if ($(k + 'out')) $(k + 'out').textContent = fmt(read()); });
    el.addEventListener('change', () => { state[k] = read(); rebuild(); });
  }
  if ($('random') && 'seed' in spec) $('random').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 99999); sync(); rebuild(); });
  if ($('spin')) $('spin').addEventListener('change', e => view.spin(e.target.checked));
  if ($('view')) $('view').addEventListener('click', () => view.reset());
  sync();
  if (panel) {
    pnl = printPanel($('print'), {
      ...panel,
      worker: { module: model, fn: 'solid', args: o => [{ ...state, ...o }] },
      share: () => shareUrl(spec, state),
    });
    for (const k of panelKeys) { const el = $('p' + k); if (el) el.addEventListener('change', rebuild); }
  }
  rebuild();
  return { state, view, rebuild, sync, panel: pnl };
}
