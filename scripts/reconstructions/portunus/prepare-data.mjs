import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
const model = await readFile('public/assets/reconstructions/portunus/portunus-v1.glb');
const gltf = await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength), '');
const bounds = new THREE.Box3().setFromObject(gltf.scene); let triangles = 0, meshes = 0;
gltf.scene.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
const sources = [
  { id: 'source:psu-fletcher', title: 'Fletcher 1921, p.105 · Portunus plan and elevations', publisher: 'Penn State University Libraries · courtesy Allan Kohl', url: 'https://www.flickr.com/photos/psulibscollections/5832798550/', accessed: '2026-10-30', citation: 'WB2007-0510. Historic illustration visually reviewed at linked larger resolution. Holder declares public-domain use; reconstruction drawings are interpretive. No image pixels used in model materials.' },
  { id: 'source:rome-heritage', title: 'Tempio di Portunus · heritage authority', publisher: 'Soprintendenza Speciale Archeologia Belle Arti e Paesaggio di Roma', url: 'https://soprintendenzaspecialeroma.it/luoghi/tempio-di-portunus/', accessed: '2026-10-30', citation: 'Direct text review: identity, Ionic order, frontal columns, structural materials and Republican rebuilding context. No images copied.' },
  { id: 'source:rome-tourism', title: 'Temple of Portunus · city location and description', publisher: 'Roma Capitale · Turismo Roma', url: 'https://www.turismoroma.it/en/places/temple-portunus', accessed: '2026-10-30', citation: 'Direct text review: geographic POINT, high podium, steps and side-column description. Point is a visitor location, not a surveyed model anchor.' },
];
const period = { start: { year: 100 }, approximate: true };
const entry = { id: 'catalogue:portunus-exterior', version: 1, title: 'Temple of Portunus · Fletcher-based exterior interpretation', placeId: 'place:temple-of-portunus', category: 'building', period, sources,
  features: [
    { title: 'Ionic exterior and four-column front', certainty: 'documented', sourceIds: ['source:rome-heritage', 'source:rome-tourism'], note: 'Building-specific structural arrangement; simplified capital geometry is interpretive.' },
    { title: 'Dimensional scaffold', certainty: 'inferred', sourceIds: ['source:psu-fletcher'], note: 'Transcribed printed feet converted to metres; diagram-derived width/depth breakdown and proportions are not modern survey measurements.' },
    { title: 'Podium, cella, engaged columns and pediments', certainty: 'inferred', sourceIds: ['source:psu-fletcher', 'source:rome-heritage'], note: 'Authored from the historic plan/elevations; wall thickness, spacing and mouldings are simplified approximations.' },
    { title: 'Roof, stairs, capitals and finishes', certainty: 'inferred', sourceIds: ['source:psu-fletcher'], note: 'Roof form follows the drawing. Tile pattern, step count, volutes and neutral/terracotta colours are modelling conventions, not verified ancient details.' },
    { title: 'Location, orientation and grounding', certainty: 'inferred', sourceIds: ['source:rome-tourism'], note: 'City visitor point used for discovery. Approximate north-facing pose and terrain contacts are display inferences, not surveyed alignment.' },
    { title: 'Classical preview context', certainty: 'inferred', sourceIds: ['source:psu-fletcher', 'source:rome-heritage'], note: 'AD 100 is an editorial preview year, not a construction date or an exact source-attested snapshot. Temporal uncertainty is retained and explicit interpretation selection is required.' },
  ],
  limitations: ['Exterior interpretation from a historic reconstruction drawing, not certified archaeological restitution.', 'Interior, cult furnishings, sculpture and original polychromy are omitted.', 'Grounding, roof covering and ornamental detail remain inferred.'],
  rights: { status: 'cleared', title: 'Project-authored model; repository terms apply', provenancePath: 'reconstructions/portunus/PROVENANCE.md', attribution: 'Mankind geometry; reference: Banister Fletcher (1921), p.105, via Penn State University Libraries / Allan Kohl.', note: 'No imported mesh or image textures. Historic drawing is designated public domain by its holder. This record does not grant a new public licence for the project.' },
  rendering: { registryId: 'portunus-exterior-v1', sha256: createHash('sha256').update(model).digest('hex') } };
await save('data/history/portunus/asset-v1.json', entry);
await save('data/history/portunus/review-v1.json', { status: 'usable', at: '2026-10-30', reviewer: 'Codex · source and technical review', note: 'Usable as an evidence-labelled exterior interpretation, with inferred dimensions/details and uncertain preview date retained. Not an expert-certified survey reconstruction. Model frame, source provenance and file integrity reviewed.' });
const evidence = (certainty, sourceIds, note) => ({ certainty, sources: sourceIds, note });
const world = { version: 1, id: 'world:portunus-exterior-v1', title: 'Temple of Portunus · classical exterior interpretation', coordinateSystem: 'WGS84', calendar: 'proleptic-gregorian', sources,
  places: [{ id: entry.placeId, title: 'Temple of Portunus', kind: 'landmark', radiusMeters: 35,
    position: { coordinate: [12.480893167165, 41.889289401004], evidence: evidence('inferred', ['source:rome-tourism'], 'City visitor point adopted as a model discovery anchor, with unquantified positional accuracy. Not a surveyed footprint.') },
    evidence: evidence('documented', ['source:rome-heritage'], 'Named Roman temple. No full lifespan or unchanged appearance is encoded.') }],
  assets: [{ id: 'asset:portunus-exterior', category: 'building', catalogueRef: { id: entry.id, version: 1 }, evidence: evidence('inferred', ['source:psu-fletcher', 'source:rome-heritage'], 'Specific exterior model derived from historic illustration and official structural descriptions. Inferred detail is documented in the pinned catalogue version.') }],
  layouts: [{ id: 'layout:portunus-classical', title: 'Classical exterior interpretation · editorial AD 100 preview', placeId: entry.placeId, period, frame: 'local-east-south-metres', extentMeters: 50, maxFoundationRiseMeters: 4,
    buildings: [{ id: 'building:portunus', assetId: 'asset:portunus-exterior', offset: [0, 0], headingRadians: Math.PI, evidence: evidence('inferred', ['source:rome-tourism', 'source:psu-fletcher'], 'One temple at visitor anchor. North-facing pose is approximate; no georeferenced wall survey was supplied.') }],
    evidence: evidence('inferred', ['source:psu-fletcher', 'source:rome-heritage'], 'User-selectable classical interpretation. Preview date is editorial, not a precise historical state. Extent/foundation rise are renderer limits, not archaeological dimensions.') }],
  scenes: [{ id: 'scene:portunus-exterior', title: 'Portunus exterior interpretation', description: 'An explicitly selected, evidence-labelled exterior model. No reconstructed neighbourhood or population.', placeId: entry.placeId, period, layoutIds: ['layout:portunus-classical'], assetIds: ['asset:portunus-exterior'], required: false, fallback: 'map-only', evidence: evidence('illustrative', [], 'Presentation requirement. A usable model does not make inferred dates or features exact.') }],
  roadNetworks: [], events: [], routes: [] };
await save('lib/history/fixtures/portunus.json', world);
await save('data/history/portunus/source/manifest.json', { drawingURL: 'https://live.staticflickr.com/5301/5832798550_2dcb27e276_b.jpg', drawingSHA256: createHash('sha256').update(await readFile('data/history/portunus/source/fletcher-1921-portunus.jpg')).digest('hex'), holderRecord: sources[0].url, modelSHA256: entry.rendering.sha256, bytes: model.length, dimensionsMeters: bounds.getSize(new THREE.Vector3()).toArray(), meshes, triangles, accessed: '2026-10-30', method: 'Project-authored Blender exterior after historic interpretation; no mesh/pixel imports.' });
console.log(JSON.stringify({ bytes: model.length, triangles, meshes, sha256: entry.rendering.sha256 }));
