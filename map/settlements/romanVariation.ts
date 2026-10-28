import { romanVariants } from "@/lib/assets/romanVariants";
import type { AssetId } from "@/lib/assets/registry";

export type RomanArchetype = "house" | "workshop" | "farmhouse";
export const romanVariantIds = Object.keys(romanVariants).map((name) => `roman-${name}` as AssetId);

/** Stable FNV sample; independent of camera, terrain, network completion and relocation. */
function sample(key: string): number {
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Weighted choices without replacement until the archetype's library is exhausted. */
export function selectRomanVariants(seed: number, archetypes: readonly RomanArchetype[]): AssetId[] {
  if (!Number.isSafeInteger(seed)) throw new Error("Settlement seed must be a safe integer");
  const used = new Set<string>();
  return archetypes.map((archetype, index) => {
    const pool = Object.entries(romanVariants).filter(([, v]) => v.archetype === archetype);
    if (!pool.length) throw new Error(`No Roman variants for ${archetype}`);
    if (pool.every(([name]) => used.has(name))) pool.forEach(([name]) => used.delete(name));
    const candidates = pool.filter(([name]) => !used.has(name));
    let cursor = sample(`${seed}:${archetype}:${index}`) * candidates.reduce((sum, [,v]) => sum + v.weight, 0);
    const choice = candidates.find(([,v]) => (cursor -= v.weight) < 0) ?? candidates[candidates.length - 1];
    used.add(choice[0]);
    return `roman-${choice[0]}` as AssetId;
  });
}
