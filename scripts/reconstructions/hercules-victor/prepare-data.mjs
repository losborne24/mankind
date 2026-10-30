import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
const model = await readFile('public/assets/reconstructions/hercules-victor/hercules-victor-v1.glb');
const gltf = await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength), '');
const bounds = new THREE.Box3().setFromObject(gltf.scene); let triangles = 0, meshes = 0;
gltf.scene.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
const sources = [
  { id: 'source:wikipedia-hercules', title: 'Temple of Hercules Victor · Wikipedia', publisher: 'Wikipedia (citing Loar 2017)', url: 'https://en.wikipedia.org/wiki/Temple_of_Hercules_Victor', accessed: '2026-10-30', citation: 'Direct text review: peripteral tholos, 20 Corinthian columns (19 survive), 14.8 m overall diameter, column height 10.65 m, later 2nd c. BC date, point coordinate 41.88861 N 12.48083 E (rounded). Secondary source; figures corroborated by World History Encyclopedia.' },
  { id: 'source:whe-hercules', title: 'Temple of Vesta/Hercules, Rome · World History Encyclopedia', publisher: 'World History Encyclopedia', url: 'https://www.worldhistory.org/article/625/temple-of-vestahercules-rome/', accessed: '2026-10-30', citation: 'Direct text review: five-step tufa base, Pentelic marble, 1st c. AD column replacements, dimensions agreeing with Wikipedia.' },
  { id: 'source:palladio-1570', title: "Palladio, I quattro libri dell'architettura (1570), Book IV ch. XIV, p. 90-91", publisher: 'Getty Research Institute via Internet Archive', url: 'https://archive.org/details/qvattrolibridel00pall/', accessed: '2026-10-30', citation: 'Public domain by age; the scan carries no stated licence. Plan ratios measured by eye (cella/colonnade ~0.645, wall ~0.073); Palladio draws about 12 columns, not 20, and a dome; both rejected. No image pixels used.' },
];
const period = { start: { year: 100 }, approximate: true };
const entry = { id: 'catalogue:hercules-victor-exterior', version: 1, title: 'Temple of Hercules Victor · exterior interpretation', placeId: 'place:temple-of-hercules-victor', category: 'building', period, sources,
  features: [
    { title: 'Circular peripteral plan with 20 Corinthian columns', certainty: 'documented', sourceIds: ['source:wikipedia-hercules', 'source:whe-hercules'], note: 'Standing building; two independent secondary sources agree. Capital detail is simplified.' },
    { title: 'Overall diameter 14.8 m and column height 10.65 m', certainty: 'documented', sourceIds: ['source:wikipedia-hercules', 'source:whe-hercules'], note: 'Whether 14.8 m is measured at stylobate or colonnade edge is not stated; modelled as the stylobate top.' },
    { title: 'Five-step tufa base', certainty: 'documented', sourceIds: ['source:whe-hercules'], note: 'Step count single-source; rise and tread are inferred.' },
    { title: 'Cella size, wall thickness and column spacing', certainty: 'inferred', sourceIds: ['source:palladio-1570', 'source:wikipedia-hercules'], note: 'Ratios measured from Palladio plan (cella 0.645 of colonnade). His text implies 10.65 m cella diameter; the plan implies 9.55 m. Plan value used. Palladio shows ~12 columns; the 20 of the standing building are used.' },
    { title: 'Entablature and conical tiled roof', certainty: 'inferred', sourceIds: ['source:palladio-1570'], note: 'Both lost. Palladio drew a dome, now considered mistaken. A low conical tiled roof over a plain entablature is a modelling convention.' },
    { title: 'Door size, orientation and finishes', certainty: 'inferred', sourceIds: ['source:palladio-1570'], note: 'Not stated in sources. Medieval windows and brick upper wall are omitted; the Luna-marble column replacements are not modelled.' },
    { title: 'Classical preview context', certainty: 'inferred', sourceIds: ['source:wikipedia-hercules'], note: 'AD 100 is an editorial preview year. All 20 columns stood by then, since the 1st-century replacements predate it.' },
  ],
  limitations: ['Exterior interpretation from secondary-source dimensions and a Renaissance plan, not an archaeological restitution.', 'Interior, cult statue and sculpture are omitted.', 'Roof, entablature and cella proportions remain inferred.'],
  rights: { status: 'cleared', title: 'Project-authored model; repository terms apply', provenancePath: 'reconstructions/hercules-victor/PROVENANCE.md', attribution: 'Mankind geometry; plan ratios after Palladio (1570), via Getty Research Institute / Internet Archive.', note: 'No imported mesh or image textures. Palladio plate public domain by age; scan licence unstated, so measurements only. No new public licence is granted.' },
  rendering: { registryId: 'hercules-victor-exterior-v1', sha256: createHash('sha256').update(model).digest('hex') } };
await save('data/history/hercules-victor/asset-v1.json', entry);
await save('data/history/hercules-victor/review-v1.json', { status: 'usable', at: '2026-10-30', reviewer: 'Claude Code · source and technical review', note: 'Usable as an evidence-labelled exterior interpretation with inferred cella, roof and door. Not expert-certified. Rendered QA image reviewed; point location is a rounded secondary-source coordinate.' });
console.log(JSON.stringify({ bytes: model.length, triangles, meshes, size: bounds.getSize(new THREE.Vector3()).toArray(), min: bounds.min.toArray(), max: bounds.max.toArray(), sha256: entry.rendering.sha256 }));
