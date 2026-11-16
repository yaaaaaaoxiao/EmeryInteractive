// A straight dislocation in a block of crystal (see crystal.ts for the block and its axes). Atom positions are the
// perfect crystal plus the textbook displacement field of a dislocation in an isotropic elastic solid (the
// Volterra solution; see Hull & Bacon, "Introduction to Dislocations", ch. 4, or Hirth & Lothe, "Theory of
// Dislocations", ch. 3). Nothing here draws anything: scene.ts turns the result into a 3D scene.
//
// The line runs along y through (position, slipHeight). The crystal has slipped by the Burgers vector b where
// x < position and not at all where x > position: the line is the boundary of the slipped area, and moving it
// in +x (glide) slips more of the plane.

import type { StructureId, Vec3 } from '../crystal/structures';
import { type Crystal, getCrystal, type Kind } from './crystal';

export type { Crystal, Kind } from './crystal';

// Poisson's ratio of the elastic solid (most metals are near 1/3)
export const NU = 1 / 3;

export interface Config {
  structure: StructureId;
  kind: Kind;
  // where the line is along x (it may be outside the block: before it enters, or after it has left)
  position: number;
}

export const crystalOf = (config: Config): Crystal => getCrystal(config.structure, config.kind);

const EPS = 1e-6;

//////////////// the displacement field

// Displacement at (X, Z) measured from the line, for a Burgers vector with the given edge and screw parts.
// The angle jumps by 2π across the slipped half of the slip plane (X < 0, Z = 0), which is the slip by b.
export function displacement(X: number, Z: number, edge: number, screw: number, nu = NU): Vec3 {
  const theta = Math.atan2(Z, X);
  const r2 = X * X + Z * Z;
  const k = 1 / (2 * Math.PI);
  return [
    edge * k * (theta + (X * Z) / (2 * (1 - nu) * r2)),
    screw * k * theta,
    -edge * k * (((1 - 2 * nu) / (4 * (1 - nu))) * Math.log(r2) + (X * X - Z * Z) / (4 * (1 - nu) * r2)),
  ];
}

// Volume change per unit volume at (X, Z): negative (compression) on the side of the extra half-plane, positive
// (tension) on the other. Only the edge part changes the volume; a screw dislocation is pure shear.
export function dilatation(X: number, Z: number, edge: number, nu = NU): number {
  return (-edge * (1 - 2 * nu) * Z) / (2 * Math.PI * (1 - nu) * (X * X + Z * Z));
}

// How much the screw part shears the crystal at (X, Z): the size of the shear strain, b / 2πr. It is the same
// all the way around the line and falls off with the distance r from it. (The edge part shears the crystal too;
// this is the screw part's own shear, the only strain a pure screw dislocation has.)
export function screwShear(X: number, Z: number, screw: number): number {
  return Math.abs(screw) / (2 * Math.PI * Math.hypot(X, Z));
}

// where a point of the perfect crystal is once the dislocation is there
export function place(config: Config, point: Vec3): Vec3 {
  const crystal = crystalOf(config);
  const u = displacement(point[0] - config.position, point[2] - crystal.slipHeight, ...crystal.burgers);
  return [point[0] + u[0], point[1] + u[1], point[2] + u[2]];
}

export const atomPosition = (config: Config, atom: number): Vec3 => place(config, crystalOf(config).atoms[atom]);

export function atomDilatation(config: Config, atom: number): number {
  const crystal = crystalOf(config);
  const p = crystal.atoms[atom];
  return dilatation(p[0] - config.position, p[2] - crystal.slipHeight, crystal.burgers[0]);
}

export function atomShear(config: Config, atom: number): number {
  const crystal = crystalOf(config);
  const p = crystal.atoms[atom];
  return screwShear(p[0] - config.position, p[2] - crystal.slipHeight, crystal.burgers[1]);
}

//////////////// where the line is

// the range the line can be moved over: from just outside one side of the block to just outside the other
export const positionRange = (crystal: Crystal): [number, number] => [-1, Math.ceil(crystal.size[0] + 1)];

// whether the line is in the block (it can also be just outside it: before it enters, or after it has left)
export function lineInBlock(config: Config): boolean {
  return config.position > -0.75 && config.position < crystalOf(config).size[0] + 0.75;
}

// how many planes of atoms the extra half-plane is made of: the planes across x that one Burgers vector spans
export const halfPlaneThickness = (crystal: Crystal) => Math.round(Math.abs(crystal.burgers[0]) / crystal.spacing[0]);

// The middle of the block, placed so the picture is symmetric: on a plane of atoms if the extra half-plane is an
// odd number of planes thick, halfway between two if it is even.
export function startPosition(crystal: Crystal): number {
  const step = crystal.spacing[0];
  const offset = halfPlaneThickness(crystal) % 2 === 1 ? 0 : step / 2;
  return Number((Math.round((crystal.size[0] / 2 - offset) / step) * step + offset).toFixed(4));
}

// the fraction of the slip plane the line has swept (0 = no slip yet, 1 = the whole top half has moved by b)
export function slippedFraction(config: Config): number {
  return Math.min(Math.max(config.position / crystalOf(config).size[0], 0), 1);
}

// the angle between the Burgers vector and the line, in degrees (90 = edge, 0 = screw)
export function characterAngle(crystal: Crystal): number {
  const [edge, screw] = crystal.burgers;
  return (Math.atan2(Math.abs(edge), Math.abs(screw)) * 180) / Math.PI;
}

//////////////// the extra half-plane

// The extra half-plane of an edge (or mixed) dislocation: the atoms above the slip plane, within half a Burgers
// vector of the line across it. Which atoms these are changes as the line glides; a screw has none.
export function inHalfPlane(config: Config, atom: number): boolean {
  const crystal = crystalOf(config);
  const edge = crystal.burgers[0];
  if (edge === 0) return false;
  const p = crystal.atoms[atom];
  const across = p[0] - config.position;
  return p[2] > crystal.slipHeight && across > -edge / 2 + EPS && across <= edge / 2 + EPS;
}

//////////////// bonds

// how much longer than in the perfect crystal a bond across the slip plane may be and still be drawn
const BOND_STRETCH = 1.1;

// Nearest-neighbour bonds, as pairs of atoms. Away from the slip plane they are the perfect crystal's. Across it,
// an atom bonds to whichever atoms now sit below it: its old neighbours ahead of the line, the next ones over
// (by b) behind the line, and fewer right at the line, where it is halfway between.
export function bonds(config: Config): [number, number][] {
  const crystal = crystalOf(config);
  const limit = BOND_STRETCH * crystal.nearest;
  const out = [...crystal.bonds];
  const seen = new Set<number>();
  for (const [a, b] of crystal.crossings) {
    const id = a * crystal.atoms.length + b;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = atomPosition(config, a);
    const q = atomPosition(config, b);
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < limit) out.push([a, b]);
  }
  return out;
}

//////////////// the spiral ramp of a screw dislocation

// The ramp is drawn out to this distance from the line. It climbs one Burgers vector per turn at any distance,
// so it is steep, and looks like a screw thread, only close to the line.
export const rampRadius = (crystal: Crystal) => 2.6 * crystal.nearest;

// How many separate ramps the layers of atoms across the line make: the layers that one Burgers vector spans.
// (With two, the layers join alternately into two ramps wound inside each other, like a two-start thread.)
export const rampCount = (crystal: Crystal) => Math.max(1, Math.round(Math.abs(crystal.burgers[1]) / crystal.spacing[1]));

// which of those ramps the layer at height y along the line belongs to
export function rampOf(crystal: Crystal, y: number): number {
  const count = rampCount(crystal);
  return ((Math.round(y / crystal.spacing[1]) % count) + count) % count;
}

// whether this atom is on the part of the ramp that is drawn (only a dislocation with a screw part has a ramp)
export function onRamp(config: Config, atom: number): boolean {
  const crystal = crystalOf(config);
  if (crystal.burgers[1] === 0 || !lineInBlock(config)) return false;
  const p = crystal.atoms[atom];
  return Math.hypot(p[0] - config.position, p[2] - crystal.slipHeight) < rampRadius(crystal);
}

// the layers of atoms across the line: where each is along the line, and which ramp it belongs to
export function rampLayers(crystal: Crystal): { y: number; ramp: number }[] {
  const count = Math.round(crystal.size[1] / crystal.spacing[1]);
  return Array.from({ length: count + 1 }, (_, n) => ({
    y: n * crystal.spacing[1],
    ramp: rampOf(crystal, n * crystal.spacing[1]),
  }));
}

// points on a surface, in rows of `columns` points
export interface Grid {
  columns: number;
  rows: number;
  points: Vec3[];
}

// One turn of the ramp: what the layer of atoms across the line at height y has become, out to the ramp's radius
// from the line (less where the block ends). Rows go outward from the line, columns once around it, starting
// and ending on the slipped side of the slip plane. There the turn doesn't meet itself: it is the screw part of
// the Burgers vector apart, and meets another layer's turn instead, so the turns make one continuous ramp.
export function rampTurn(config: Config, y: number, around = 72, outward = 8): Grid {
  const crystal = crystalOf(config);
  const [edge, screw] = crystal.burgers;
  const x0 = config.position;
  const z0 = crystal.slipHeight;
  // the block's sides, half an atom outside its outermost atoms, measured from the line
  const margin = crystal.nearest / 2;
  const left = -margin - x0;
  const right = crystal.size[0] + margin - x0;
  const top = crystal.size[2] + margin - z0;
  const bottom = -margin - z0;
  const radiusOfRamp = rampRadius(crystal);
  const points: Vec3[] = [];
  for (let r = 0; r <= outward; r++) {
    for (let c = 0; c <= around; c++) {
      const theta = -Math.PI + (2 * Math.PI * c) / around;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const toSide = Math.abs(cos) < 1e-9 ? Infinity : (cos > 0 ? right : left) / cos;
      const toTop = Math.abs(sin) < 1e-9 ? Infinity : (sin > 0 ? top : bottom) / sin;
      const edgeOfRamp = Math.max(Math.min(radiusOfRamp, toSide, toTop), 0);
      // (the first row is just off the line: the displacement isn't defined on the line itself)
      const radius = Math.max((r / outward) * edgeOfRamp, 0.02);
      // the angle is given exactly at the two ends, so they are a full turn apart whatever the rounding
      const u = displacement(radius * cos, radius * sin, edge, 0);
      points.push([x0 + radius * cos + u[0], y + (screw * theta) / (2 * Math.PI), z0 + radius * sin + u[2]]);
    }
  }
  return { columns: around + 1, rows: outward + 1, points };
}

//////////////// the Burgers circuit

export type Heading = 'down' | 'right' | 'up' | 'left';

export interface Circuit {
  // the atoms visited, from start to finish, and where each was in the perfect crystal
  atoms: number[];
  points: Vec3[];
  // the four sides in the order they are walked, as seen from the front, with their number of steps
  legs: { heading: Heading; steps: number }[];
}

// how many layers the circuit reaches above and below the slip plane, and its least width in nearest-neighbour
// distances
const CIRCUIT_REACH = 3;
const CIRCUIT_WIDTH = 5.5;

// A Burgers circuit: atom-to-atom steps around the line that would return to the start in a perfect crystal
// (down, right, the same steps up again, the same steps left again). Around a dislocation it doesn't close; the
// gap from start to finish is the Burgers vector. The circuit is right-handed about the line sense
// (anticlockwise seen from the front), which fixes the sign: this is the start-to-finish / right-hand convention.
// Null if no such circuit fits in the block around the line's current position.
export function burgersCircuit(config: Config): Circuit | null {
  const crystal = crystalOf(config);
  const { right, up } = crystal.steps;
  const z0 = crystal.slipHeight;
  const b: Vec3 = [crystal.burgers[0], crystal.burgers[1], 0];
  const add = (p: Vec3, v: Vec3, sign: number): Vec3 => [p[0] + sign * v[0], p[1] + sign * v[1], p[2] + sign * v[2]];

  // enough steps across to be `CIRCUIT_WIDTH` wide, in whole repeats of the step sequence
  const perRepeat = right.reduce((sum, v) => sum + v[0], 0);
  const across = right.length * Math.ceil((CIRCUIT_WIDTH * crystal.nearest) / perRepeat - EPS);
  const down = 2 * CIRCUIT_REACH - 1;

  // the circuit from a given starting atom, with where it crosses the slip plane on its way down and up
  const from = (start: Vec3) => {
    const points = [start];
    let p = start;
    let crossedDownAt = 0;
    let crossedUpAt = 0;
    for (let n = 0; n < down; n++) {
      const q = add(p, up[n % up.length], -1);
      // on the slipped side, the neighbour below the slip plane is the one that slipped under: a Burgers vector over
      const crossing = p[2] > z0 && q[2] < z0;
      if (crossing) crossedDownAt = (p[0] + q[0]) / 2;
      p = crossing ? add(q, b, 1) : q;
      points.push(p);
    }
    for (let n = 0; n < across; n++) {
      p = add(p, right[n % right.length], 1);
      points.push(p);
    }
    // back up by the same steps in reverse, on the side that hasn't slipped, then back along the top
    for (let n = down - 1; n >= 0; n--) {
      const q = add(p, up[n % up.length], 1);
      if (p[2] < z0 && q[2] > z0) crossedUpAt = (p[0] + q[0]) / 2;
      p = q;
      points.push(p);
    }
    for (let n = across - 1; n >= 0; n--) {
      p = add(p, right[n % right.length], -1);
      points.push(p);
    }
    return { points, crossedDownAt, crossedUpAt };
  };

  // start on the top layer the circuit reaches; take the circuit best centred on the line, nearest the front
  const top = z0 + (CIRCUIT_REACH - 0.5) * crystal.spacing[2];
  const clear = 1.2 * crystal.nearest;
  let best: { atoms: number[]; points: Vec3[] } | null = null;
  let bestCost = Infinity;
  for (const start of crystal.atoms) {
    if (Math.abs(start[2] - top) > EPS) continue;
    const { points, crossedDownAt, crossedUpAt } = from(start);
    if (crossedDownAt > config.position - clear || crossedUpAt < config.position + clear) continue;
    const cost = Math.round(Math.abs((crossedDownAt + crossedUpAt) / 2 - config.position) * 1e3) * 1e3 + start[1];
    if (cost >= bestCost) continue;
    const atoms = points.map((point) => crystal.atomAt(point));
    if (atoms.some((atom) => atom === undefined)) continue;
    best = { atoms: atoms as number[], points };
    bestCost = cost;
  }
  if (!best) return null;
  return {
    ...best,
    legs: [
      { heading: 'down', steps: down },
      { heading: 'right', steps: across },
      { heading: 'up', steps: down },
      { heading: 'left', steps: across },
    ],
  };
}
