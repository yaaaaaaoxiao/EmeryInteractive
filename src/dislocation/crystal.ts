// The block of perfect crystal a dislocation is put into: simple cubic, FCC or BCC, turned so that its slip system
// lines up with the block. Everything here is fixed for a structure and a kind of dislocation; field.ts adds the
// dislocation itself.
//
// The block's own axes ("the frame"), in units of the lattice parameter a:
//   - z is the slip-plane normal; the slip plane is z = slipHeight, halfway between two layers of atoms;
//   - y is along the dislocation line. The line's sense is −y: out of the front face, toward the viewer;
//   - x = y × z is the glide direction: the line moves along +x.
// The Burgers vector lies in the slip plane: [its part along x (edge), its part along y (screw)].

import { STRUCTURES, type StructureId, type Vec3 } from '../crystal/structures';

export type Kind = 'edge' | 'screw' | 'mixed';

interface KindSetup {
  // the line's sense, as a crystal direction
  line: Vec3;
  // the Burgers vector: `factor` × [uvw] (e.g. a/2 [1̄ 1 0]), and its length as text
  factor: number;
  uvw: Vec3;
  factorText: string;
  lengthText: string;
}

interface Setup {
  // the slip plane (h k l)
  plane: Vec3;
  // the block's size along x, y and z, roughly (it is rounded to whole repeats of the crystal)
  size: Vec3;
  kinds: Record<Kind, KindSetup>;
}

// The usual slip system of each structure: the shortest lattice vector on the closest-packed plane that holds it.
// Edge and screw share a Burgers vector where they can, so only the line turns; the mixed case is the other
// perfect dislocation the slip plane offers (60° in FCC, 71° in BCC).
const SETUPS: Record<StructureId, Setup> = {
  sc: {
    plane: [0, 0, 1],
    size: [13, 8, 10],
    kinds: {
      edge: { line: [0, -1, 0], factor: 1, uvw: [1, 0, 0], factorText: 'a', lengthText: 'a' },
      screw: { line: [0, -1, 0], factor: 1, uvw: [0, -1, 0], factorText: 'a', lengthText: 'a' },
      mixed: { line: [0, -1, 0], factor: 1, uvw: [1, -1, 0], factorText: 'a', lengthText: '√2 a' },
    },
  },
  fcc: {
    plane: [1, 1, 1],
    size: [9.2, 4.9, 6.9],
    kinds: {
      edge: { line: [1, 1, -2], factor: 0.5, uvw: [-1, 1, 0], factorText: 'a/2', lengthText: 'a/√2' },
      screw: { line: [-1, 1, 0], factor: 0.5, uvw: [-1, 1, 0], factorText: 'a/2', lengthText: 'a/√2' },
      mixed: { line: [-1, 1, 0], factor: 0.5, uvw: [-1, 0, 1], factorText: 'a/2', lengthText: 'a/√2' },
    },
  },
  bcc: {
    plane: [1, 1, 0],
    size: [9.6, 6.5, 7.1],
    kinds: {
      edge: { line: [-1, 1, -2], factor: 0.5, uvw: [-1, 1, 1], factorText: 'a/2', lengthText: '√3 a/2' },
      screw: { line: [-1, 1, 1], factor: 0.5, uvw: [-1, 1, 1], factorText: 'a/2', lengthText: '√3 a/2' },
      mixed: { line: [-1, 1, 1], factor: 0.5, uvw: [1, -1, 1], factorText: 'a/2', lengthText: '√3 a/2' },
    },
  },
};

export interface Crystal {
  structure: StructureId;
  kind: Kind;
  // every atom of the perfect block, in the frame
  atoms: Vec3[];
  // the largest x, y and z among the atoms (the smallest are 0)
  size: Vec3;
  slipHeight: number;
  // the Burgers vector's parts along x (edge) and y (screw)
  burgers: [number, number];
  // the distance between nearest neighbours
  nearest: number;
  // the distance between neighbouring planes of atoms across x, y and z
  spacing: Vec3;
  // nearest-neighbour pairs on the same side of the slip plane
  bonds: [number, number][];
  // pairs that are nearest neighbours across the slip plane, either before slip or after slip by b
  crossings: [number, number][];
  // atom-to-atom steps for a Burgers circuit: across the slip plane's width (z stays), and up one layer. Each is a
  // short repeating sequence whose sideways parts cancel, so a row of steps goes straight on average.
  steps: { right: Vec3[]; up: Vec3[] };
  // the atom at a point of the frame, if there is one
  atomAt: (point: Vec3) => number | undefined;
  // for the page's text
  facts: {
    plane: Vec3;
    line: Vec3;
    burgers: { factorText: string; uvw: Vec3; lengthText: string };
  };
}

const EPS = 1e-6;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3) => scale(a, 1 / length(a));

const cache = new Map<string, Crystal>();

export function getCrystal(structure: StructureId, kind: Kind): Crystal {
  const key = `${structure}/${kind}`;
  let crystal = cache.get(key);
  if (!crystal) {
    crystal = build(structure, kind);
    cache.set(key, crystal);
  }
  return crystal;
}

function build(structure: StructureId, kind: Kind): Crystal {
  const setup = SETUPS[structure];
  const k = setup.kinds[kind];
  const ez = unit(setup.plane);
  const ey = unit(scale(k.line, -1));
  const ex = cross(ey, ez);
  const toFrame = (p: Vec3): Vec3 => [dot(p, ex), dot(p, ey), dot(p, ez)];
  const { centering } = STRUCTURES[structure];

  // lattice points of the crystal out to `range` cells from the origin, in the frame
  const lattice = (range: number, each: (p: Vec3) => void) => {
    for (let i = -range; i <= range; i++)
      for (let j = -range; j <= range; j++)
        for (let l = -range; l <= range; l++) for (const c of centering) each(toFrame([i + c[0], j + c[1], l + c[2]]));
  };

  // the lattice vectors near the origin: enough to find every short step and every repeat distance
  const near: Vec3[] = [];
  lattice(3, (v) => {
    if (length(v) > EPS) near.push(v);
  });
  const nearest = Math.min(...near.map(length));
  // planes of atoms across an axis are evenly spaced: the smallest step any lattice vector takes along it
  const spacing = [0, 1, 2].map((axis) => Math.min(...near.map((v) => Math.abs(v[axis])).filter((d) => d > EPS))) as Vec3;
  // the crystal repeats along an axis after the shortest lattice vector that points along it
  const repeat = [0, 1, 2].map((axis) =>
    Math.min(...near.filter((v) => v[axis] > EPS && v.every((d, a) => a === axis || Math.abs(d) < EPS)).map(length)),
  );

  // whole repeats along each axis, with an even number of layers so the slip plane is in the middle
  const repeats = repeat.map((r, axis) => Math.max(1, Math.round(setup.size[axis] / r)));
  const layersPerRepeat = Math.round(repeat[2] / spacing[2]);
  if ((repeats[2] * layersPerRepeat) % 2) repeats[2]++;
  const box = repeat.map((r, axis) => r * repeats[axis]);
  const slipHeight = ((repeats[2] * layersPerRepeat) / 2 - 0.5) * spacing[2];

  const atoms: Vec3[] = [];
  lattice(Math.ceil(length(box as Vec3)) + 1, (p) => {
    if (p.every((d, axis) => d > -EPS && d < box[axis] - EPS)) atoms.push(p.map((d) => Math.round(d * 1e9) / 1e9) as Vec3);
  });
  // (in a fixed order, so an atom keeps its number: layer by layer, then front to back, then left to right)
  atoms.sort((p, q) => p[2] - q[2] || p[1] - q[1] || p[0] - q[0]);
  const size = [0, 1, 2].map((axis) => Math.max(...atoms.map((p) => p[axis]))) as Vec3;

  const keyOf = (p: Vec3) => p.map((d) => Math.round(d * 1e4)).join();
  const index = new Map(atoms.map((p, n) => [keyOf(p), n]));
  const atomAt = (p: Vec3) => index.get(keyOf(p));

  const burgers3 = toFrame(scale(k.uvw, k.factor));
  const burgers: [number, number] = [burgers3[0], burgers3[1]].map((d) => (Math.abs(d) < EPS ? 0 : d)) as [number, number];

  //////// bonds
  const neighbours = near.filter((v) => Math.abs(length(v) - nearest) < EPS);
  const above = (p: Vec3) => p[2] > slipHeight;
  const bonds: [number, number][] = [];
  const crossings: [number, number][] = [];
  atoms.forEach((p, n) => {
    for (const v of neighbours) {
      const m = atomAt(add(p, v));
      if (m !== undefined && m > n && above(atoms[m]) === above(p)) bonds.push([n, m]);
      // from the first layer above the slip plane, down: the neighbour before slip, and the one after it
      if (!above(p) || v[2] > -EPS || above(add(p, v))) continue;
      for (const shift of [0, 1]) {
        const below = atomAt(add(add(p, v), [burgers[0] * shift, burgers[1] * shift, 0]));
        if (below !== undefined) crossings.push([n, below]);
      }
    }
  });

  return {
    structure,
    kind,
    atoms,
    size,
    slipHeight,
    burgers,
    nearest,
    spacing,
    bonds,
    crossings,
    steps: {
      right: straightSteps(
        near.filter((v) => Math.abs(v[2]) < EPS && v[0] > EPS),
        nearest,
        [1],
      ),
      up: straightSteps(
        near.filter((v) => Math.abs(v[2] - spacing[2]) < EPS),
        nearest,
        [0, 1],
      ),
    },
    atomAt,
    facts: {
      plane: setup.plane,
      line: k.line,
      burgers: { factorText: k.factorText, uvw: k.uvw, lengthText: k.lengthText },
    },
  };
}

// The shortest sequence of one, two or three of the short steps in `candidates` whose parts along `sideways`
// (axes of the frame) cancel. E.g. in FCC the three ways up to the next layer all lean, but one of each goes
// straight up.
function straightSteps(candidates: Vec3[], nearest: number, sideways: number[]): Vec3[] {
  const short = candidates
    .filter((v) => length(v) < 1.5 * nearest)
    .sort((p, q) => length(p) - length(q) || p[1] - q[1] || p[0] - q[0]);
  let best: Vec3[] | null = null;
  let bestLength = Infinity;
  const consider = (steps: Vec3[]) => {
    const sum = steps.reduce(add);
    if (!sideways.every((axis) => Math.abs(sum[axis]) < EPS)) return;
    const total = steps.reduce((acc, v) => acc + length(v), 0) / steps.length;
    if (!best || steps.length < best.length || (steps.length === best.length && total < bestLength - EPS)) {
      best = steps;
      bestLength = total;
    }
  };
  for (let a = 0; a < short.length; a++) {
    consider([short[a]]);
    for (let b = a; b < short.length; b++) {
      consider([short[a], short[b]]);
      // (the odd one out goes in the middle, so the row wanders least)
      for (let c = b; c < short.length; c++) consider([short[a], short[c], short[b]]);
    }
  }
  if (!best) throw new Error('no straight row of atom-to-atom steps in this orientation');
  return best;
}
