import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import { globeSurfaceFrame, lngLatToUnitSphere, metersToGlobeUnits } from "@/lib/geo";

/** +X east, +Y up, +Z south, metres. Same frame as the original Giza beacon. */
export function geographicAnchor(lngLat: readonly [number, number], altitudeMeters: number) {
  const [lng, lat] = lngLat;
  const frame = globeSurfaceFrame(lng, lat);
  const radius = 1 + metersToGlobeUnits(altitudeMeters);
  const globeScale = metersToGlobeUnits(1);
  const globe = new THREE.Matrix4()
    .makeBasis(new THREE.Vector3(...frame.xAxis), new THREE.Vector3(...frame.up), new THREE.Vector3(...frame.zAxis))
    .scale(new THREE.Vector3(globeScale, globeScale, globeScale))
    .setPosition(...frame.position.map((v) => v * radius) as [number, number, number]);
  const mc = MercatorCoordinate.fromLngLat({ lng, lat }, altitudeMeters);
  const mercatorScale = mc.meterInMercatorCoordinateUnits();
  // Mercator Y grows southward. This basis deliberately reflects handedness;
  // Three handles the negative determinant when selecting mesh face winding.
  const mercator = new THREE.Matrix4()
    .makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
    .scale(new THREE.Vector3(mercatorScale, mercatorScale, mercatorScale))
    .setPosition(mc.x, mc.y, mc.z);
  return { globe, mercator, sphere: lngLatToUnitSphere(lng, lat) };
}
