// The natal chart scene: the date, the local time and the place (a city of
// the bundled list or latitude and longitude typed in, with an IANA zone),
// turned into a UTC instant by the tz database of the browser; the chart of
// core.js drawn as the wheel, the sphere and three tables. Nothing leaves the
// page, and the data enter the address only through Copy link.

import { chart, civilToUtc, HOUSE_SYSTEMS } from './core.js';
import { drawWheel, drawKey } from './wheel.js';
import { makeSphere } from './sphere.js';
import { positionsTable, cuspsTable, aspectsTable } from './tables.js';
import { EXAMPLE, readHash, toHash } from './state.js';
import { t, lang, onLang, onTheme } from '../i18n.js';

const $ = id => document.getElementById(id);
const still = matchMedia('(prefers-reduced-motion: reduce)');
const fold = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const state = { ...EXAMPLE };
let ch = null, sphere = null;

/* ----------------------------------------------------------- places ---- */

let cities = [], zones = [];
const ready = fetch(new URL('./cities.json', import.meta.url)).then(r => r.json()).then(d => {
  zones = d.zones;
  cities = d.cities.map(([name, alt, admin, cc, lat, lon, z, pop]) => ({
    name, admin, cc, lat, lon, zone: d.zones[z], pop,
    names: [name].concat(alt ? alt.split('|') : []),
    keys: [name].concat(alt ? alt.split('|') : []).map(fold)
  }));
});
const label = c => [c.name, c.admin, c.cc].filter(Boolean).join(', ');
function search(q) {
  q = fold(q.trim());
  if (q.length < 2) return [];
  const hits = [];
  for (const c of cities) {
    let s = 0, as = c.name;
    c.keys.forEach((k, i) => {
      const v = k.startsWith(q) ? (k === q ? 3 : 2) : (k.includes(' ' + q) || k.includes('-' + q)) ? 1 : 0;
      if (v > s) { s = v; as = c.names[i]; }
    });
    // a city found by another of its names is shown by that name
    if (s) hits.push([s, as === c.name ? c : { ...c, shown: `${as} (${c.name})`, name: as }]);
  }
  return hits.sort((a, b) => b[0] - a[0] || b[1].pop - a[1].pop).slice(0, 8).map(h => h[1]);
}

function suggestBox() {
  const inp = $('place'), ul = $('suggest');
  let items = [], sel = -1;
  const close = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); sel = -1; };
  const show = () => {
    ul.replaceChildren();
    items.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = 'sg' + i;
      li.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      li.innerHTML = `${c.shown || c.name} <small>${[c.admin, c.cc].filter(Boolean).join(', ')} · ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}</small>`;
      li.addEventListener('mousedown', ev => { ev.preventDefault(); pick(c); });
      ul.appendChild(li);
    });
    ul.hidden = !items.length;
    inp.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (sel >= 0) inp.setAttribute('aria-activedescendant', 'sg' + sel); else inp.removeAttribute('aria-activedescendant');
  };
  const pick = c => {
    Object.assign(state, { place: label(c), lat: c.lat, lon: c.lon, zone: c.zone });
    close(); toInputs(); compute();
  };
  inp.addEventListener('input', async () => { await ready; items = search(inp.value); sel = -1; show(); });
  inp.addEventListener('keydown', ev => {
    if (ul.hidden) return;
    if (ev.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); show(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); show(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { if (items.length) pick(items[Math.max(0, sel)]); ev.preventDefault(); }
    else if (ev.key === 'Escape') { close(); inp.value = state.place; }
  });
  inp.addEventListener('blur', () => { close(); inp.value = state.place; });
}

/* ----------------------------------------------------------- inputs ---- */

function fillZones() {
  const sel = $('zone');
  let list = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch (e) { list = []; }
  list = [...new Set(['UTC', ...list, ...zones])];
  sel.replaceChildren(...list.map(z => new Option(z, z)));
}
function toInputs() {
  $('date').value = state.date; $('time').value = state.time;
  $('place').value = state.place;
  $('lat').value = (+state.lat).toFixed(4); $('lon').value = (+state.lon).toFixed(4);
  if (![...$('zone').options].some(o => o.value === state.zone)) $('zone').add(new Option(state.zone, state.zone));
  $('zone').value = state.zone; $('houses').value = state.houses; $('node').value = state.node;
}
function fromInputs() {
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if ($('date').value) state.date = $('date').value;
  if ($('time').value) state.time = $('time').value.length === 5 ? $('time').value + ':00' : $('time').value;
  if (Number.isFinite(lat) && Math.abs(lat) < 90) state.lat = lat;
  if (Number.isFinite(lon) && Math.abs(lon) <= 180) state.lon = lon;
  state.zone = $('zone').value; state.houses = $('houses').value; state.node = $('node').value;
}

/* ------------------------------------------------------------ chart ---- */

let civil = null;
function compute() {
  const [y, mo, d] = state.date.split('-').map(Number), [h, mi, s] = state.time.split(':').map(Number);
  civil = civilToUtc(y, mo, d, h, mi, s || 0, state.zone);
  ch = chart(civil.ms, +state.lat, +state.lon, { houses: state.houses, node: state.node });
  render();
}

const pad = n => String(n).padStart(2, '0');
const offs = m => `UTC${m < 0 ? '\u2212' : '+'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
const hms = hours => { let s = Math.round(hours * 3600) % 86400; return `${Math.floor(s / 3600)}h${pad(Math.floor(s / 60) % 60)}m${pad(s % 60)}s`; };
const iso = ms => { const d = new Date(ms); return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };

function render() {
  drawWheel($('wheel'), ch);
  drawKey($('aspkey'));
  sphere.update(ch);
  info(); tables(); hoverLinks();
  bookletLink();
}

function info() {
  const dt = (en, it, v) => `<div><dt>${t(en, it)}</dt><dd>${v}</dd></div>`;
  const lmst = (ch.armc / 15 + 24) % 24;
  $('info').innerHTML = dt('universal time', 'tempo universale', iso(ch.ms)) +
    dt('offset', 'scarto', `${offs(civil.offset)}`) +
    dt('local sidereal time', 'tempo siderale locale', hms(lmst)) +
    dt('obliquity', 'obliquità', `${ch.eps.toFixed(4)}\u00B0`) +
    dt('place', 'luogo', `${Math.abs(ch.lat).toFixed(2)}\u00B0${ch.lat >= 0 ? 'N' : 'S'} ${Math.abs(ch.lon).toFixed(2)}\u00B0${ch.lon >= 0 ? 'E' : t('W', 'O')}`);
  const w = [];
  if (civil.status === 'gap') w.push(t('This time does not exist in this zone, since the clocks were moved forward over it; it is read with the offset in force before the change.',
    "Quest'ora non esiste in questo fuso, perché gli orologi sono stati portati avanti scavalcandola; la si legge con lo scarto in vigore prima del cambio."));
  if (civil.status === 'twice') w.push(t('This time occurs twice in this zone, since the clocks were moved back over it; the first of the two is used.',
    "Quest'ora ricorre due volte in questo fuso, perché gli orologi sono stati portati indietro; si usa la prima delle due."));
  if (ch.houses.failed) {
    const name = HOUSE_SYSTEMS[ch.houses.failed], lim = (90 - ch.eps).toFixed(2);
    w.push(t(`The ${name} houses do not exist at latitude ${ch.lat.toFixed(2)}\u00B0: beyond the polar circles (|latitude| \u2265 90\u00B0 \u2212 \u03B5 = ${lim}\u00B0) some degrees of the ecliptic never rise or never set, so that the semi-arcs which ${name} divides in three are not defined there; the equal houses are drawn instead.`,
      `Le case ${name} non esistono alla latitudine ${ch.lat.toFixed(2)}\u00B0: oltre i circoli polari (|latitudine| \u2265 90\u00B0 \u2212 \u03B5 = ${lim}\u00B0) alcuni gradi dell'eclittica non sorgono o non tramontano mai, sicché i semiarchi che ${name} divide in tre lì non sono definiti; al loro posto sono disegnate le case uguali.`));
  }
  $('warn').hidden = !w.length;
  $('warn').textContent = w.join(' ');
}

function tables() {
  $('positions').innerHTML = positionsTable(ch);
  $('cusps').innerHTML = cuspsTable(ch);
  $('aspects').innerHTML = aspectsTable(ch);
}

// pointing at a body in the wheel or at its row lights its aspects
function hoverLinks() {
  const svg = $('wheel');
  const focus = name => {
    svg.classList.toggle('focus', !!name);
    svg.querySelectorAll('.w-asp').forEach(l => l.classList.toggle('on', !!name && (l.dataset.a === name || l.dataset.b === name)));
    svg.querySelectorAll('.w-body').forEach(g => g.classList.toggle('on', !!name && g.dataset.name === name));
    document.querySelectorAll('#positions tr[data-name]').forEach(r => r.classList.toggle('on', r.dataset.name === name));
    document.querySelectorAll('#aspects tr[data-a]').forEach(r => r.classList.toggle('on', !!name && (r.dataset.a === name || r.dataset.b === name)));
  };
  svg.querySelectorAll('.w-body').forEach(g => {
    g.addEventListener('pointerenter', () => focus(g.dataset.name));
    g.addEventListener('pointerleave', () => focus(null));
  });
  document.querySelectorAll('#positions tr[data-name]').forEach(r => {
    r.addEventListener('pointerenter', () => focus(r.dataset.name));
    r.addEventListener('pointerleave', () => focus(null));
  });
}

/* ------------------------------------------------- the link and now ---- */

const link = (page = location.pathname) => location.origin + page + toHash(state);
// the booklet opens in its own tab with the chart in the hash
const bookletLink = () => { $('booklet').href = link(new URL('astro-booklet.html', location.href).pathname); };
function nowInZone() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: state.zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  for (const x of f.formatToParts(new Date())) p[x.type] = x.value;
  state.date = `${p.year}-${p.month}-${p.day}`; state.time = `${p.hour}:${p.minute}:${p.second}`;
}

/* -------------------------------------------------------- projection ---- */

let anim = null;
function setU(u) { sphere.setProjection(u); $('proj').value = u; playLabel(); }
function playLabel() {
  const back = sphere.u > 0.5;
  $('play').innerHTML = back ? '<span data-l="en">Back to the sky</span><span data-l="it" lang="it">Torna al cielo</span>'
    : '<span data-l="en">Project</span><span data-l="it" lang="it">Proietta</span>';
}
function play() {
  if (anim) cancelAnimationFrame(anim);
  const from = sphere.u, to = from > 0.5 ? 0 : 1;
  if (still.matches) { setU(to); return; }
  const t0 = performance.now(), dur = 4000 * Math.abs(to - from);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    setU(from + (to - from) * k);
    anim = k < 1 ? requestAnimationFrame(step) : null;
  };
  anim = requestAnimationFrame(step);
}

/* ------------------------------------------------------------- start ---- */

function relang() {
  for (const o of document.querySelectorAll('option[data-it]')) {
    if (!o.dataset.en) o.dataset.en = o.textContent;
    o.textContent = lang() === 'it' ? o.dataset.it : o.dataset.en;
  }
  sphere.relabel(lang());
  if (ch) { drawWheel($('wheel'), ch); drawKey($('aspkey')); info(); tables(); hoverLinks(); }
}

fillZones();
readHash(location.hash, state);
toInputs();
suggestBox();
sphere = makeSphere($('stage'));
for (const id of ['date', 'time', 'zone', 'houses', 'node']) $(id).addEventListener('change', () => { fromInputs(); compute(); });
for (const id of ['lat', 'lon']) $(id).addEventListener('change', () => {
  fromInputs(); state.place = `${(+state.lat).toFixed(4)}, ${(+state.lon).toFixed(4)}`; $('place').value = state.place; compute();
});
$('now').addEventListener('click', () => { nowInZone(); toInputs(); compute(); });
$('reset').addEventListener('click', () => { Object.assign(state, EXAMPLE); toInputs(); compute(); setU(0); });
$('copy').addEventListener('click', async () => {
  const url = link();
  let ok = true;
  try { await navigator.clipboard.writeText(url); } catch (e) { ok = false; window.prompt(t('Link to this chart', 'Link a questa carta'), url); }
  if (ok) {
    const b = $('copy'), old = b.innerHTML;
    b.innerHTML = '<span data-l="en">Copied</span><span data-l="it" lang="it">Copiato</span>';
    setTimeout(() => { b.innerHTML = old; }, 1600);
  }
});
$('proj').addEventListener('input', () => { if (anim) { cancelAnimationFrame(anim); anim = null; } setU(+$('proj').value); });
$('play').addEventListener('click', play);
onLang(relang);
onTheme(() => { sphere.colours(); });
relang();
compute();
playLabel();
// for the checks in headless Chrome
window.__astro = { get chart() { return ch; }, setU, state, compute, toInputs, search: q => ready.then(() => search(q).map(label)) };
