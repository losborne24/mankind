// Fetches traced reconstruction outlines for the Campus Martius monuments that have no mapped remains (Stage 3b, second pass).
// Same rules as the other fetchers: network is needed only here; build-landmarks.mjs works offline from the snapshot.
//
// OpenHistoricalMap (CC0) via its Overpass server: outlines its contributors traced from published reconstruction plans (the Larousse
// plan of ancient Rome, the plans on Wikimedia Commons). They are reconstructions, not remains, so every landmark placed from them is a
// best guess; only position, orientation and footprint are used.
import { mkdir, writeFile } from 'node:fs/promises';
const agent = { 'user-agent': 'mankind-research/0.1 (osborneleith@gmail.com)' };
const out = 'data/history/rome/source';
const accessed = new Date().toISOString().slice(0, 10);
await mkdir(out, { recursive: true });

/** Snapshot key → OHM element, or several whose outlines are taken together. */
export const elements = {
  'iseum-court': ['relation/2753804', 'relation/2753805'], serapeum: 'relation/2753803',
  'porticus-divorum': 'relation/2751512', 'theatre-balbus': 'way/199853034', 'crypta-balbi': 'relation/2751618',
  'porticus-philippi': 'relation/2751523', 'temple-hercules-musarum': 'way/199853033',
  'temple-juno-regina': 'way/199853021', 'temple-jupiter-stator': 'way/199853020',
  'temple-neptune-circo': 'way/199853025', 'temple-hercules-custos': 'way/199853026', minervium: 'way/199864869',
};
const ids = [...new Set(Object.values(elements).flat())].map(e => e.split('/'));
const query = `[out:json][timeout:90];(${ids.map(([t, id]) => `${t}(${id});`).join('')});out geom;`;
let r;
for (let attempt = 0; attempt < 5; attempt++) {
  r = await fetch('https://overpass-api.openhistoricalmap.org/api/interpreter', { method: 'POST', headers: { ...agent, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
  if (r.ok) break;
  await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
}
if (!r.ok) throw Error(`OHM Overpass: ${r.status}`);
const ohm = await r.json();
const ll = g => g.map(p => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
const byId = new Map(ohm.elements.map(e => [`${e.type}/${e.id}`, e]));
const landmarks = Object.fromEntries(Object.entries(elements).map(([key, refs]) => {
  const es = [refs].flat().map(ref => byId.get(ref) ?? (() => { throw Error(`Missing OHM ${ref} (${key})`); })());
  const ways = es.flatMap(e => e.geometry ? [ll(e.geometry)] : e.members.filter(m => m.geometry && m.role !== 'inner').map(m => ll(m.geometry)));
  const tags = Object.assign({}, ...es.map(e => Object.fromEntries(Object.entries(e.tags).filter(([k]) => /^(name|name:en|start_date|end_date|note|source.*)$/.test(k)))));
  return [key, { ohm: [refs].flat().join(' + '), name: tags.name ?? key, tags, ways }];
}));
await writeFile(`${out}/ohm-landmarks.json`, JSON.stringify({ accessed, baseTimestamp: ohm.osm3s.timestamp_osm_base, licence: 'CC0 · OpenHistoricalMap contributors', licenceUrl: 'https://www.openhistoricalmap.org/copyright', landmarks }) + '\n');
console.log(`ohm-landmarks: ${Object.keys(landmarks).length} outlines`);
