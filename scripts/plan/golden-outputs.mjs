// The Forum Boarium and Rome AD 100 outputs Phase 5A must leave byte-for-byte unchanged: the fixtures the generators read, and what
// the generators and journey make from them. `--record` writes the digests (done once, before any Phase 5A change); otherwise prints them.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadTypescript } from '../lib/load-typescript.mjs';
const mod = async path => import(await loadTypescript(path));
const sha = text => createHash('sha256').update(text).digest('hex');
export const GOLDEN_FIXTURES = ['lib/scenarios/fixtures/forum-boarium-context.json', 'lib/scenarios/fixtures/forum-boarium-reconstruction.json',
  'lib/scenarios/fixtures/rome-ad100-landmarks.json', 'lib/scenarios/fixtures/rome-ad100-suburb-density.json', 'lib/scenarios/fixtures/rome-ad100-zoning.json',
  'lib/history/fixtures/forum-boarium.json', 'lib/history/fixtures/portunus.json'];
export async function goldenOutputs() {
  const { generateRomeFill } = await mod('lib/scenarios/romeFill');
  const { zoningFeatures } = await mod('lib/scenarios/zoning');
  const { zoningPlanSvg } = await mod('lib/scenarios/zoningPlan');
  const { landmarkPieces } = await mod('lib/scenarios/romeLandmarks');
  const { forumReconstruction, contextGroundFor } = await mod('lib/history/localContext');
  const { offsetCoordinate } = await mod('map/settlements/romanSettlement');
  const { portunusJourney } = await mod('lib/scenarios/portunus');
  const keepOut = forumReconstruction.objects.map(o => o.footprint.map(p => offsetCoordinate(forumReconstruction.origin, p)));
  const out = {};
  for (const path of GOLDEN_FIXTURES) out[path] = sha(await readFile(path));
  out['rome fill items'] = sha(JSON.stringify(generateRomeFill(keepOut).items));
  out['rome landmark pieces'] = sha(JSON.stringify(landmarkPieces(p => [p[0], p[1]], 100)));
  out['rome zoning features AD 100'] = sha(JSON.stringify(zoningFeatures({ start: { year: 100 } })));
  out['rome zoning plan svg AD 100'] = sha(zoningPlanSvg(100));
  out['forum reconstruction'] = sha(JSON.stringify(forumReconstruction));
  out['forum context ground'] = sha(JSON.stringify(contextGroundFor('layout:forum-boarium-temples', forumReconstruction.origin)));
  out['portunus journey'] = sha(JSON.stringify(portunusJourney));
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await goldenOutputs();
  if (process.argv[2] === '--record') await writeFile('lib/plan/golden/outputs.json', JSON.stringify({ recordedAt: 'v5.21.1 (ff1a51b), before Phase 5A', digests: out }, null, 2) + '\n');
  console.log(out);
}
