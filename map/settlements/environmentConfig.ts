/** Metres in displayed terrain space. Art tuning, independent of architectural style. */
export const settlementEnvironmentConfig = {
  seatingClearance: 0.015,
  wallWearMeters: 0.85,
  entranceRadiusMeters: 1.45,
  trafficFalloffMeters: 2.4,
  trackGaugeMeters: 1.35,
  trackWidthMeters: 0.16,
  maxWallPlants: 28,
} as const;
