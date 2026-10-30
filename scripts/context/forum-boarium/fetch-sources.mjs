// Re-fetches the source records behind the Forum Boarium 2D context layer and stores trimmed snapshots.
// Network access is needed only here; build-context.mjs and the checks work offline from the snapshots.
import { writeFile } from 'node:fs/promises';
const agent = { 'user-agent': 'mankind-research/0.1 (osborneleith@gmail.com)' };
const out = 'data/history/forum-boarium/source';
const save = (name, data) => writeFile(`${out}/${name}`, JSON.stringify(data, null, 1) + '\n');
const accessed = new Date().toISOString().slice(0, 10);

// Pleiades gazetteer: CC BY 3.0. Keep only fields we use.
const pleiadesIds = { 'forum-boarium': 207271756, 'ara-maxima': 207271757, 'pons-aemilius': 425068, 'hercules-victor': 825969667, 'portunus': 494660670,
  'cloaca-maxima': 867802692, 'arch-of-janus': 367835399, 'santa-maria-in-cosmedin': 934591702, 'capitoline': 347036492, 'palatine': 971691208, 'aventine': 865014139, 'tiber-island': 771725842, 'aedes-fauni': 455817200, 'circus-maximus': 458808506 };
const pleiades = {};
for (const [key, id] of Object.entries(pleiadesIds)) {
  const r = await fetch(`https://pleiades.stoa.org/places/${id}/json`, { headers: agent });
  if (!r.ok) throw Error(`Pleiades ${id}: ${r.status}`);
  const d = await r.json();
  pleiades[key] = { id, uri: `https://pleiades.stoa.org/places/${id}`, title: d.title, description: d.description, reprPoint: d.reprPoint, rights: d.rights,
    locations: d.locations.map(l => ({ title: l.title, provenance: l.provenance, accuracy: l.accuracy_value, start: l.start, end: l.end, geometry: l.geometry })) };
}
await save('pleiades.json', { accessed, licence: 'CC BY 3.0 · Pleiades contributors', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/', places: pleiades });

// OpenStreetMap via Overpass: ODbL. The Tiber relation is modern channel geometry, used only as a labelled approximation.
const query = `[out:json][timeout:90];(relation(5071);way(27350575);way(251342364);way(251331418);relation(6384861);node(4754734734);way(52924046);way(120854225);way(126146475););out geom;`;
const o = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...agent, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
if (!o.ok) throw Error(`Overpass: ${o.status}`);
const osm = await o.json();
await save('osm.json', { accessed, baseTimestamp: osm.osm3s.timestamp_osm_base, licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright',
  elements: osm.elements.map(e => ({ type: e.type, id: e.id, tags: e.tags, ...(e.geometry ? { geometry: e.geometry.map(p => [p.lon, p.lat]) } : {}), ...(e.lat !== undefined ? { lon: e.lon, lat: e.lat } : {}),
    ...(e.members ? { members: e.members.map(m => ({ type: m.type, ref: m.ref, role: m.role, geometry: m.geometry?.map(p => [p.lon, p.lat]) })) } : {}) })) });

// Wikidata P625 for Portus Tiberinus (CC0).
const w = await (await fetch('https://www.wikidata.org/wiki/Special:EntityData/Q3909304.json', { headers: agent })).json();
const claim = w.entities.Q3909304.claims.P625[0].mainsnak.datavalue.value;
await save('wikidata.json', { accessed, licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', 'portus-tiberinus': { id: 'Q3909304', uri: 'https://www.wikidata.org/wiki/Q3909304', coordinate: [claim.longitude, claim.latitude], precisionDegrees: claim.precision } });
console.log('saved');
