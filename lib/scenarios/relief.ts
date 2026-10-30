/**
 * Local relief correction for the Forum Boarium journey. The global terrain source (Mapterhorn, sampled here at zoom 12) is a
 * 30 m-class elevation model that includes modern buildings: it shows about 30 m of rise from the Forum Boarium to the Palatine
 * where the hills rise about 40 m, and it smooths their shoulders. The journey therefore exaggerates relief by this factor, and
 * says so beside the legend. It changes display heights only; the buildings and ground follow the same exaggerated terrain.
 */
export const LOCAL_RELIEF_EXAGGERATION = 2;
/** Local hillshade strength while the correction is on (the global default is 0.25), so the exaggerated slopes also read in the regional view. */
export const LOCAL_RELIEF_HILLSHADE = 0.55;
export const DEFAULT_LOCAL_HILLSHADE = 0.25;
