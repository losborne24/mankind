import zoning from '@/lib/scenarios/fixtures/rome-ad100-zoning.json';
import landmarks from '@/lib/scenarios/fixtures/rome-ad100-landmarks.json';
import density from '@/lib/scenarios/fixtures/rome-ad100-suburb-density.json';
import context from '@/lib/scenarios/fixtures/forum-boarium-context.json';
import reconstruction from '@/lib/scenarios/fixtures/forum-boarium-reconstruction.json';
import forumWorld from '@/lib/history/fixtures/forum-boarium.json';
import portunusWorld from '@/lib/history/fixtures/portunus.json';
import housesteadsWorld from '@/lib/history/fixtures/housesteads.json';
import menanderWorld from '@/lib/history/fixtures/menander.json';
import type { Evidence, HistoricalPeriod } from '@/lib/history/schema';
import type { Bounds, PlanFeature, SpatialBlueprint } from '@/lib/plan/contracts';
import { CODEC_VERSIONS, bboxOf, centreOf, contextFeatures, densityFeature, flatPoints, landmarkFeatures, layerFromFile, reconstructionFeatures, worldPlaceFeatures, zoningFeatures } from '@/lib/plan/codecs';
import { GENERATORS } from '@/lib/plan/generators';
import { offsetCoordinate } from '@/map/settlements/romanSettlement';
import type { Coordinate } from '@/lib/scenarios/schema';

/**
 * The golden blueprints: what Phase 4 and the Rome AD 100 work already hold, expressed in the planning contracts. Nothing is added
 * as evidence here. Empire and region levels are viewing frames with the settlements the registered datasets actually cover; their
 * missing evidence is left for the planner to report. Fixtures stay the files the app reads; `compileLayer` of each layer gives
 * them back byte for byte (scripts/check-plan-golden.mjs).
 */
type Json = Record<string, unknown>;
const json = (v: unknown) => v as Json;
const frame = (note: string): Evidence => ({ certainty: 'illustrative', sources: [], note });
const versions = () => ({ schema: 1 as const, codecs: { ...CODEC_VERSIONS } });
const AD100: HistoricalPeriod = { start: { year: 100 } };
/** Astronomical years: 27 BCE is -26. */
const IMPERIAL: HistoricalPeriod = { start: { year: -26 }, end: { year: 476 } };
const around = ([lng, lat]: Coordinate, metres: number): Bounds => {
  const dx = metres / (Math.cos(lat * Math.PI / 180) * 111320), dy = metres / 110950;
  return [lng - dx, lat - dy, lng + dx, lat + dy];
};
const placeOf = (world: unknown, id: string) => (json(world).places as { id: string; title: string; position: { coordinate: Coordinate }; radiusMeters: number; period?: HistoricalPeriod; evidence: Evidence }[]).find(p => p.id === id)!;
/** Catalogue pins by the place each placed building represents (a layout combining several names each building's own place). */
const assetPins = (world: unknown) => {
  const w = json(world), pins: Record<string, { catalogue: { id: string; version: number } }> = {};
  for (const layout of w.layouts as { placeId: string; buildings: { assetId: string; placeId?: string }[] }[]) for (const b of layout.buildings) {
    const asset = (w.assets as { id: string; catalogueRef?: { id: string; version: number } }[]).find(a => a.id === b.assetId);
    if (asset?.catalogueRef) pins[b.placeId ?? layout.placeId] = { catalogue: asset.catalogueRef };
  }
  return pins;
};

export const ZONING_FILE = 'lib/scenarios/fixtures/rome-ad100-zoning.json';
export const LANDMARKS_FILE = 'lib/scenarios/fixtures/rome-ad100-landmarks.json';
export const DENSITY_FILE = 'lib/scenarios/fixtures/rome-ad100-suburb-density.json';
export const CONTEXT_FILE = 'lib/scenarios/fixtures/forum-boarium-context.json';
export const RECONSTRUCTION_FILE = 'lib/scenarios/fixtures/forum-boarium-reconstruction.json';

function rome(): SpatialBlueprint {
  const id = 'blueprint:rome', f = json(zoning).frame as Coordinate[], bounds = bboxOf(f)!;
  const zoningLayer = layerFromFile('zoning', 'zoning', 'rome-zoning@1', ZONING_FILE, json(zoning), 0, ['lines', 'zones', 'markers']);
  const landmarkLayer = layerFromFile('landmarks', 'landmarks', 'rome-landmarks@1', LANDMARKS_FILE, json(landmarks), 1, ['landmarks']);
  const densityLayer = layerFromFile('density', 'density', 'rome-density@1', DENSITY_FILE, json(density), 0, []);
  const extent = json(zoning).extent as { ring: Coordinate[]; sources: string[] };
  const fill: PlanFeature = { id: 'fill:rome-ad100', kind: 'fill', title: 'Zoned fill of the city, suburbium and Campagna', chronology: 'dated', existence: { start: { year: 100 }, end: { year: 100 }, uncertaintyYears: 25 },
    evidence: { certainty: 'illustrative', sources: [], note: 'Every building, tomb, pier and field strip outside the Forum Boarium neighbourhood is generated from the zoning and the density field; none is placed from a source (FILL.md).' },
    refs: [{ store: `fixture:${ZONING_FILE}`, id: 'zones' }, { store: 'generator', id: 'rome-fill' }], geometry: { type: 'polygon', bbox: bounds }, rung: 3 };
  return {
    schema: 1, id, version: 1, title: 'Rome c. AD 100', lod: 'city',
    place: { id: 'place:rome', title: 'Rome', aliases: ['Rome', 'Roma', 'Ancient Rome', 'Urbs'], anchor: centreOf(bboxOf(extent.ring)!), refs: [{ store: `fixture:${ZONING_FILE}`, id: 'zone:extent' }] },
    bounds, boundsEvidence: frame('The zoning frame: about 14 km square round the city, its suburbium and the Campagna. A working frame, not a boundary.'),
    applicability: AD100, traditions: ['roman'], parent: { id: 'blueprint:central-italy', version: 1 }, children: [{ id: 'blueprint:forum-boarium', version: 1 }],
    layers: [zoningLayer, landmarkLayer, densityLayer],
    features: [...zoningFeatures(zoningLayer, ZONING_FILE, bounds), ...landmarkFeatures(landmarkLayer, LANDMARKS_FILE, id), densityFeature(densityLayer, DENSITY_FILE, AD100), fill],
    generators: [{ id: 'fill:rome-ad100', generator: 'rome-fill', version: GENERATORS['rome-fill'].version, inputs: ['zoning', 'density', 'landmarks', 'blueprint:forum-boarium@1/reconstruction'],
      params: { keepOut: 'footprints of every object in blueprint:forum-boarium@1/reconstruction, at its origin' }, outputDigest: GENERATORS['rome-fill'].outputDigest, applicability: { start: { year: 100 }, end: { year: 100 }, uncertaintyYears: 25 } }],
    provenance: { builtFrom: [ZONING_FILE, LANDMARKS_FILE, DENSITY_FILE, 'scripts/context/rome/ZONING.md', 'scripts/context/rome/LANDMARKS.md', 'scripts/context/rome/FILL.md'], note: 'Stage 1 zoning, Stage 3 fill and Stage 3b landmark placeholders of Rome c. AD 100 (v5.16–v5.21). AD 100 is an editorial date.' },
    versions: versions(),
  };
}

function forumBoarium(): SpatialBlueprint {
  const id = 'blueprint:forum-boarium', origin = json(reconstruction).origin as Coordinate, toGeo = (p: [number, number]): Coordinate => [...offsetCoordinate(origin, p)];
  const contextLayer = layerFromFile('context', 'context', 'forum-context@1', CONTEXT_FILE, json(context), 1, ['locations', 'geometries']);
  const reconLayer = layerFromFile('reconstruction', 'layout', 'forum-reconstruction@1', RECONSTRUCTION_FILE, json(reconstruction), 0, ['objects', 'streets', 'lots', 'lanes', 'courts']);
  const worldLayer = layerFromFile('world', 'world', 'world@1', 'lib/history/fixtures/forum-boarium.json', json(forumWorld), 2, ['sources', 'places', 'assets', 'roadNetworks', 'layouts', 'events', 'routes', 'scenes']);
  const pins = assetPins(forumWorld), objectPins = { 'temple-portunus': pins['place:temple-of-portunus'], 'temple-hercules-victor': pins['place:temple-of-hercules-victor'] };
  const ground = (json(context).geometries as { id: string; coordinates: Coordinate[][] }[]).find(g => g.id === 'ground')!;
  const forum = (json(context).geometries as { id: string; coordinates: Coordinate[][] }[]).find(g => g.id === 'forum-boarium')!;
  return {
    schema: 1, id, version: 1, title: 'Forum Boarium c. AD 100', lod: 'neighbourhood',
    place: { id: 'place:forum-boarium', title: 'Forum Boarium', aliases: ['Forum Boarium', 'Cattle market', 'Foro Boario'], anchor: centreOf(bboxOf(flatPoints(forum.coordinates))!), refs: [{ store: `fixture:${CONTEXT_FILE}`, id: 'forum-boarium' }, { store: 'source', id: 'source:pleiades-forum-boarium' }] },
    bounds: bboxOf(flatPoints(ground.coordinates))!, boundsEvidence: frame('The journey\'s ground frame round the Forum Boarium, the river crossing and the hills; a working frame.'),
    applicability: AD100, traditions: ['roman'], parent: { id: 'blueprint:rome', version: 1 },
    children: [{ id: 'blueprint:temple-of-portunus', version: 1 }, { id: 'blueprint:temple-of-hercules-victor', version: 1 }],
    layers: [contextLayer, reconLayer, worldLayer],
    features: [...contextFeatures(contextLayer, CONTEXT_FILE), ...reconstructionFeatures(reconLayer, RECONSTRUCTION_FILE, toGeo, objectPins), ...worldPlaceFeatures(worldLayer, 'forum-boarium', pins, {
      'place:forum-boarium-temples': { period: { start: { year: -120 }, end: { year: 2025 } }, note: 'the later of the two temples\' recorded starts (Portunus, -120) to today.', ref: { store: 'world:forum-boarium', id: 'place:temple-of-portunus' } } })],
    generators: [],
    provenance: { builtFrom: [CONTEXT_FILE, RECONSTRUCTION_FILE, 'lib/history/fixtures/forum-boarium.json', 'scripts/context/forum-boarium/RECONSTRUCTION.md'], note: 'Phase 4 Forum Boarium journey context, the v5.8–v5.15 period survey and generated neighbourhood, and the two catalogue-pinned temples.' },
    versions: versions(),
  };
}

function temple(placeId: string, slug: string, title: string, aliases: string[], world: unknown, dataset: string, file?: string): SpatialBlueprint {
  const place = placeOf(forumWorld, placeId), pin = assetPins(forumWorld)[placeId];
  const layer = file ? layerFromFile('world', 'world', 'world@1', file, json(world), 2, ['sources', 'places', 'assets', 'roadNetworks', 'layouts', 'events', 'routes', 'scenes']) : undefined;
  const features: PlanFeature[] = layer
    ? worldPlaceFeatures(layer, dataset, { [placeId]: pin }, { [placeId]: { period: place.period!, note: `the Forum Boarium dataset's record of ${place.title}.`, ref: { store: 'world:forum-boarium', id: placeId } } })
    : [{ id: `place:${slug}`, kind: 'landmark', title: place.title, chronology: 'dated', existence: place.period, evidence: place.evidence, refs: [{ store: 'world:forum-boarium', id: placeId }, ...place.evidence.sources.map(id => ({ store: 'source', id }))], geometry: { type: 'point', anchor: place.position.coordinate }, rung: 1, asset: { catalogue: pin.catalogue } }];
  return {
    schema: 1, id: `blueprint:${slug}`, version: 1, title: `${title} c. AD 100`, lod: 'site',
    place: { id: placeId, title, aliases, anchor: place.position.coordinate, refs: [{ store: 'world:forum-boarium', id: placeId }] },
    bounds: around(place.position.coordinate, place.radiusMeters), boundsEvidence: frame(`The dataset's ${place.radiusMeters} m discovery radius round the visitor anchor; a display setting, not a site boundary.`),
    applicability: AD100, traditions: ['roman'], parent: { id: 'blueprint:forum-boarium', version: 1 }, children: [], layers: layer ? [layer] : [], features, generators: [],
    provenance: { builtFrom: [file ?? 'lib/history/fixtures/forum-boarium.json', 'lib/assets/catalogue.json'], note: `The catalogue-pinned exterior (${pin.catalogue.id}@${pin.catalogue.version}). Interior and finer architectural detail have no blueprint yet.` },
    versions: versions(),
  };
}

function settlementMarker(id: string, title: string, anchor: Coordinate, existence: HistoricalPeriod, evidence: Evidence, refs: PlanFeature['refs']): PlanFeature {
  return { id, kind: 'settlement', title, chronology: existence.end ? 'dated' : 'from-start', existence, evidence, refs, geometry: { type: 'point', anchor }, rung: 5 };
}
const modernTerrain = (): PlanFeature => ({ id: 'terrain:modern-relief', kind: 'terrain', title: 'Modern relief and coastline', chronology: 'timeless',
  evidence: { certainty: 'unknown', sources: [], note: 'Today\'s elevation (Mapterhorn) and Natural Earth coastline, drawn for every date. No ancient coastline or sea-level change is modelled at this scale.' },
  refs: [{ store: 'dataset:mapterhorn', id: 'elevation' }, { store: 'dataset:natural-earth', id: 'coastline' }], geometry: { type: 'none' }, rung: 4 });

function centralItaly(romeAnchor: Coordinate, romeSources: string[]): SpatialBlueprint {
  const menander = placeOf(menanderWorld, 'place:house-of-menander');
  return {
    schema: 1, id: 'blueprint:central-italy', version: 1, title: 'Central Italy (Latium and Campania)', lod: 'region',
    place: { id: 'place:central-italy', title: 'Central Italy', aliases: ['Central Italy', 'Latium', 'Campania', 'Italia'], anchor: [12.9, 41.6], refs: [] },
    bounds: [11.0, 40.3, 15.2, 43.0], boundsEvidence: frame('A viewing frame round Latium and Campania. No ancient regional boundary is drawn; none is registered.'),
    applicability: IMPERIAL, traditions: ['roman'], parent: { id: 'blueprint:roman-empire', version: 1 },
    children: [{ id: 'blueprint:rome', version: 1 }, { id: 'blueprint:house-of-menander', version: 1 }], layers: [],
    features: [
      modernTerrain(),
      settlementMarker('settlement:rome', 'Rome', romeAnchor, { start: { year: -752 }, end: { year: 2025 } }, { certainty: 'inferred', sources: romeSources, note: 'Continuously occupied from its traditional founding (753 BCE); marker at the centre of the AD 100 continuous-city extent.' }, [{ store: `fixture:${ZONING_FILE}`, id: 'zone:extent' }]),
      settlementMarker('settlement:pompeii-menander', 'Pompeii (House of Menander)', menander.position.coordinate, { start: { year: 79 }, end: { year: 79 }, approximate: true },
        { certainty: 'inferred', sources: menander.evidence.sources, note: 'The registered dataset covers only the House of Menander\'s final phase, AD 79. No other date is supported.' }, [{ store: 'world:menander', id: 'place:house-of-menander' }]),
    ],
    generators: [], provenance: { builtFrom: ['lib/plan/golden/blueprints.ts'], note: 'A frame and the settlements registered datasets cover. Roads, other towns and the ancient coast are content gaps.' },
    versions: versions(),
  };
}

function romanEmpire(romeAnchor: Coordinate, romeSources: string[]): SpatialBlueprint {
  const fort = placeOf(housesteadsWorld, 'place:housesteads-fort');
  return {
    schema: 1, id: 'blueprint:roman-empire', version: 1, title: 'The Roman Empire', lod: 'empire',
    place: { id: 'place:roman-empire', title: 'Roman Empire', aliases: ['Roman Empire', 'Imperium Romanum', 'The Roman Empire'], anchor: [16, 41], refs: [] },
    bounds: [-10, 23, 42, 57], boundsEvidence: frame('A viewing frame from Iberia to Syria and from Egypt to northern Britain. It is not a frontier line: no sourced provincial or frontier geometry is registered.'),
    applicability: IMPERIAL, traditions: ['roman'], children: [{ id: 'blueprint:central-italy', version: 1 }, { id: 'blueprint:housesteads', version: 1 }], layers: [],
    features: [
      modernTerrain(),
      settlementMarker('settlement:rome', 'Rome', romeAnchor, { start: { year: -752 }, end: { year: 2025 } }, { certainty: 'inferred', sources: romeSources, note: 'Continuously occupied from its traditional founding (753 BCE); marker at the centre of the AD 100 continuous-city extent.' }, [{ store: `fixture:${ZONING_FILE}`, id: 'zone:extent' }]),
      settlementMarker('settlement:housesteads', 'Housesteads (Vercovicium)', fort.position.coordinate, { start: { year: 122 }, end: { year: 400 }, approximate: true },
        { certainty: 'inferred', sources: fort.evidence.sources, note: 'Dated by the dataset\'s phase contexts (early c. AD 122–138 to late c. 270–400); the place record itself asserts no lifespan.' }, [{ store: 'world:housesteads', id: 'place:housesteads-fort' }]),
    ],
    generators: [], provenance: { builtFrom: ['lib/plan/golden/blueprints.ts'], note: 'A frame and the settlements registered datasets cover. Provinces, frontiers, roads and the other cities are content gaps.' },
    versions: versions(),
  };
}

function datasetSite(slug: string, placeId: string, title: string, aliases: string[], world: unknown, dataset: string, file: string, parent: string, applicability: HistoricalPeriod, note: string): SpatialBlueprint {
  const place = placeOf(world, placeId), layer = layerFromFile('world', 'world', 'world@1', file, json(world), 2, ['sources', 'places', 'referenceAreas', 'footprints', 'assets', 'roadNetworks', 'layouts', 'events', 'routes', 'scenes'].filter(k => k in json(world)));
  const dated = Object.fromEntries((json(world).places as { id: string; period?: HistoricalPeriod }[]).filter(p => !p.period).map(p => [p.id, { period: applicability, note, ref: { store: `world:${dataset}`, id: (json(world).scenes as { id: string }[])[0].id } }]));
  return {
    schema: 1, id: `blueprint:${slug}`, version: 1, title, lod: 'site', place: { id: placeId, title: place.title, aliases, anchor: place.position.coordinate, refs: [{ store: `world:${dataset}`, id: placeId }] },
    bounds: around(place.position.coordinate, place.radiusMeters), boundsEvidence: frame(`The dataset's ${place.radiusMeters} m discovery radius; a display setting.`),
    applicability, traditions: ['roman'], parent: { id: parent, version: 1 }, children: [], layers: [layer], features: worldPlaceFeatures(layer, dataset, {}, dated), generators: [],
    provenance: { builtFrom: [file], note }, versions: versions(),
  };
}

let cached: SpatialBlueprint[] | undefined;
/** The canonical golden set, deep-frozen: a scenario may only change it through override layers. */
export function goldenBlueprints(): SpatialBlueprint[] {
  if (cached) return cached;
  const r = rome(), romeSources = (json(zoning).extent as { sources: string[] }).sources;
  const set = [romanEmpire(r.place.anchor, romeSources), centralItaly(r.place.anchor, romeSources), r, forumBoarium(),
    temple('place:temple-of-portunus', 'temple-of-portunus', 'Temple of Portunus', ['Temple of Portunus', 'Portunus', 'Tempio di Portunus', 'Temple of Fortuna Virilis'], portunusWorld, 'portunus', 'lib/history/fixtures/portunus.json'),
    temple('place:temple-of-hercules-victor', 'temple-of-hercules-victor', 'Temple of Hercules Victor', ['Temple of Hercules Victor', 'Hercules Victor', 'Round temple'], forumWorld, 'forum-boarium'),
    datasetSite('housesteads', 'place:housesteads-fort', 'Housesteads Roman Fort', ['Housesteads', 'Vercovicium', 'Housesteads Roman Fort'], housesteadsWorld, 'housesteads', 'lib/history/fixtures/housesteads.json', 'blueprint:roman-empire',
      { start: { year: 122 }, end: { year: 400 }, approximate: true }, 'Dated by the dataset\'s phase contexts, c. AD 122–400. Reconstruction geometry is unavailable.'),
    datasetSite('house-of-menander', 'place:house-of-menander', 'House of Menander, Pompeii', ['House of Menander', 'Casa del Menandro'], menanderWorld, 'menander', 'lib/history/fixtures/menander.json', 'blueprint:central-italy',
      { start: { year: 79 }, approximate: true }, 'The final phase before AD 79 only: a sourced property extent with no reconstructed architecture.'),
  ];
  const freeze = (v: unknown) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); } };
  // Freezing the layers would freeze the imported fixtures the app also reads; they are detached first.
  cached = set.map(b => structuredClone(b));
  cached.forEach(freeze);
  return cached;
}
