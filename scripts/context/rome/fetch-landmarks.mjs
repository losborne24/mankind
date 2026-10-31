// Fetches the outlines of the standing remains behind the simple landmark reconstructions of Rome c. AD 100 (Stage 3b).
// Same rules as the other fetchers: network is needed only here; build-landmarks.mjs works offline from the snapshot.
//
// OpenStreetMap (ODbL) via Overpass: the mapped outline of each monument's remains (an archaeological site, a building or a square).
// Only their position, orientation and footprint are used; the reconstructed volume is a kit shape (see LANDMARKS.md).
import { mkdir, writeFile } from 'node:fs/promises';
const agent = { 'user-agent': 'mankind-research/0.1 (osborneleith@gmail.com)' };
const out = 'data/history/rome/source';
const accessed = new Date().toISOString().slice(0, 10);
await mkdir(out, { recursive: true });

/** Snapshot key → OSM element. */
export const elements = {
  colosseum: 'relation/1834818', 'ludus-magnus': 'relation/1894844', 'arch-of-titus': 'way/23913953',
  'basilica-iulia': 'way/131451564', 'basilica-aemilia': 'relation/1766532', curia: 'relation/1841079', 'temple-castor': 'relation/1842061',
  'temple-divus-iulius': 'way/131451819', 'temple-concord': 'relation/1767601', 'temple-saturn': 'relation/1849835', 'temple-vespasian': 'relation/1767603',
  'temple-vesta': 'relation/1842062', 'atrium-vestae': 'relation/1842058', regia: 'relation/1765429',
  'forum-augustus': 'relation/1899638', 'temple-mars-ultor': 'relation/13353050', 'forum-caesar': 'relation/1841081', 'temple-venus-genetrix': 'relation/1809171',
  'forum-nerva': 'relation/1899639', 'templum-pacis': 'relation/1841167',
  pantheon: 'relation/3374342', 'mausoleum-augustus': 'relation/2709954', 'piazza-navona': 'way/4247138',
  'largo-argentina-b': 'way/125566965', 'largo-argentina-c': 'way/125566967', 'largo-argentina-d': 'way/125566969', 'porticus-octaviae-propylon': 'way/123530471',
  'baths-agrippa': 'relation/6596512', 'temple-minerva': 'way/140264246',
};
const ids = Object.values(elements).map(e => e.split('/')), query = `[out:json][timeout:90];(${ids.map(([t, id]) => `${t}(${id});`).join('')});out geom;`;
let r;
for (let attempt = 0; attempt < 5; attempt++) {   // the public Overpass servers answer 502/504 under load
  r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...agent, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
  if (r.ok) break;
  await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
}
if (!r.ok) throw Error(`Overpass: ${r.status}`);
const osm = await r.json();
const ll = g => g.map(p => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
const byId = new Map(osm.elements.map(e => [`${e.type}/${e.id}`, e]));
const landmarks = Object.fromEntries(Object.entries(elements).map(([key, ref]) => {
  const e = byId.get(ref);
  if (!e) throw Error(`Missing OSM ${ref} (${key})`);
  const ways = e.geometry ? [ll(e.geometry)] : e.members.filter(m => m.geometry && m.role !== 'inner').map(m => ll(m.geometry));
  return [key, { osm: ref, name: e.tags.name, tags: Object.fromEntries(Object.entries(e.tags).filter(([k]) => /^(historic|building|ruins|place|wikidata|wikipedia)/.test(k))), ways }];
}));
await writeFile(`${out}/osm-landmarks.json`, JSON.stringify({ accessed, baseTimestamp: osm.osm3s.timestamp_osm_base, licence: 'ODbL 1.0 · © OpenStreetMap contributors', licenceUrl: 'https://www.openstreetmap.org/copyright', landmarks }) + '\n');
console.log(`osm-landmarks: ${Object.keys(landmarks).length} outlines`);
