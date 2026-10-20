// Checks the science the site states, against geometry computed here independently.

import { describe, expect, it } from 'vitest';
import { atomObjects, dist, doorwaySides, nearestAtoms, neighborShells, siteInfo, siteObjects } from '../src/crystal/lattice';
import { STRUCTURES, type Vec3 } from '../src/crystal/structures';

const structures = Object.values(STRUCTURES);

// free space at a point: distance to the nearest atom surface (in units of a)
const freeRadius = (s: (typeof structures)[number], p: Vec3) => nearestAtoms(s, p).distance - s.atomRadius;

// climb towards more free space; returns how much bigger a sphere can get by moving
function climb(s: (typeof structures)[number], start: Vec3): number {
  const dirs: Vec3[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push([x, y, z]);
  // a few off-axis directions too (the escape from a triangular doorway is along [111])
  for (let i = 0; i < 200; i++) dirs.push([Math.sin(i * 1.7), Math.cos(i * 2.3), Math.sin(i * 0.9 + 1)]);
  const unit = dirs.map((d) => d.map((v) => v / Math.hypot(...d)) as Vec3);
  let p = start;
  let best = freeRadius(s, p);
  let step = 0.05;
  while (step > 1e-6) {
    const next = unit
      .map((d) => [p[0] + step * d[0], p[1] + step * d[1], p[2] + step * d[2]] as Vec3)
      .find((q) => freeRadius(s, q) > best + 1e-12);
    if (next) {
      p = next;
      best = freeRadius(s, p);
    } else step /= 2;
  }
  return best - freeRadius(s, start);
}

describe('pockets and doorways', () => {
  for (const s of structures) {
    for (const site of s.sites) {
      it(`${s.shortName} ${site.name} is ${site.doorwayBetween ? 'a doorway' : 'a pocket'}`, () => {
        const gain = climb(s, site.representative);
        if (site.doorwayBetween) expect(gain).toBeGreaterThan(1e-3);
        else expect(gain).toBeLessThan(1e-7);
      });
    }
  }

  it('each doorway lies on the line between the two sites it connects, which are both bigger', () => {
    for (const s of structures) {
      for (const site of s.sites.filter((t) => t.doorwayBetween)) {
        const [a, b] = doorwaySides(s, site) ?? [];
        expect(dist(a.position, site.representative) + dist(site.representative, b.position)).toBeCloseTo(
          dist(a.position, b.position),
          9,
        );
        expect(a.ratio).toBeGreaterThan(siteInfo(s, site).ratio);
        expect(b.ratio).toBeGreaterThan(siteInfo(s, site).ratio);
      }
    }
  });

  it('FCC triangular: 0.144a from a tetrahedral site and 0.289a from an octahedral one', () => {
    const fcc = STRUCTURES.fcc;
    const sides = doorwaySides(fcc, fcc.sites[2]) ?? [];
    expect(sides.map((x) => [x.type.id, +x.distance.toFixed(3)])).toEqual([
      ['tet', 0.144],
      ['oct', 0.289],
    ]);
  });
});

describe('distorted sites', () => {
  it('BCC octahedral: 2 atoms at a/2 and 4 at a/√2; every other site is regular', () => {
    for (const s of structures) {
      for (const site of s.sites) {
        const shells = neighborShells(s, site);
        if (s.id === 'bcc' && site.id === 'oct') {
          expect(shells.map((x) => [x.count, +x.distance.toFixed(4)])).toEqual([
            [2, 0.5],
            [4, 0.7071],
          ]);
        } else expect(shells).toHaveLength(1);
      }
    }
  });
});

describe('the text matches the geometry', () => {
  // an object on a face counts 1/2, on an edge 1/4, at a corner 1/8
  const weight = (p: number[]) => 1 / 2 ** p.filter((v) => Math.abs(v - Math.round(v)) < 1e-9).length;

  for (const s of structures) {
    it(`${s.shortName}: atoms per cell, APF, and where atoms touch`, () => {
      const n = atomObjects(s, [1, 1, 1]).reduce((acc, o) => acc + weight(o.pos), 0);
      expect(Number(s.info.atomsPerCell.split('=').at(-1))).toBe(n);

      const apf = (n * 4 * Math.PI * s.atomRadius ** 3) / 3;
      expect(s.info.apf).toContain(`{${apf.toFixed(2)}}`);

      // nearest neighbours touch (distance 2R) along the direction the text names
      const { positions, distance } = nearestAtoms(s, [0, 0, 0]);
      expect(distance).toBeCloseTo(2 * s.atomRadius, 12);
      const along = { 'cube edge': 1, 'face diagonal': 2, 'body diagonal': 3 }[s.info.touchAlong];
      for (const p of positions) expect(p.filter((v) => Math.abs(v) > 1e-9)).toHaveLength(along as number);
    });

    it(`${s.shortName}: the drawn sites in one cell add up to the "per cell" count`, () => {
      for (const site of s.sites) {
        const drawn = siteObjects(s, site, [1, 1, 1]).reduce((acc, o) => acc + weight(o.pos), 0);
        expect(drawn).toBeCloseTo(siteInfo(s, site).perCell, 9);
      }
    });
  }
});
