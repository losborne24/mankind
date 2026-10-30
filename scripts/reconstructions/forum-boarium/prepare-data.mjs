// Composes the two reviewed temple interpretations into one historical world, so a journey can show both at once.
// The scene streamer keeps one detailed layout active at a time, so the pair is one layout (two buildings),
// not two layouts. Reads lib/history/fixtures/portunus.json (regenerate that with portunus/prepare-data.mjs) and
// the Hercules Victor catalogue entry; never edits either. Output: lib/history/fixtures/forum-boarium.json.
import { readFile, writeFile } from 'node:fs/promises';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const portunus = await json('lib/history/fixtures/portunus.json');
const hercules = await json('data/history/hercules-victor/asset-v1.json');
const osm = await json('data/history/forum-boarium/source/osm.json');
const pleiades = await json('data/history/forum-boarium/source/pleiades.json');
const accessed = '2026-10-30';

/** Area-weighted centroid of a closed lon/lat ring (small areas: planar is exact enough). */
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1], f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
const way = id => osm.elements.find(e => e.type === 'way' && e.id === id).geometry;
const hOsm = centroid(way(251342364)), pOsm = centroid(way(251331418));
const anchor = portunus.places[0].position.coordinate;
const latScale = 110574, lonScale = 111320 * Math.cos(anchor[1] * Math.PI / 180);
// Vector from the Portunus outline centre to the Hercules outline centre, east/south metres (same dataset, so errors largely cancel).
const d = [(hOsm[0] - pOsm[0]) * lonScale, -(hOsm[1] - pOsm[1]) * latScale];
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const at = (east, south) => [Math.round((anchor[0] + east / lonScale) * 1e9) / 1e9, Math.round((anchor[1] - south / latScale) * 1e9) / 1e9];
const herculesCoordinate = at(d[0], d[1]), origin = at(d[0] / 2, d[1] / 2);

const evidence = (certainty, sources, note) => ({ certainty, sources, note });
const sources = [
  ...portunus.sources,
  ...hercules.sources.map(s => ({ ...s })),
  { id: 'source:pleiades-hercules-victor', title: 'Pleiades · Temple of Hercules Victor', publisher: 'Pleiades (ISAW/NYU)', url: pleiades.places['hercules-victor'].uri, accessed, citation: `${pleiades.licence}. Location is an OpenStreetMap outline with stated accuracy 20 m.` },
  { id: 'source:pleiades-portunus', title: 'Pleiades · Temple of Portunus', publisher: 'Pleiades (ISAW/NYU)', url: pleiades.places.portunus.uri, accessed, citation: `${pleiades.licence}. Location is an OpenStreetMap outline with stated accuracy 20 m.` },
  { id: 'source:osm-hercules', title: 'OpenStreetMap · Tempio di Ercole Vincitore (way 251342364)', publisher: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/way/251342364', accessed, citation: osm.licence },
  { id: 'source:osm-portunus', title: 'OpenStreetMap · Tempio di Portuno (way 251331418)', publisher: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/way/251331418', accessed, citation: osm.licence },
];
const period = { start: { year: 100 }, approximate: true };
const world = {
  version: 1, id: 'world:forum-boarium-temples-v1', title: 'Forum Boarium · two temple interpretations', coordinateSystem: 'WGS84', calendar: 'proleptic-gregorian', sources,
  places: [
    { id: 'place:temple-of-portunus', title: 'Temple of Portunus', kind: 'landmark', radiusMeters: 35, marker: false, period: { start: { year: -120 }, end: { year: 2025 } },
      position: portunus.places[0].position, evidence: evidence('documented', ['source:rome-heritage', 'source:pleiades-portunus'], 'Named Roman temple. Pleiades dates it to the late 2nd or early 1st century BC; the date range here is approximate and encodes no unchanged appearance.') },
    { id: 'place:temple-of-hercules-victor', title: 'Temple of Hercules Victor', kind: 'landmark', radiusMeters: 35, marker: false, period: { start: { year: -143 }, end: { year: 2025 } },
      position: { coordinate: herculesCoordinate, uncertaintyMeters: 25, evidence: evidence('inferred', ['source:osm-hercules', 'source:osm-portunus', 'source:rome-tourism'], `Derived, not surveyed: the Portunus visitor anchor plus the vector (${round(d[0], 1)} m east, ${round(d[1], 1)} m south) between the two OpenStreetMap temple outlines, whose stated accuracy is 20 m. The earlier rounded Wikipedia point (41.88861 N, 12.48083 E) lies about 20 m away from the OpenStreetMap outline centre and was not used.`) },
      evidence: evidence('documented', ['source:wikipedia-hercules', 'source:whe-hercules'], 'Named Roman temple, standing, dated to the later 2nd century BC. Peripteral tholos of 20 Corinthian columns.') },
    { id: 'place:forum-boarium-temples', title: 'Forum Boarium temple pair · layout origin', kind: 'landmark', radiusMeters: 90, marker: false,
      position: { coordinate: origin, uncertaintyMeters: 25, evidence: evidence('inferred', ['source:osm-hercules', 'source:osm-portunus', 'source:rome-tourism'], 'Midpoint of the two temple anchors, chosen only as the origin of the combined layout. It is not a surveyed centre and marks no ancient feature.') },
      evidence: evidence('illustrative', [], 'A presentation anchor for showing two reviewed buildings together. It asserts no ancient neighbourhood.') },
  ],
  assets: [
    portunus.assets[0],
    { id: 'asset:hercules-victor-exterior', category: 'building', catalogueRef: { id: hercules.id, version: hercules.version }, evidence: evidence('inferred', ['source:wikipedia-hercules', 'source:whe-hercules', 'source:palladio-1570'], 'Specific exterior model: standing plan and counts documented, cella, roof and door inferred. Details in the pinned catalogue version.') },
  ],
  layouts: [{ id: 'layout:forum-boarium-temples', title: 'Two reviewed temple exteriors · editorial AD 100 preview', placeId: 'place:forum-boarium-temples', period, frame: 'local-east-south-metres', extentMeters: 120, maxFoundationRiseMeters: 4,
    buildings: [
      { id: 'building:portunus', assetId: 'asset:portunus-exterior', placeId: 'place:temple-of-portunus', offset: [round(-d[0] / 2), round(-d[1] / 2)], headingRadians: Math.PI, evidence: portunus.layouts[0].buildings[0].evidence },
      { id: 'building:hercules-victor', assetId: 'asset:hercules-victor-exterior', placeId: 'place:temple-of-hercules-victor', offset: [round(d[0] / 2), round(d[1] / 2)], evidence: evidence('inferred', ['source:osm-hercules', 'source:osm-portunus', 'source:wikipedia-hercules'], 'Position from the two OpenStreetMap outlines (accuracy about 20 m). The door orientation is not documented, so the display pose is arbitrary and the models are not rotated to match the outlines.') },
    ],
    evidence: evidence('inferred', ['source:psu-fletcher', 'source:rome-heritage', 'source:palladio-1570', 'source:osm-hercules'], 'Combines two separately reviewed exterior interpretations. Their relative placement is approximate; extent and foundation rise are renderer limits. The preview date is editorial, not a verified state.') }],
  scenes: [{ id: 'scene:forum-boarium-temples', title: 'Two temples side by side', description: 'Two explicitly selected, evidence-labelled temple exteriors in one scene. No reconstructed square, neighbourhood or population.', placeId: 'place:forum-boarium-temples', period, layoutIds: ['layout:forum-boarium-temples'], assetIds: ['asset:portunus-exterior', 'asset:hercules-victor-exterior'], required: false, fallback: 'map-only', evidence: evidence('illustrative', [], 'Presentation requirement. Usable models do not make inferred dates or features exact.') }],
  roadNetworks: [], events: [], routes: [],
};
await writeFile('lib/history/fixtures/forum-boarium.json', JSON.stringify(world, null, 2) + '\n');
console.log(JSON.stringify({ vectorMetres: d.map(v => round(v, 1)), hercules: herculesCoordinate, origin, offsets: world.layouts[0].buildings.map(b => b.offset) }));
