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
 * The 1:50 m fill and coastline are left UNCAPPED in the base style. We cap
 * them at {@link REGIONAL_ZOOM} only once the 1:10 m data has actually finished
 * loading and is ready to render. That matters in two directions:
 *
 *   • Before the data is ready, the 1:50 m layers still render at zoom ≥5, so
 *     land never goes blank during a delayed load or a rapid zoom-in.
 *   • The moment the data is ready we cap both 1:50 m layers in a single step,
 *     so the two scales meet at REGIONAL_ZOOM without overlapping. The coarser
 *     simplified 1:50 m fill can therefore never poke out from under the finer
 *     1:10 m fill as a straight-edged wedge, and the fill and coastline always
 *     switch resolution together.
 */

import type { Map as MaplibreMap, MapSourceDataEvent } from "maplibre-gl";
import {
  COASTLINE_WIDTH,
  GEO_ATTRIBUTION,
  GEO_DATA,
  GEO_IDS,
  palette,
  REGIONAL_ZOOM,
} from "@/map/mapStyle";
import { TERRAIN_IDS } from "@/map/terrain";

/**
 * Start fetching the 1:10 m data a little before {@link REGIONAL_ZOOM} so it is
 * usually ready by the time the camera reaches the handoff, even on a fast
 * zoom-in. Chosen deliberately (not derived) so the prefetch lead can be tuned
 * independently of the handoff zoom.
 */
export const PREFETCH_ZOOM = 4.25;

/** Cap the 1:50 m fill + coastline at REGIONAL_ZOOM so the 1:10 m data owns the
 * close-up view. Runs once, only after the 1:10 m source is ready to render. */
function handOffToRegional(map: MaplibreMap): void {
  // Both layers switch together: identical [0, REGIONAL_ZOOM] range.
  map.setLayerZoomRange(GEO_IDS.landFill50, 0, REGIONAL_ZOOM);
  map.setLayerZoomRange(GEO_IDS.coast50, 0, REGIONAL_ZOOM);
}

/**
 * Add the 1:10 m source + layers once, then cap the 1:50 m layers as soon as the
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
  // while the relief, graticule and both coastline strokes stay on top. Were it
  // inserted above the relief it would paint over the terrain at regional zoom,
  // flattening exactly the view where the relief matters most. minzoom
  // REGIONAL_ZOOM so it never renders below the handoff.
  map.addLayer(
    {
      id: GEO_IDS.landFill10,
      type: "fill",
      source: GEO_IDS.land10,
      minzoom: REGIONAL_ZOOM,
      paint: { "fill-color": palette.land, "fill-opacity": 0.92 },
    },
    TERRAIN_IDS.relief,
  );

  // Finer coastline, taking over exactly where the 1:50 m one is capped.
  map.addLayer({
    id: GEO_IDS.coast10,
    type: "line",
    source: GEO_IDS.land10,
    minzoom: REGIONAL_ZOOM,
    paint: {
      "line-color": palette.coastline,
      "line-width": COASTLINE_WIDTH,
      "line-opacity": 0.85,
    },
  });

  let handedOff = false;
  const doHandoff = () => {
    if (handedOff) return;
    handedOff = true;
    map.off("sourcedata", onSourceData);
    handOffToRegional(map);
  };

  const onSourceData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== GEO_IDS.land10) return;
    if (!map.isSourceLoaded(GEO_IDS.land10)) return;
    doHandoff();
  };

  // A fresh GeoJSON source is never already loaded, but a browser-cached file
  // can resolve so fast the first `sourcedata` arrives before we attach — guard
  // by checking the current state too.
  map.on("sourcedata", onSourceData);
  if (map.isSourceLoaded(GEO_IDS.land10)) doHandoff();

  return () => {
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
