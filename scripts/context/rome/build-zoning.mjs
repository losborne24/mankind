// Builds the dated land-use zoning of Rome around AD 100 (Stage 1 of the city expansion) as plain data. Works offline and is
// deterministic: the same snapshots give byte-identical output. Never edit the output by hand; see ZONING.md for the reasoning.
//
// Inputs: the Pleiades snapshot written by fetch-zoning-sources.mjs, the Tiber outline already in the Forum Boarium context layer, and the coarse zone outlines below. Those outlines are drawn by hand around Pleiades points at about
// 50-100 m precision, from the general topography in the works cited in SOURCES; nothing is traced from a plan. Where a line is a
// guess the zone says so in its note.
//
// Output: lib/scenarios/fixtures/rome-ad100-zoning.json, longitude/latitude, zones that never overlap (each is cut by every zone
// of higher priority), with an evidence tier, an existence interval and a source note each.
import { readFile, writeFile } from 'node:fs/promises';
import polygonClipping from 'polygon-clipping';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const pleiades = await json('data/history/rome/source/pleiades-zoning.json');
const context = await json('lib/scenarios/fixtures/forum-boarium-context.json');
const tiberSnapshot = await json('data/history/rome/source/osm-tiber.json');
const r6 = v => Math.round(v * 1e6) / 1e6, round = p => [r6(p[0]), r6(p[1])];
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;   // metres per degree at Rome
const pl = key => pleiades.places[key] ?? (() => { throw Error(`Missing Pleiades ${key}`); })();

// ---- Extent: continuous building around AD 100, drawn by hand at about 150 m precision. It is not derived from any wall line:
// the Aurelian Walls (AD 271-275) are 170 years later and appear nowhere in this data. The east bank and Trastevere are drawn
// separately, each closed along today's bank, and joined by the river between them; short built-up ribbons run out along the
// main roads. Road lines here are approximate axes from the gates; the sourced roads replace them in the suburbium stage.
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
/** Join ways end to end into closed rings (as in the Forum Boarium context builder). */
function joinRings(ways) {
  ways = ways.map(w => w.slice()); const key = p => p.join(','), out = [];
  while (ways.length) {
    let ring = ways.shift();
    for (let progress = true; progress && key(ring[0]) !== key(ring.at(-1));) {
      progress = false;
      for (let n = 0; n < ways.length; n++) {
        const w = ways[n];
        if (key(w[0]) === key(ring.at(-1))) ring = ring.concat(w.slice(1));
        else if (key(w.at(-1)) === key(ring.at(-1))) ring = ring.concat(w.slice(0, -1).reverse());
        else if (key(w.at(-1)) === key(ring[0])) ring = w.concat(ring.slice(1));
        else if (key(w[0]) === key(ring[0])) ring = w.slice(1).reverse().concat(ring);
        else continue;
        ways.splice(n, 1); progress = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}
// The whole Tiber across the map, from the OpenStreetMap pieces (the urban relation and the polygons up- and downstream), for the
// river zone. The 3D water and the banks that close the extent keep using the context layer's urban stretch.
const VIEW = [[12.44, 41.85], [12.53, 41.85], [12.53, 41.935], [12.44, 41.935], [12.44, 41.85]];
const fullRiver = polygonClipping.intersection(polygonClipping.union(...tiberSnapshot.elements.map(e => {
  if (e.type === 'way') return [e.geometry];
  const outer = joinRings(e.members.filter(m => m.role === 'outer').map(m => m.geometry)), inner = joinRings(e.members.filter(m => m.role === 'inner').map(m => m.geometry));
  return polygonClipping.difference(outer.map(r => [r]), ...inner.map(r => [[r]]));
})), [VIEW]);
const closed = ring => [[...ring.map(round), round(ring[0])]];
// East bank: up today's bank from the Emporium to the Mausoleum, then clockwise round the Pincian gardens, the Castra Praetoria,
// the Esquiline plateau, the Caelian and the Aventine back to the river below the Emporium.
const eastCore = closed([...bank([12.4714, 41.8742], [12.4747, 41.9070]),
  [12.4775, 41.9085], [12.4800, 41.9090], [12.4830, 41.9095], [12.4870, 41.9104], [12.4920, 41.9110], [12.4975, 41.9104], [12.5015, 41.9086], [12.5045, 41.9078],
  [12.5055, 41.9085], [12.5108, 41.9091], [12.5116, 41.9048], [12.5112, 41.9010], [12.5130, 41.8970], [12.5120, 41.8930], [12.5085, 41.8895], [12.5060, 41.8860],
  [12.5030, 41.8835], [12.4990, 41.8820], [12.4950, 41.8815], [12.4920, 41.8783], [12.4880, 41.8778], [12.4840, 41.8770], [12.4815, 41.8760], [12.4780, 41.8745], [12.4740, 41.8738]]);
// Trastevere: the flat ground between the river and the foot of the Janiculum, from below Porta Settimiana's later site to the Via Portuensis.
const westCore = closed([...bank([12.4692, 41.8933], [12.4702, 41.8752]),
  [12.4688, 41.8752], [12.4678, 41.8785], [12.4665, 41.8820], [12.4658, 41.8860], [12.4660, 41.8895], [12.4668, 41.8925], [12.4682, 41.8945]]);
const riverBetween = polygonClipping.intersection([[river]],   // outer outline only, so Tiber Island stays in the city
  [[[12.46, 41.8738], [12.49, 41.8738], [12.49, 41.8936], [12.46, 41.8936], [12.46, 41.8738]]]);
const core = polygonClipping.union(eastCore, westCore, riverBetween);
// Ribbons: 120 m wide along each road axis, from inside the core outwards.
const roads = {
  'via-flaminia': [[12.4792, 41.9040], [12.4782, 41.9080], [12.4765, 41.9112], [12.4745, 41.9165]],
  'via-salaria': [[12.4985, 41.9095], [12.5005, 41.9140], [12.5030, 41.9190]],
  'via-nomentana': [[12.5030, 41.9075], [12.5075, 41.9115], [12.5125, 41.9150]],
  'via-tiburtina': [[12.5110, 41.8990], [12.5160, 41.9005], [12.5210, 41.9020]],
  'via-labicana-praenestina': [[12.5100, 41.8925], [12.5155, 41.8916], [12.5205, 41.8905]],
  'via-appia': [[12.4935, 41.8822], [12.4975, 41.8775], [12.5010, 41.8735], [12.5045, 41.8690]],
  'via-ostiensis': [[12.4805, 41.8765], [12.4812, 41.8720], [12.4800, 41.8670]],
  'via-portuensis': [[12.4700, 41.8770], [12.4688, 41.8730], [12.4665, 41.8690]],
  'via-aurelia': [[12.4665, 41.8878], [12.4630, 41.8857], [12.4595, 41.8840]],
};
// Half-width tapers from 70 m where the road leaves the city to 25 m at the ribbon's end: roadside building thinned with distance.
const RIBBON = [70, 25];
const segment = (a, b, wa, wb) => { const dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
  const side = (p, w, s, along) => [p[0] + (-uy * w * s + ux * along) / KX, p[1] + (ux * w * s + uy * along) / KY];
  return closed([side(a, wa, 1, -wa / 2), side(b, wb, 1, wb / 2), side(b, wb, -1, wb / 2), side(a, wa, -1, -wa / 2)]); };
const taper = line => { const lengths = line.slice(1).map((b, n) => Math.hypot((b[0] - line[n][0]) * KX, (b[1] - line[n][1]) * KY)), total = lengths.reduce((x, y) => x + y, 0);
  let run = 0; return lengths.map((len, n) => { const w = t => RIBBON[0] + (RIBBON[1] - RIBBON[0]) * t, piece = segment(line[n], line[n + 1], w(run / total), w((run + len) / total)); run += len; return piece; }); };
const ribbons = polygonClipping.union(...Object.values(roads).flatMap(taper));
const extent = polygonClipping.union(core, ribbons);
if (extent.length !== 1) throw Error(`extent has ${extent.length} pieces`);
const ribbonOnly = polygonClipping.difference(ribbons, core);

// ---- Sources. Everything here is cited for text or a point; nothing restricted is used for geometry.
const src = (id, title, url, licence) => ({ id, title, url, licence });
const P = key => `source:pleiades-${key}`;
const sources = [
  ...Object.entries(pleiades.places).map(([k, p]) => src(P(k), `Pleiades · ${p.title}`, p.uri, pleiades.licence)),
  src('source:osm-tiber', 'OpenStreetMap · Tiber water polygon (relation 5071)', 'https://www.openstreetmap.org/relation/5071', 'ODbL 1.0 · © OpenStreetMap contributors'),
  src('source:osm-tiber-reaches', 'OpenStreetMap · Tiber water polygons upstream and downstream of the city (relations 15909049, 17258409 and 14 ways)', 'https://www.openstreetmap.org/relation/17258409', tiberSnapshot.licence),
  src('source:wikipedia-quirinal', 'Wikipedia · Quirinal Hill (temples of Quirinus, Sancus and others)', 'https://en.wikipedia.org/wiki/Quirinal_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-esquiline', 'Wikipedia · Esquiline Hill (favoured by the aristocracy for their houses)', 'https://en.wikipedia.org/wiki/Esquiline_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-regions', 'Wikipedia · Fourteen regions of Augustan Rome', 'https://en.wikipedia.org/wiki/Fourteen_regions_of_Augustan_Rome', 'CC BY-SA 4.0 · text read for the regions and their contents'),
  src('source:wikipedia-subura', 'Wikipedia · Subura ("a vast and populous neighborhood")', 'https://en.wikipedia.org/wiki/Subura', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-aventine', 'Wikipedia · Aventine Hill (imperial era: aristocratic residences, Trajan\'s private house)', 'https://en.wikipedia.org/wiki/Aventine_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-caelian', 'Wikipedia · Caelian Hill (a fashionable residential district of the wealthy)', 'https://en.wikipedia.org/wiki/Caelian_Hill', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-forum-boarium', 'Wikipedia · Forum Boarium (cattle market, original docks, intense commercial activity)', 'https://en.wikipedia.org/wiki/Forum_Boarium', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-velabrum', 'Wikipedia · Velabrum (the valley joining the Forum and the Forum Boarium; its edges are unclear)', 'https://en.wikipedia.org/wiki/Velabrum', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-baths-of-trajan', 'Wikipedia · Baths of Trajan (over the Domus Aurea wing burned in AD 104; dedicated 109)', 'https://en.wikipedia.org/wiki/Baths_of_Trajan', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-trajans-forum', 'Wikipedia · Trajan\'s Forum (the last imperial forum; dedicated AD 112)', 'https://en.wikipedia.org/wiki/Trajan%27s_Forum', 'CC BY-SA 4.0 · text read for dates'),
  src('source:wikipedia-baths-of-agrippa', 'Wikipedia · Baths of Agrippa (with the Stagnum Agrippae lake and the Euripus canal to the Tiber)', 'https://en.wikipedia.org/wiki/Baths_of_Agrippa', 'CC BY-SA 4.0 · text read'),
  src('source:wikipedia-campus-martius', 'Wikipedia · Campus Martius (insulae and villas encroached from Sulla on; crowded by the Flavians)', 'https://en.wikipedia.org/wiki/Campus_Martius', 'CC BY-SA 4.0 · text read'),
  src('source:lanciani-fur', 'Lanciani, Forma Urbis Romae (1893-1901), general layout', 'https://commons.wikimedia.org/wiki/Category:Forma_Urbis_Romae_(Lanciani)', 'Public domain (published 1901) · consulted for layout, no plate traced for these zones'),
  src('source:platner-1929', 'Platner & Ashby, A Topographical Dictionary of Ancient Rome (1929): Horti, Subura, Campus Martius, Emporium', 'https://penelope.uchicago.edu/Thayer/E/Gazetteer/Places/Europe/Italy/Lazio/Roma/Rome/_Texts/PLATOP*/home.html', 'Public domain (published 1929) · text read'),
  src('source:severan-plan', 'Severan Marble Plan (Forma Urbis Romae, AD 203-211), via the Stanford Digital FUR Project', 'https://formaurbis.stanford.edu/', 'Reference only: later than AD 100 and not licensed for derived geometry; nothing traced'),
  src('source:atlas-ancient-rome', 'Carandini (ed.), The Atlas of Ancient Rome (Princeton, 2017)', 'https://press.princeton.edu/books/hardcover/9780691163475/the-atlas-of-ancient-rome', 'Copyright · reference only, nothing traced'),
];


// ---- Zones. Coordinates are [longitude, latitude], drawn coarsely; anything that reaches into the river or past the extent is cut.
// `interval` is the span over which the zone, as drawn, is defended as a description of the city; the scene date is AD 100.
// A zone whose interval starts after AD 100 is kept so the date filter can name it as left out; it never cuts the zones of AD 100.
const regions = ['regio-i', 'regio-ii', 'regio-iii', 'regio-iv', 'regio-v', 'regio-vi', 'regio-vii', 'regio-viii', 'regio-ix', 'regio-x', 'regio-xi', 'regio-xii', 'regio-xiii', 'regio-xiv'].map(P);
const zone = (id, use, title, certainty, interval, outline, note, sourceIds, extra = {}) => ({ id, use, title, certainty, time: { start: { year: interval[0] }, end: { year: interval[1] } }, outline, note, sources: sourceIds, ...extra });
const GUESS = 'The outline is drawn by hand at about 100 m precision and its edges are a guess.';
const drawn = [
  // Monumental, public and commercial
  zone('zone:forum-palatine', 'monumental', 'Capitoline, Forum Romanum, Palatine, Colosseum valley and Circus Maximus', 'approximate', [80, 104],
    [[12.4797, 41.8946], [12.4838, 41.8950], [12.4865, 41.8952], [12.4882, 41.8947], [12.4893, 41.8935], [12.4912, 41.8922], [12.4940, 41.8920], [12.4952, 41.8902],
      [12.4934, 41.8884], [12.4905, 41.8872], [12.4903, 41.8848], [12.4890, 41.8834], [12.4815, 41.8862], [12.4810, 41.8876], [12.4836, 41.8885], [12.4846, 41.8903],
      [12.4826, 41.8907], [12.4812, 41.8912], [12.4796, 41.8926]],
    `Temples, basilicas, imperial fora (Caesar, Augustus, the Templum Pacis, Nerva's forum of AD 97), the palaces on the Palatine, the Flavian amphitheatre (AD 80) and the Circus Maximus, around Pleiades points for each. The saddle where Trajan's Forum was built from about AD 106 is outside this zone (see the Trajan's Forum zone, left out at AD 100). ${GUESS}`,
    [P('forum-romanum'), P('forum-iulium'), P('templum-pacis'), P('amphitheatrum-flavium'), P('jupiter-capitolinus'), P('palatine'), P('circus-maximus'), P('regio-viii'), P('regio-x'), P('regio-xi'), 'source:wikipedia-regions', 'source:lanciani-fur']),
  zone('zone:forum-boarium', 'monumental', 'Forum Boarium and Velabrum: temples, markets and the river harbour', 'approximate', [-200, 300],
    [[12.4793, 41.8899], [12.4800, 41.8906], [12.4822, 41.8909], [12.4843, 41.8906], [12.4847, 41.8890], [12.4832, 41.8878], [12.4812, 41.8871], [12.4795, 41.8869], [12.4789, 41.8880]],
    `The cattle market by the original docks of Rome, with the temples of Portunus and Hercules Victor, the Ara Maxima, the Portus Tiberinus and the Velabrum valley up to the Forum: a place of temples, markets and trade more than of housing. The Velabrum's own edges are unclear (Wikipedia); ${GUESS.toLowerCase()}`,
    ['source:wikipedia-forum-boarium', 'source:wikipedia-velabrum', P('regio-xi'), P('regio-viii'), 'source:platner-1929', 'source:lanciani-fur']),
  zone('zone:oppian', 'monumental', 'Oppian: Baths of Titus and the Domus Aurea pavilion', 'approximate', [80, 104],
    [[12.4925, 41.8940], [12.4990, 41.8938], [12.4992, 41.8915], [12.4945, 41.8912], [12.4925, 41.8920]],
    `The Baths of Titus (AD 80) and the Oppian wing of Nero's Domus Aurea, still in use by the Flavians until it burned in AD 104. The Baths of Trajan were built over it after the fire and dedicated in 109, so they are not shown at AD 100. ${GUESS}`,
    [P('regio-iii'), 'source:wikipedia-baths-of-trajan', 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:claudianum', 'monumental', 'Caelian: Temple of the Deified Claudius', 'approximate', [75, 300],
    [[12.4920, 41.8883], [12.4952, 41.8883], [12.4952, 41.8857], [12.4920, 41.8857]],
    `The terrace of the Temple of Claudius, begun after AD 54 and finished under Vespasian (Wikipedia). Placed by the Regio II record; its size here is a round figure. ${GUESS}`,
    [P('regio-ii'), 'source:wikipedia-caelian', 'source:platner-1929']),
  zone('zone:circus-flaminius', 'monumental', 'Forum Holitorium, Theatre of Marcellus and the Circus Flaminius porticoes', 'approximate', [-13, 300],
    [[12.4752, 41.8936], [12.4800, 41.8943], [12.4813, 41.8925], [12.4808, 41.8906], [12.4795, 41.8900], [12.4779, 41.8909], [12.4753, 41.8925]],
    `The vegetable market and its temples, the Theatre of Marcellus (13 BC), the Porticus Octaviae and the Circus Flaminius, a public square ringed by temples and porticoes. The circus's exact line is disputed; ${GUESS.toLowerCase()}`,
    [P('theatrum-marcelli'), P('forum-holitorium'), P('circus-flaminius'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:campus-centre', 'monumental', 'Central Campus Martius: Pantheon, Saepta, Baths of Agrippa and lake, Stadium of Domitian, Theatre of Pompey, porticoes up to the sundial', 'approximate', [86, 300],
    [[12.4711, 41.8976], [12.4716, 41.9006], [12.4745, 41.9016], [12.4772, 41.9022], [12.4800, 41.9022], [12.4806, 41.8996], [12.4802, 41.8962], [12.4787, 41.8947], [12.4762, 41.8944], [12.4733, 41.8943], [12.4716, 41.8948]],
    `Public buildings packed close: Agrippa's Pantheon and baths with their lake (Stagnum Agrippae), the Saepta Julia, the temples of the Largo Argentina, Pompey's theatre and portico, Domitian's stadium and odeum (after AD 86), and the porticoes between the Pantheon and the Horologium. Extended north to meet the Mausoleum zone; the northern edge is new and approximate. ${GUESS}`,
    [P('pantheon'), P('saepta-iulia'), P('stadium-domitiani'), P('theatrum-pompei'), P('horologium-augusti'), P('campus-martius'), P('regio-ix'), 'source:wikipedia-baths-of-agrippa', 'source:platner-1929']),
  zone('zone:campus-north', 'monumental', 'Northern Campus Martius: Mausoleum of Augustus, Ara Pacis and the sundial', 'approximate', [-9, 300],
    [[12.4748, 41.9076], [12.4778, 41.9076], [12.4800, 41.9040], [12.4800, 41.9022], [12.4772, 41.9022], [12.4748, 41.9044]],
    `Augustus's mausoleum and its park, the Ara Pacis (9 BC) and the Horologium, placed from their Pleiades points. ${GUESS}`,
    [P('mausoleum-augusti'), P('ara-pacis'), P('horologium-augusti'), P('regio-ix'), 'source:platner-1929']),
  zone('zone:castra-praetoria', 'monumental', 'Castra Praetoria (camp of the Praetorian Guard)', 'approximate', [23, 312],
    [[12.5057, 41.9083], [12.5106, 41.9089], [12.5113, 41.9050], [12.5064, 41.9043]],
    `The walled camp built under Tiberius (AD 23) on the plateau beyond the Viminal. Placed as a rectangle of about 440 by 380 m; ${GUESS.toLowerCase()}`,
    [P('regio-vi'), 'source:wikipedia-regions', 'source:platner-1929']),
  zone('zone:tiber-island', 'monumental', 'Tiber Island: sanctuary of Aesculapius', 'approximate', [-291, 2025],
    [[12.4758, 41.8907], [12.4772, 41.8917], [12.4794, 41.8906], [12.4786, 41.8896], [12.4768, 41.8898]],
    'The island and its sanctuary (temple of Aesculapius, 291 BC; temple of Faunus, 196 BC). The island is today\'s outline; its ancient shore is not traced, so the edge is a guess.',
    [P('regio-xiv'), 'source:platner-1929', 'source:osm-tiber']),
  // Later than AD 100: kept for the date filter only.
  zone('zone:baths-of-trajan', 'monumental', 'Baths of Trajan', 'approximate', [104, 537],
    [[12.4940, 41.8952], [12.4995, 41.8948], [12.4998, 41.8915], [12.4945, 41.8912]],
    `Built over the Domus Aurea wing after the fire of AD 104 and dedicated in July 109 (Wikipedia), so not standing at AD 100. ${GUESS}`,
    ['source:wikipedia-baths-of-trajan', P('regio-iii')], { later: true }),
  zone('zone:forum-of-trajan', 'monumental', "Trajan's Forum and Markets", 'approximate', [106, 600],
    [[12.4828, 41.8948], [12.4850, 41.8970], [12.4868, 41.8962], [12.4862, 41.8947], [12.4842, 41.8942]],
    `The last imperial forum, cut into the saddle between the Capitoline and the Quirinal from about AD 106 and dedicated in 112, so not built at AD 100. What stood on the saddle before is uncertain; it falls to housing. ${GUESS}`,
    ['source:wikipedia-trajans-forum', P('regio-viii')], { later: true }),
  // Port and warehouses
  zone('zone:emporium', 'port', 'Emporium, Porticus Aemilia and the horrea below the Aventine', 'approximate', [-193, 300],
    [[12.4786, 41.8868], [12.4775, 41.8850], [12.4762, 41.8840], [12.4748, 41.8830], [12.4733, 41.8820], [12.4720, 41.8810], [12.4709, 41.8800], [12.4702, 41.8790], [12.4700, 41.8770], [12.4706, 41.8750], [12.4716, 41.8725],
      [12.4760, 41.8722], [12.4805, 41.8755], [12.4790, 41.8770], [12.4778, 41.8790], [12.4772, 41.8815], [12.4778, 41.8840], [12.4792, 41.8862], [12.4795, 41.8868]],
    'The river port on the plain south of the Aventine: the Emporium quay (Pleiades point), the Porticus Aemilia warehouse (193 BC) and the horrea (Galbana, Lolliana and others) between it and the hill. The amphora dump of Monte Testaccio was growing here; it is not modelled. ' + GUESS,
    [P('emporium'), P('porticus-aemilia'), P('regio-xiii'), 'source:platner-1929', 'source:lanciani-fur']),
  zone('zone:trastevere-river', 'port', 'Trastevere riverfront', 'illustrative', [0, 200],
    [[12.4793, 41.8890], [12.4796, 41.8875], [12.4786, 41.8860], [12.4762, 41.8840], [12.4733, 41.8820], [12.4709, 41.8800], [12.4700, 41.8780], [12.4699, 41.8760],
      [12.4687, 41.8760], [12.4686, 41.8780], [12.4694, 41.8805], [12.4718, 41.8825], [12.4746, 41.8845], [12.4770, 41.8865], [12.4778, 41.8885], [12.4776, 41.8893]],
    'A band about 100 m deep along the west bank south of the island, where landing places and storehouses for the river traffic are likely but not mapped. Its depth and extent are a guess.',
    [P('regio-xiv'), 'source:wikipedia-regions']),
  // Horti (estate gardens)
  zone('zone:collis-hortorum', 'horti', 'Pincian (Collis Hortorum): Horti Luculliani, Sallustiani and others', 'approximate', [-60, 300],
    [[12.4788, 41.9122], [12.4840, 41.9140], [12.4960, 41.9125], [12.5020, 41.9107], [12.5026, 41.9066], [12.4986, 41.9046], [12.4930, 41.9050], [12.4880, 41.9060], [12.4830, 41.9057], [12.4800, 41.9074]],
    `The hill of gardens: the Horti Luculliani above the Campus and the imperial Horti Sallustiani in the valley towards the Quirinal. Mostly gardens, pavilions and a few great houses. ${GUESS}`,
    [P('horti-luculliani'), P('horti-sallustiani'), P('regio-vi'), P('regio-vii'), 'source:platner-1929']),
  zone('zone:esquiline-horti', 'horti', 'Esquiline: Horti Maecenatis and Lamiani', 'approximate', [-30, 300],
    [[12.4998, 41.8962], [12.5040, 41.8990], [12.5090, 41.8975], [12.5100, 41.8930], [12.5060, 41.8905], [12.5010, 41.8922]],
    `The gardens laid out over the old Esquiline cemetery beyond the Servian agger (Maecenas's, then imperial; the Lamian gardens beside them), placed by their Pleiades points. ${GUESS}`,
    [P('horti-maecenatis'), P('horti-lamiani'), P('regio-v'), 'source:platner-1929']),
  zone('zone:esquiline-plateau', 'horti', 'Esquiline and Viminal plateau', 'illustrative', [0, 200],
    [[12.5030, 41.9040], [12.5110, 41.9042], [12.5165, 41.8960], [12.5150, 41.8898], [12.5100, 41.8930], [12.5090, 41.8975], [12.5040, 41.8990], [12.5000, 41.9010]],
    'The outer plateau between the Castra Praetoria and the aqueducts. Suburban gardens and villas are likely; nothing specific is mapped here. The extent is a guess.',
    [P('regio-v'), P('regio-vi'), 'source:wikipedia-regions']),
  zone('zone:caelian-east', 'horti', 'Eastern Caelian: great houses and gardens', 'illustrative', [0, 200],
    [[12.4985, 41.8900], [12.5070, 41.8895], [12.5105, 41.8855], [12.5070, 41.8822], [12.4990, 41.8840]],
    'The eastern Caelian, towards the later Lateran, was a quarter of large houses with gardens (the house of the Laterani among them). The extent and the share of garden are guesses.',
    [P('regio-ii'), 'source:wikipedia-caelian', 'source:platner-1929']),
  // Open ground
  zone('zone:campus-river', 'open', 'Campus Martius by the river bend: Trigarium and Tarentum', 'approximate', [-17, 300],
    [[12.4690, 41.8950], [12.4711, 41.8960], [12.4716, 41.9006], [12.4740, 41.9030], [12.4725, 41.9045], [12.4650, 41.9022], [12.4618, 41.8990], [12.4645, 41.8950]],
    `The open ground inside the river bend: the Trigarium exercise ground and the Tarentum, where the altar of Dis and Proserpina was used for the Secular Games (17 BC, AD 88), with the Euripus canal from Agrippa's lake. From Sulla on, insulae and villas encroached on the Campus (Wikipedia), so some building stood here too; the extent and the share left open are approximate. ${GUESS}`,
    [P('campus-martius'), P('regio-ix'), 'source:wikipedia-campus-martius', 'source:wikipedia-baths-of-agrippa', 'source:platner-1929']),
];
// Low-density elite housing: drawn on the two hills the sources describe that way; the rest of the housing is dense.
const elite = {
  aventine: closed([[12.4790, 41.8862], [12.4815, 41.8862], [12.4860, 41.8840], [12.4878, 41.8810], [12.4880, 41.8785], [12.4840, 41.8770], [12.4800, 41.8768], [12.4778, 41.8795], [12.4775, 41.8830]]),
  caelian: closed([[12.4912, 41.8890], [12.4990, 41.8897], [12.4997, 41.8845], [12.4950, 41.8828], [12.4912, 41.8843]]),
};
// Mixed hill housing: the Quirinal, Viminal, upper Esquiline and the Pincian slope, between the dense valleys and the gardens.
const hills = closed([[12.4838, 41.8995], [12.4870, 41.8985], [12.4935, 41.8990], [12.4965, 41.8962], [12.5000, 41.8945], [12.5040, 41.8990], [12.5030, 41.9040],
  [12.4990, 41.9048], [12.4930, 41.9050], [12.4880, 41.9062], [12.4825, 41.9058], [12.4815, 41.9030], [12.4825, 41.9000]]);

// ---- Resolve: river first, then each zone in priority order, every one cut by everything above it; housing is what is left.
const priority = ['open-river', 'monumental', 'port', 'horti', 'open', 'residential'];
const areaOf = mp => mp.reduce((sum, poly) => sum + poly.reduce((s, ring, k) => { let a = 0; for (let n = 0; n < ring.length - 1; n++) a += ring[n][0] * ring[n + 1][1] - ring[n + 1][0] * ring[n][1]; return s + (k ? -1 : 1) * Math.abs(a / 2) * KX * KY; }, 0), 0);
const water = fullRiver;
let taken = water;
const resolved = [];
const keep = mp => mp.filter(poly => areaOf([poly]) > 400);   // drop slivers left by the cuts
resolved.push({ id: 'zone:tiber', use: 'open-river', title: 'Tiber', certainty: 'approximate', time: { start: { year: -753 }, end: { year: 2025 } }, multipolygon: water,
  note: 'Today\'s channel (OpenStreetMap), standing in for the ancient river, which was wider and had no embankments (begun 1876). Drawn along the whole map, inside and outside the city; the 3D water uses the urban stretch only.', sources: ['source:osm-tiber', 'source:osm-tiber-reaches'] });
for (const use of priority.slice(1, -1)) for (const z of drawn.filter(z => z.use === use)) {
  const outline = [[[...z.outline, z.outline[0]]]];
  const shape = keep(polygonClipping.difference(polygonClipping.intersection(extent, outline), z.later ? water : taken, ...(z.use === 'open' ? [ribbons] : [])));
  if (!z.later) taken = polygonClipping.union(taken, shape);
  const { outline: _o, later: _l, ...rest } = z; void _o; void _l;
  resolved.push({ ...rest, multipolygon: shape });
}
// Housing: the remainder, in four classes. Roadside ribbons outside the core; low-density elite on the Aventine and Caelian;
// Trastevere; dense on the east bank.
const rest = keep(polygonClipping.difference(extent, taken));
const roadside = keep(polygonClipping.intersection(rest, ribbonOnly)), inCore = polygonClipping.difference(rest, ribbonOnly);
const eliteShape = keep(polygonClipping.intersection(inCore, elite.aventine, ...[]).concat(polygonClipping.intersection(inCore, elite.caelian)));
const notElite = polygonClipping.difference(inCore, elite.aventine, elite.caelian);
const hillShape = keep(polygonClipping.intersection(notElite, hills)), valleys = polygonClipping.difference(notElite, hills);
const residential = [
  { id: 'zone:residential-dense', cls: 'dense', title: 'Dense housing: the valleys of the east bank (Subura, Argiletum, Via Lata, the Circus Maximus side)', shape: keep(polygonClipping.difference(valleys, westCore)), density: 1, certainty: 'approximate',
    note: 'Blocks of flats over shops, packed close. The Subura was "a vast and populous neighborhood" (Wikipedia) in the valley below the Esquiline, Viminal and Quirinal; the same dense fabric is attested along the Via Lata. The zone is what the others leave in the valleys, so its edges are theirs: approximate.',
    sources: [...regions.filter(id => !/regio-(ii|xiii|xiv)$/.test(id)), 'source:wikipedia-subura', 'source:wikipedia-regions', 'source:platner-1929'] },
  { id: 'zone:residential-hills', cls: 'mixed', title: 'Mixed housing on the hills: Quirinal, Viminal, upper Esquiline, Pincian slope', shape: keep(polygonClipping.difference(hillShape, westCore)), density: 0.6, certainty: 'illustrative',
    note: 'Between the dense valleys and the gardens: temples (Quirinus, Sancus and others on the Quirinal), houses of the well-off (the Esquiline was favoured by the aristocracy for their houses) and blocks of flats. Wikipedia supports the mix but not its share or extent; the outline of the hills is drawn by hand and is a guess.',
    sources: [P('regio-vi'), P('regio-v'), P('regio-iv'), 'source:wikipedia-quirinal', 'source:wikipedia-esquiline'] },
  { id: 'zone:residential-elite', cls: 'elite', title: 'Low-density elite housing: Aventine and Caelian', shape: eliteShape, density: 0.35, certainty: 'approximate',
    note: 'Large houses (domus) with gardens and fewer blocks of flats. In the imperial era the Aventine became the seat of aristocratic residences, among them Trajan\'s own house before he became emperor; the Caelian was a fashionable residential district of the wealthy (Wikipedia). The hill outlines are drawn by hand; their edges are a guess.',
    sources: [P('regio-xiii'), P('regio-ii'), 'source:wikipedia-aventine', 'source:wikipedia-caelian'] },
  { id: 'zone:residential-trastevere', cls: 'dense', title: 'Housing: Trastevere (Regio XIV)', shape: keep(polygonClipping.intersection(notElite, westCore)), density: 0.6, certainty: 'approximate',
    note: 'Across the river: workshops, flats and immigrant communities on the flat ground below the Janiculum, generally less dense than the east-bank core. The zone is what the others leave there, so its edges are theirs: approximate.',
    sources: [P('regio-xiv'), 'source:wikipedia-regions', 'source:platner-1929'] },
  { id: 'zone:residential-roadside', cls: 'roadside', title: 'Roadside building along the main roads out of the city', shape: roadside, density: 0.45, certainty: 'illustrative',
    note: 'Short ribbons of shops, inns, workshops and tombs where the roads left the continuous city (Flaminia, Salaria, Nomentana, Tiburtina, Labicana and Praenestina, Appia, Ostiensis, Portuensis, Aurelia). The road lines are approximate axes from the gates and the ribbons a fixed 120 m wide; both are a guess, to be replaced by the sourced roads.',
    sources: ['source:wikipedia-regions', 'source:platner-1929'] },
];
for (const r of residential) resolved.push({ id: r.id, use: 'residential', housing: r.cls, title: r.title, certainty: r.certainty, time: { start: { year: 64 }, end: { year: 200 } }, density: r.density, multipolygon: r.shape,
  note: `${r.note} Dated from the rebuilding after the fire of AD 64.`, sources: r.sources });

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
const shortNames = { 'zone:tiber': 'Tiber', 'zone:forum-palatine': 'Fora · Palatine', 'zone:forum-boarium': 'Forum Boarium', 'zone:oppian': 'Oppian', 'zone:claudianum': 'Claudianum',
  'zone:circus-flaminius': 'Circus Flaminius', 'zone:campus-centre': 'Campus Martius', 'zone:campus-north': 'Mausoleum', 'zone:castra-praetoria': 'Castra Praetoria', 'zone:tiber-island': 'Tiber Island',
  'zone:baths-of-trajan': 'Baths of Trajan', 'zone:forum-of-trajan': "Trajan's Forum", 'zone:emporium': 'Emporium', 'zone:trastevere-river': 'Riverfront',
  'zone:collis-hortorum': 'Collis Hortorum', 'zone:esquiline-horti': 'Esquiline horti', 'zone:esquiline-plateau': 'Esquiline gardens', 'zone:caelian-east': 'Caelian houses',
  'zone:campus-river': 'Trigarium', 'zone:residential-dense': 'Dense housing', 'zone:residential-hills': 'Hill housing', 'zone:residential-elite': 'Elite houses',
  'zone:residential-trastevere': 'Trastevere', 'zone:residential-roadside': 'Roadside' };
for (const z of resolved) if (!z.multipolygon.length) throw Error(`${z.id} is empty after the cuts`);
const zones = resolved.sort((a, b) => priority.indexOf(a.use) - priority.indexOf(b.use)).map(z => ({
  ...z, short: shortNames[z.id], area: Math.round(areaOf(z.multipolygon)), label: labelPoint(z.multipolygon.slice().sort((a, b) => areaOf([b]) - areaOf([a]))[0]),
  multipolygon: z.multipolygon.map(poly => poly.map(ring => ring.map(round))) }));

// ---- Markers: one per Augustan region and per named anchor. Pleiades points are used as they are unless they fall outside what they
// label; those are moved by hand and say so. Gates and walls of the later circuit are not markers.
const region = { i: 'Regio I (Porta Capena)', ii: 'Regio II (Caelimontium)', iii: 'Regio III (Isis et Serapis)', iv: 'Regio IV (Templum Pacis)', v: 'Regio V (Esquiliae)', vi: 'Regio VI (Alta Semita)', vii: 'Regio VII (Via Lata)',
  viii: 'Regio VIII (Forum Romanum)', ix: 'Regio IX (Circus Flaminius)', x: 'Regio X (Palatium)', xi: 'Regio XI (Circus Maximus)', xii: 'Regio XII (Piscina Publica)', xiii: 'Regio XIII (Aventinus)', xiv: 'Regio XIV (Transtiberim)' };
const moved = {
  i: [[12.4935, 41.8810], 'The Pleiades point lies about 1 km further south, at the later Aurelian gate; moved by hand to the Via Appia just outside Porta Capena, where the region began.'],
  v: [[12.5030, 41.8960], 'Pleiades gives this region no location; placed by hand on the Esquiline beyond the Servian agger, among the gardens the region held.'],
  xiv: [[12.4700, 41.8880], 'The Pleiades point lies across the river bend to the north-west, outside Trastevere; moved by hand to the middle of the Trastevere housing.'],
};
const markers = [
  ...Object.entries(region).map(([k, title]) => {
    const p = pl(`regio-${k}`), [coordinate, why] = moved[k] ?? [p.reprPoint, null];
    return { id: `marker:regio-${k}`, kind: 'region', title, coordinate: round(coordinate), certainty: why ? 'illustrative' : 'approximate', time: { start: { year: -7 }, end: { year: 400 } },
      note: `One of the fourteen regions into which Augustus divided the city in 7 BC. ${why ?? 'Placed at the Pleiades representative point, derived from the places Pleiades links to the region.'}`, sources: [P(`regio-${k}`), 'source:wikipedia-regions'] };
  }),
  ...[['horti-luculliani', -60, [12.4835, 41.9078], 'The Pleiades point lies about 700 m north, beyond the gardens; moved by hand onto the Pincian slope above the Campus, inside the Collis Hortorum zone.'],
    ['horti-sallustiani', -40], ['horti-lamiani', 0], ['emporium', -193], ['porticus-aemilia', -193]].map(([key, from, at, why]) => ({
    id: `marker:${key}`, kind: 'anchor', title: pl(key).title, coordinate: round(at ?? pl(key).reprPoint), certainty: at ? 'illustrative' : 'approximate', time: { start: { year: from }, end: { year: 300 } },
    note: why ?? 'Placed at the Pleiades representative point; the zone around it is drawn from it.', sources: [P(key), 'source:platner-1929'] })),
];

const used = new Set([...zones.flatMap(z => z.sources), ...markers.flatMap(m => m.sources), 'source:osm-tiber', 'source:osm-tiber-reaches', 'source:lanciani-fur', 'source:atlas-ancient-rome', 'source:severan-plan']);
const out = {
  title: 'Land use, Rome c. AD 100', date: { year: 100 }, generator: 'scripts/context/rome/build-zoning.mjs',
  extent: { id: 'zone:extent', title: 'Continuous city c. AD 100 · approximate extent', certainty: 'approximate', time: { start: { year: 64 }, end: { year: 200 } },
    note: 'Where building was more or less continuous around AD 100, drawn by hand at about 150 m precision from the topography of the fourteen regions (Pleiades), Platner and the general layout in Lanciani\'s plan, with modern atlases as reference only. It includes the gardens at the edge of the city (Pincian, Esquiline) and short ribbons along the main roads; Trastevere stops at the foot of the Janiculum. The edge is a guess: building thinned out gradually rather than stopping at a line. It is not taken from any wall; the Aurelian Walls were built in AD 271-275.',
    sources: [...regions, 'source:platner-1929', 'source:lanciani-fur', 'source:atlas-ancient-rome', 'source:osm-tiber'], area: Math.round(areaOf(extent)), ring: extent[0][0].map(round) },
  roads: Object.fromEntries(Object.entries(roads).map(([k, line]) => [k, line.map(round)])),
  sources: sources.filter(s => used.has(s.id)),
  zones, markers,
};
await writeFile('lib/scenarios/fixtures/rome-ad100-zoning.json', JSON.stringify(out) + '\n');
console.log(JSON.stringify({ extentKm2: +(out.extent.area / 1e6).toFixed(2), markers: markers.length, zones: zones.map(z => [z.id, z.use, z.certainty, +(z.area / 1e6).toFixed(3)]) }));
