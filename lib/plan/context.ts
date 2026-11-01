import { readAssetCatalogue } from '@/lib/assets/catalogue';
import { goldenBlueprints } from '@/lib/plan/golden/blueprints';
import type { PlanningContext } from '@/lib/plan/planner';
import { BlueprintStore } from '@/lib/plan/store';
import accepted from '@/lib/plan/accepted/blueprints.json';
import type { SpatialBlueprint } from '@/lib/plan/contracts';

let shared: PlanningContext | undefined;
/**
 * The app's planning context: the golden blueprints, the blueprint drafts a reviewer accepted (published by
 * scripts/research/publish-accepted.mjs), and the compiled catalogue, built once. Each is validated as it is registered.
 */
export function defaultPlanningContext(): PlanningContext {
  shared ??= { store: new BlueprintStore([...goldenBlueprints(), ...(accepted as unknown as SpatialBlueprint[])]), catalogue: readAssetCatalogue() };
  return shared;
}
