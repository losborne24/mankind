// Builds the simple landmark reconstructions of Rome c. AD 100 (Stage 3b) as plain data: one entry per monument, giving a kit
// shape (temple, basilica, precinct, amphitheatre, ...), where it stands, which way it faces, its size and height. Works offline and
// is deterministic. Never edit the output by hand; LANDMARKS.md gives the reasoning.
//
// Where the remains are mapped, position and orientation come from their OpenStreetMap outline (fetch-landmarks.mjs): the centre and
// axes of its smallest enclosing rectangle. Sizes are the published figures (Platner 1929, the Wikipedia articles on each monument),
// rounded; where an outline covers only the excavated part, the published size is used about the outline's centre and axis. Heights
// are published where recorded, otherwise guesses, as each note says. Where nothing is mapped the position is a Pleiades point or
// the centre of the zone drawn round the monument. The volumes are kit shapes, not models: placeholders until assets are made.
//
// Output: lib/scenarios/fixtures/rome-ad100-landmarks.json.
import { readFile, writeFile } from 'node:fs/promises';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const osm = await json('data/history/rome/source/osm-landmarks.json');
const pleiades = await json('data/history/rome/source/pleiades-zoning.json');
const zoning = await json('lib/scenarios/fixtures/rome-ad100-zoning.json');
const LAT = 41.892, KX = Math.cos(LAT * Math.PI / 180) * 111320, KY = 110950;
const r7 = v => Math.round(v * 1e7) / 1e7, r1 = v => Math.round(v * 10) / 10;
const BEARING = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: 225, S: 270, SE: 315 };

/** Smallest enclosing rectangle of a set of lon/lat points: centre, the angle of its first side (degrees from east), side lengths. */
function rectangle(points) {
  const c0 = points.reduce((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length], [0, 0]);
  const xy = points.map(p => [(p[0] - c0[0]) * KX, (p[1] - c0[1]) * KY]);
  let best;
  for (let a = 0; a < 180; a += 0.5) {
    const t = a * Math.PI / 180, u = xy.map(p => p[0] * Math.cos(t) + p[1] * Math.sin(t)), v = xy.map(p => -p[0] * Math.sin(t) + p[1] * Math.cos(t));
    const L = Math.max(...u) - Math.min(...u), W = Math.max(...v) - Math.min(...v);
    if (!best || L * W < best.area - 1e-6) best = { area: L * W, a, L, W, cu: (Math.max(...u) + Math.min(...u)) / 2, cv: (Math.max(...v) + Math.min(...v)) / 2 };
  }
  const t = best.a * Math.PI / 180, cx = best.cu * Math.cos(t) - best.cv * Math.sin(t), cy = best.cu * Math.sin(t) + best.cv * Math.cos(t);
  // Normalise so `angle` is the long axis.
  const long = best.L >= best.W;
  return { centre: [c0[0] + cx / KX, c0[1] + cy / KY], angle: long ? best.a : best.a + 90, long: Math.max(best.L, best.W), short: Math.min(best.L, best.W) };
}
/** Of the two directions along an axis (degrees), the one nearer the compass bearing `hint`. */
const toward = (axis, hint) => { const d = a => Math.abs(((a - BEARING[hint]) % 360 + 540) % 360 - 180); return d(axis) <= d(axis + 180) ? axis % 360 : (axis + 180) % 360; };
const offset = (p, metres, deg) => [p[0] + metres * Math.cos(deg * Math.PI / 180) / KX, p[1] + metres * Math.sin(deg * Math.PI / 180) / KY];
const zoneRectangle = id => rectangle(zoning.zones.find(z => z.id === id).multipolygon.flatMap(poly => poly[0]));

const OSM = key => `source:osm-landmark-${key}`, PLATNER = 'source:platner-1929';
/**
 * The monuments standing c. AD 100 in the zones the fill leaves open. Those the Forum Boarium neighbourhood already models (the Circus
 * Maximus, the Palatine palaces, the Theatre of Marcellus, the Forum Holitorium temples, the Temple of Aesculapius) are not repeated.
 * Later ones (Trajan's Forum and Baths, the Temple of Venus and Roma, Hadrian's Pantheon rotunda as such) are left out or noted.
 *
 * `osm`: the outline key; `axis`: which of its axes is the monument's length ('long' by default); `front`: the rough compass bearing it
 * faces (temples' fronts, the Pantheon's porch, a stadium's straight end, a theatre's stage), so the kit is turned the right way round.
 * `size`: [length, width] in metres where the published size replaces the outline's.
 */
const SPEC = [
  // ---- Colosseum valley.
  { id: 'colosseum', title: 'Flavian Amphitheatre (Colosseum)', kit: 'amphitheatre', osm: 'colosseum', size: [189, 156], arena: [87, 55], height: 48, built: 80,
    note: 'Outer ellipse 189 × 156 m, arena 87 × 55 m, 48 m high (published); placed and turned by the mapped outline. Four tiers of seating stepped down to an open arena.' },
  { id: 'ludus-magnus', title: 'Ludus Magnus (gladiators\' school)', kit: 'precinct', osm: 'ludus-magnus', depth: 14, height: 11, built: 90,
    note: 'Barracks round a courtyard with a small arena, by the mapped outline of the excavated part. Height a guess.' },
  { id: 'arch-of-titus', title: 'Arch of Titus', kit: 'block', osm: 'arch-of-titus', size: [13.5, 4.75], height: 15.4, built: 81, note: 'Published size and height, on its standing position.' },
  // ---- Forum Romanum.
  { id: 'basilica-iulia', title: 'Basilica Julia', kit: 'basilica', osm: 'basilica-iulia', size: [101, 49], height: 22, aisle: 13, note: 'Published plan 101 × 49 m, by the mapped outline; heights a guess.' },
  { id: 'basilica-aemilia', title: 'Basilica Aemilia', kit: 'basilica', osm: 'basilica-aemilia', size: [100, 29], height: 20, aisle: 12, note: 'About 100 × 29 m by the mapped outline; heights a guess.' },
  { id: 'curia', title: 'Curia Julia (Senate house, Domitian\'s rebuilding)', kit: 'hall', osm: 'curia', size: [27, 18], height: 21, built: 94, note: 'The standing building is Diocletian\'s on the same plan: 27 × 18 m, 21 m high.' },
  { id: 'temple-castor', title: 'Temple of Castor and Pollux', kit: 'temple', osm: 'temple-castor', front: 'NE', size: [50, 32], podium: 7, height: 26, note: 'Podium about 50 × 32 m and 7 m high (published); columns 12.5 m. Faces the Forum square.' },
  { id: 'temple-divus-iulius', title: 'Temple of the Deified Julius', kit: 'temple', osm: 'temple-divus-iulius', front: 'NW', size: [30, 26], podium: 5.5, height: 18, note: 'By the mapped podium; height a guess.' },
  { id: 'temple-concord', title: 'Temple of Concord', kit: 'temple', osm: 'temple-concord', front: 'SE', size: [24, 45], podium: 5, height: 19, note: 'Transverse cella, wider (45 m) than deep, facing down the Forum, by the mapped podium (whose outline is near square, so the facing is a judgement); height a guess.' },
  { id: 'temple-saturn', title: 'Temple of Saturn', kit: 'temple', osm: 'temple-saturn', front: 'NE', size: [40, 22], podium: 9, height: 22, note: 'Podium 40 × 22 m and about 9 m high; the standing columns are 11 m. Faces north-east across the Vicus Iugarius to the Forum, as the mapped podium runs.' },
  { id: 'temple-vespasian', title: 'Temple of Vespasian and Titus', kit: 'temple', osm: 'temple-vespasian', front: 'SE', size: [33, 22], podium: 5, height: 21, built: 87, note: 'By the mapped podium; columns 15.2 m.' },
  { id: 'temple-vesta', title: 'Temple of Vesta', kit: 'round-temple', osm: 'temple-vesta', diameter: 15, podium: 3, height: 13, note: 'Round temple about 15 m across; height a guess.' },
  { id: 'atrium-vestae', title: 'House of the Vestals', kit: 'precinct', osm: 'atrium-vestae', depth: 13, height: 11, note: 'Rooms round a long court, at the size of the mapped outline (about 104 × 55 m); height a guess.' },
  { id: 'regia', title: 'Regia', kit: 'hall', osm: 'regia', size: [30, 20], height: 8, note: 'Small irregular building; a block of about its size.' },
  { id: 'temple-jupiter', title: 'Temple of Jupiter Optimus Maximus (Capitoline)', kit: 'temple', pleiades: 'jupiter-capitolinus', angle: 75, front: 'S', size: [62, 54], podium: 5, height: 32, built: 82,
    certainty: 'best-guess', note: 'Podium about 62 × 54 m (published; estimates vary). Placed at the Pleiades point, which is only good to about 2 km, and checked against the remains under Palazzo Caffarelli; faced south. Domitian\'s rebuilding after AD 80.' },
  // ---- Imperial fora.
  { id: 'forum-caesar', title: 'Forum of Caesar', kit: 'precinct', osm: 'forum-caesar', size: [160, 75], depth: 12, height: 13, note: 'Colonnaded square 160 × 75 m (published), by the mapped outline.' },
  { id: 'temple-venus-genetrix', title: 'Temple of Venus Genetrix', kit: 'temple', osm: 'temple-venus-genetrix', front: 'SE', size: [37, 30], podium: 5, height: 23, note: 'By the mapped podium at the head of the Forum of Caesar; height a guess.' },
  { id: 'forum-augustus', title: 'Forum of Augustus', kit: 'precinct', osm: 'forum-augustus', size: [125, 118], depth: 15, height: 18, note: 'Colonnades and exedrae round the square, about 125 × 118 m with them, by the mapped outline; the 33 m fire wall behind is drawn at the colonnades\' height.' },
  { id: 'temple-mars-ultor', title: 'Temple of Mars Ultor', kit: 'temple', osm: 'temple-mars-ultor', front: 'SW', size: [50, 38], podium: 3.5, height: 30, note: 'By the mapped podium; columns 17.7 m (published).' },
  { id: 'forum-nerva', title: 'Forum of Nerva (Forum Transitorium)', kit: 'precinct', osm: 'forum-nerva', size: [120, 45], depth: 6, height: 15, built: 97, note: 'A long walled square, 120 × 45 m, by the mapped outline; its columns stood against the walls.' },
  { id: 'temple-minerva', title: 'Temple of Minerva (Forum of Nerva)', kit: 'temple', osm: 'temple-minerva', front: 'SW', size: [32, 22], podium: 4, height: 22, built: 97, note: 'At the head of the Forum of Nerva, by the mapped remains; size and height a guess.' },
  { id: 'templum-pacis', title: 'Temple of Peace (Templum Pacis)', kit: 'precinct', osm: 'templum-pacis', size: [135, 110], depth: 14, height: 14, built: 75,
    certainty: 'best-guess', note: 'A garden square of about 135 × 110 m inside porticoes. The mapped outline covers only the excavated part, so the published size is set on its centre and axis.' },
  // ---- Campus Martius.
  { id: 'pantheon', title: 'Pantheon (Agrippa\'s, restored by Domitian)', kit: 'rotunda', osm: 'pantheon', front: 'N', diameter: 56, drum: 30, height: 43, porch: [34, 16], certainty: 'best-guess',
    note: 'Drawn on the plan of Hadrian\'s rebuilding (c. AD 113-125), which stands on the same site and faces the same way; the Pantheon of AD 100 was Domitian\'s restoration of Agrippa\'s, and its form is uncertain.' },
  { id: 'saepta-iulia', title: 'Saepta Julia', kit: 'precinct', point: [12.47815, 41.8980], angle: 90, size: [310, 120], depth: 15, height: 14, certainty: 'best-guess',
    note: 'Porticoes round a long enclosure, about 310 × 120 m (published), set east of the Pantheon as Platner describes it; position about 50 m.' },
  { id: 'baths-agrippa', title: 'Baths of Agrippa', kit: 'baths', osm: 'baths-agrippa', axis: 'short', size: [100, 80], height: 20, certainty: 'best-guess',
    note: 'The mapped fragment is the round hall (Arco della Ciambella); the bath block about it is a guess, about 100 × 80 m.' },
  { id: 'stadium-domitian', title: 'Stadium of Domitian', kit: 'stadium', osm: 'piazza-navona', front: 'S', cavea: 26, height: 22, built: 86,
    note: 'Piazza Navona keeps the arena (about 258 × 54 m, the mapped square); the stands round it about 26 m deep (outer size about 275 × 106 m, published). Curved end to the north. Height a guess.' },
  { id: 'theatre-pompey', title: 'Theatre of Pompey', kit: 'theatre', pleiades: 'theatrum-pompei', shift: [25, 0], angle: 0, front: 'E', diameter: 150, orchestra: 30, height: 35, crown: true, certainty: 'best-guess',
    note: 'Cavea about 150 m across (published), facing east. The Pleiades point is the line of Via di Grotta Pinta, which follows the curve; the centre is set 25 m east of it. The Temple of Venus Victrix crowns the cavea. Height a guess.' },
  { id: 'porticus-pompey', title: 'Porticus of Pompey', kit: 'precinct', pleiades: 'theatrum-pompei', shift: [25 + 90 + 12, 0], angle: 0, size: [180, 135], depth: 12, height: 12, certainty: 'best-guess',
    note: 'The garden portico behind the stage, about 180 × 135 m (published), reaching east to the Largo Argentina temples.' },
  { id: 'baths-nero', title: 'Baths of Nero', kit: 'baths', point: [12.4748, 41.8991], angle: 90, size: [190, 120], height: 20, built: 62, certainty: 'best-guess',
    note: 'Between the Stadium of Domitian and the Pantheon, under Palazzo Madama, as Platner places them; about 190 × 120 m. Position about 50 m; size and height a guess.' },
  { id: 'odeum-domitian', title: 'Odeum of Domitian', kit: 'theatre', point: [12.4727, 41.8972], angle: 90, front: 'N', diameter: 100, orchestra: 26, height: 22, built: 86, certainty: 'best-guess',
    note: 'South of the stadium; the curved front of Palazzo Massimo follows its cavea, so the stage faced north. About 100 m across; height a guess.' },
  { id: 'largo-argentina-b', title: 'Largo Argentina, Temple B', kit: 'round-temple', osm: 'largo-argentina-b', diameter: 18, podium: 2.5, height: 14, note: 'Round temple by its mapped podium; height a guess.' },
  { id: 'largo-argentina-c', title: 'Largo Argentina, Temple C', kit: 'temple', osm: 'largo-argentina-c', front: 'E', podium: 4, height: 13, note: 'By its mapped podium; height a guess.' },
  { id: 'largo-argentina-d', title: 'Largo Argentina, Temple D', kit: 'temple', osm: 'largo-argentina-d', front: 'E', podium: 3, height: 15, note: 'By its mapped podium; height a guess.' },
  { id: 'porticus-octaviae', title: 'Porticus of Octavia', kit: 'precinct', osm: 'porticus-octaviae-propylon', from: 'front', front: 'SW', axis: 'short', size: [132, 119], depth: 12, height: 12,
    certainty: 'best-guess', note: 'Porticoes 119 × 132 m (published) behind the standing propylon, which is mapped; the precinct is set on it.' },
  { id: 'mausoleum-augustus', title: 'Mausoleum of Augustus', kit: 'drum', osm: 'mausoleum-augustus', tiers: [[44.5, 12], [32, 24], [17, 38], [5, 42]],
    note: 'About 89 m across (mapped). The drum and the planted mound above it are drawn as stepped tiers; heights after the published reconstructions (about 42 m), a guess.' },
  { id: 'ara-pacis', title: 'Ara Pacis Augustae (original site)', kit: 'block', pleiades: 'ara-pacis', angle: 0, size: [11.6, 10.6], height: 6, note: 'The enclosure, 11.6 × 10.6 m (published), at its original site from Pleiades (it now stands by the Mausoleum).' },
  { id: 'horologium-obelisk', title: 'Obelisk of the Horologium Augusti', kit: 'block', pleiades: 'horologium-augusti', angle: 0, size: [3, 3], height: 30, note: 'The obelisk (21.8 m) on its base, at the Pleiades point.' },
  // ---- Oppian, Caelian, Viminal, Vatican.
  { id: 'baths-titus', title: 'Baths of Titus', kit: 'baths', zone: 'zone:oppian', size: [120, 110], height: 22, built: 80, certainty: 'best-guess', note: 'A bath block of about 120 × 110 m at the centre of the zone drawn round it; size and height a guess.' },
  { id: 'claudianum-terrace', title: 'Temple of the Deified Claudius: terrace', kit: 'precinct', zone: 'zone:claudianum', size: [200, 175], depth: 10, height: 10, built: 70, certainty: 'best-guess',
    note: 'The terrace, about 200 × 175 m, with porticoes round it, in the zone drawn round it; height a guess.' },
  { id: 'claudianum-temple', title: 'Temple of the Deified Claudius', kit: 'temple', zone: 'zone:claudianum', front: 'NW', size: [42, 26], podium: 4, base: 8, height: 26, built: 70, certainty: 'best-guess', note: 'The temple on its terrace; size a guess.' },
  { id: 'castra-praetoria', title: 'Castra Praetoria', kit: 'camp', zone: 'zone:castra-praetoria', size: [440, 380], height: 5, built: 23, certainty: 'best-guess',
    note: 'Walls of about 440 × 380 m (published), turned by the zone drawn round the camp, about 5 m high before the Aurelian heightening; barrack rows inside are a guess.' },
  { id: 'circus-vaticanus', title: 'Circus of Gaius and Nero', kit: 'circus', pleiades: 'circus-gaii-et-neronis', angle: 0, front: 'E', size: [540, 90], cavea: 16, height: 11, certainty: 'best-guess',
    note: 'About 540 × 90 m, running east-west along the south flank of today\'s St Peter\'s, with the obelisk on its spine; on the Pleiades point. Height a guess.' },
];

/** Keys that say how to place a monument; the output keeps only where it ended up. */
const PLACING = new Set(['osm', 'pleiades', 'zone', 'point', 'axis', 'front', 'shift', 'from', 'built']);
const out = SPEC.map(s => {
  let centre, angle, size = s.size, position;
  if (s.osm) {
    const l = osm.landmarks[s.osm], rect = rectangle(l.ways.flat());
    angle = s.axis === 'short' ? rect.angle + 90 : rect.angle;
    centre = rect.centre; size = size ?? (s.axis === 'short' ? [rect.short, rect.long] : [rect.long, rect.short]);
    position = `OpenStreetMap ${l.osm} (${l.name})`;
  } else if (s.pleiades) { centre = pleiades.places[s.pleiades].reprPoint; angle = s.angle; position = `Pleiades ${pleiades.places[s.pleiades].id}`; }
  else if (s.zone) { const rect = zoneRectangle(s.zone); centre = rect.centre; angle = s.angle ?? rect.angle; position = `centre of ${s.zone}`; }
  else { centre = s.point; angle = s.angle; position = 'Platner 1929 (described position)'; }
  if (s.front) angle = toward(angle, s.front);
  if (s.shift) centre = offset(offset(centre, s.shift[0], angle), s.shift[1], angle + 90);   // [along, across] the monument's axis
  if (s.from === 'front') centre = offset(centre, size[0] / 2, angle + 180);   // the mapped piece is the front: the precinct lies behind it
  const rest = Object.fromEntries(Object.entries(s).filter(([k]) => !PLACING.has(k))), built = s.built;
  return { ...rest, centre: [r7(centre[0]), r7(centre[1])], angle: r1(((angle % 360) + 360) % 360), ...(size ? { size: size.map(r1) } : {}), built: built ?? -100,
    certainty: s.certainty ?? (s.osm ? 'evidence-based' : 'best-guess'), position,
    sources: [...(s.osm ? [OSM(s.osm)] : []), ...(s.pleiades ? [`source:pleiades-${s.pleiades}`] : []), ...(s.zone ? [s.zone] : []), PLATNER] };
});
await writeFile('lib/scenarios/fixtures/rome-ad100-landmarks.json', JSON.stringify({
  about: 'Simple landmark reconstructions, Rome c. AD 100 (build-landmarks.mjs). angle: degrees from east, anticlockwise, of the length axis, pointing to the front where a kit has one. size: [length, width] metres.',
  osm: { accessed: osm.accessed, licence: osm.licence }, landmarks: out }, null, 1) + '\n');
console.log(`landmarks: ${out.length}`);
