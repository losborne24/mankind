// Phase 5C: puts accepted blueprint drafts into the app. Only drafts whose current content a named reviewer accepted are copied to
// lib/plan/accepted/blueprints.json (read by lib/plan/context.ts); each must still pass the contract and Checkpoint A against the
// golden set. A draft edited after review, or rejected, is left out. Prints what changed.
//   node scripts/research/publish-accepted.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const { acceptedBlueprints, reviews } = await mod('lib/ai/review');
const { goldenBlueprints } = await mod('lib/plan/golden/blueprints');
const { BlueprintStore } = await mod('lib/plan/store');
const { blueprintIssues } = await mod('lib/plan/checkpointA');
const { readAssetCatalogue } = await mod('lib/assets/catalogue');
const accepted = acceptedBlueprints().sort((a, b) => a.id.localeCompare(b.id)), store = new BlueprintStore([...goldenBlueprints(), ...accepted]), catalogue = readAssetCatalogue();
for (const b of accepted) {
  const errors = blueprintIssues(b, { store, catalogue }).filter(i => i.severity === 'error');
  if (errors.length) { console.error(`${b.id} fails Checkpoint A: ${errors.map(e => e.message).join(' ')}`); process.exit(1); }
}
const before = JSON.parse(readFileSync('lib/plan/accepted/blueprints.json', 'utf8')).map(b => b.id);
writeFileSync('lib/plan/accepted/blueprints.json', JSON.stringify(accepted, null, 1) + '\n');
const reviewers = id => [...new Set(reviews().filter(r => r.kind === 'blueprint' && `blueprint:${r.id}` === id && r.status === 'accepted').map(r => r.reviewer))].join(', ');
console.log(accepted.length ? accepted.map(b => `${before.includes(b.id) ? 'kept' : 'added'} ${b.id} (accepted by ${reviewers(b.id)})`).join('\n') : 'No accepted blueprint drafts.');
for (const id of before.filter(id => !accepted.some(b => b.id === id))) console.log(`removed ${id} (no longer accepted)`);
