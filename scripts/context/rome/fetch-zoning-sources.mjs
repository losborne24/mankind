// Fetches the source records behind the AD 100 land-use zoning of Rome (Stage 1 of the city expansion).
// Same rules as the Forum Boarium fetchers: network is needed only here; build-zoning.mjs works offline from the snapshots.
//
// * Pleiades (CC BY 3.0): the fourteen Augustan regions, the main horti, the river port and the monuments the zones are drawn
//   around. Pleiades gives a representative point and, for regions, a bounding box derived from the places it links to.
// * OpenStreetMap (ODbL) via Overpass: the Tiber water polygons from about 4 km downstream to 5 km upstream of the city, so the
//   river zone runs the whole length of the map, not only the stretch in the Forum Boarium context layer.
// Nothing from the Aurelian Walls (AD 271-275) or their gates is fetched: they post-date the scene.
import { mkdir, writeFile } from 'node:fs/promises';
const agent = { 'user-agent': 'mankind-research/0.1 (osborneleith@gmail.com)' };
const out = 'data/history/rome/source';
const accessed = new Date().toISOString().slice(0, 10);
await mkdir(out, { recursive: true });

const ids = {
  'regio-i': 307963010, 'regio-ii': 917389428, 'regio-iii': 378562728, 'regio-iv': 523965218, 'regio-v': 406470991, 'regio-vi': 75632296, 'regio-vii': 596666070,
  'regio-viii': 337325364, 'regio-ix': 936873471, 'regio-x': 298699921, 'regio-xi': 418516191, 'regio-xii': 886355306, 'regio-xiii': 372769291, 'regio-xiv': 217953464,
  'horti-sallustiani': 166405461, 'horti-maecenatis': 399141643, 'horti-lamiani': 789002571, 'horti-luculliani': 418356677, 'horti-caesaris': 387197668,
  'horti-agrippinae': 124755045, 'horti-domitiae': 387197669, 'horti-spei-veteris': 874244230, 'horti-largiani': 769033983, 'horti-aciliorum': 204515924,
  emporium: 937921711, 'porticus-aemilia': 51787060,
  'forum-romanum': 502866838, 'forum-iulium': 445545537, 'templum-pacis': 152567558, 'amphitheatrum-flavium': 285857974, 'theatrum-marcelli': 300583267,
  'forum-holitorium': 72845305, 'circus-flaminius': 158081395, 'jupiter-capitolinus': 871801169, 'stadium-domitiani': 92342486,
  'theatrum-pompei': 541950317, pantheon: 128044615, 'saepta-iulia': 854946506, 'thermae-agrippae': 921692078, 'mausoleum-augusti': 281368358,
  'ara-pacis': 816091000, 'circus-gaii-et-neronis': 395487201, 'horti-agrippinae': 124755045, 'vatican-obelisk': 855632226, 'via-cornelia': 741499023, 'via-triumphalis': 839719167,
  'via-triumphalis-necropolis': 578501279, 'pons-neronianus': 100447491, 'mausoleum-hadriani': 334776904, 'aqua-claudia': 423563, 'aqua-anio-novus': 423559, 'via-nomentana': 699256589,
  'thermae-antoninianae': 322942899, 'vaticanus-ager': 104629751, 'horologium-augusti': 986274170, 'circus-maximus': 458808506, 'campus-martius': 422863, palatine: 971691208,
};
const places = {};
for (const [key, id] of Object.entries(ids)) {
  const r = await fetch(`https://pleiades.stoa.org/places/${id}/json`, { headers: agent });
  if (!r.ok) throw Error(`Pleiades ${id}: ${r.status}`);
  const d = await r.json();
  places[key] = { id, uri: `https://pleiades.stoa.org/places/${id}`, title: d.title, description: d.description, reprPoint: d.reprPoint, bbox: d.bbox,
    locations: d.locations.map(l => ({ title: l.title, provenance: l.provenance, accuracy: l.accuracy_value, start: l.start, end: l.end, geometry: l.geometry })) };
}
await writeFile(`${out}/pleiades-zoning.json`, JSON.stringify({ accessed, licence: 'CC BY 3.0 · Pleiades contributors', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/', places }, null, 1) + '\n');

// The river is mapped in pieces: relation 5071 is the urban stretch only (41.860-41.911), the rest are the polygons upstream and downstream.
const riverRelations = [5071, 15909049, 17258409], riverWays = [22747533, 22797948, 23353973, 23353974, 23354406, 23354527, 23354547, 23354970, 23354973, 23356029, 184762449, 184762450, 216887342, 216888510];
const query = `[out:json][timeout:90];(${riverRelations.map(r => `rel(${r});`).join('')}${riverWays.map(w => `way(${w});`).join('')});out geom;`;
let o;
for (let attempt = 0; attempt < 5; attempt++) {   // the public Overpass servers answer 502/504 under load
  o = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...agent, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
  if (o.ok) break;
  await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
}
if (!o.ok) throw Error(`Overpass: ${o.status}`);
const osm = await o.json();
const ll = g => g.map(p => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
await writeFile(`${out}/osm-tiber.json`, JSON.stringify({ accessed, baseTimestamp: osm.osm3s.timestamp_osm_base, licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright',
  elements: osm.elements.map(e => ({ type: e.type, id: e.id, ...(e.geometry ? { geometry: ll(e.geometry) } : {}), ...(e.members ? { members: e.members.filter(m => m.geometry).map(m => ({ role: m.role, geometry: ll(m.geometry) })) } : {}) })) }) + '\n');

// The suburbium: modern streets that keep the line of the consular roads, the standing Aqua Claudia arches (Pleiades cites way 781857867) and the Anio Novus way, and the Aniene.
const roadNames = ['Via Flaminia', 'Via Salaria', 'Via Nomentana', 'Via Tiburtina', 'Via Labicana', 'Via Casilina', 'Via Prenestina', 'Via Latina', 'Via di Porta San Sebastiano', 'Via Appia Antica', 'Via Ostiense', 'Via Portuense', 'Via Aurelia Antica', 'Via Trionfale'];
const suburbQuery = `[out:json][timeout:180];(way["highway"]["name"~"^(${roadNames.join('|')})$"](41.82,12.38,41.97,12.60);${[781857867, 781857868, 781857869, 781857870, 781857871, 781857872, 781857874, 997532460, 128274578].map(w => `way(${w});`).join('')}rel(16025341););out geom;`;
let r;
for (let attempt = 0; attempt < 5; attempt++) {
  r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...agent, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(suburbQuery) });
  if (r.ok) break;
  await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
}
if (!r.ok) throw Error(`Overpass: ${r.status}`);
const suburb = await r.json();
await writeFile(`${out}/osm-suburbium.json`, JSON.stringify({ accessed, baseTimestamp: suburb.osm3s.timestamp_osm_base, licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright',
  elements: suburb.elements.map(e => ({ type: e.type, id: e.id, name: e.tags?.name ?? e.tags?.['name:it'] ?? null, ...(e.geometry ? { geometry: ll(e.geometry) } : {}), ...(e.members ? { members: e.members.filter(m => m.geometry).map(m => ({ role: m.role, geometry: ll(m.geometry) })) } : {}) })).sort((a, b) => a.id - b.id) }) + '\n');
console.log('saved', Object.keys(places).length, 'Pleiades places,', osm.elements.length, 'Tiber polygons and', suburb.elements.length, 'suburbium ways');
