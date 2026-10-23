// EXPERIMENTAL (src/experimental/): interstitial sites found by computation, checked against the hand-made ones in
// src/crystal/structures.ts that the website uses, and against known values for crystals the website doesn't have.

import { describe, expect, it } from 'vitest';
import { orbit, siteInfo } from '../../src/crystal/lattice';
import { STRUCTURES, type Vec3 } from '../../src/crystal/structures';
import { CSCL, crystalOf, DIAMOND, NACL } from '../../src/experimental/crystals';
import { type Crystal, type FoundSite, findSites } from '../../src/experimental/sites';

const key = (p: Vec3) => p.map((v) => v.toFixed(4)).join();
const summary = (sites: FoundSite[]) => sites.map((s) => [s.kind, s.shape, s.perCell, +s.ratio.toFixed(4)]);
// a shell as [count, distance from the site's centre to those atoms' centres]
const centres = (site: FoundSite, radius: number) => site.shells.map((s) => [s.count, +(s.gap + radius).toFixed(4)]);

describe('experimental: the website’s crystals', () => {
  for (const structure of Object.values(STRUCTURES)) {
    it(`${structure.shortName}: finds every hand-made site, with the same count per cell and size`, () => {
      const found = findSites(crystalOf(structure));
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
    expect(summary(findSites(crystalOf(STRUCTURES.fcc)))).toEqual([
      ['pocket', 'octahedral', 4, 0.4142],
      ['pocket', 'tetrahedral', 8, 0.2247],
      ['doorway', 'triangular', 32, 0.1547],
    ]);
  });

  it('SC: exactly the cubic pocket and the square doorways', () => {
    expect(summary(findSites(crystalOf(STRUCTURES.sc)))).toEqual([
      ['pocket', 'cubic', 1, 0.7321],
      ['doorway', 'square', 3, 0.4142],
    ]);
  });

  it('BCC: tetrahedral pockets, triangular doorways between them, and the octahedral site is a gap between two atoms', () => {
    const found = findSites(crystalOf(STRUCTURES.bcc));
    expect(summary(found)).toEqual([
      ['pocket', 'tetrahedral', 12, 0.291],
      // the window a small atom passes through hopping between neighbouring tetrahedral sites
      ['doorway', 'triangular', 24, 0.2247],
      ['gap', 'between two atoms', 6, 0.1547],
    ]);
    // a saddle between the 2 atoms at a/2; the textbook octahedron adds the 4 at a/√2
    const gap = found.find((f) => f.kind === 'gap') as FoundSite;
    expect(centres(gap, STRUCTURES.bcc.atomRadius).slice(0, 2)).toEqual([
      [2, 0.5],
      [4, 0.7071],
    ]);
  });
});

describe('experimental: crystals the website doesn’t have', () => {
  it('diamond: the tetrahedral (T) site is as big as an atom; the ring centre (H) is a twisted-octahedron pocket', () => {
    const found = findSites(DIAMOND);
    expect(summary(found)).toEqual([
      ['pocket', 'tetrahedral', 8, 1],
      ['pocket', 'octahedral', 16, 0.9149],
      ['doorway', 'triangular', 32, 0.8856],
    ]);
    const R = Math.sqrt(3) / 8;
    // T: 4 atoms at the bond length √3/4 a, then 6 at a/2
    expect(centres(found[0], R).slice(0, 2)).toEqual([
      [4, +(Math.sqrt(3) / 4).toFixed(4)],
      [6, 0.5],
    ]);
    // H, the centre of a six-membered ring (puckered, so its atoms surround it like a twisted octahedron): √11/8 a
    expect(centres(found[1], R)[0]).toEqual([6, +(Math.sqrt(11) / 8).toFixed(4)]);
  });

  it('CsCl: the BCC pattern, split by which ions surround each site', () => {
    const found = findSites(CSCL);
    expect(summary(found)).toEqual([
      ['pocket', 'tetrahedral (2 Cl, 2 Cs)', 12, 0.286],
      ['doorway', 'triangular (1 Cl, 2 Cs)', 12, 0.2303],
      ['doorway', 'triangular (2 Cl, 1 Cs)', 12, 0.211],
      ['gap', 'between two atoms (2 Cs)', 3, 0.1779],
      ['gap', 'between two atoms (2 Cl)', 3, 0.1324],
    ]);
    // the same numbers of each kind as BCC, whose two atoms per cell CsCl's ions replace
    const perKind = (sites: FoundSite[]) =>
      sites.reduce<Record<string, number>>((n, s) => ({ ...n, [s.kind]: (n[s.kind] ?? 0) + s.perCell }), {});
    expect(perKind(found)).toEqual(perKind(findSites(crystalOf(STRUCTURES.bcc))));
  });

  it('NaCl: the (¼,¼,¼) site is a tetrahedral pocket of the 4 larger Cl ions, with 4 Na just beyond', () => {
    const found = findSites(NACL);
    expect(summary(found)).toEqual([
      ['pocket', 'tetrahedral (4 Cl)', 8, 0.3541],
      ['pocket', 'tetrahedral (3 Cl, 1 Na)', 32, 0.2781],
      ['doorway', 'triangular (3 Cl)', 32, 0.2766],
      ['doorway', 'triangular (2 Cl, 1 Na)', 48, 0.1674],
      ['gap', 'between two atoms (2 Cl)', 24, 0.1056],
    ]);
    expect(found[0].representative).toEqual([0.25, 0.25, 0.25]);
    // all 8 neighbours are √3/4 a away (centre to centre): the 4 Cl surfaces are nearer than the 4 smaller Na
    const [cl, na] = found[0].shells;
    expect([cl.count, cl.elements, na.count, na.elements]).toEqual([4, { Cl: 4 }, 4, { Na: 4 }]);
  });
});

describe('experimental: every site found is really a site', () => {
  // every atom of the crystal near p, by brute force (independent of the search)
  const surfaces = (crystal: Crystal, p: Vec3) => {
    const out: number[] = [];
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++)
        for (let k = -2; k <= 2; k++)
          for (const a of crystal.atoms) {
            const c = [a.position[0] + i, a.position[1] + j, a.position[2] + k];
            out.push(Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) - a.radius);
          }
    return out.sort((a, b) => a - b);
  };

  for (const crystal of [...Object.values(STRUCTURES).map(crystalOf), DIAMOND, CSCL, NACL]) {
    it(`${crystal.name}: no atom inside any site's sphere, and its nearest atoms all touch it`, () => {
      for (const site of findSites(crystal)) {
        const gaps = surfaces(crystal, site.representative);
        expect(gaps[0]).toBeCloseTo(site.radius, 9);
        expect(gaps.filter((g) => g < site.radius + 1e-6)).toHaveLength(site.shells[0].count);
      }
    });
  }
});
