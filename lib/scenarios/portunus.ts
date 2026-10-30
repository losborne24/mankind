import type { ScenarioDefinition } from '@/lib/scenarios/schema';
import world from '@/lib/history/fixtures/portunus.json';
const center: [number, number] = [12.480893167165, 41.889289401004];
export const portunusJourney: ScenarioDefinition = {
  version: 1, id: 'portunus-evidence', historicalDataset: 'portunus',
  title: 'Portunus — reading a reconstruction',
  description: 'Visit a specific temple interpretation, examine its evidence, and see where inference begins. Starting shows the interpretation. AD 100 is an editorial preview, not an exact historical snapshot.',
  scope: { bounds: [12.47, 41.88, 12.49, 41.90], time: { start: { year: 100 } } },
  content: {
    sources: world.sources.map(({ id, title, url }) => ({ id, title, url })),
    locations: [{ id: 'portunus', title: 'Temple of Portunus · approximate location', coordinate: center, certainty: 'illustrative', sources: ['source:rome-tourism'] }],
    routes: [],
    scenes: [{ id: 'exterior', historicalSceneId: 'scene:portunus-exterior', interpretationLayoutId: 'layout:portunus-classical', description: 'Catalogue-pinned Portunus exterior interpretation', certainty: 'illustrative', sources: ['source:psu-fletcher', 'source:rome-heritage'], required: false }],
    overlays: [
      { id: 'location', type: 'point', location: 'portunus' },
      { id: 'context', type: 'caption', title: 'A temple in Rome', text: 'The heritage authority identifies the Temple of Portunus as a Roman Ionic temple. This visitor location is approximate; the surrounding map is physical context, not reconstructed ancient Rome.', sources: ['source:rome-heritage', 'source:rome-tourism'] },
      { id: 'structure', type: 'card', title: 'Read the exterior', text: 'A high podium, entrance steps and a four-column Ionic front define the building. The model follows a historic plan and elevations, with simplified geometry. It is a specific interpretation, not a measured survey.', sources: ['source:rome-tourism', 'source:rome-heritage', 'source:psu-fletcher'] },
      { id: 'inference', type: 'card', title: 'Where the evidence ends', text: 'The drawing supplies a dimensional scaffold. Roof tiles, stair divisions, capital detail, finishes and the model pose involve inference. Interior furnishings and original paint are omitted. AD 100 is an editorial viewing context, not a verified appearance in that year.', sources: ['source:psu-fletcher'] },
      { id: 'explore', type: 'caption', title: 'Inspect and explore', text: 'Open the building evidence to inspect the pinned catalogue version, sources and limitations. Move the map to explore; Resume returns you to the journey. No ancient neighbourhood or population is supplied.' },
    ],
  },
  beats: [
    { id: 'context', title: 'Locate the temple', actions: [{ camera: { type: 'flyTo', transition: 'zoomPanZoom', center, zoom: 16, pitch: 42, bearing: 165, duration: 6000 }, overlays: ['context', 'location'] }] },
    { id: 'structure', title: 'Read the exterior', sceneRequirements: ['exterior'], actions: [{ camera: { type: 'flyTo', center, zoom: 19.1, pitch: 55, bearing: 165, duration: 5000 }, overlays: ['structure'] }, { camera: { type: 'hold', duration: 7000 }, overlays: ['structure'] }] },
    { id: 'inference', title: 'Evidence and inference', sceneRequirements: ['exterior'], actions: [{ camera: { type: 'orbit', center, zoom: 19.1, pitch: 55, degrees: 65, duration: 12000 }, overlays: ['inference'] }] },
    { id: 'explore', title: 'Inspect and explore', sceneRequirements: ['exterior'], explorationPrompt: 'Inspect the evidence or explore freely.', actions: [{ camera: { type: 'hold', duration: 5000 }, overlays: ['explore'] }] },
  ],
};
