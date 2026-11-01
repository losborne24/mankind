/**
 * Procedural generators a blueprint may reference, with the version and the digest of the output that version gives for the golden
 * inputs. scripts/check-plan-golden.mjs reruns each one: a rule change that alters the output without a version bump fails the gate,
 * so selective invalidation can trust the version to say when a generated layer is stale.
 */
export const GENERATORS = {
  'rome-fill': {
    version: '1',
    module: 'lib/scenarios/romeFill.ts (generateRomeFill)',
    rules: 'scripts/context/rome/FILL.md',
    /** SHA-256 of JSON.stringify(generateRomeFill(keepOut).items), keepOut = the Forum Boarium neighbourhood footprints. */
    outputDigest: '46d790eff8de4bcb4750e2b86a1c895bfbe248aac3ad3855bdbcf83d72c63d41',
  },
} as const;
export type GeneratorId = keyof typeof GENERATORS;
export const generatorVersions = (): Record<string, string> => Object.fromEntries(Object.entries(GENERATORS).map(([id, g]) => [id, g.version]));

/**
 * Reusable by tradition, never by place: rules and kits a place without a layout may borrow. A typology carries no street, lot or
 * landmark position from the place it was developed at.
 */
export const TYPOLOGIES = {
  roman: {
    rules: ['Zoned fill rules (scripts/context/rome/FILL.md): block grid, courtyard lots, density by housing class', 'Procedural settlement profiles: hamlet, village, small town (map/settlements/proceduralSettlement.ts)'],
    kits: ['roman-kit (public/assets/roman-kit): provincial house, taberna, villa, temple, aqueduct and variants', 'Landmark massing kit shapes (lib/scenarios/romeLandmarks.ts): temple, basilica, precinct, theatre, amphitheatre, baths'],
    /** The kit was built from Roman Republican and imperial forms (200 BCE–400 CE, astronomical years); a request outside this is not given the typology. */
    period: { start: { year: -199 }, end: { year: 400 } },
  },
} as const;
