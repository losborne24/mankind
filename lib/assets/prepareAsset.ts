import * as THREE from "three";
import type { AssetDefinition } from "@/lib/assets/registry";

/** Correct orientation/scale first, then centre X/Z and put the bounding base on Y=0. */
export function prepareAsset(model: THREE.Object3D, asset: AssetDefinition, heading = 0): THREE.Group {
  const corrected = new THREE.Group();
  corrected.add(model);
  corrected.scale.setScalar(asset.scale);
  if (asset.orientationRadians) corrected.rotation.set(...asset.orientationRadians);
  corrected.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(corrected);
  if (bounds.isEmpty() || !Number.isFinite(bounds.min.y)) throw new Error(`Empty model: ${asset.id}`);
  corrected.position.set(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y + asset.groundOffsetMeters,
    -(bounds.min.z + bounds.max.z) / 2,
  );
  const root = new THREE.Group();
  root.rotation.y = heading;
  root.add(corrected);
  return root;
}
