// The data of a chart as the scene and the booklet share them: the example
// (the greatest eclipse of the total solar eclipse of 11 August 1999, 11:03
// UT, near Râmnicu Vâlcea, 14:03 summer time there), and the address that
// carries them after the #, which the browser never sends to a server.

export const EXAMPLE = { date: '1999-08-11', time: '14:03:00', place: 'Râmnicu Vâlcea, Vâlcea County, RO', lat: 45.1, lon: 24.3667, zone: 'Europe/Bucharest', houses: 'P', node: 'true' };

// the fields of a hash into state (only those that are well formed); false
// when the hash holds no chart
export function readHash(hash, state) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (!p.has('d')) return false;
  const ok = (k, re) => p.has(k) && re.test(p.get(k));
  if (ok('d', /^\d{4}-\d\d-\d\d$/)) state.date = p.get('d');
  if (ok('t', /^\d\d:\d\d(:\d\d)?$/)) state.time = p.get('t').length === 5 ? p.get('t') + ':00' : p.get('t');
  if (ok('lat', /^-?\d+(\.\d+)?$/)) state.lat = +p.get('lat');
  if (ok('lon', /^-?\d+(\.\d+)?$/)) state.lon = +p.get('lon');
  if (p.has('tz')) state.zone = p.get('tz');
  state.place = p.get('p') || `${(+state.lat).toFixed(4)}, ${(+state.lon).toFixed(4)}`;
  if (ok('h', /^[PKEW]$/)) state.houses = p.get('h');
  if (ok('n', /^(true|mean)$/)) state.node = p.get('n');
  if (ok('y', /^\d{4}-\d\d-\d\d$/)) state.year = p.get('y');
  return true;
}

export function toHash(state) {
  const p = new URLSearchParams({ d: state.date, t: state.time, lat: (+state.lat).toFixed(4), lon: (+state.lon).toFixed(4), tz: state.zone, p: state.place, h: state.houses, n: state.node });
  if (state.year) p.set('y', state.year);
  return '#' + p.toString();
}
