// Builds the dated land-use zoning of Rome around AD 100 (Stage 1 of the city expansion) as plain data. Works offline and is
// deterministic: the same snapshots give byte-identical output. Never edit the output by hand; see ZONING.md for the reasoning.
//
// Inputs: the Pleiades and OpenStreetMap snapshots written by fetch-zoning-sources.mjs, the Tiber outline already in the Forum
// Boarium context layer, and the coarse zone outlines below. Those outlines are drawn by hand around Pleiades points at about
// 50-100 m precision, from the general topography in the works cited in SOURCES; nothing is traced from a plan. Where a line is a
// guess the zone says so in its note.
//
// Output: lib/scenarios/fixtures/rome-ad100-zoning.json, longitude/latitude, zones that never overlap (each is cut by every zone
// of higher priority), with an evidence tier, an existence interval and a source note each.
import { readFile, writeFile } from 'node:fs/promises';
import polygonClipping from 'polygon-clipping';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const pleiades = await json('data/history/rome/source/pleiades-zoning.json');
const walls = await json('data/history/rome/source/osm-aurelian-walls.json');
const context = await json('lib/scenarios/fixtures/forum-boarium-context.json');
const r6 = v => Math.round(v * 1e6) / 1e6, round = p => [r6(p[0]), r6(p[1])];
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;   // metres per degree at Rome
const pl = key => pleiades.places[key] ?? (() => { throw Error(`Missing Pleiades ${key}`); })();

// ---- Extent: the area later enclosed by the Aurelian Walls (AD 271-275). Used only as the outer limit; the walls are not drawn.
// East bank: the surviving wall ways, ordered round a centre and kept at their outermost point per degree, from where the wall
// leaves the river north of the Campus Martius, round the east, to where it meets the river south of the Emporium.
const CENTRE = [12.49, 41.892];
const angle = p => Math.atan2((p[1] - CENTRE[1]) * KY, (p[0] - CENTRE[0]) * KX) * 180 / Math.PI, radius = p => Math.hypot((p[1] - CENTRE[1]) * KY, (p[0] - CENTRE[0]) * KX);
const NORTH_END = [12.474919, 41.911304], SOUTH_END = [12.47437, 41.873042];   // ends of OSM ways 1050857480 and 687345945
// Angles run counter-clockwise from east, taken in [north end, north end + 360): the east arc is from the south end's angle up to a full turn.
const north = angle(NORTH_END), south = angle(SOUTH_END) < north ? angle(SOUTH_END) + 360 : angle(SOUTH_END);
const bins = new Map();
for (const p of walls.elements.flatMap(e => e.geometry)) {
  const a = angle(p) < north ? angle(p) + 360 : angle(p);
  if (a < south + 0.5 || a > north + 359.5) continue;   // the west sector is closed by the river and Trastevere below
  const bin = Math.round(a);
  if (!bins.has(bin) || radius(p) > radius(bins.get(bin))) bins.set(bin, p);
}
const eastArc = [...bins.entries()].sort((a, b) => b[0] - a[0]).map(([, p]) => p);   // north end first, then clockwise round the east
// Trastevere: the wall's surviving ends (OSM way 803364166 at the river in the south, way 204145793 from Porta Settimiana up the
// Janiculum) joined through the site of Porta Aurelia (today's Porta San Pancrazio). That middle stretch is lost and is a guess.
const trastevere = [[12.471834, 41.873699], [12.4668, 41.8778], [12.4615, 41.8846],
  ...walls.elements.find(e => e.id === 204145793).geometry.slice().reverse()];
// Back across the river at Porta Settimiana, and north up the east bank of today's channel to the wall's north end.
const tiberRings = context.geometries.find(g => g.id === 'tiber').coordinates, river = tiberRings[0];
const nearest = q => river.reduce((best, p, i) => { const d = Math.hypot((p[0] - q[0]) * KX, (p[1] - q[1]) * KY); return d < best.d ? { i, d } : best; }, { i: 0, d: Infinity }).i;
/** The stretch of today's bank between the points nearest `from` and `to` (the shorter way round the outline), in that order. */
function bank(from, to) {
  const [i, j] = [nearest(from), nearest(to)];
  const arcs = [river.slice(Math.min(i, j), Math.max(i, j) + 1), [...river.slice(Math.max(i, j)), ...river.slice(1, Math.min(i, j) + 1)]];
  const span = arc => Math.max(...arc.map(p => p[1])) - Math.min(...arc.map(p => p[1]));
  const arc = arcs.sort((a, b) => span(a) - span(b))[0];
  return Math.sign(arc.at(-1)[1] - arc[0][1]) === Math.sign(to[1] - from[1]) ? arc : arc.slice().reverse();
}
const eastBank = bank([12.4706, 41.8933], [12.4728, 41.9105]);
const extentRing = [...eastArc, SOUTH_END, ...trastevere, ...eastBank, NORTH_END].map(round);
extentRing.push(extentRing[0]);
const extent = polygonClipping.union([[extentRing]]);

// ---- Sources. Everything here is cited for text or a point; nothing restricted is used for geometry.
const src = (id, title, url, licence) => ({ id, title, url, licence });
const P = key => `source:pleiades-${key}`;
const sources = [
  ...Object.entries(pleiades.places).map(([k, p]) => src(P(k), `Pleiades · ${p.title}`, p.uri, pleiades.licence)),
  src('source:osm-aurelian-walls', 'OpenStreetMap · surviving ways of the Mura Aureliane (historic=citywalls)', 'https://www.openstreetmap.org/way/1050857480', walls.licence),
  src('source:osm-tiber', 'OpenStreetMap · Tiber water polygon (relation 5071)', 'https://www.openstreetmap.org/relation/5071', 'ODbL 1.0 · © OpenStreetMap contributors'),
  src('source:wikipedia-regions', 'Wikipedia · Fourteen regions of Augustan Rome', 'https://en.wikipedia.org/wiki/Fourteen_regions_of_Augustan_Rome', 'CC BY-SA 4.0 · text read for the regions and their contents'),
  src('source:wikipedia-aurelian-walls', 'Wikipedia · Aurelian Walls (built AD 271-275)', 'https://en.wikipedia.org/wiki/Aurelian_Walls', 'CC BY-SA 4.0 · text read for the date'),
  src('source:lanciani-fur', 'Lanciani, Forma Urbis Romae (1893-1901), general layout', 'https://commons.wikimedia.org/wiki/Category:Forma_Urbis_Romae_(Lanciani)', 'Public domain (published 1901) · consulted for layout, no plate traced for these zones'),
  src('source:platner-1929', 'Platner & Ashby, A Topographical Dictionary of Ancient Rome (1929): Horti, Subura, Campus Martius, Emporium', 'https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Roma/Rome/_Texts/PLATOP*/home.html', 'Public domain (published 1929) · text read'),
  src('source:severan-plan', 'Severan Marble Plan (Forma Urbis Romae, AD 203-211), via the Stanford Digital FUR Project', 'https://formaurbis.stanford.edu/', 'Reference only: later than AD 100 and not licensed for derived geometry; nothing traced'),
  src('source:atlas-ancient-rome', 'Carandini (ed.), The Atlas of Ancient Rome (Princeton, 2017)', 'https://press.princeton.edu/books/hardcover/9780691163475/the-atlas-of-ancient-rome', 'Copyright · reference only, nothing traced'),
];

// ---- Zones. Coordinates are [longitude, latitude], drawn coarsely; anything that reaches into the river or past the extent is cut.
// `interval` is the span over which the zone, as drawn, is defended as a description of the city; the scene date is AD 100.
const regions = ['regio-i', 'regio-ii', 'regio-iii', 'regio-iv', 'regio-v', 'regio-vi', 'regio-vii', 'regio-viii', 'regio-ix', 'regio-x', 'regio-xi', 'regio-xii', 'regio-xiii', 'regio-xiv'].map(P);
const zone = (id, use, title, certainty, interval, outline, note, sourceIds) => ({ id, use, title, certainty, time: { start: { year: interval[0] }, end: { year: interval[1] } }, outline, note, sources: sourceIds });
const GUESS = 'The outline is drawn by hand at about 100 m precision and its edges are a guess.';
const drawn = [
  // Monumental and public
  zone('zone:forum-palatine', 'monumental', 'Capitoline, Forum Romanum, Palatine, Colosseum valley and Circus Maximus', 'approximate', [80, 104],
    [[12.4797, 41.8946], [12.4838, 41.8950], [12.4865, 41.8952], [12.4882, 41.8947], [12.4893, 41.8935], [12.4912, 41.8922], [12.4940, 41.8920], [12.4952, 41.8902],
      [12.4934, 41.8884], [12.4905, 41.8872], [12.4903, 41.8848], [12.4890, 41.8834], [12.4815, 41.8862], [12.4810, 41.8876], [12.4836, 41.8885], [12.4846, 41.8903],
      [12.4826, 41.8907], [12.4812, 41.8912], [12.4796, 41.8926]],
    `Temples, basilicas, imperial fora (Caesar, Augustus, the Templum Pacis, Nerva's forum of AD 97), the palaces on the Palatine, the Flavian amphitheatre (AD 80) and the Circus Maximus, around Pleiades points for each. The Velabrum between the Capitoline and the Palatine is left to housing. The saddle where Trajan's Forum was built from about AD 106 is left out of this zone and falls to housing; what stood there at AD 100 is uncertain. ${GUESS}`,
    [P('forum-romanum'), P('forum-iulium'), P('templum-pacis'), P('amphitheatrum-flavium'), P('jupiter-capitolinus'), P('palatine'), P('circus-maximus'), P('regio-viii'), P('regio-x'), P('regio-xi'), 'source:wikipedia-regions', 'source:lanciani-fur']),
  zone('zone:oppian', 'monumental', 'Oppian: Baths of Titus and the Domus Aurea pavilion', 'approximate', [80, 104],
    [[12.4925, 41.8940], [12.4990, 41.8938], [12.4992, 41.8915], [12.4945, 41.8912], [12.4925, 41.8920]],
    `The Baths of Titus (AD 80) and the surviving Oppian wing of Nero's Domus Aurea, which burned in AD 104 and lay under the Baths of Trajan by 109. ${GUESS}`,
    [P('regio-iii'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:claudianum', 'monumental', 'Caelian: Temple of the Deified Claudius', 'approximate', [75, 300],
    [[12.4920, 41.8883], [12.4952, 41.8883], [12.4952, 41.8857], [12.4920, 41.8857]],
    `The terrace of the Temple of Claudius, completed by Vespasian. Placed by the Regio II record; its size here is a round figure. ${GUESS}`,
    [P('regio-ii'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:circus-flaminius', 'monumental', 'Forum Holitorium, Theatre of Marcellus and the Circus Flaminius porticoes', 'approximate', [-13, 300],
    [[12.4752, 41.8936], [12.4800, 41.8943], [12.4813, 41.8925], [12.4808, 41.8906], [12.4795, 41.8900], [12.4779, 41.8909], [12.4753, 41.8925]],
    `The vegetable market and its temples, the Theatre of Marcellus (13 BC), the Porticus Octaviae and the Circus Flaminius, a public square ringed by temples and porticoes. The circus's exact line is disputed; ${GUESS.toLowerCase()}`,
    [P('theatrum-marcelli'), P('forum-holitorium'), P('circus-flaminius'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:campus-centre', 'monumental', 'Central Campus Martius: Pantheon, Saepta, Baths of Agrippa, Stadium of Domitian, Theatre of Pompey', 'approximate', [86, 300],
    [[12.4716, 41.9006], [12.4745, 41.9008], [12.4778, 41.9003], [12.4797, 41.8996], [12.4802, 41.8962], [12.4787, 41.8947], [12.4762, 41.8944], [12.4733, 41.8943], [12.4716, 41.8948], [12.4711, 41.8976]],
    `Public buildings packed close: Agrippa's Pantheon and baths, the Saepta Julia, the temples of the Largo Argentina, Pompey's theatre and portico, and Domitian's stadium and odeum (after AD 86). ${GUESS}`,
    [P('pantheon'), P('saepta-iulia'), P('stadium-domitiani'), P('theatrum-pompei'), P('campus-martius'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:campus-north', 'monumental', 'Northern Campus Martius: Mausoleum of Augustus, Ara Pacis and the sundial', 'approximate', [-9, 300],
    [[12.4748, 41.9076], [12.4778, 41.9074], [12.4800, 41.9040], [12.4798, 41.9022], [12.4772, 41.9022], [12.4748, 41.9044]],
    `Augustus's mausoleum and its park, the Ara Pacis (9 BC) and the Horologium, placed from their Pleiades points. ${GUESS}`,
    [P('mausoleum-augusti'), P('ara-pacis'), P('horologium-augusti'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:castra-praetoria', 'monumental', 'Castra Praetoria (camp of the Praetorian Guard)', 'approximate', [23, 312],
    [[12.5057, 41.9083], [12.5106, 41.9089], [12.5113, 41.9050], [12.5064, 41.9043]],
    `The walled camp built under Tiberius (AD 23) on the plateau beyond the Viminal, later taken into the Aurelian circuit. Placed as a rectangle of about 440 by 380 m; ${GUESS.toLowerCase()}`,
    [P('regio-vi'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:tiber-island', 'monumental', 'Tiber Island: sanctuary of Aesculapius', 'approximate', [-291, 2025],
    [[12.4758, 41.8907], [12.4772, 41.8917], [12.4794, 41.8906], [12.4786, 41.8896], [12.4768, 41.8898]],
    'The island and its sanctuary (temple of Aesculapius, 291 BC; temple of Faunus, 196 BC). The island is today\'s outline; its ancient shore is not traced, so the edge is a guess.',
    [P('regio-xiv'), 'source:platner-1929', 'source:osm-tiber']),
  // Port and warehouses
  zone('zone:emporium', 'port', 'Emporium, Porticus Aemilia and the horrea below the Aventine', 'approximate', [-193, 300],
    [[12.4786, 41.8868], [12.4775, 41.8850], [12.4762, 41.8840], [12.4748, 41.8830], [12.4733, 41.8820], [12.4720, 41.8810], [12.4709, 41.8800], [12.4702, 41.8790], [12.4700, 41.8770], [12.4706, 41.8750], [12.4716, 41.8725],
      [12.4760, 41.8722], [12.4805, 41.8755], [12.4790, 41.8770], [12.4778, 41.8790], [12.4772, 41.8815], [12.4778, 41.8840], [12.4792, 41.8862], [12.4795, 41.8868]],
    'The river port on the plain south of the Aventine: the Emporium quay (Pleiades point), the Porticus Aemilia warehouse (193 BC) and the horrea (Galbana, Lolliana and others) between it and the hill, with the riverside strip north to the Forum Boarium. The amphora dump of Monte Testaccio was growing here; it is not modelled. ' + GUESS,
    [P('emporium'), P('porticus-aemilia'), P('regio-xiii'), 'source:platner-1929', 'source:lanciani-fur']),
  zone('zone:trastevere-river', 'port', 'Trastevere riverfront', 'illustrative', [0, 200],
    [[12.4793, 41.8890], [12.4796, 41.8875], [12.4786, 41.8860], [12.4762, 41.8840], [12.4733, 41.8820], [12.4709, 41.8800], [12.4700, 41.8780], [12.4699, 41.8760],
      [12.4687, 41.8760], [12.4686, 41.8780], [12.4694, 41.8805], [12.4718, 41.8825], [12.4746, 41.8845], [12.4770, 41.8865], [12.4778, 41.8885], [12.4776, 41.8893]],
    'A band about 100 m deep along the west bank south of the island, where landing places and storehouses for the river traffic are likely but not mapped. Its depth and extent are a guess.',
    [P('regio-xiv'), P('porta-portuensis'), 'source:wikipedia-regions']),
  // Horti (estate gardens)
  zone('zone:collis-hortorum', 'horti', 'Pincian (Collis Hortorum): Horti Luculliani, Sallustiani and others', 'approximate', [-60, 300],
    [[12.4788, 41.9122], [12.4840, 41.9140], [12.4960, 41.9125], [12.5020, 41.9107], [12.5026, 41.9066], [12.4986, 41.9046], [12.4930, 41.9050], [12.4880, 41.9060], [12.4830, 41.9057], [12.4800, 41.9074]],
    `The hill of gardens: the Horti Luculliani above the Campus and the imperial Horti Sallustiani in the valley towards the Quirinal, placed by their Pleiades points. Mostly gardens, pavilions and a few great houses. ${GUESS}`,
    [P('horti-luculliani'), P('horti-sallustiani'), P('regio-vi'), P('regio-vii'), 'source:platner-1929']),
  zone('zone:esquiline-horti', 'horti', 'Esquiline: Horti Maecenatis and Lamiani', 'approximate', [-30, 300],
    [[12.4998, 41.8962], [12.5040, 41.8990], [12.5090, 41.8975], [12.5100, 41.8930], [12.5060, 41.8905], [12.5010, 41.8922]],
    `The gardens laid out over the old Esquiline cemetery beyond the Servian agger (Maecenas's, then imperial; the Lamian gardens beside them), placed by their Pleiades points. ${GUESS}`,
    [P('horti-maecenatis'), P('horti-lamiani'), P('regio-v'), 'source:platner-1929']),
  zone('zone:esquiline-plateau', 'horti', 'Esquiline and Viminal plateau towards the later wall', 'illustrative', [0, 200],
    [[12.5030, 41.9040], [12.5110, 41.9042], [12.5165, 41.8960], [12.5150, 41.8898], [12.5100, 41.8930], [12.5090, 41.8975], [12.5040, 41.8990], [12.5000, 41.9010]],
    'The outer plateau between the Castra Praetoria and the aqueduct junction near the later Porta Maggiore. Suburban gardens and villas are likely; nothing specific is mapped here. The extent is a guess.',
    [P('regio-v'), P('regio-vi'), 'source:wikipedia-regions']),
  zone('zone:caelian-east', 'horti', 'Eastern Caelian: great houses and gardens', 'illustrative', [0, 200],
    [[12.4985, 41.8900], [12.5070, 41.8895], [12.5105, 41.8855], [12.5070, 41.8822], [12.4990, 41.8840]],
    'The eastern Caelian, towards the later Lateran, was a quarter of large houses with gardens (the house of the Laterani among them). The extent and the share of garden are guesses.',
    [P('regio-ii'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:via-appia', 'horti', 'Via Appia beyond Porta Capena: tombs, gardens and villas', 'illustrative', [0, 200],
    [[12.4928, 41.8832], [12.5000, 41.8828], [12.5065, 41.8785], [12.5040, 41.8735], [12.4985, 41.8728], [12.4935, 41.8780]],
    'Outside the Servian gate the Appian Way was lined with tombs (the Scipios\' among them) between gardens and villas, later enclosed by the Aurelian wall. Character and extent are a guess.',
    [P('regio-i'), 'source:wikipedia-regions']),
  zone('zone:janiculum', 'horti', 'Janiculum slopes', 'illustrative', [0, 200],
    [[12.4610, 41.8846], [12.4655, 41.8898], [12.4676, 41.8920], [12.4672, 41.8895], [12.4664, 41.8865], [12.4660, 41.8830], [12.4665, 41.8790], [12.4668, 41.8776]],
    'The slope up to the Janiculum within the later wall, likely villas and gardens above the Trastevere streets (a late-republican villa stood by the river at the Farnesina). The extent is a guess.',
    [P('regio-xiv'), 'source:wikipedia-regions']),
  // Open ground
  zone('zone:campus-open', 'open', 'Northern Campus Martius: open ground towards the Via Flaminia', 'illustrative', [0, 200],
    [[12.4700, 41.9030], [12.4748, 41.9044], [12.4748, 41.9076], [12.4778, 41.9076], [12.4790, 41.9122], [12.4700, 41.9125]],
    'North and west of the Mausoleum, towards where the Via Flaminia left the city. Strabo describes the Campus as open ground for exercise and games; by AD 100 building had spread north along the Via Lata, so how much stayed open here is a guess.',
    [P('campus-martius'), 'source:platner-1929']),
];

// ---- Resolve: river first, then each zone in priority order, every one cut by everything above it; housing is what is left.
const priority = ['open-river', 'monumental', 'port', 'horti', 'open', 'residential'];
const areaOf = mp => mp.reduce((sum, poly) => sum + poly.reduce((s, ring, k) => { let a = 0; for (let n = 0; n < ring.length - 1; n++) a += ring[n][0] * ring[n + 1][1] - ring[n + 1][0] * ring[n][1]; return s + (k ? -1 : 1) * Math.abs(a / 2) * KX * KY; }, 0), 0);
const water = polygonClipping.intersection(extent, [tiberRings]);
let taken = water;
const resolved = [];
const keep = mp => mp.filter(poly => areaOf([poly]) > 400);   // drop slivers left by the cuts
resolved.push({ id: 'zone:tiber', use: 'open-river', title: 'Tiber', certainty: 'approximate', time: { start: { year: -753 }, end: { year: 2025 } }, multipolygon: water,
  note: 'Today\'s channel (OpenStreetMap), standing in for the ancient river, which was wider and had no embankments (begun 1876). Inside the city only.', sources: ['source:osm-tiber'] });
for (const use of priority.slice(1, -1)) for (const z of drawn.filter(z => z.use === use)) {
  const shape = keep(polygonClipping.difference(polygonClipping.intersection(extent, [[[...z.outline, z.outline[0]]]]), taken));
  taken = polygonClipping.union(taken, shape);
  const { outline, ...rest } = z; void outline;
  resolved.push({ ...rest, multipolygon: shape });
}
// Housing: the remainder, split by the river into the east bank and Trastevere.
const rest = keep(polygonClipping.difference(extent, taken)).sort((a, b) => areaOf([b]) - areaOf([a]));
// Trastevere is what lies inside the wall line on the west bank: the Trastevere stretch closed by today's west bank.
const westBank = [...trastevere, ...bank([12.4692, 41.8933], [12.4711, 41.8735])].map(round);
const transTiberim = polygonClipping.intersection(extent, [[[...westBank, westBank[0]]]]);
const residential = [
  { id: 'zone:residential-east', title: 'Dense housing: the east bank (Subura, Velabrum, Via Lata, Quirinal, Viminal, Esquiline, Caelian, Aventine)', shape: keep(polygonClipping.difference(rest, transTiberim)), density: 1,
    certainty: 'approximate', note: 'Everything inside the city not assigned to another zone. Dense blocks of flats over shops are attested in the Subura, the Argiletum and the Velabrum and along the Via Lata; the Aventine and Caelian mixed flats with large houses. The zone is the remainder of the others, so its edges are theirs: approximate.' },
  { id: 'zone:residential-trastevere', title: 'Housing: Trastevere (Regio XIV)', shape: keep(polygonClipping.intersection(rest, transTiberim)), density: 0.6,
    certainty: 'approximate', note: 'Across the river: workshops, flats and immigrant communities on the flat ground below the Janiculum, generally less dense than the east-bank core. The zone is the remainder of the others, so its edges are theirs: approximate.' },
];
for (const r of residential) resolved.push({ id: r.id, use: 'residential', title: r.title, certainty: r.certainty, time: { start: { year: 64 }, end: { year: 200 } }, density: r.density, multipolygon: r.shape,
  note: `${r.note} Dated from the rebuilding after the fire of AD 64.`, sources: [...regions.filter(id => r.id.endsWith('trastevere') ? id.endsWith('regio-xiv') : !id.endsWith('regio-xiv')), 'source:wikipedia-regions', 'source:platner-1929'] });

// Labels: a coarse interior point of the largest piece, far from its edges.
function labelPoint(poly) {
  const ring = poly[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const inside = (x, y) => { let c = false; for (const r of poly) for (let n = 0; n < r.length - 1; n++) { const [ax, ay] = r[n], [bx, by] = r[n + 1]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
  const edge = (x, y) => Math.min(...poly.flatMap(r => r.slice(1).map((b, n) => { const a = r[n], dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, px = (x - a[0]) * KX, py = (y - a[1]) * KY, t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - t * dx, py - t * dy); })));
  let best = [ring[0][0], ring[0][1]], score = -1;
  for (let a = 0; a <= 30; a++) for (let b = 0; b <= 30; b++) {
    const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * a / 30, y = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * b / 30;
    if (inside(x, y)) { const d = edge(x, y); if (d > score) { score = d; best = [x, y]; } }
  }
  return round(best);
}
const shortNames = { 'zone:tiber': 'Tiber', 'zone:forum-palatine': 'Fora · Palatine', 'zone:oppian': 'Oppian', 'zone:claudianum': 'Claudianum', 'zone:circus-flaminius': 'Circus Flaminius',
  'zone:campus-centre': 'Campus Martius', 'zone:campus-north': 'Mausoleum', 'zone:castra-praetoria': 'Castra Praetoria', 'zone:tiber-island': 'Insula', 'zone:emporium': 'Emporium',
  'zone:trastevere-river': 'Riverfront', 'zone:collis-hortorum': 'Collis Hortorum', 'zone:esquiline-horti': 'Horti Maecenatis', 'zone:esquiline-plateau': 'Esquiline gardens',
  'zone:caelian-east': 'Caelian houses', 'zone:via-appia': 'Via Appia', 'zone:janiculum': 'Janiculum', 'zone:campus-open': 'Campus (open)', 'zone:residential-east': 'Housing', 'zone:residential-trastevere': 'Trastevere' };
for (const z of resolved) if (!z.multipolygon.length) console.error(`${z.id} is empty after the cuts`);
const zones = resolved.sort((a, b) => priority.indexOf(a.use) - priority.indexOf(b.use)).map(z => ({
  ...z, short: shortNames[z.id], area: Math.round(areaOf(z.multipolygon)), label: labelPoint(z.multipolygon.slice().sort((a, b) => areaOf([b]) - areaOf([a]))[0]),
  multipolygon: z.multipolygon.map(poly => poly.map(ring => ring.map(round))) }));
for (const z of zones) if (!z.multipolygon.length) throw Error(`${z.id} is empty after the cuts`);

const used = new Set(zones.flatMap(z => z.sources));
const out = {
  title: 'Land use, Rome c. AD 100', date: { year: 100 }, generator: 'scripts/context/rome/build-zoning.mjs',
  extent: { title: 'Area later enclosed by the Aurelian Walls (AD 271-275)', note: 'The outer limit of the zoning, taken from the surviving wall ways in OpenStreetMap and today\'s east bank of the Tiber, with the lost Trastevere stretch drawn through the site of Porta Aurelia. The walls did not exist in AD 100 and are not drawn; the built-up area then spilled past this line in places.', sources: ['source:osm-aurelian-walls', 'source:wikipedia-aurelian-walls', 'source:osm-tiber'], area: Math.round(areaOf(extent)), ring: extent[0][0].map(round) },
  sources: sources.filter(s => used.has(s.id) || s.id === 'source:osm-aurelian-walls' || s.id === 'source:wikipedia-aurelian-walls'),
  zones,
};
await writeFile('lib/scenarios/fixtures/rome-ad100-zoning.json', JSON.stringify(out) + '\n');
console.log(JSON.stringify({ extentKm2: +(out.extent.area / 1e6).toFixed(2), zones: zones.map(z => [z.id, z.use, z.certainty, +(z.area / 1e6).toFixed(3)]) }));
