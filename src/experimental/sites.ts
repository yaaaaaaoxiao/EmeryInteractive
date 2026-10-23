// EXPERIMENTAL: not used by the website (nothing in the app imports it). Its tests are in tests/experimental/.
//
// Finds a crystal's interstitial sites by computation instead of listing them by hand. Picture, at every point, the
// distance to the nearest atom's surface: the sites are the special ("critical") points of that landscape, and
// each one lies among the atoms whose surfaces are nearest to it, which can surround it as
// - a polyhedron (tetrahedron, octahedron, cube...): a local maximum, a POCKET
// - a flat polygon (triangle, square, hexagon...): a saddle, a DOORWAY between pockets
// - a pair, one each side: a saddle, a GAP between two atoms
// Each site is the centre of a sphere touching those atoms (radius = the room there), so the search solves for such
// spheres around every pair, triple and quadruple of nearby atoms and keeps those with no atom inside.
//
// For now: cubic cells (positions in units of a). Sites are grouped by their surroundings (kind, size and the
// atoms around them), which needs no symmetry tables; equivalent sites always have the same surroundings.

import type { Vec3 } from '../crystal/structures';

export interface Atom {
  element: string;
  // fractional, in [0, 1)
  position: Vec3;
  // hard-sphere radius, in units of a
  radius: number;
}

// one cubic unit cell, every atom in it listed
export interface Crystal {
  name: string;
  atoms: Atom[];
}

export type SiteKind = 'pocket' | 'doorway' | 'gap';

export interface Shell {
  count: number;
  // from the site's centre to these atoms' surfaces (the first shell's is the site's radius)
  gap: number;
  // how many of each element
  elements: Record<string, number>;
}

export interface FoundSite {
  kind: SiteKind;
  // from the shape of the nearest atoms: tetrahedral, octahedral, cubic, triangular, square, hexagonal...
  shape: string;
  // one position (in [0, 1)), and how many such sites one unit cell holds
  representative: Vec3;
  perCell: number;
  // the surrounding atoms, nearest first (the first shell is the atoms that give `kind` and `shape`)
  shells: Shell[];
  // the largest sphere that fits, in units of a, and as a fraction of the radius of the atoms around it (the larger,
  // if they differ)
  radius: number;
  ratio: number;
}

const EPS = 1e-6;
// sites closer than this (in units of a) are the same site
const SAME = 1e-5;

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
  return w > 1 - SAME || w < SAME ? 0 : w;
};
const key = (p: Vec3) => p.map((v) => (Math.abs(v) < SAME ? 0 : v).toFixed(4)).join();

//////////////// spheres touching atoms

// every copy of the cell's atoms with all coordinates in [-reach, 1 + reach]
function atomsAround(crystal: Crystal, reach: number): Atom[] {
  const out: Atom[] = [];
  const lo = Math.floor(-reach) - 1;
  const hi = Math.ceil(1 + reach) + 1;
  for (let i = lo; i <= hi; i++)
    for (let j = lo; j <= hi; j++)
      for (let k = lo; k <= hi; k++)
        for (const atom of crystal.atoms) {
          const position = add(atom.position, [i, j, k]);
          if (position.every((v) => v >= -reach - EPS && v <= 1 + reach + EPS)) out.push({ ...atom, position });
        }
  return out;
}

// A neighbour as seen from an atom at the origin with radius r0. A sphere centred at y with radius t touches both
// when |y| = r0 + t and |y - v| = r + t; subtracting the two (squared) leaves a linear equation, v·y = c - d t.
interface Neighbor {
  v: Vec3;
  radius: number;
  c: number;
  d: number;
}

// The sphere centre y = y0 - y1 t found from the linear equations, with |y| = r0 + t: solve that quadratic for the
// radius t. Every solution with room (t > 0).
function touching(y0: Vec3, y1: Vec3, r0: number): { y: Vec3; t: number }[] {
  // |y0 - y1 t|² = (r0 + t)²
  const qa = dot(y1, y1) - 1;
  const qb = -2 * (dot(y0, y1) + r0);
  const qc = dot(y0, y0) - r0 * r0;
  const roots: number[] = [];
  if (Math.abs(qa) < EPS) {
    if (Math.abs(qb) > EPS) roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -EPS) return [];
    const s = Math.sqrt(Math.max(0, disc));
    roots.push((-qb - s) / (2 * qa), (-qb + s) / (2 * qa));
  }
  return roots.filter((t) => t > EPS).map((t) => ({ y: sub(y0, scale(y1, t)), t }));
}

// a sphere touching the atom and one neighbour, centred on the line between them
function touchingPair(a: Neighbor, r0: number): { y: Vec3; t: number }[] {
  const d = length(a.v);
  const t = (d - r0 - a.radius) / 2;
  return t > EPS ? [{ y: scale(a.v, (r0 + t) / d), t }] : [];
}

// spheres touching the atom and two neighbours, centred in the plane of the three
function touchingTriple(a: Neighbor, b: Neighbor, r0: number): { y: Vec3; t: number }[] {
  // y = α a + β b, so a·y and b·y give α and β (each linear in t)
  const [aa, ab, bb] = [dot(a.v, a.v), dot(a.v, b.v), dot(b.v, b.v)];
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < EPS) return [];
  const solve = (x: number, z: number): Vec3 => add(scale(a.v, (x * bb - z * ab) / det), scale(b.v, (z * aa - x * ab) / det));
  return touching(solve(a.c, b.c), solve(a.d, b.d), r0);
}

// spheres touching the atom and three neighbours
function touchingQuadruple(a: Neighbor, b: Neighbor, c: Neighbor, r0: number): { y: Vec3; t: number }[] {
  const det = dot(a.v, cross(b.v, c.v));
  if (Math.abs(det) < EPS) return [];
  const solve = (x: number, y: number, z: number): Vec3 =>
    scale(add(add(scale(cross(b.v, c.v), x), scale(cross(c.v, a.v), y)), scale(cross(a.v, b.v), z)), 1 / det);
  return touching(solve(a.c, b.c, c.c), solve(a.d, b.d, c.d), r0);
}

// every empty sphere touching two, three or four atoms, around each atom of the cell
function candidates(crystal: Crystal, atoms: Atom[]): Vec3[] {
  const out: Vec3[] = [];
  for (const atom of crystal.atoms) {
    const r0 = atom.radius;
    const around = atoms.map((n) => ({ v: sub(n.position, atom.position), radius: n.radius })).filter((n) => length(n.v) > EPS);
    // the atoms that can share a site with this one: within about twice the nearest neighbour
    const nearest = Math.min(...around.map((n) => length(n.v)));
    const neighbors: Neighbor[] = around
      .filter((n) => length(n.v) < 2.2 * nearest)
      .map((n) => ({ ...n, c: (dot(n.v, n.v) - n.radius * n.radius + r0 * r0) / 2, d: n.radius - r0 }));
    // no atom may reach into the sphere (checked against these neighbours here, and against all atoms later)
    const empty = ({ y, t }: { y: Vec3; t: number }) =>
      length(y) - r0 >= t - EPS && neighbors.every((n) => dist(y, n.v) - n.radius >= t - EPS);
    const keep = (spheres: { y: Vec3; t: number }[]) => {
      for (const s of spheres) if (empty(s)) out.push(add(atom.position, s.y));
    };

    for (const a of neighbors) keep(touchingPair(a, r0));
    for (const [a, b] of pairs(neighbors)) keep(touchingTriple(a, b, r0));
    for (const [a, b, c] of triples(neighbors)) keep(touchingQuadruple(a, b, c, r0));
  }
  return out;
}

//////////////// is it a site, and of which kind

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

// c's kind if it's a critical point, null if it isn't. `around` are the directions to its nearest atoms, as points
// one unit from c: c is critical when it lies inside their shape (for equal atoms, the same as inside the shape of
// the atoms themselves). On that shape's boundary (a face, an edge) it's whatever the smaller shape there gives.
function classify(c: Vec3, around: Vec3[]): SiteKind | null {
  const dim = spanDimension(around);
  if (dim === 1) {
    return around.length === 2 && dist(scale(add(around[0], around[1]), 0.5), c) < EPS ? 'gap' : null;
  }
  if (dim === 2) {
    const normal = planeNormal(around);
    if (Math.abs(dot(normal, sub(c, around[0]))) > EPS) return null;
    // the polygon's edges: lines through two of the points with all the others on one side
    for (const [p, q] of pairs(around)) {
      const out = cross(normal, sub(q, p));
      const verdict = boundary(c, around, p, scale(out, 1 / length(out)));
      if (verdict !== 'inside') return verdict;
    }
    return 'doorway';
  }
  if (dim === 3) {
    // the polyhedron's faces: planes through three of the points with all the others on one side
    for (const [p, q, r] of triples(around)) {
      const n = cross(sub(q, p), sub(r, p));
      if (length(n) < EPS) continue;
      const verdict = boundary(c, around, p, scale(n, 1 / length(n)));
      if (verdict !== 'inside') return verdict;
    }
    return 'pocket';
  }
  return null;
}

// for a line (or plane) through p with unit normal n: 'inside' unless it bounds the shape and c is outside it
// (null) or on it (classified by the points on it)
function boundary(c: Vec3, points: Vec3[], p: Vec3, n: Vec3): SiteKind | null | 'inside' {
  const sides = points.map((s) => dot(n, sub(s, p)));
  const sign = sides.every((s) => s >= -EPS) ? 1 : sides.every((s) => s <= EPS) ? -1 : 0;
  if (!sign) return 'inside';
  const side = sign * dot(n, sub(c, p));
  if (side < -EPS) return null;
  if (side < EPS)
    return classify(
      c,
      points.filter((_, i) => Math.abs(sides[i]) < EPS),
    );
  return 'inside';
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

// a name from the shape of the nearest atoms, with what they are when the crystal has more than one element
function shapeOf(kind: SiteKind, nearest: Shell, mixed: boolean): string {
  const n = nearest.count;
  const name =
    kind === 'gap'
      ? 'between two atoms'
      : kind === 'doorway'
        ? (({ 3: 'triangular', 4: 'square', 6: 'hexagonal' } as Record<number, string>)[n] ?? `${n}-sided window`)
        : (({ 4: 'tetrahedral', 6: 'octahedral', 8: 'cubic' } as Record<number, string>)[n] ?? `${n}-coordinated`);
  if (!mixed) return name;
  const what = Object.entries(nearest.elements)
    .sort()
    .map(([element, count]) => `${count} ${element}`)
    .join(', ');
  return `${name} (${what})`;
}

//////////////// all together

// every interstitial site of the crystal, one entry per kind of site (equal surroundings), largest first. Points
// where atoms touch (no room for any sphere, as halfway between touching neighbours) are left out.
export function findSites(crystal: Crystal): FoundSite[] {
  const atoms = atomsAround(crystal, 2);
  const mixed = new Set(crystal.atoms.map((a) => a.element)).size > 1;

  const unique = new Map<string, Vec3>();
  for (const c of candidates(crystal, atoms)) {
    const w = c.map(wrap) as Vec3;
    unique.set(key(w), w);
  }
  // in a fixed order, so the representatives are always the same
  const ordered = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  const kinds = new Map<string, FoundSite>();
  for (const c of ordered) {
    const byGap = atoms.map((atom) => ({ atom, gap: dist(atom.position, c) - atom.radius })).sort((a, b) => a.gap - b.gap);
    const radius = byGap[0].gap;
    if (radius <= EPS) continue;
    const nearest = byGap.filter((x) => x.gap < radius + EPS);
    const directions = nearest.map(({ atom }) => {
      const v = sub(atom.position, c);
      return add(c, scale(v, 1 / length(v)));
    });
    const kind = classify(c, directions);
    if (!kind) continue;

    const shells: Shell[] = [];
    for (const { atom, gap } of byGap) {
      let shell = shells.at(-1);
      if (!shell || gap - shell.gap > EPS) {
        if (shells.length === 3) break;
        shell = { count: 0, gap, elements: {} };
        shells.push(shell);
      }
      shell.count++;
      shell.elements[atom.element] = (shell.elements[atom.element] ?? 0) + 1;
    }
    // sites with the same surroundings are the same kind of site
    const signature = [
      kind,
      radius.toFixed(5),
      ...shells.map((s) => `${s.count}@${s.gap.toFixed(5)}:${Object.entries(s.elements).sort().join()}`),
    ].join('|');
    const known = kinds.get(signature);
    if (known) {
      known.perCell++;
      continue;
    }
    const larger = Math.max(...nearest.map((x) => x.atom.radius));
    kinds.set(signature, {
      kind,
      shape: shapeOf(kind, shells[0], mixed),
      representative: c,
      perCell: 1,
      shells,
      radius,
      ratio: radius / larger,
    });
  }
  return [...kinds.values()].sort((a, b) => b.radius - a.radius || a.kind.localeCompare(b.kind));
}
