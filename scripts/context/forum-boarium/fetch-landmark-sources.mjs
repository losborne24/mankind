// Fetches the extra source records behind the Circus Maximus, the Palatine palace and the documented streets (Pass C).
// Same rules as fetch-sources.mjs: network is needed only here; build-reconstruction.mjs works offline from the snapshots.
import { writeFile } from 'node:fs/promises';
const agent = { 'user-agent': 'mankind-research/0.1 (osborneleith@gmail.com)' };
const out = 'data/history/forum-boarium/source';
const accessed = new Date().toISOString().slice(0, 10);

// Pleiades (CC BY 3.0): streets and palace wings, each with the OpenStreetMap location Pleiades derived.
const ids = { 'vicus-tuscus': 380281017, 'vicus-iugarius': 889101791, 'domus-flavia': 564783056, 'domus-augustana': 792237246, 'clivus-victoriae': 668537796 };
const places = {};
for (const [key, id] of Object.entries(ids)) {
  const r = await fetch(`https://pleiades.stoa.org/places/${id}/json`, { headers: agent });
  if (!r.ok) throw Error(`Pleiades ${id}: ${r.status}`);
  const d = await r.json();
  places[key] = { id, uri: `https://pleiades.stoa.org/places/${id}`, title: d.title, description: d.description, reprPoint: d.reprPoint, rights: d.rights,
    locations: d.locations.map(l => ({ title: l.title, provenance: l.provenance, accuracy: l.accuracy_value, start: l.start, end: l.end, geometry: l.geometry })) };
}
await writeFile(`${out}/pleiades-landmarks.json`, JSON.stringify({ accessed, licence: 'CC BY 3.0 · Pleiades contributors', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/', places }, null, 1) + '\n');

// OpenStreetMap (ODbL) via Overpass: the Circus Maximus site, the three palace sites and the modern streets that follow the old valley routes.
const ways = [998877106, 1000529940, 4951341, 132682585, 52938659, 888672891, 22880319, 138303047, 138303048, 366796445, 82201173, 123817468];
const relations = [11384819, 1805347, 1857984, 1860920];
const query = `[out:json][timeout:90];(${relations.map(r => `relation(${r});`).join('')}${ways.map(w => `way(${w});`).join('')});out geom;`;
let o;
for (let attempt = 0; attempt < 5; attempt++) {   // the public Overpass servers answer 502/504 under load
  o = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...agent, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
  if (o.ok) break;
  await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
}
if (!o.ok) throw Error(`Overpass: ${o.status}`);
const osm = await o.json();
const keep = ['name', 'highway', 'historic', 'wikidata', 'leisure'];
await writeFile(`${out}/osm-landmarks.json`, JSON.stringify({ accessed, baseTimestamp: osm.osm3s.timestamp_osm_base, licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright',
  elements: osm.elements.map(e => ({ type: e.type, id: e.id, tags: Object.fromEntries(keep.filter(k => e.tags?.[k]).map(k => [k, e.tags[k]])),
    ...(e.geometry ? { geometry: e.geometry.map(p => [p.lon, p.lat]) } : {}),
    ...(e.members ? { members: e.members.filter(m => m.geometry).map(m => ({ ref: m.ref, role: m.role, geometry: m.geometry.map(p => [p.lon, p.lat]) })) } : {}) })) }) + '\n');
console.log('saved', osm.elements.length, 'OSM elements and', Object.keys(places).length, 'Pleiades places');
