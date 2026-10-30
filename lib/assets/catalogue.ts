import stored from '@/lib/assets/catalogue.json';
import { validateAssetCatalogue } from '@/lib/assets/catalogueValidation';

const catalogue = validateAssetCatalogue(stored);
/** Persistent source-controlled snapshot. Callers receive detached metadata, never mutable shared state. */
export function readAssetCatalogue() { return structuredClone(catalogue); }
