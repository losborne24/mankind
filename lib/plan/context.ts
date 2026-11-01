import { readAssetCatalogue } from '@/lib/assets/catalogue';
import { goldenBlueprints } from '@/lib/plan/golden/blueprints';
import type { PlanningContext } from '@/lib/plan/planner';
import { BlueprintStore } from '@/lib/plan/store';

let shared: PlanningContext | undefined;
/** The app's planning context: the golden blueprints and the compiled catalogue, built once. */
export function defaultPlanningContext(): PlanningContext {
  shared ??= { store: new BlueprintStore(goldenBlueprints()), catalogue: readAssetCatalogue() };
  return shared;
}
