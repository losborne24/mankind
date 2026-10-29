import type { ScenarioDefinition, Coordinate, CameraCommand } from '@/lib/scenarios/schema';
const july = { start: { year: 2012, month: 7 } }, opening = { start: { year: 2012, month: 7, day: 27 } };
const stadium: Coordinate = [-0.0166, 51.5387];
const route: Coordinate[] = [[-0.1276, 51.5074], [-0.1246, 51.5077], [-0.1195, 51.509], [-0.1115, 51.5106], [-0.1044, 51.5119], [-0.0968, 51.5115], [-0.0905, 51.5105], [-0.0803, 51.5095], [-0.0754, 51.5081]];
const beat = (id: string, title: string, camera: CameraCommand, overlays: string[], time = july) => ({ id, title, actions: [{ camera, overlays, time }] });
export const london2012: ScenarioDefinition = {
    version: 1, id: 'london-2012', title: 'London 2012 — The Road to the Opening Ceremony', description: 'A continuous geographic journey through London. Take control of the map at any moment.',
    scope: { bounds: [-12, 49, 3, 60], time: july },
    content: {
        sources: [{ id: 'ioc', title: 'London 2012 official guide — The Relay & Ceremonies', url: 'https://library.olympics.com/digitalCollection/DigitalCollectionAttachmentDownloadHandler.ashx?documentId=157401&parentDocumentId=61000&skipCopyright=true&skipWatermark=true' }, { id: 'ceremony', title: 'World Athletics — London Olympics open in spectacular fashion, 28 July 2012', url: 'https://worldathletics.org/news/news/london-olympics-open-in-spectacular-fashion' }],
        locations: [{ id: 'westminster', title: 'Westminster', coordinate: [-0.1246, 51.5007], certainty: 'established', sources: [] }, { id: 'tower', title: 'Tower Bridge', coordinate: [-0.0754, 51.5055], certainty: 'established', sources: [] }, { id: 'stadium', title: 'Olympic Stadium · Stratford', coordinate: stadium, certainty: 'established', sources: ['ceremony'] }],
        routes: [{ id: 'illustrative-relay', coordinates: route, certainty: 'illustrative', sources: [], time: july }],
        overlays: [{ id: 'intro', type: 'caption', title: 'Britain · July 2012', text: 'A city prepares to welcome the world. Travel into London, then east towards the Olympic Park.' }, { id: 'context', type: 'caption', title: 'London, on the world stage', text: 'The city hosted the 2012 Summer Games. These landmark markers locate our journey; the map is geographic context, not a reconstruction of 2012.', sources: ['ceremony'] }, { id: 'westminster', type: 'point', location: 'westminster' }, { id: 'tower', type: 'point', location: 'tower' }, { id: 'route', type: 'route', route: 'illustrative-relay' }, { id: 'relay', type: 'card', title: 'The road to the flame', text: 'The Olympic flame travelled around the UK before reaching the opening ceremony. This central London line is an illustrative camera-testing route, not the documented torch relay.', sources: ['ioc'] }, { id: 'destination', type: 'point', location: 'stadium' }, { id: 'park', type: 'caption', title: 'East to Stratford', text: 'Our camera crosses east London towards the Olympic Stadium and its surrounding park. No detailed historical London scene is loaded.' }, { id: 'ceremony', type: 'card', title: '27 July 2012 · Opening ceremony', text: 'The London Games opened at the Olympic Stadium with a ceremony directed by Danny Boyle. The stadium marker is approximate; present-day geography is not an exact 2012 reconstruction.', sources: ['ceremony'] }, { id: 'explore', type: 'caption', title: 'London is yours to explore', text: 'The guided journey is complete. Pan, zoom or change the timeline. Replay whenever you wish.' }],
    },
    beats: [
        beat('arrival', 'Arrival in Britain', { type: 'flyTo', center: [-2, 54], zoom: 5.4, pitch: 12, bearing: 0, duration: 10000 }, ['intro']),
        beat('london', 'London overview', { type: 'flyTo', center: [-0.116, 51.507], zoom: 12, pitch: 36, bearing: 0, duration: 10000 }, ['context', 'westminster', 'tower']),
        beat('relay', 'An illustrative torch journey', { type: 'followRoute', route: 'illustrative-relay', zoom: 14.3, pitch: 48, duration: 22000 }, ['relay', 'route', 'tower']),
        beat('park', 'Journey to Olympic Park', { type: 'flyTo', center: stadium, zoom: 14.5, pitch: 48, bearing: -25, duration: 12000 }, ['park', 'destination']),
        beat('ceremony', 'The opening ceremony', { type: 'orbit', center: stadium, zoom: 15.5, pitch: 52, degrees: 100, duration: 18000 }, ['ceremony', 'destination'], opening),
        { ...beat('explore', 'Continue exploring', { type: 'hold', duration: 4000 }, ['explore', 'destination'], opening), explorationPrompt: 'Explore London freely or replay the journey.' },
    ],
};
