// EXPERIMENTAL: not used by the website (nothing in the app imports it). Its tests are in tests/experimental/.
//
// Finds a crystal's interstitial sites by computation instead of listing them by hand. Picture, at every point, the
// distance to the nearest atom centre: the sites are the special ("critical") points of that landscape, and each one
// lies inside the shape its nearest atoms form:
// - inside a polyhedron of atoms (tetrahedron, octahedron, cube...): a local maximum, a POCKET
// - inside a flat polygon of atoms (triangle, square...): a saddle, a DOORWAY between pockets
// - halfway between two atoms: a saddle, a GAP between them
// The candidates come from each atom's Voronoi cell (the region closer to it than to any other atom): pockets can
// only be at its corners, doorways on its edges, gaps on its faces.
//
// For now: cubic lattices with one kind of atom (positions in units of a), grouped by the cube's symmetry.

import { orbit } from '../crystal/lattice';
import type { Vec3 } from '../crystal/structures';

export type SiteKind = 'pocket' | 'doorway' | 'gap';

export interface Lattice {
  // atom positions in one cell (fractional)
  centering: Vec3[];
  // hard-sphere atom radius R
  atomRadius: number;
}

export interface Shell {
  count: number;
  distance: number;
}

export interface FoundSite {
  kind: SiteKind;
  // from the shape of the nearest atoms: tetrahedral, octahedral, cubic, triangular, square...
  shape: string;
  // one position (in [0, 1)), and how many equivalent sites one unit cell holds
  representative: Vec3;
  perCell: number;
  // the surrounding atoms by distance (the first shell is the nearest atoms, whose shape gives `kind`)
  shells: Shell[];
  // the largest sphere that fits, in units of a, and as a fraction of R
  radius: number;
  ratio: number;
}

const EPS = 1e-6;
// a Voronoi cell's walls come from neighbours closer than this (in units of a); enough for these lattices
const NEIGHBOR_REACH = 1.5;

//////////////// vectors

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const dist = (a: Vec3, b: Vec3) => length(sub(a, b));
const wrap = (v: number) => {
  const w = v - Math.floor(v);
  return w > 1 - EPS || w < EPS ? 0 : w;
};
const key = (p: Vec3) => p.map((v) => (Math.abs(v) < EPS ? 0 : v).toFixed(5)).join();

//////////////// the search

// every atom with all coordinates in [-reach, 1 + reach]
function atomsAround(lattice: Lattice, reach: number): Vec3[] {
  const out: Vec3[] = [];
  const lo = Math.floor(-reach) - 1;
  const hi = Math.ceil(1 + reach) + 1;
  for (let i = lo; i <= hi; i++)
    for (let j = lo; j <= hi; j++)
      for (let k = lo; k <= hi; k++)
        for (const c of lattice.centering) {
          const p: Vec3 = [i + c[0], j + c[1], k + c[2]];
          if (p.every((v) => v >= -reach - EPS && v <= 1 + reach + EPS)) out.push(p);
        }
  return out;
}

// points that could be critical: corners, edge points and face points of each atom's Voronoi cell
function candidates(lattice: Lattice, atoms: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const center of lattice.centering) {
    // the cell's walls, relative to the atom: the points y with v·y = w are halfway to the neighbour at v
    const walls = atoms
      .map((n) => sub(n, center))
      .filter((v) => length(v) > EPS && length(v) < NEIGHBOR_REACH)
      .map((v) => ({ v, w: dot(v, v) / 2 }));
    const inside = (y: Vec3) => walls.every((p) => dot(p.v, y) <= p.w + EPS);
    const keep = (y: Vec3 | null) => {
      if (y && inside(y)) out.push(add(center, y));
    };

    // gaps: halfway to a neighbour
    for (const a of walls) keep(scale(a.v, 0.5));
    // doorways: the centre of the circle through the atom and two neighbours (on the line where two walls meet)
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) keep(circleCenter(walls[i].v, walls[j].v));
    // pockets: where three walls meet
    for (let i = 0; i < walls.length; i++)
      for (let j = i + 1; j < walls.length; j++)
        for (let k = j + 1; k < walls.length; k++) keep(meet(walls[i], walls[j], walls[k]));
  }
  return out;
}

// the centre of the circle through 0, a and b (null if they're in a line)
function circleCenter(a: Vec3, b: Vec3): Vec3 | null {
  // c = α a + β b with c·a = |a|²/2 and c·b = |b|²/2
  const [aa, ab, bb] = [dot(a, a), dot(a, b), dot(b, b)];
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < EPS) return null;
  const alpha = ((aa / 2) * bb - (bb / 2) * ab) / det;
  const beta = ((bb / 2) * aa - (aa / 2) * ab) / det;
  return add(scale(a, alpha), scale(b, beta));
}

// the point on all three walls (null if they don't meet in one point)
function meet(p: { v: Vec3; w: number }, q: { v: Vec3; w: number }, r: { v: Vec3; w: number }): Vec3 | null {
  const det = dot(p.v, cross(q.v, r.v));
  if (Math.abs(det) < EPS) return null;
  return scale(add(add(scale(cross(q.v, r.v), p.w), scale(cross(r.v, p.v), q.w)), scale(cross(p.v, q.v), r.w)), 1 / det);
}

//////////////// is it critical, and of which kind

// how many independent directions the points span (0 for one point, 1 for a line, 2 for a plane, 3 for space)
function spanDimension(points: Vec3[]): number {
  const basis: Vec3[] = [];
  for (const p of points.slice(1)) {
    let v = sub(p, points[0]);
    for (const b of basis) v = sub(v, scale(b, dot(v, b)));
    if (length(v) > EPS) basis.push(scale(v, 1 / length(v)));
  }
  return basis.length;
}

// c's kind if it's a critical point, given its nearest atoms (all equally far), or null if it isn't one. On the
// boundary of their shape (a face of the polyhedron, an edge of the polygon) it's whatever that smaller shape gives.
function classify(c: Vec3, nearest: Vec3[]): SiteKind | null {
  const dim = spanDimension(nearest);
  if (dim === 1) {
    // (atoms equally far from c and in a line can only be a pair)
    return nearest.length === 2 && dist(scale(add(nearest[0], nearest[1]), 0.5), c) < EPS ? 'gap' : null;
  }
  if (dim === 2) {
    const normal = planeNormal(nearest);
    if (Math.abs(dot(normal, sub(c, nearest[0]))) > EPS) return null;
    // the polygon's edges: lines through two of the atoms with all the others on one side
    for (const [p, q] of pairs(nearest)) {
      const out = cross(normal, sub(q, p));
      const unit = scale(out, 1 / length(out));
      const sides = nearest.map((s) => dot(unit, sub(s, p)));
      const sign = sides.every((s) => s >= -EPS) ? 1 : sides.every((s) => s <= EPS) ? -1 : 0;
      if (!sign) continue;
      const side = sign * dot(unit, sub(c, p));
      if (side < -EPS) return null;
      if (side < EPS)
        return classify(
          c,
          nearest.filter((_, i) => Math.abs(sides[i]) < EPS),
        );
    }
    return 'doorway';
  }
  if (dim === 3) {
    // the polyhedron's faces: planes through three of the atoms with all the others on one side
    for (const [p, q, r] of triples(nearest)) {
      const n = cross(sub(q, p), sub(r, p));
      if (length(n) < EPS) continue;
      const unit = scale(n, 1 / length(n));
      const sides = nearest.map((s) => dot(unit, sub(s, p)));
      const sign = sides.every((s) => s >= -EPS) ? 1 : sides.every((s) => s <= EPS) ? -1 : 0;
      if (!sign) continue;
      const side = sign * dot(unit, sub(c, p));
      if (side < -EPS) return null;
      if (side < EPS)
        return classify(
          c,
          nearest.filter((_, i) => Math.abs(sides[i]) < EPS),
        );
    }
    return 'pocket';
  }
  return null;
}

function planeNormal(points: Vec3[]): Vec3 {
  for (const [p, q, r] of triples(points)) {
    const n = cross(sub(q, p), sub(r, p));
    if (length(n) > EPS) return scale(n, 1 / length(n));
  }
  throw new Error('points are in a line');
}

function* pairs<T>(xs: T[]): Generator<[T, T]> {
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) yield [xs[i], xs[j]];
}

function* triples<T>(xs: T[]): Generator<[T, T, T]> {
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) for (let k = j + 1; k < xs.length; k++) yield [xs[i], xs[j], xs[k]];
}

// a name from the shape of the nearest atoms
function shapeOf(kind: SiteKind, count: number): string {
  if (kind === 'gap') return 'between two atoms';
  if (kind === 'doorway') return count === 3 ? 'triangular' : count === 4 ? 'square' : `${count}-sided window`;
  return count === 4 ? 'tetrahedral' : count === 6 ? 'octahedral' : count === 8 ? 'cubic' : `${count}-coordinated`;
}

//////////////// all together

// every interstitial site of the lattice, one entry per kind of equivalent sites, largest first. Sites where the
// atoms touch (no room for any sphere, as halfway between touching neighbours) are left out.
export function findSites(lattice: Lattice): FoundSite[] {
  const atoms = atomsAround(lattice, 2);
  const seen = new Set<string>();
  const sites: FoundSite[] = [];

  const unique = new Map<string, Vec3>();
  for (const c of candidates(lattice, atoms)) {
    const w = c.map(wrap) as Vec3;
    unique.set(key(w), w);
  }
  // in a fixed order, so the representatives are always the same
  const ordered = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  for (const c of ordered) {
    if (seen.has(key(c))) continue;
    const byDistance = atoms.map((p) => ({ p, d: dist(p, c) })).sort((a, b) => a.d - b.d);
    const d = byDistance[0].d;
    const radius = d - lattice.atomRadius;
    if (radius <= EPS) continue;
    const nearest = byDistance.filter((x) => x.d < d + EPS).map((x) => x.p);
    const kind = classify(c, nearest);
    if (!kind) continue;

    const equivalent = orbit(c, lattice.centering);
    for (const p of equivalent) seen.add(key(p));
    const shells: Shell[] = [];
    for (const { d: r } of byDistance.slice(0, 32)) {
      const shell = shells.at(-1);
      if (shell && Math.abs(shell.distance - r) < EPS) shell.count++;
      else shells.push({ count: 1, distance: r });
    }
    sites.push({
      kind,
      shape: shapeOf(kind, nearest.length),
      representative: c,
      perCell: equivalent.length,
      shells: shells.slice(0, 3),
      radius,
      ratio: radius / lattice.atomRadius,
    });
  }
  return sites.sort((a, b) => b.radius - a.radius);
}
