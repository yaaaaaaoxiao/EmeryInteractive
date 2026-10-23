// EXPERIMENTAL: crystals described as data for sites.ts (not used by the website). Each lists every atom in one
// cubic cell (positions in units of a) with a hard-sphere radius chosen so that neighbours touch.

import type { Structure, Vec3 } from '../crystal/structures';
import type { Crystal } from './sites';

const FCC: Vec3[] = [
  [0, 0, 0],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
];
const shift = (positions: Vec3[], by: Vec3): Vec3[] => positions.map((p) => p.map((v, i) => (v + by[i]) % 1) as Vec3);

// one of the website's structures (FCC, BCC, SC: one kind of atom on each lattice point)
export function crystalOf(structure: Structure): Crystal {
  return {
    name: structure.shortName,
    atoms: structure.centering.map((position) => ({ element: 'atom', position, radius: structure.atomRadius })),
  };
}

// Two ions that touch, sized in proportion to their Shannon ionic radii (Å, for the coordination they have in the
// crystal; Shannon 1976): radii in units of a that add up to `touching`.
function ionRadii(first: number, second: number, touching: number): [number, number] {
  const k = touching / (first + second);
  return [first * k, second * k];
}

// diamond (also Si, Ge): FCC plus a copy shifted a quarter of the body diagonal; neighbours touch along it
export const DIAMOND: Crystal = {
  name: 'Diamond',
  atoms: [...FCC, ...shift(FCC, [0.25, 0.25, 0.25])].map((position) => ({
    element: 'C',
    position,
    radius: Math.sqrt(3) / 8,
  })),
};

// cesium chloride: Cs at the corners, Cl at the body centre, touching along the body diagonal (Cs⁺ 1.74 Å with 8
// neighbours, Cl⁻ 1.81 Å)
const [CS, CL_8] = ionRadii(1.74, 1.81, Math.sqrt(3) / 2);
export const CSCL: Crystal = {
  name: 'CsCl',
  atoms: [
    { element: 'Cs', position: [0, 0, 0], radius: CS },
    { element: 'Cl', position: [0.5, 0.5, 0.5], radius: CL_8 },
  ],
};

// rock salt: Na on FCC, Cl on FCC shifted by half a cube edge, touching along the edges (Na⁺ 1.02 Å and Cl⁻ 1.81 Å,
// each with 6 neighbours)
const [NA, CL_6] = ionRadii(1.02, 1.81, 0.5);
export const NACL: Crystal = {
  name: 'NaCl',
  atoms: [
    ...FCC.map((position) => ({ element: 'Na', position, radius: NA })),
    ...shift(FCC, [0.5, 0, 0]).map((position) => ({ element: 'Cl', position, radius: CL_6 })),
  ],
};
