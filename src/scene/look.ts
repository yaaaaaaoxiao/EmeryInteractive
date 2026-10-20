// How atoms and sites are shaded. Two looks: the default glossy one, and a simpler, faster one for
// older or slower computers ("Performance mode"). Every number that changes the look is here.

import * as THREE from 'three';

export type Graphics = 'quality' | 'performance';

export interface Look {
  // 0 = mirror-like highlight, 1 = fully matte
  roughness: number;
  // 0 = plastic/ceramic, 1 = metal (metal needs strong reflections to look right)
  metalness: number;
  // a glossy lacquer layer on top of the colour (0 = none, 1 = full) and how sharp its highlight is;
  // with 0 the cheaper MeshStandardMaterial is used
  clearcoat: number;
  clearcoatRoughness: number;
  // strength of the soft studio reflections (0 = none, and nothing is computed for them)
  environment: number;
  // NeutralToneMapping keeps bright highlights from washing out while leaving the atom colours as they are
  toneMapping: THREE.ToneMapping;
  exposure: number;
  // fill light from above/below, and the key light that follows the camera
  hemisphere: number;
  key: number;
}

export const LOOKS: Record<Graphics, Look> = {
  // glossy, clear-coated, with studio reflections
  quality: {
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    environment: 0.7,
    toneMapping: THREE.NeutralToneMapping,
    exposure: 1,
    hemisphere: 0.6,
    key: 1.6,
  },
  // the original matte look: plain lights, no reflections, cheapest shading
  performance: {
    roughness: 0.45,
    metalness: 0.05,
    clearcoat: 0,
    clearcoatRoughness: 0,
    environment: 0,
    toneMapping: THREE.NoToneMapping,
    exposure: 1,
    hemisphere: 1.6,
    key: 2.2,
  },
};

export function makeMaterial(look: Look, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const shading = { roughness: look.roughness, metalness: look.metalness };
  if (look.clearcoat > 0) {
    return new THREE.MeshPhysicalMaterial({
      ...params,
      ...shading,
      clearcoat: look.clearcoat,
      clearcoatRoughness: look.clearcoatRoughness,
    });
  }
  return new THREE.MeshStandardMaterial({ ...params, ...shading });
}

//////////////// remembered per device (not part of shared links)

const STORAGE_KEY = 'crystalview.graphics';

export function savedGraphics(): Graphics {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'performance' ? 'performance' : 'quality';
  } catch {
    return 'quality';
  }
}

export function saveGraphics(graphics: Graphics): void {
  try {
    localStorage.setItem(STORAGE_KEY, graphics);
  } catch {
    // private browsing or blocked storage: the choice just isn't remembered
  }
}
