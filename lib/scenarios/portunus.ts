import type { ScenarioDefinition, ScenarioOverlay, Coordinate } from '@/lib/scenarios/schema';
import world from '@/lib/history/fixtures/forum-boarium.json';
import context from '@/lib/scenarios/fixtures/forum-boarium-context.json';
// Camera targets reuse coordinates already in the sourced data; none are invented for the journey.
const place = (id: string): Coordinate => world.places.find(p => p.id === id)!.position.coordinate as Coordinate;
const marker = (id: string): Coordinate => context.locations.find(l => l.id === id)!.coordinate as Coordinate;
const centreOf = (id: string): Coordinate => {
  const ring = context.geometries.find(g => g.id === id)!.coordinates[0] as Coordinate[], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const portunus = place('place:temple-of-portunus'), pair = place('place:forum-boarium-temples');
const island = marker('tiber-island'), bridge = centreOf('pons-aemilius'), forum = centreOf('forum-boarium');
const sourceIds = new Set<string>();
const sources = [...context.sources, ...world.sources].filter(s => !sourceIds.has(s.id) && sourceIds.add(s.id)).map(({ id, title, url, ...rest }) => ({ id, title, url, ...('licence' in rest && rest.licence ? { licence: rest.licence as string } : {}) }));
const layer = (id: string) => ({ id: `layer:${id}`, type: context.geometries.find(g => g.id === id)!.kind as 'polygon' | 'line', geometry: id });
const point = (id: string) => ({ id: `layer:${id}`, type: 'point' as const, location: id });
const base = ['layer:ground', 'layer:tiber'];
const hills = ['layer:capitoline', 'layer:palatine', 'layer:aventine', 'layer:tiber-island', 'layer:circus-maximus'];
const left = ['layer:arch-of-janus', 'layer:santa-maria-in-cosmedin'];
export const portunusJourney: ScenarioDefinition = {
  version: 1, id: 'portunus-evidence', historicalDataset: 'forum-boarium',
  title: 'Portunus and the Forum Boarium',
  description: 'Arrive at Rome\'s riverside cattle market, see why two temples stood here, and read what is documented, approximate and inferred. AD 100 is an editorial preview, not an exact historical snapshot.',
  scope: { bounds: [12.47, 41.88, 12.49, 41.9], time: { start: { year: 100 } } },
  content: {
    sources,
    locations: context.locations as ScenarioDefinition['content']['locations'],
    routes: [],
    geometries: context.geometries as NonNullable<ScenarioDefinition['content']['geometries']>,
    scenes: [{ id: 'temples', historicalSceneId: 'scene:forum-boarium-temples', interpretationLayoutId: 'layout:forum-boarium-temples', description: 'Catalogue-pinned Portunus and Hercules Victor exterior interpretations', certainty: 'illustrative', sources: ['source:psu-fletcher', 'source:rome-heritage', 'source:wikipedia-hercules'], required: false }],
    overlays: [
      ...context.geometries.map(g => layer(g.id)),
      ...context.locations.map(l => point(l.id)),
      { id: 'rome', type: 'card', title: 'Rome, around AD 100', text: 'You are above the Tiber, beside the Capitoline, Palatine and Aventine hills. Hill labels, the pale ground and the river outline are orientation only: the river shown is today\'s channel, not the ancient bank.', sources: ['source:pleiades-forum-boarium', 'source:osm-tiber', 'source:wikipedia-tiber'] },
      { id: 'crossing', type: 'card', title: 'The river crossing', text: 'Pons Aemilius, Rome\'s first stone bridge, crossed the Tiber here. Nearby lay the Portus Tiberinus, the city\'s first commercial harbour, possibly still in use by AD 100. The bridge shows its surviving fragment; the harbour is one approximate point.', sources: ['source:wikipedia-pons-aemilius', 'source:pleiades-pons-aemilius', 'source:it-wikipedia-porto-tiberino'] },
      { id: 'market', type: 'card', title: 'The cattle market', text: 'The Forum Boarium was a centre of trade and ritual on the Tiber\'s east bank. Its outline here is the modern site boundary. The Ara Maxima, an altar of Hercules, is marked approximately; its foundations may lie under Santa Maria in Cosmedin.', sources: ['source:pleiades-forum-boarium', 'source:osm-forum-boarium', 'source:wikipedia-great-altar'] },
      { id: 'temples', type: 'card', title: 'Two temples, side by side', text: 'Round Hercules Victor, with a ring of 20 Corinthian columns, stood beside rectangular, four-column Ionic Portunus. Both models are interpretations, placed from modern map outlines accurate to about 20 metres.', sources: ['source:wikipedia-hercules', 'source:whe-hercules', 'source:rome-heritage', 'source:osm-hercules'] },
      { id: 'structure', type: 'card', title: 'Read the exterior', text: 'Portunus has a high podium, entrance steps and a four-column Ionic front. The model follows a historic plan and elevations, simplified. It is an interpretation, not a survey.', sources: ['source:rome-tourism', 'source:rome-heritage', 'source:psu-fletcher'] },
      { id: 'inference', type: 'card', title: 'Where the evidence ends', text: 'Portunus roof tiles, steps and capitals are inferred. Hercules Victor\'s original roof is lost, so its cone is a plain guess; Palladio\'s dome and column count were rejected. AD 100 is an editorial date, not verified.', sources: ['source:psu-fletcher', 'source:palladio-1570', 'source:wikipedia-hercules'] },
      { id: 'explore', type: 'caption', title: 'Inspect and explore', text: 'Tap any layer on the map for its dates, certainty and sources. Move the map freely; Resume returns you to the journey. Nothing else is reconstructed.', sources: ['source:rome-heritage'] },
    ] as ScenarioOverlay[],
  },
  beats: [
    { id: 'rome', title: 'Rome from above', actions: [
      { camera: { type: 'flyTo', transition: 'zoomPanZoom', center: forum, zoom: 14.7, pitch: 40, bearing: 200, duration: 11000 }, overlays: ['rome', ...base, ...hills, 'layer:forum-boarium'] },
      { camera: { type: 'hold', duration: 5000 }, overlays: ['rome', ...base, ...hills, 'layer:forum-boarium'] } ] },
    { id: 'crossing', title: 'The river crossing', actions: [
      { camera: { type: 'flyTo', center: island, zoom: 15.8, pitch: 52, bearing: 150, duration: 6000 }, overlays: ['crossing', ...base, 'layer:tiber-island', 'layer:pons-aemilius', 'layer:portus-tiberinus'] },
      { camera: { type: 'flyTo', center: bridge, zoom: 16.5, pitch: 55, bearing: 115, duration: 8000 }, overlays: ['crossing', ...base, 'layer:tiber-island', 'layer:pons-aemilius', 'layer:portus-tiberinus', 'layer:cloaca-maxima-outlet'] } ] },
    { id: 'market', title: 'The cattle market', actions: [
      { camera: { type: 'flyTo', center: forum, zoom: 17.2, pitch: 58, bearing: 70, duration: 7000 }, overlays: ['market', ...base, 'layer:forum-boarium', 'layer:ara-maxima', 'layer:cloaca-maxima-outlet', 'layer:portus-tiberinus', ...left] },
      { camera: { type: 'orbit', center: forum, zoom: 17.2, pitch: 58, degrees: 35, duration: 7000 }, overlays: ['market', ...base, 'layer:forum-boarium', 'layer:ara-maxima', 'layer:cloaca-maxima-outlet', 'layer:portus-tiberinus', ...left] } ] },
    { id: 'temples', title: 'Two temples', sceneRequirements: ['temples'], actions: [
      { camera: { type: 'flyTo', center: pair, zoom: 18.3, pitch: 58, bearing: 165, duration: 7000 }, overlays: ['temples', ...base, 'layer:forum-boarium', 'layer:hercules-victor-footprint', 'layer:portunus-footprint', ...left] },
      { camera: { type: 'hold', duration: 7000 }, overlays: ['temples', ...base, 'layer:forum-boarium', 'layer:hercules-victor-footprint', 'layer:portunus-footprint', ...left] } ] },
    { id: 'structure', title: 'Read the exterior', sceneRequirements: ['temples'], actions: [
      { camera: { type: 'flyTo', center: portunus, zoom: 19.1, pitch: 55, bearing: 165, duration: 5000 }, overlays: ['structure', ...base, 'layer:portunus-footprint'] },
      { camera: { type: 'hold', duration: 7000 }, overlays: ['structure', ...base, 'layer:portunus-footprint'] } ] },
    { id: 'inference', title: 'Where the evidence ends', sceneRequirements: ['temples'], actions: [
      { camera: { type: 'orbit', center: pair, zoom: 18.3, pitch: 55, degrees: 40, duration: 14000 }, overlays: ['inference', ...base, 'layer:hercules-victor-footprint', 'layer:portunus-footprint'] } ] },
    { id: 'explore', title: 'Inspect and explore', sceneRequirements: ['temples'], explorationPrompt: 'Inspect the evidence or explore freely.', actions: [
      { camera: { type: 'hold', duration: 5000 }, overlays: ['explore', ...base, ...hills, ...context.geometries.map(g => `layer:${g.id}`).filter(id => !base.includes(id)), 'layer:ara-maxima', 'layer:portus-tiberinus', 'layer:cloaca-maxima-outlet'] } ] },
  ],
};
