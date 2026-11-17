// The download panel of a form: the size in millimetres, the fields of the
// scene (numbers, choices, checkboxes such as the base), and the buttons
// "Download STL + 3MF", "STL", "3MF" with a status line. The solid is built
// on the main thread by cfg.build(o), or off it by a worker (cfg.worker), and
// handed to the browser as a file.
//
//   printPanel(host, {
//     size:   { value: 80, min: 20, max: 300, what: { en: 'largest dimension', it: 'lato maggiore' } },
//     fields: [ { key: 'thick', label: { en: 'wall, mm', it: 'parete, mm' }, value: 1.6, min: 0.8, max: 6, step: 0.1 },
//               { key: 'base', type: 'check', label: { en: 'flat base', it: 'base piana' }, value: true,
//                 thick: { key: 'baseThick', label: { en: 'base, mm', it: 'base, mm' }, value: 2, min: 0.6, max: 10, step: 0.1 } },
//               { key: 'res', type: 'select', label: { en: 'resolution', it: 'risoluzione' }, value: 'draft',
//                 options: [{ value: 'draft', en: 'draft', it: 'bozza' }, { value: 'fine', en: 'fine', it: 'alta' }] } ],
//     build:  o => mesh,                                   // or
//     worker: { module: new URL('./my-print.js', import.meta.url).href, fn: 'solid', args: o => [o] },
//     name:   o => 'myform_' + o.size + 'mm',               // base of the file names
//     head:   'binary STL, millimetres, my form',           // STL header, ASCII, <= 80
//     object: 'myform',                                     // name of the 3MF object
//     note:   (info, o) => '',                              // more for the status line
//     before: [nodes],                                      // other buttons first in the bar
//     prefix: 'p',                                          // ids: psize, pthick, ..., pboth, pstl, p3mf, pstatus
//   })
//     title:  () => 'name of the form',                    // subject of a request (default the h1)
//     share:  () => url,                                   // link to the scene as it is (default location.href)
// o holds size and every field by its key (numbers clamped to their range,
// checkboxes as booleans); returns { el, read: () => o, download(what) }.
//
// On the site (OWNER false, see mode.js) the same fields stay, and the three
// buttons become one, "Request this print", which opens an e-mail with the
// link to the scene, every field and a line for notes; the root gets the
// class print-public, which shows the elements .public-only of the page and
// hides the .owner-only ones.

import { t, bi, onLang, lang } from '../i18n.js';
import { save } from './save.js';
import { dims } from './mesh.js';
import { OWNER } from './mode.js';

// where the requests of prints go
export const MAIL = 'donato.meoli@outlook.com';

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./print.css', import.meta.url).href;
  document.head.appendChild(l);
  // at once, before the sheet arrives: which of the texts of the page to show
  const st = document.createElement('style');
  st.textContent = OWNER ? '.public-only { display: none !important; }' : '.owner-only { display: none !important; }';
  document.head.appendChild(st);
  if (!OWNER) document.documentElement.classList.add('print-public');
}

const mk = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  if (html) e.innerHTML = html;
  return e;
};

export function printPanel(host, cfg) {
  style();
  const P = cfg.prefix || 'p', id = k => P + k;
  const fields = [{ key: 'size', label: { en: 'size, mm', it: 'dimensione, mm' }, step: 1, ...cfg.size }, ...(cfg.fields || [])];
  const wrap = mk('div', { class: 'controls printpanel' }), set = mk('div', { class: 'settings' });
  for (const n of cfg.before || []) set.appendChild(n);
  const inputs = [], selects = [];
  const number = f => {
    const lab = mk('label', {}, `<span>${bi(f.label.en, f.label.it)}</span>`);
    const inp = mk('input', { id: id(f.key), type: 'number', min: f.min, max: f.max, step: f.step ?? 0.1, value: f.value, title: f.what && f.what.en });
    lab.appendChild(inp); set.appendChild(lab); inputs.push([f, inp]);
    return inp;
  };
  for (const f of fields) {
    if (f.type === 'check') {
      const lab = mk('label', { class: 'check' }, bi(f.label.en, f.label.it));
      const inp = mk('input', { id: id(f.key), type: 'checkbox', checked: !!f.value });
      lab.appendChild(inp); set.appendChild(lab); inputs.push([f, inp]);
      if (f.thick) {
        const sub = number(f.thick);
        const sync = () => { sub.disabled = !inp.checked; };
        inp.addEventListener('change', sync); sync();
      }
    } else if (f.type === 'select') {
      const lab = mk('label', {}, bi(f.label.en, f.label.it)), sel = mk('select', { id: id(f.key) });
      for (const o of f.options) sel.appendChild(mk('option', { value: o.value, selected: o.value === f.value }, o.en));
      lab.appendChild(sel); set.appendChild(lab); inputs.push([f, sel]); selects.push([f, sel]);
    } else number(f);
  }
  const names = () => { for (const [f, sel] of selects) f.options.forEach((o, i) => { sel.options[i].textContent = t(o.en, o.it); }); };
  names(); onLang(names);
  const tr = mk('div', { class: 'transport' });
  const st = mk('p', { class: 'row pstatus', id: id('status'), 'aria-live': 'polite' });
  wrap.append(set, tr, st);
  host.appendChild(wrap);
  if (!OWNER) return requestPanel(cfg, fields, inputs, tr, st, id);
  const both = mk('button', { type: 'button', class: 'main', id: id('both') }, bi('Download STL + 3MF', 'Scarica STL + 3MF'));
  const bstl = mk('button', { type: 'button', id: id('stl') }, 'STL'), b3mf = mk('button', { type: 'button', id: id('3mf') }, '3MF');
  tr.append(both, bstl, b3mf);

  const read = () => readFields(inputs);
  const buttons = [both, bstl, b3mf];
  const busy = on => buttons.forEach(b => { b.disabled = on; });
  const report = (file, bytes, tris, d, info, o) => {
    const k = bytes.length < 2 ** 20 ? `${(bytes.length / 1024).toFixed(0)} kB` : `${(bytes.length / 2 ** 20).toFixed(1)} MB`;
    const n = tris < 10000 ? `${tris}` : `${(tris / 1000).toFixed(0)} k`;
    st.textContent = `${file}: ${n} ${t('triangles', 'triangoli')}, ${d.map(x => x.toFixed(1)).join(' × ')} mm, ${k}` + (cfg.note ? cfg.note(info, o) : '');
  };
  const opts = o => ({
    name: cfg.name ? cfg.name(o) : 'solid',
    head: typeof cfg.head === 'function' ? cfg.head(o) : cfg.head,
    object: cfg.object || 'solid',
  });
  let worker = null;
  async function download(what) {
    const o = read();
    if (cfg.worker) {
      if (worker) worker.terminate();
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      busy(true);
      st.replaceChildren(t('building the solid', 'costruzione del solido'));
      const bar = mk('progress', { max: 1, value: 0 }); st.appendChild(bar);
      const end = () => { busy(false); worker.terminate(); worker = null; };
      worker.onmessage = ({ data }) => {
        if (data.progress !== undefined) { bar.value = data.progress; return; }
        if (data.error) { st.textContent = t('failed: ', 'non riuscito: ') + data.error; return end(); }
        save(data.bytes, data.file);
        report(data.file, data.bytes, data.tris, data.info.dims, data.info, o);
        end();
      };
      worker.onerror = e => { st.textContent = t('failed: ', 'non riuscito: ') + (e.message || 'worker'); end(); };
      worker.postMessage({ module: cfg.worker.module, fn: cfg.worker.fn, args: cfg.worker.args(o), what, ...opts(o) });
      return;
    }
    try {
      busy(true);
      const { printFiles } = await import('./files.js');
      const m = await cfg.build(o), { file, bytes } = await printFiles(m, what, opts(o));
      save(bytes, file);
      report(file, bytes, m.idx.length / 3, m.dims || dims(m), m, o);
    } catch (e) {
      st.textContent = t('failed: ', 'non riuscito: ') + (e && e.message || e);
    } finally { busy(false); }
  }
  both.addEventListener('click', () => download('zip'));
  bstl.addEventListener('click', () => download('stl'));
  b3mf.addEventListener('click', () => download('3mf'));
  return { el: wrap, read, download };
}

function readFields(inputs) {
  const o = {};
  for (const [f, inp] of inputs) {
    if (f.type === 'check') o[f.key] = inp.checked;
    else if (f.type === 'select') o[f.key] = inp.value;
    else {
      const v = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, +inp.value || f.value));
      inp.value = v; o[f.key] = v;
    }
  }
  return o;
}

// the panel of the site: the fields, and a request by e-mail
function requestPanel(cfg, fields, inputs, tr, st, id) {
  const go = mk('a', { class: 'main', id: id('request'), role: 'button' }, bi('Request this print', 'Richiedi questa stampa'));
  tr.append(go);
  st.innerHTML = bi(`Printed on request, also customised in size, colour and material: the e-mail carries the link to the scene as it is now; or write to <a href="mailto:${MAIL}">${MAIL}</a>.`,
    `Stampata su richiesta, anche personalizzata in dimensione, colore e materiale: la mail porta il link alla scena così com'è ora; oppure scrivere a <a href="mailto:${MAIL}">${MAIL}</a>.`);
  const mail = () => {
    const o = readFields(inputs), h1 = document.querySelector(`h1 [data-l="${lang()}"]`) || document.querySelector('h1');
    const title = cfg.title ? cfg.title() : (h1 ? h1.textContent.trim() : document.title);
    const lines = [t(`I would like a 3D print of: ${title}`, `Vorrei una stampa 3D di: ${title}`), '',
      t('The scene with its parameters:', 'La scena con i suoi parametri:'), cfg.share ? cfg.share() : location.href, ''];
    for (const f of fields) {
      const lab = t(f.label.en, f.label.it);
      if (f.type === 'check') lines.push(`${lab}: ${o[f.key] ? t('yes', 'sì') : t('no', 'no')}`);
      else if (f.type === 'select') { const op = f.options.find(x => x.value === o[f.key]); lines.push(`${lab}: ${op ? t(op.en, op.it) : o[f.key]}`); }
      else lines.push(`${lab}: ${o[f.key]}`);
      if (f.type === 'check' && f.thick && o[f.key]) lines.push(`${t(f.thick.label.en, f.thick.label.it)}: ${o[f.thick.key]}`);
    }
    lines.push('', t('Notes (colour, material, personalisation): ', 'Note (colore, materiale, personalizzazione): '), '');
    return `mailto:${MAIL}?subject=${encodeURIComponent('Stampa 3D: ' + title)}&body=${encodeURIComponent(lines.join('\n'))}`;
  };
  // the link is written again just before it is followed, so that it carries
  // the scene and the fields as they are at that moment
  const fresh = () => { go.href = mail(); };
  fresh();
  for (const ev of ['click', 'pointerenter', 'focus']) go.addEventListener(ev, fresh);
  onLang(fresh);
  return { el: tr.parentNode, read: () => readFields(inputs), mailto: mail };
}
