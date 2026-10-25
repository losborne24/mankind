/**
 * Lazy regional geography (Natural Earth 1:10 m land).
 *
 * The base style ships only the 1:50 m land (~573 KB gz) so the globe starts
 * fast. The finer 1:10 m land (~5.0 MB gz) is worth its weight only once the
 * user zooms into a regional view, so we add its source + layers the first time
 * the camera crosses {@link PREFETCH_ZOOM} — and never for a user who stays at a
 * continental view. MapLibre fetches a GeoJSON source's `data` when the source
 * is added, so *adding late is what defers the download*; the browser then
 * caches the static file, and the source is created only once per session.
 *
 * Handoff without blank land or coastline wedges
 * ──────────────────────────────────────────────
 * The 1:50 m layers initially render at every camera zoom. We gate
 * them at {@link REGIONAL_ZOOM} only once the 1:10 m data has actually finished
 * loading and is ready to render. That matters in two directions:
 *
 *   • Before the data is ready, the 1:50 m layers still render at zoom ≥5, so
 *     land never goes blank during a delayed load or a rapid zoom-in.
 *   • The moment the data is ready we switch the 1:50 m layers in a single step,
 *     so the two scales meet at REGIONAL_ZOOM without overlapping. The coarser
 *     simplified 1:50 m fill can therefore never poke out from under the finer
 *     1:10 m fill as a straight-edged wedge, and the fill and coastline always
 *     switch resolution together.
 */

import type { Map as MaplibreMap, MapSourceDataEvent } from "maplibre-gl";
import {
  GEO_ATTRIBUTION,
  GEO_DATA,
  GEO_IDS,
  palette,
  REGIONAL_ZOOM,
} from "@/map/mapStyle";
import { CoastlineLayer } from "@/map/coastlineLayer";
import { TERRAIN_IDS } from "@/map/terrain";
import { FIRST_ENVIRONMENT_LAYER } from "@/map/environment/renderer";

/**
 * Start fetching the 1:10 m data a little before {@link REGIONAL_ZOOM} so it is
 * usually ready by the time the camera reaches the handoff, even on a fast
 * zoom-in. Chosen deliberately (not derived) so the prefetch lead can be tuned
 * independently of the handoff zoom.
 */
export const PREFETCH_ZOOM = 4.25;

/** Gate the 1:50 m fill + coastline + ocean mask at REGIONAL_ZOOM so the 1:10 m
 * data owns the close-up view. Runs once, only after the 1:10 m source is ready
 * to render. */
function handOffToRegional(map: MaplibreMap): void {
  // Land, water and coastline switch together at the same camera zoom so
  // coarse geometry never spills beyond the finer coastline.
  // Fill layer zoom ranges also control worker bucket creation. A tilted globe
  // mixes tile zooms within one viewport, so minzoom=5 drops the regional fill
  // from distant z4 tiles even when the camera is above zoom 5. Use camera-zoom
  // paint expressions instead: both resolutions retain geometry at every tile
  // zoom, but only one resolution paints the whole viewport at a time.
  for (const id of [GEO_IDS.landFill50, GEO_IDS.oceanFill50]) {
    map.setPaintProperty(id, "fill-opacity-transition", { duration: 0, delay: 0 });
    map.setPaintProperty(id, "fill-opacity", ["step", ["zoom"], 1, REGIONAL_ZOOM, 0]);
  }
  // The custom coastline has no worker buckets; its zoom range is camera-only.
  map.setLayerZoomRange(GEO_IDS.coast50, 0, REGIONAL_ZOOM);
}

/**
 * Add the 1:10 m source + layers once, then gate the 1:50 m layers as soon as the
 * source has loaded. Safe to call repeatedly. Returns a disposer that detaches
 * the source-loaded listener if the handoff has not happened yet.
 */
function installRegionalGeo(map: MaplibreMap): () => void {
  if (map.getSource(GEO_IDS.land10)) return () => {};

  map.addSource(GEO_IDS.land10, {
    type: "geojson",
    data: GEO_DATA.land10,
    attribution: GEO_ATTRIBUTION,
  });

  // Finer land fill, inserted beneath the stylised relief so it sits above the
  // 1:50 m fill (covering it during the brief ready-but-not-yet-capped frame)
  // while the relief, ocean fill and graticule stay on top. Were it
  // inserted above the relief it would paint over the terrain at regional zoom,
  // flattening exactly the view where the relief matters most. A paint
  // expression gates the handoff without discarding distant low-zoom buckets.
  map.addLayer(
    {
      id: GEO_IDS.landFill10,
      type: "fill",
      source: GEO_IDS.land10,
      paint: {
        "fill-color": palette.land,
        "fill-opacity": ["step", ["zoom"], 0, REGIONAL_ZOOM, 1],
        "fill-opacity-transition": { duration: 0, delay: 0 },
        "fill-antialias": false,
      },
    },
    // Keep the regional base beneath environmental surfaces as well as relief.
    map.getLayer(FIRST_ENVIRONMENT_LAYER) ? FIRST_ENVIRONMENT_LAYER : TERRAIN_IDS.relief,
  );

  // Finer ocean mask, taking over exactly where the 1:50 m one is capped.
  // Inserted BELOW the graticule so it masks the terrain relief but never paints
  // over the graticule, mirroring the 1:50 m ocean fill's slot in the base style.
  // Its edge against the land fill IS the coast.
  map.addSource(GEO_IDS.ocean10, {
    type: "geojson",
    data: GEO_DATA.ocean10,
    attribution: GEO_ATTRIBUTION,
  });
  map.addLayer(
    {
      id: GEO_IDS.oceanFill10,
      type: "fill",
      source: GEO_IDS.ocean10,
      paint: {
        "fill-color": palette.ocean,
        "fill-opacity": ["step", ["zoom"], 0, REGIONAL_ZOOM, 1],
        "fill-opacity-transition": { duration: 0, delay: 0 },
        "fill-antialias": false,
      },
    },
    GEO_IDS.graticule,
  );

  // Read the fill's exact polygon edges but draw outside the terrain drape.
  const coast = new CoastlineLayer(
    GEO_IDS.coast10, GEO_IDS.land10, palette.coastline, REGIONAL_ZOOM,
    () => doHandoff(),
  );
  map.addLayer(coast);

  // Until both sources and the independent coastline are ready, keep all fine layers hidden. A
  // partly loaded ocean mask would expose global DEM shading over water, and
  // overlapping coarse/fine polygons can leave wedges at the coast.
  const regionalLayers = [GEO_IDS.landFill10, GEO_IDS.oceanFill10, GEO_IDS.coast10];
  for (const id of regionalLayers) map.setLayoutProperty(id, "visibility", "none");

  let handedOff = false;
  let disposed = false;
  const doHandoff = () => {
    if (disposed || handedOff || !coast.ready) return;
    if (!map.isSourceLoaded(GEO_IDS.land10) || !map.isSourceLoaded(GEO_IDS.ocean10)) return;
    handedOff = true;
    map.off("sourcedata", onSourceData);
    const visibility = map.getLayoutProperty(GEO_IDS.landFill50, "visibility") === "none"
      ? "none" : "visible";
    for (const id of regionalLayers) map.setLayoutProperty(id, "visibility", visibility);
    handOffToRegional(map);
  };

  const onSourceData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== GEO_IDS.land10 && e.sourceId !== GEO_IDS.ocean10) return;
    doHandoff();
  };

  // A fresh GeoJSON source is never already loaded, but a browser-cached file
  // can resolve so fast the first `sourcedata` arrives before we attach — guard
  // by checking the current state too.
  map.on("sourcedata", onSourceData);
  doHandoff();

  return () => {
    disposed = true;
    map.off("sourcedata", onSourceData);
  };
}

/**
 * Watch the camera and install the regional data the first time it is needed.
 * Returns a disposer that detaches all listeners (idempotent). If the camera is
 * already zoomed in at call time, the data is installed immediately.
 */
export function watchRegionalGeo(map: MaplibreMap): () => void {
  let installed = false;
  let disposeInstall: (() => void) | null = null;

  const maybeInstall = () => {
    if (installed) return;
    if (map.getZoom() < PREFETCH_ZOOM) return;
    installed = true;
    map.off("zoom", maybeInstall);
    disposeInstall = installRegionalGeo(map);
  };

  map.on("zoom", maybeInstall);
  maybeInstall(); // Handle a deep-linked / restored camera already zoomed in.

  return () => {
    map.off("zoom", maybeInstall);
    disposeInstall?.();
  };
}
