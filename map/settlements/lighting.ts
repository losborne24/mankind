import * as THREE from "three";

/**
 * One late-afternoon sun for the whole local scene, in the settlement frame
 * (+x east, +y up, +z south). Low and warm: it comes from the west-south-west
 * about 25° above the horizon, so shadows are long and soft-edged. This is an
 * art direction for a pleasant, readable scene, not an astronomical claim.
 */
export const SUN_DIRECTION = new THREE.Vector3(-0.72, 0.43, 0.54).normalize();
export const SUN_COLOUR = 0xffe3c2;
export const SKY_COLOUR = 0xc9d6e4;
export const GROUND_BOUNCE_COLOUR = 0x9a8662;
export const HAZE_COLOUR = 0xd9cdb4;
export const EXPOSURE = 1.12;
