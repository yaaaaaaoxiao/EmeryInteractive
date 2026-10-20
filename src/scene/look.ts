// How atoms and sites are shaded: a glossy clear-coated material lit by soft studio reflections.
// Every number that changes the look is here.

import * as THREE from 'three';

export const LOOK = {
  // 0 = mirror-like highlight, 1 = fully matte
  roughness: 0.3,
  // 0 = plastic/ceramic, 1 = metal (metal needs strong reflections to look right)
  metalness: 0,
  // a glossy lacquer layer on top of the colour (0 = none, 1 = full) and how sharp its highlight is
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  // strength of the soft studio reflections (0 = none)
  environment: 0.7,
  // keeps bright highlights from washing out while leaving the atom colours as they are
  toneMapping: THREE.NeutralToneMapping as THREE.ToneMapping,
  exposure: 1,
  // fill light from above/below, and the key light that follows the camera
  hemisphere: 0.6,
  key: 1.6,
};

export function makeMaterial(params: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    ...params,
    roughness: LOOK.roughness,
    metalness: LOOK.metalness,
    clearcoat: LOOK.clearcoat,
    clearcoatRoughness: LOOK.clearcoatRoughness,
  });
}
