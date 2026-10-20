import { describe, expect, it } from 'vitest';
import { STRUCTURES } from '../src/crystal/structures';
import { atomObjects, nearestAtoms, orbit, siteInfo, siteObjects, toIntegerIndices, fraction } from '../src/crystal/lattice';

const info = (s: keyof typeof STRUCTURES) =>
  Object.fromEntries(STRUCTURES[s].sites.map((t) => {
    const i = siteInfo(STRUCTURES[s], t);
    return [t.id, { perCell: i.perCell, cn: i.coordination, ratio: +i.ratio.toFixed(3) }];
  }));

describe('atoms', () => {
  it('has the right atoms per cell and coordination', () => {
    for (const [id, n, cn] of [['fcc', 4, 12], ['bcc', 2, 8], ['sc', 1, 6]] as const) {
      const s = STRUCTURES[id];
      expect(orbit([0, 0, 0], s.centering)).toHaveLength(n);
      expect(nearestAtoms(s, [0, 0, 0]).positions).toHaveLength(cn);
      // atoms touch: nearest-neighbour distance is 2R
      expect(nearestAtoms(s, [0, 0, 0]).distance).toBeCloseTo(2 * s.atomRadius, 10);
    }
  });
  it('draws boundary images in the cell', () => {
    expect(atomObjects(STRUCTURES.fcc, [1, 1, 1])).toHaveLength(14);
    expect(atomObjects(STRUCTURES.bcc, [1, 1, 1])).toHaveLength(9);
    expect(atomObjects(STRUCTURES.sc, [1, 1, 1])).toHaveLength(8);
    expect(atomObjects(STRUCTURES.sc, [2, 1, 1])).toHaveLength(12);
  });
});

describe('interstitial sites', () => {
  it('FCC', () => {
    expect(info('fcc')).toEqual({
      oct: { perCell: 4, cn: 6, ratio: 0.414 },
      tet: { perCell: 8, cn: 4, ratio: 0.225 },
      tri: { perCell: 32, cn: 3, ratio: 0.155 },
    });
    expect(siteObjects(STRUCTURES.fcc, STRUCTURES.fcc.sites[0], [1, 1, 1])).toHaveLength(13);
    expect(siteObjects(STRUCTURES.fcc, STRUCTURES.fcc.sites[2], [1, 1, 1])).toHaveLength(32);
  });
  it('BCC', () => {
    expect(info('bcc')).toEqual({
      oct: { perCell: 6, cn: 6, ratio: 0.155 },
      tet: { perCell: 12, cn: 4, ratio: 0.291 },
      tri: { perCell: 24, cn: 3, ratio: 0.225 },
    });
  });
  it('SC', () => {
    expect(info('sc')).toEqual({
      cubic: { perCell: 1, cn: 8, ratio: 0.732 },
      square: { perCell: 3, cn: 4, ratio: 0.414 },
    });
  });
  it('triangular sites have 3 equidistant atoms', () => {
    for (const id of ['fcc', 'bcc'] as const) {
      const s = STRUCTURES[id];
      const tri = s.sites.find((t) => t.id === 'tri')!;
      expect(nearestAtoms(s, tri.representative).positions).toHaveLength(3);
    }
  });
});

describe('formatting', () => {
  it('fractions and indices', () => {
    expect(fraction(1 / 3)).toBe('1/3');
    expect(fraction(0.375)).toBe('3/8');
    expect(fraction(1)).toBe('1');
    expect(toIntegerIndices([0.5, 0.5, 0])).toEqual([1, 1, 0]);
    expect(toIntegerIndices([-0.25, 0.5, 0.25])).toEqual([-1, 2, 1]);
  });
});
