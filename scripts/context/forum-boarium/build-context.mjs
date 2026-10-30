// Builds the Forum Boarium 2D context layer from the snapshots written by fetch-sources.mjs. Works offline.
// Every coordinate below is copied from a snapshot; nothing is typed in by hand except the schematic ground tile,
// which reuses the scenario bounds. Run after fetch-sources.mjs, never edit the output by hand.
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'data/history/forum-boarium/source';
const pleiades = JSON.parse(await readFile(`${dir}/pleiades.json`, 'utf8'));
const osm = JSON.parse(await readFile(`${dir}/osm.json`, 'utf8'));
const wikidata = JSON.parse(await readFile(`${dir}/wikidata.json`, 'utf8'));
const bounds = [12.47, 41.88, 12.49, 41.9];
const round = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
const element = (type, id) => osm.elements.find(e => e.type === type && e.id === id) ?? (() => { throw Error(`Missing OSM ${type} ${id}`); })();
const key = p => p.join(',');
/** Join member ways end to end into closed rings. */
function rings(members) {
  const ways = members.map(m => m.geometry.map(round)), out = [];
  while (ways.length) {
    let ring = ways.shift();
    for (let progress = true; progress && key(ring[0]) !== key(ring.at(-1));) {
      progress = false;
      for (let i = 0; i < ways.length; i++) {
        const w = ways[i];
        if (key(w[0]) === key(ring.at(-1))) ring = ring.concat(w.slice(1));
        else if (key(w.at(-1)) === key(ring.at(-1))) ring = ring.concat(w.slice(0, -1).reverse());
        else if (key(w.at(-1)) === key(ring[0])) ring = w.concat(ring.slice(1));
        else if (key(w[0]) === key(ring[0])) ring = w.slice(1).reverse().concat(ring);
        else continue;
        ways.splice(i, 1); progress = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}
/** Sutherland–Hodgman against the scenario rectangle; the clipped river keeps real banks inside it. */
function clip(ring) {
  const edges = [[p => p[0] >= bounds[0], (a, b) => { const t = (bounds[0] - a[0]) / (b[0] - a[0]); return [bounds[0], a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= bounds[2], (a, b) => { const t = (bounds[2] - a[0]) / (b[0] - a[0]); return [bounds[2], a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= bounds[1], (a, b) => { const t = (bounds[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), bounds[1]]; }],
    [p => p[1] <= bounds[3], (a, b) => { const t = (bounds[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), bounds[3]]; }]];
  let points = ring.slice(0, -1);
  for (const [inside, cut] of edges) {
    const next = [];
    points.forEach((cur, i) => {
      const prev = points[(i + points.length - 1) % points.length];
      if (inside(cur)) { if (!inside(prev)) next.push(cut(prev, cur)); next.push(cur); } else if (inside(prev)) next.push(cut(prev, cur));
    });
    points = next;
    if (!points.length) return [];
  }
  const closed = points.map(round);
  return closed.length < 3 ? [] : [...closed, closed[0]];
}
const inBounds = p => p[0] >= bounds[0] && p[0] <= bounds[2] && p[1] >= bounds[1] && p[1] <= bounds[3];
const polygon = (type, id) => { const e = element(type, id); return [e.geometry.map(round)]; };

const pl = key => pleiades.places[key];
const src = (id, title, url, licence) => ({ id, title, url, licence });
const sources = [
  ...Object.entries(pleiades.places).map(([k, p]) => src(`source:pleiades-${k}`, `Pleiades · ${p.title}`, p.uri, pleiades.licence)),
  src('source:osm-tiber', 'OpenStreetMap · Tiber water polygon (relation 5071)', 'https://www.openstreetmap.org/relation/5071', osm.licence),
  src('source:osm-forum-boarium', 'OpenStreetMap · Foro Boario site (way 27350575)', 'https://www.openstreetmap.org/way/27350575', osm.licence),
  src('source:osm-hercules', 'OpenStreetMap · Tempio di Ercole Vincitore (way 251342364)', 'https://www.openstreetmap.org/way/251342364', osm.licence),
  src('source:osm-portunus', 'OpenStreetMap · Tempio di Portuno (way 251331418)', 'https://www.openstreetmap.org/way/251331418', osm.licence),
  src('source:osm-pons-aemilius', 'OpenStreetMap · Ponte Emilio (relation 6384861)', 'https://www.openstreetmap.org/relation/6384861', osm.licence),
  src('source:osm-cloaca', 'OpenStreetMap · mouth of the Cloaca Maxima (node 4754734734)', 'https://www.openstreetmap.org/node/4754734734', osm.licence),
  src('source:osm-arch-of-janus', 'OpenStreetMap · Arco di Giano (way 52924046)', 'https://www.openstreetmap.org/way/52924046', osm.licence),
  src('source:osm-santa-maria', 'OpenStreetMap · Santa Maria in Cosmedin (way 120854225)', 'https://www.openstreetmap.org/way/120854225', osm.licence),
  src('source:wikidata-portus', 'Wikidata · Portus Tiberinus (Q3909304), coordinate', wikidata['portus-tiberinus'].uri, wikidata.licence),
  src('source:wikipedia-tiber', 'Wikipedia · Tiber (embankments begun 1876)', 'https://en.wikipedia.org/wiki/Tiber', 'CC BY-SA 4.0 · text read for one dated claim'),
  src('source:wikipedia-pons-aemilius', 'Wikipedia · Pons Aemilius (stone bridge begun 179 BC, completed 151 BC)', 'https://en.wikipedia.org/wiki/Pons_Aemilius', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-great-altar', 'Wikipedia · Great Altar of Hercules (foundations possibly under Santa Maria in Cosmedin)', 'https://en.wikipedia.org/wiki/Great_Altar_of_Hercules', 'CC BY-SA 4.0 · text read for one claim'),
  src('source:wikipedia-hercules', 'Wikipedia · Temple of Hercules Victor (later 2nd century BC)', 'https://en.wikipedia.org/wiki/Temple_of_Hercules_Victor', 'CC BY-SA 4.0 · text read for the date'),
  src('source:it-wikipedia-porto-tiberino', 'Wikipedia (it) · Porto tiberino (6th century BC; kept active at least to the Flavians)', 'https://it.wikipedia.org/wiki/Porto_tiberino', 'CC BY-SA 4.0 · text read for dates and setting'),
];

// Tiber: modern OSM water polygon, clipped to the scenario rectangle. Outer rings minus Tiber Island.
const river = element('relation', 5071), outer = rings(river.members.filter(m => m.role === 'outer')), inner = rings(river.members.filter(m => m.role === 'inner'));
const clippedOuter = outer.map(clip).filter(r => r.length);
const holes = inner.filter(r => r.every(inBounds));
const largest = clippedOuter.sort((a, b) => b.length - a.length)[0];
if (!largest) throw Error('No Tiber outline inside the scenario bounds');
const tiberRings = [largest, ...holes.filter(h => h.length > 4)];

const modernNote = 'Modern geometry. ';
const geometries = [
  { id: 'ground', title: 'Ancient ground · illustrative', kind: 'polygon', coordinates: [[[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]], [bounds[0], bounds[1]]]],
    certainty: 'illustrative', basis: 'schematic', style: 'ground', sources: [],
    note: 'A neutral tone over the scenario area so no beat shows the modern vegetation plane. It carries no information about ancient terrain, paving or surfaces.' },
  { id: 'tiber', title: 'Tiber · modern channel, approximate ancient bank', kind: 'polygon', coordinates: tiberRings,
    certainty: 'approximate', basis: 'modern-geometry', style: 'water', sources: ['source:osm-tiber', 'source:wikipedia-tiber', 'source:pleiades-forum-boarium'],
    note: `${modernNote}OpenStreetMap water outline of today's river, clipped to the scenario area and shown only as an approximation of where the ancient bank lay. The present embankments were begun in 1876, so this is not the ancient course.` },
  { id: 'forum-boarium', title: 'Forum Boarium · approximate extent', kind: 'polygon', coordinates: polygon('way', 27350575),
    certainty: 'approximate', basis: 'modern-geometry', style: 'extent', time: { start: { year: -330 }, end: { year: 2025 } }, sources: ['source:osm-forum-boarium', 'source:pleiades-forum-boarium'],
    note: `${modernNote}OpenStreetMap outline of the present-day archaeological site, recorded by Pleiades as its location. Not a surveyed boundary of the ancient market. Date range is the Pleiades record span.` },
  { id: 'hercules-victor-footprint', title: 'Temple of Hercules Victor · footprint', kind: 'polygon', coordinates: polygon('way', 251342364),
    certainty: 'approximate', basis: 'modern-geometry', style: 'footprint', time: { start: { year: -143 }, end: { year: 2025 } }, uncertaintyYears: 15, sources: ['source:osm-hercules', 'source:pleiades-hercules-victor', 'source:wikipedia-hercules'],
    note: `${modernNote}Outline of the standing building as mapped in OpenStreetMap (Pleiades location). The temple stands where it did; the outline may omit the base steps. Dated to the later 2nd century BC.` },
  { id: 'portunus-footprint', title: 'Temple of Portunus · footprint', kind: 'polygon', coordinates: polygon('way', 251331418),
    certainty: 'approximate', basis: 'modern-geometry', style: 'footprint', time: { start: { year: -120 }, end: { year: 2025 } }, uncertaintyYears: 30, sources: ['source:osm-portunus', 'source:pleiades-portunus'],
    note: `${modernNote}Outline of the standing building as mapped in OpenStreetMap (Pleiades location). Pleiades dates the temple to the late 2nd or early 1st century BC.` },
  { id: 'pons-aemilius', title: 'Pons Aemilius · surviving fragment', kind: 'polygon', coordinates: rings(element('relation', 6384861).members).map(r => r),
    certainty: 'approximate', basis: 'modern-geometry', style: 'structure', time: { start: { year: -179 }, end: { year: 2025 } }, uncertaintyYears: 28, sources: ['source:osm-pons-aemilius', 'source:pleiades-pons-aemilius', 'source:wikipedia-pons-aemilius'],
    note: `${modernNote}Only the remnant known as the Ponte Rotto is mapped, so this shows where the bridge stood, not its full span. Sources disagree on the first stone bridge: Pleiades says 241 BC, Wikipedia 179 BC begun and 151 BC complete; both precede AD 100.` },
  { id: 'arch-of-janus', title: 'Arch of Janus', kind: 'polygon', coordinates: polygon('way', 52924046),
    certainty: 'approximate', basis: 'modern-geometry', style: 'structure', time: { start: { year: 300 }, end: { year: 2025 } }, sources: ['source:osm-arch-of-janus', 'source:pleiades-arch-of-janus'],
    note: `${modernNote}Early fourth-century arch (Pleiades), so absent at AD 100. Kept in the data so the date filter can show it is left out.` },
  { id: 'santa-maria-in-cosmedin', title: 'Santa Maria in Cosmedin', kind: 'polygon', coordinates: polygon('way', 120854225),
    certainty: 'approximate', basis: 'modern-geometry', style: 'structure', time: { start: { year: 501 }, end: { year: 2025 } }, uncertaintyYears: 100, sources: ['source:osm-santa-maria', 'source:pleiades-santa-maria-in-cosmedin'],
    note: `${modernNote}Church founded, by tradition, in the sixth century (Pleiades) and rebuilt from the eighth, so absent at AD 100. Kept in the data so the date filter can show it is left out.` },
];
const marker = (id, title, coordinate, sourceIds, context) => ({ id, title, coordinate: round(coordinate), certainty: context.certainty === 'illustrative' ? 'illustrative' : 'established', sources: sourceIds, context });
const locations = [
  marker('portus-tiberinus', 'Portus Tiberinus · river harbour (approximate)', wikidata['portus-tiberinus'].coordinate, ['source:wikidata-portus', 'source:it-wikipedia-porto-tiberino'],
    { certainty: 'approximate', basis: 'point-only', style: 'structure', time: { start: { year: -550 }, end: { year: 96 } }, uncertaintyYears: 50,
      note: `Marker only. The coordinate is a Wikidata point whose declared precision is about ${Math.round(wikidata['portus-tiberinus'].precisionDegrees * 111)} km, so it shows the harbour's neighbourhood, not its quays. Italian Wikipedia places it between the Palatine and Capitoline slopes and says it stayed in use at least to the Flavian period (to AD 96); use at AD 100 is possible, not documented.` }),
  marker('ara-maxima', 'Ara Maxima of Hercules · approximate', pl('ara-maxima').reprPoint, ['source:pleiades-ara-maxima', 'source:wikipedia-great-altar'],
    { certainty: 'approximate', basis: 'point-only', style: 'structure', time: { start: { year: -30 }, end: { year: 640 } },
      note: 'Marker only. Pleiades gives this altar no location of its own; its representative point is derived. Foundations possibly lie beneath Santa Maria in Cosmedin (tentative identification). Date range is the Pleiades attestation span, not the altar\'s origin.' }),
  marker('cloaca-maxima-outlet', 'Cloaca Maxima · outlet into the Tiber', pl('cloaca-maxima').locations[0].geometry.coordinates, ['source:osm-cloaca', 'source:pleiades-cloaca-maxima'],
    { certainty: 'approximate', basis: 'point-only', style: 'structure', time: { start: { year: -525 }, end: { year: 2025 } }, uncertaintyYears: 25,
      note: 'Marker only: the mapped mouth of the sewer today, recorded by Pleiades. Pleiades describes a canalised drain from the late sixth century BC draining into the Tiber; the ancient outlet may have lain elsewhere.' }),
  marker('capitoline', 'Capitoline', pl('capitoline').reprPoint, ['source:pleiades-capitoline'], { certainty: 'illustrative', basis: 'point-only', style: 'orientation', note: 'Orientation label at the mapped summit point. A landform present throughout; not part of the evidence.' }),
  marker('palatine', 'Palatine', pl('palatine').reprPoint, ['source:pleiades-palatine'], { certainty: 'illustrative', basis: 'point-only', style: 'orientation', note: 'Orientation label at the mapped summit point. A landform present throughout; not part of the evidence.' }),
  marker('aventine', 'Aventine', pl('aventine').reprPoint, ['source:pleiades-aventine'], { certainty: 'illustrative', basis: 'point-only', style: 'orientation', note: 'Orientation label at the Pleiades summit point (stated accuracy about 2 km). A landform present throughout; not part of the evidence.' }),
  marker('tiber-island', 'Tiber Island', pl('tiber-island').reprPoint, ['source:pleiades-tiber-island', 'source:pleiades-aedes-fauni'], { certainty: 'illustrative', basis: 'point-only', style: 'orientation', time: { start: { year: -196 }, end: { year: 2025 } }, note: 'Orientation label. Pleiades records a temple of Faunus on the island dedicated in 196 BC, so the island was occupied by then.' }),
  marker('circus-maximus', 'Circus Maximus (direction)', pl('circus-maximus').reprPoint, ['source:pleiades-circus-maximus'], { certainty: 'illustrative', basis: 'point-only', style: 'orientation', time: { start: { year: -30 }, end: { year: 300 } }, note: 'Orientation label for the direction of the Circus Maximus, at the Pleiades representative point. Date range is the Pleiades location span.' }),
];
const used = new Set([...geometries.flatMap(g => g.sources), ...locations.flatMap(l => l.sources)]);
const out = { sources: sources.filter(s => used.has(s.id)), locations, geometries };
await writeFile('lib/scenarios/fixtures/forum-boarium-context.json', JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ geometries: geometries.map(g => [g.id, g.coordinates.map(r => r.length)]), locations: locations.length, sources: out.sources.length }));
