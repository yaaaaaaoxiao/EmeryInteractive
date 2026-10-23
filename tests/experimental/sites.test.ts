// EXPERIMENTAL (src/experimental/sites.ts): interstitial sites found by computation, checked against the hand-made
// ones in src/crystal/structures.ts that the website uses.

import { describe, expect, it } from 'vitest';
import { orbit, siteInfo } from '../../src/crystal/lattice';
import { STRUCTURES, type Vec3 } from '../../src/crystal/structures';
import { type FoundSite, findSites } from '../../src/experimental/sites';

const key = (p: Vec3) => p.map((v) => v.toFixed(4)).join();
const summary = (sites: FoundSite[]) => sites.map((s) => [s.kind, s.shape, s.perCell, +s.ratio.toFixed(4)]);

describe('experimental: interstitial sites found by computation', () => {
  for (const structure of Object.values(STRUCTURES)) {
    it(`${structure.shortName}: finds every hand-made site, with the same count per cell and size`, () => {
      const found = findSites(structure);
      for (const site of structure.sites) {
        const equivalent = new Set(orbit(site.representative, structure.centering).map(key));
        const match = found.find((f) => equivalent.has(key(f.representative)));
        expect(match, site.name).toBeDefined();
        expect(match?.perCell).toBe(equivalent.size);
        expect(match?.ratio).toBeCloseTo(siteInfo(structure, site).ratio, 6);
        // the hand-made doorways are saddles: a window (doorway), or for BCC's octahedral site a gap between two atoms
        const kind = site.doorwayBetween ? (structure.id === 'bcc' && site.id === 'oct' ? 'gap' : 'doorway') : 'pocket';
        expect(match?.kind, site.name).toBe(kind);
      }
    });
  }

  it('FCC: exactly the octahedral and tetrahedral pockets and the triangular doorways', () => {
    expect(summary(findSites(STRUCTURES.fcc))).toEqual([
      ['pocket', 'octahedral', 4, 0.4142],
      ['pocket', 'tetrahedral', 8, 0.2247],
      ['doorway', 'triangular', 32, 0.1547],
    ]);
  });

  it('SC: exactly the cubic pocket and the square doorways', () => {
    expect(summary(findSites(STRUCTURES.sc))).toEqual([
      ['pocket', 'cubic', 1, 0.7321],
      ['doorway', 'square', 3, 0.4142],
    ]);
  });

  it('BCC: tetrahedral pockets, triangular doorways between them, and the octahedral site is a gap between two atoms', () => {
    const found = findSites(STRUCTURES.bcc);
    expect(summary(found)).toEqual([
      ['pocket', 'tetrahedral', 12, 0.291],
      // the window a small atom passes through hopping between neighbouring tetrahedral sites
      ['doorway', 'triangular', 24, 0.2247],
      ['gap', 'between two atoms', 6, 0.1547],
    ]);
    // a saddle between the 2 atoms at a/2; the textbook octahedron adds the 4 at a/√2
    const gap = found.find((f) => f.kind === 'gap');
    expect(gap?.shells.slice(0, 2).map((s) => [s.count, +s.distance.toFixed(4)])).toEqual([
      [2, 0.5],
      [4, 0.7071],
    ]);
  });

  it('every site found really has its nearest atoms all equally far, at R + r', () => {
    for (const structure of Object.values(STRUCTURES)) {
      for (const site of findSites(structure)) {
        expect(site.shells[0].distance).toBeCloseTo(structure.atomRadius + site.radius, 9);
      }
    }
  });
});
