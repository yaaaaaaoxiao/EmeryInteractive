import { describe, expect, it } from 'vitest';
import type { StructureId, Vec3 } from '../src/crystal/structures';
import { getCrystal } from '../src/dislocation/crystal';
import {
  atomPosition,
  bonds,
  burgersCircuit,
  type Config,
  characterAngle,
  crystalOf,
  dilatation,
  displacement,
  halfPlaneThickness,
  inHalfPlane,
  type Kind,
  NU,
  onRamp,
  positionRange,
  rampCount,
  rampLayers,
  rampOf,
  rampTurn,
  screwShear,
  slippedFraction,
  startPosition,
} from '../src/dislocation/field';

const STRUCTURE_IDS: StructureId[] = ['sc', 'fcc', 'bcc'];
const KINDS: Kind[] = ['edge', 'screw', 'mixed'];
const CASES = STRUCTURE_IDS.flatMap((structure) => KINDS.map((kind) => [structure, kind] as const));

// a dislocation in the middle of its block, unless a position is given
const config = (structure: StructureId, kind: Kind, position?: number): Config => ({
  structure,
  kind,
  position: position ?? startPosition(getCrystal(structure, kind)),
});
const distance = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('displacement field', () => {
  it('jumps by exactly the Burgers vector across the slipped half of the slip plane, and nowhere else', () => {
    for (const [structure, kind] of CASES) {
      const [edge, screw] = getCrystal(structure, kind).burgers;
      for (const X of [-0.5, -2, -7]) {
        const above = displacement(X, 1e-9, edge, screw);
        const below = displacement(X, -1e-9, edge, screw);
        expect(above[0] - below[0]).toBeCloseTo(edge, 6);
        expect(above[1] - below[1]).toBeCloseTo(screw, 6);
        expect(above[2] - below[2]).toBeCloseTo(0, 6);
      }
      for (const X of [0.5, 2, 7]) {
        const above = displacement(X, 1e-9, edge, screw);
        const below = displacement(X, -1e-9, edge, screw);
        for (const axis of [0, 1, 2]) expect(above[axis] - below[axis]).toBeCloseTo(0, 6);
      }
    }
  });

  it('moves atoms only along the line for a screw, and never along it for an edge', () => {
    for (const [X, Z] of [
      [1, 0.5],
      [-2, 1.5],
      [0, -0.5],
      [3, -2.5],
    ]) {
      const screw = displacement(X, Z, 0, -1);
      expect(screw[0]).toBeCloseTo(0, 12);
      expect(screw[2]).toBeCloseTo(0, 12);
      expect(displacement(X, Z, 1, 0)[1]).toBeCloseTo(0, 12);
    }
  });

  it('has the volume change its formula says (checked against the slope of the displacement)', () => {
    const h = 1e-5;
    for (const [X, Z] of [
      [1, 0.5],
      [-2, 1.5],
      [0.3, -0.5],
      [3, -2.5],
    ]) {
      const dux = (displacement(X + h, Z, 1, 0)[0] - displacement(X - h, Z, 1, 0)[0]) / (2 * h);
      const duz = (displacement(X, Z + h, 1, 0)[2] - displacement(X, Z - h, 1, 0)[2]) / (2 * h);
      expect(dux + duz).toBeCloseTo(dilatation(X, Z, 1), 6);
    }
  });

  it('shears the crystal around a screw by b / 2πr (checked against the slope of the displacement)', () => {
    const h = 1e-6;
    for (const [X, Z] of [
      [1, 0.5],
      [-2, 1.5],
      [0.3, -0.5],
      [3, -2.5],
    ]) {
      const slopeX = (displacement(X + h, Z, 0, -1)[1] - displacement(X - h, Z, 0, -1)[1]) / (2 * h);
      const slopeZ = (displacement(X, Z + h, 0, -1)[1] - displacement(X, Z - h, 0, -1)[1]) / (2 * h);
      expect(Math.hypot(slopeX, slopeZ)).toBeCloseTo(screwShear(X, Z, -1), 6);
      // and changes no volume
      expect(dilatation(X, Z, 0)).toBeCloseTo(0, 12);
    }
    // the same all around the line, halving when the distance doubles
    expect(screwShear(0, 2, 1)).toBeCloseTo(screwShear(2, 0, 1), 12);
    expect(screwShear(4, 0, 1)).toBeCloseTo(screwShear(2, 0, 1) / 2, 12);
  });

  it('compresses the side with the extra half-plane and stretches the other', () => {
    expect(dilatation(0, 0.5, 1)).toBeLessThan(0);
    expect(dilatation(0, -0.5, 1)).toBeGreaterThan(0);
    expect(dilatation(1, 0.5, 0, NU)).toBeCloseTo(0, 12);
  });
});

describe('the blocks of perfect crystal', () => {
  it('have the right number of nearest neighbours inside the block', () => {
    const neighbours = { sc: 6, fcc: 12, bcc: 8 };
    const nearest = { sc: 1, fcc: Math.SQRT1_2, bcc: Math.sqrt(3) / 2 };
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      expect(crystal.nearest).toBeCloseTo(nearest[structure], 9);
      // an atom well inside the block, away from the slip plane
      const middle = crystal.size.map((d) => d / 2) as Vec3;
      middle[2] = crystal.size[2] * 0.8;
      let atom = 0;
      crystal.atoms.forEach((p, n) => {
        if (distance(p, middle) < distance(crystal.atoms[atom], middle)) atom = n;
      });
      const count = crystal.atoms.filter((p) => Math.abs(distance(p, crystal.atoms[atom]) - crystal.nearest) < 1e-6).length;
      expect(count).toBe(neighbours[structure]);
      expect(crystal.bonds.filter(([a, b]) => a === atom || b === atom)).toHaveLength(neighbours[structure]);
    }
  });

  it('have the density of their structure (atoms per a³)', () => {
    const perCell = { sc: 1, fcc: 4, bcc: 2 };
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      // the block is whole repeats of the crystal: its atoms fill a box one plane spacing larger than their extent
      const volume = crystal.size.reduce((v, d, axis) => v * (d + crystal.spacing[axis]), 1);
      expect(crystal.atoms.length / volume).toBeCloseTo(perCell[structure], 6);
    }
  });

  it('have the slip plane halfway between two layers, with as many layers above as below', () => {
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      const above = crystal.atoms.filter((p) => p[2] > crystal.slipHeight).length;
      expect(above * 2).toBe(crystal.atoms.length);
      const gap = Math.min(...crystal.atoms.map((p) => Math.abs(p[2] - crystal.slipHeight)));
      expect(gap).toBeCloseTo(crystal.spacing[2] / 2, 9);
    }
  });

  it('have the Burgers vector of their slip system: a lattice vector in the slip plane', () => {
    const length = { sc: 1, fcc: Math.SQRT1_2, bcc: Math.sqrt(3) / 2 };
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      const [edge, screw] = crystal.burgers;
      // (the simple-cubic mixed case is the one that isn't the shortest lattice vector)
      const expected = structure === 'sc' && kind === 'mixed' ? Math.SQRT2 : length[structure];
      expect(Math.hypot(edge, screw)).toBeCloseTo(expected, 9);
      // moving an atom by b lands on another atom
      const from = crystal.atoms.find((p) => p[0] > 2 && p[1] > 2 && p[2] > 2)!;
      expect(crystal.atomAt([from[0] + edge, from[1] + screw, from[2]])).toBeDefined();
    }
    expect(characterAngle(getCrystal('sc', 'edge'))).toBeCloseTo(90);
    expect(characterAngle(getCrystal('bcc', 'screw'))).toBeCloseTo(0);
    expect(characterAngle(getCrystal('sc', 'mixed'))).toBeCloseTo(45);
    expect(characterAngle(getCrystal('fcc', 'mixed'))).toBeCloseTo(60);
    expect(characterAngle(getCrystal('bcc', 'mixed'))).toBeCloseTo(70.53, 1);
  });

  it('keep the simple-cubic block as it was: 13 × 8 × 10 atoms on a unit grid', () => {
    const crystal = getCrystal('sc', 'edge');
    expect(crystal.atoms).toHaveLength(13 * 8 * 10);
    expect(crystal.size).toEqual([12, 7, 9]);
    expect(crystal.slipHeight).toBe(4.5);
    expect(startPosition(crystal)).toBe(6);
    expect(positionRange(crystal)).toEqual([-1, 13]);
  });
});

describe('the block with a dislocation', () => {
  it('is the perfect crystal before the line enters, and slipped by b after it has left', () => {
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      const [edge, screw] = crystal.burgers;
      const [up, down] = crystal.crossings[0];
      const before = crystal.atoms[up].map((d, axis) => d - crystal.atoms[down][axis]);
      // far ahead of and far behind the line (far enough that the elastic distortion is gone)
      const offset = (position: number) => {
        const c = config(structure, kind, position);
        const p = atomPosition(c, up);
        const q = atomPosition(c, down);
        return [p[0] - q[0] - before[0], p[1] - q[1] - before[1]];
      };
      expect(offset(-1e6)[0]).toBeCloseTo(0, 4);
      expect(offset(-1e6)[1]).toBeCloseTo(0, 4);
      expect(offset(1e6)[0]).toBeCloseTo(edge, 4);
      expect(offset(1e6)[1]).toBeCloseTo(screw, 4);
    }
  });

  it('keeps every pair of atoms at least three quarters of a nearest-neighbour distance apart, wherever the line is', () => {
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      const start = startPosition(crystal);
      for (const position of [-1, start - 0.31, start, start + 0.17, crystal.size[0] + 1]) {
        const c = config(structure, kind, position);
        // only near the slip plane, where atoms move against each other
        const atoms = crystal.atoms
          .map((p, n) => (Math.abs(p[2] - crystal.slipHeight) < 1.1 * crystal.spacing[2] ? atomPosition(c, n) : null))
          .filter((p) => p !== null);
        let closest = Infinity;
        for (let m = 0; m < atoms.length; m++)
          for (let n = m + 1; n < atoms.length; n++) closest = Math.min(closest, distance(atoms[m], atoms[n]));
        expect(closest / crystal.nearest).toBeGreaterThan(0.75);
      }
    }
  });

  it('draws no bond longer than 1.4 nearest-neighbour distances', () => {
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      for (const position of [startPosition(crystal), startPosition(crystal) + 0.4, 2.5]) {
        const c = config(structure, kind, position);
        for (const [a, b] of bonds(c)) {
          expect(distance(atomPosition(c, a), atomPosition(c, b)) / crystal.nearest).toBeLessThan(1.4);
        }
      }
    }
  });

  it('bonds every atom across the slip plane as in the perfect crystal, far from the line on either side', () => {
    const across = { sc: 1, fcc: 3, bcc: 2 };
    for (const [structure, kind] of CASES) {
      const crystal = getCrystal(structure, kind);
      for (const position of [-1e6, 1e6]) {
        const c = config(structure, kind, position);
        const crossing = bonds(c).slice(crystal.bonds.length);
        // an atom in the first layer above the slip plane, away from the block's sides
        const atom = crystal.atoms.findIndex(
          (p) =>
            p[2] > crystal.slipHeight &&
            p[2] < crystal.slipHeight + crystal.spacing[2] &&
            p[0] > 3 &&
            p[0] < 6 &&
            p[1] > 2 &&
            p[1] < 4,
        );
        expect(crossing.filter(([a]) => a === atom)).toHaveLength(across[structure]);
      }
    }
  });
});

describe('extra half-plane', () => {
  it('is one plane thick in simple cubic, two in FCC and three in BCC; a screw has none', () => {
    expect(halfPlaneThickness(getCrystal('sc', 'edge'))).toBe(1);
    expect(halfPlaneThickness(getCrystal('fcc', 'edge'))).toBe(2);
    expect(halfPlaneThickness(getCrystal('bcc', 'edge'))).toBe(3);
    for (const structure of STRUCTURE_IDS) {
      const c = config(structure, 'screw');
      expect(crystalOf(c).atoms.some((_, n) => inHalfPlane(c, n))).toBe(false);
    }
  });

  it('is the atoms above the slip plane within half a Burgers vector of the line', () => {
    for (const structure of STRUCTURE_IDS) {
      const c = config(structure, 'edge');
      const crystal = crystalOf(c);
      const inPlane = crystal.atoms.filter((_, n) => inHalfPlane(c, n));
      const xs = new Set(inPlane.map((p) => p[0].toFixed(4)));
      expect(xs.size).toBe(halfPlaneThickness(crystal));
      expect(inPlane.every((p) => p[2] > crystal.slipHeight)).toBe(true);
      // symmetric about the line where the line starts
      const mean = inPlane.reduce((sum, p) => sum + p[0], 0) / inPlane.length;
      expect(mean).toBeCloseTo(c.position, 3);
      // no half-plane before the line enters the block
      const before = config(structure, 'edge', -1);
      expect(crystal.atoms.some((_, n) => inHalfPlane(before, n))).toBe(false);
    }
  });

  it('is one more column above the slip plane than below, between the same atoms (simple cubic)', () => {
    const c = config('sc', 'edge');
    const crystal = crystalOf(c);
    // far to the left the upper atom of column i sits over the lower atom of column i + 1; far right, over column i
    const over = (i: number) => atomPosition(c, crystal.atomAt([i, 0, 5])!)[0];
    const under = (i: number) => atomPosition(c, crystal.atomAt([i, 0, 4])!)[0];
    expect(Math.abs(over(0) - under(1))).toBeLessThan(0.2);
    expect(Math.abs(over(12) - under(12))).toBeLessThan(0.2);
    // the half-plane's bottom atom has no bond across the slip plane; its neighbours bond to the atoms now under them
    const crossing = bonds(c).slice(crystal.bonds.length);
    const partner = (i: number) => crossing.filter(([a]) => a === crystal.atomAt([i, 0, 5])).map(([, b]) => crystal.atoms[b][0]);
    expect(partner(6)).toEqual([]);
    expect(partner(5)).toEqual([6]);
    expect(partner(7)).toEqual([7]);
    expect(partner(0)).toEqual([1]);
    expect(partner(12)).toEqual([12]);
  });
});

describe('spiral ramp', () => {
  it('is one ramp in simple cubic, two in FCC and three in BCC, each layer on one of them', () => {
    expect(rampCount(getCrystal('sc', 'screw'))).toBe(1);
    expect(rampCount(getCrystal('fcc', 'screw'))).toBe(2);
    expect(rampCount(getCrystal('bcc', 'screw'))).toBe(3);
    for (const structure of STRUCTURE_IDS) {
      const crystal = getCrystal(structure, 'screw');
      const layers = rampLayers(crystal);
      // every atom is on one of the layers
      const heights = new Set(layers.map((layer) => layer.y.toFixed(4)));
      expect(crystal.atoms.every((p) => heights.has(p[1].toFixed(4)))).toBe(true);
      expect(new Set(layers.map((layer) => layer.ramp)).size).toBe(rampCount(crystal));
    }
  });

  it('climbs the screw part of the Burgers vector per turn, each turn ending where another layer’s begins', () => {
    for (const [structure, kind] of CASES) {
      const c = config(structure, kind);
      const crystal = crystalOf(c);
      const [edge, screw] = crystal.burgers;
      if (screw === 0) continue;
      const y = rampLayers(crystal)[3].y;
      const turn = rampTurn(c, y);
      const next = rampTurn(c, y + screw);
      // (the layer it leads to is on the same ramp)
      expect(rampOf(crystal, y + screw)).toBe(rampOf(crystal, y));
      for (let r = 0; r < turn.rows; r++) {
        const end = turn.points[r * turn.columns + turn.columns - 1];
        const start = turn.points[r * turn.columns];
        const nextStart = next.points[r * next.columns];
        expect(end[1] - start[1]).toBeCloseTo(screw, 9);
        expect(end[1]).toBeCloseTo(nextStart[1], 9);
        // (an edge part also shifts the two ends sideways, by its own part of the Burgers vector)
        expect(end[0] - nextStart[0]).toBeCloseTo(edge, 6);
        expect(end[2]).toBeCloseTo(nextStart[2], 6);
      }
    }
  });

  it('passes through the atoms it is drawn around', () => {
    for (const structure of STRUCTURE_IDS) {
      const crystal = getCrystal(structure, 'screw');
      const c = config(structure, 'screw', startPosition(crystal) + 0.13);
      const pitch = Math.abs(crystal.burgers[1]);
      const layer = rampLayers(crystal)[4];
      const turn = rampTurn(c, layer.y, 360, 30);
      const near = crystal.atoms.map((_, n) => n).filter((n) => onRamp(c, n) && Math.abs(crystal.atoms[n][1] - layer.y) < 1e-6);
      expect(near.length).toBeGreaterThan(8);
      for (const atom of near) {
        const p = atomPosition(c, atom);
        // (the atom may lie on this turn or, across the slip plane, on the turn one Burgers vector along)
        const along = (d: number) => (((((d % pitch) + pitch) % pitch) + pitch / 2) % pitch) - pitch / 2;
        const nearest = Math.min(...turn.points.map((q) => Math.hypot(p[0] - q[0], along(p[1] - q[1]), p[2] - q[2])));
        expect(nearest).toBeLessThan(0.1);
      }
    }
  });

  it('stays inside the block when the line is near its side', () => {
    for (const structure of STRUCTURE_IDS) {
      const c = config(structure, 'screw', 0.5);
      const crystal = crystalOf(c);
      const turn = rampTurn(c, 0);
      for (const p of turn.points) expect(p[0]).toBeGreaterThan(-crystal.nearest / 2 - 1e-9);
    }
  });

  it('is only on a dislocation with a screw part, and only around the line', () => {
    for (const structure of STRUCTURE_IDS) {
      const crystal = getCrystal(structure, 'screw');
      const nearLine = (c: Config) =>
        crystal.atoms.findIndex((p) => Math.hypot(p[0] - c.position, p[2] - crystal.slipHeight) < crystal.nearest);
      const screw = config(structure, 'screw');
      expect(onRamp(screw, nearLine(screw))).toBe(true);
      expect(onRamp(screw, crystal.atomAt([0, 0, 0])!)).toBe(false);
      expect(onRamp(config(structure, 'screw', -1), nearLine(screw))).toBe(false);
      const edge = config(structure, 'edge');
      expect(crystalOf(edge).atoms.some((_, n) => onRamp(edge, n))).toBe(false);
      const mixed = config(structure, 'mixed');
      expect(crystalOf(mixed).atoms.some((_, n) => onRamp(mixed, n))).toBe(true);
    }
  });
});

describe('Burgers circuit', () => {
  const gap = (c: Config) => {
    const circuit = burgersCircuit(c)!;
    const s = atomPosition(c, circuit.atoms[0]);
    const f = atomPosition(c, circuit.atoms[circuit.atoms.length - 1]);
    return { circuit, vector: [f[0] - s[0], f[1] - s[1], f[2] - s[2]] };
  };

  it('fails to close by the Burgers vector, in every structure', () => {
    for (const [structure, kind] of CASES) {
      const c = config(structure, kind);
      const [edge, screw] = crystalOf(c).burgers;
      const { vector } = gap(c);
      // (the atoms are a little off their ideal places, so the gap is b to within the elastic distortion)
      expect(Math.abs(vector[0] - edge)).toBeLessThan(0.05);
      expect(Math.abs(vector[1] - screw)).toBeLessThan(0.05);
      expect(Math.abs(vector[2])).toBeLessThan(0.05);
    }
  });

  it('would close in the perfect crystal: its start and finish are exactly a Burgers vector apart there', () => {
    for (const [structure, kind] of CASES) {
      const c = config(structure, kind);
      const crystal = crystalOf(c);
      const { circuit } = gap(c);
      const first = circuit.points[0];
      const last = circuit.points[circuit.points.length - 1];
      expect(last[0] - first[0]).toBeCloseTo(crystal.burgers[0], 9);
      expect(last[1] - first[1]).toBeCloseTo(crystal.burgers[1], 9);
      expect(last[2] - first[2]).toBeCloseTo(0, 9);
    }
  });

  it('goes from atom to atom, each step about one atom spacing, around the line', () => {
    for (const [structure, kind] of CASES) {
      const c = config(structure, kind);
      const crystal = crystalOf(c);
      const { circuit } = gap(c);
      expect(circuit.atoms).toHaveLength(circuit.points.length);
      expect(circuit.legs.map((leg) => leg.heading)).toEqual(['down', 'right', 'up', 'left']);
      expect(circuit.legs[0].steps).toBe(circuit.legs[2].steps);
      expect(circuit.legs[1].steps).toBe(circuit.legs[3].steps);
      expect(circuit.legs.reduce((sum, leg) => sum + leg.steps, 0)).toBe(circuit.points.length - 1);
      for (let n = 1; n < circuit.atoms.length; n++) {
        const d = distance(atomPosition(c, circuit.atoms[n - 1]), atomPosition(c, circuit.atoms[n])) / crystal.nearest;
        expect(d).toBeGreaterThan(0.8);
        expect(d).toBeLessThan(1.3);
      }
      // the line is inside the circuit: it passes left of it below the slip plane... and right of it too
      const xs = circuit.atoms.map((atom) => atomPosition(c, atom)[0]);
      expect(Math.min(...xs)).toBeLessThan(c.position - crystal.nearest);
      expect(Math.max(...xs)).toBeGreaterThan(c.position + crystal.nearest);
    }
  });

  it('is not drawn when it would not fit around the line', () => {
    for (const structure of STRUCTURE_IDS) {
      const size = getCrystal(structure, 'edge').size[0];
      expect(burgersCircuit(config(structure, 'edge', 0.5))).toBeNull();
      expect(burgersCircuit(config(structure, 'edge', size - 0.5))).toBeNull();
      expect(burgersCircuit(config(structure, 'edge'))).not.toBeNull();
    }
  });
});

describe('summary numbers', () => {
  it('goes from no slip to full slip as the line crosses the block', () => {
    for (const structure of STRUCTURE_IDS) {
      const crystal = getCrystal(structure, 'edge');
      expect(slippedFraction(config(structure, 'edge', -1))).toBe(0);
      expect(slippedFraction(config(structure, 'edge', crystal.size[0] + 1))).toBe(1);
      expect(slippedFraction(config(structure, 'edge', crystal.size[0] / 2))).toBeCloseTo(0.5);
    }
  });
});
