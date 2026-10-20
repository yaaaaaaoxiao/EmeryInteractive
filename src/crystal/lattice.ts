// Generates every atom and interstitial site from the structure data, and computes neighbours.

import type { SiteId, SiteType, Structure, Vec3 } from './structures';

const EPS = 1e-6;

export type ObjectKind = 'atom' | SiteId;

export interface CrystalObject {
  key: string;
  kind: ObjectKind;
  name: string;
  color: number;
  // position in units of a (inside the repeated block)
  pos: Vec3;
  // hard-sphere radius in units of a
  radius: number;
}

export interface SiteInfo {
  type: SiteType;
  // sites belonging to one unit cell (boundary sites counted once)
  perCell: number;
  coordination: number;
  // largest sphere that fits, in units of a, and as a fraction of the atom radius R
  radius: number;
  ratio: number;
}

export interface Neighbors {
  distance: number;
  positions: Vec3[];
}

//////////////// vector helpers

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function objectKey(kind: ObjectKind, pos: Vec3): string {
  return kind + ':' + pos.map((v) => (Math.abs(v) < EPS ? 0 : v).toFixed(4)).join(',');
}

//////////////// symmetry

// the 48 operations of the cubic point group: all permutations of (x, y, z) with all sign changes
const CUBIC_OPS: ((v: Vec3) => Vec3)[] = (() => {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const ops: ((v: Vec3) => Vec3)[] = [];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const sign = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      ops.push((v) => [sign[0] * v[p[0]], sign[1] * v[p[1]], sign[2] * v[p[2]]]);
    }
  }
  return ops;
})();

const wrap = (x: number): number => {
  const w = x - Math.floor(x);
  return w > 1 - EPS ? 0 : w;
};

// all distinct positions in one unit cell, [0, 1), equivalent to `representative`
export function orbit(representative: Vec3, centering: Vec3[]): Vec3[] {
  const out = new Map<string, Vec3>();
  for (const op of CUBIC_OPS) {
    const v = op(representative);
    for (const c of centering) {
      const w: Vec3 = [wrap(v[0] + c[0]), wrap(v[1] + c[1]), wrap(v[2] + c[2])];
      out.set(objectKey('atom', w), w);
    }
  }
  return [...out.values()];
}

// every image of the unit-cell positions that lies inside the block [0, n] (boundaries included)
export function imagesInBlock(positions: Vec3[], repeat: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const p of positions) {
    for (let i = 0; i <= repeat[0]; i++) {
      for (let j = 0; j <= repeat[1]; j++) {
        for (let k = 0; k <= repeat[2]; k++) {
          const q: Vec3 = [p[0] + i, p[1] + j, p[2] + k];
          if (q.every((v, axis) => v <= repeat[axis] + EPS)) out.push(q);
        }
      }
    }
  }
  return out;
}

//////////////// neighbours

// all atoms of the infinite lattice within `cutoff` of `center`
function atomsNear(structure: Structure, center: Vec3, cutoff: number): Vec3[] {
  const out: Vec3[] = [];
  const lo = center.map((c) => Math.floor(c - cutoff) - 1);
  const hi = center.map((c) => Math.ceil(c + cutoff) + 1);
  for (let i = lo[0]; i <= hi[0]; i++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let k = lo[2]; k <= hi[2]; k++) {
        for (const c of structure.centering) {
          const p: Vec3 = [i + c[0], j + c[1], k + c[2]];
          if (dist(p, center) <= cutoff) out.push(p);
        }
      }
    }
  }
  return out;
}

// atoms surrounding a point (excluding an atom sitting exactly on the point):
// the `count` closest ones if given, otherwise the nearest shell
export function nearestAtoms(structure: Structure, center: Vec3, count?: number): Neighbors {
  const candidates = atomsNear(structure, center, 1.5)
    .filter((p) => dist(p, center) > EPS)
    .sort((a, b) => dist(a, center) - dist(b, center));
  const d = dist(candidates[0], center);
  const positions = count ? candidates.slice(0, count) : candidates.filter((p) => dist(p, center) < d + 1e-4);
  return { distance: d, positions };
}

export function siteInfo(structure: Structure, site: SiteType): SiteInfo {
  // the largest sphere that fits is limited by the closest atom
  const radius = nearestAtoms(structure, site.representative).distance - structure.atomRadius;
  return {
    type: site,
    perCell: orbit(site.representative, structure.centering).length,
    coordination: site.coordination,
    radius,
    ratio: radius / structure.atomRadius,
  };
}

export interface Shell {
  count: number;
  distance: number;
}

// the surrounding atoms grouped by distance, e.g. the distorted BCC octahedron: 2 at 0.5a + 4 at 0.707a
export function neighborShells(structure: Structure, site: SiteType): Shell[] {
  const { positions } = nearestAtoms(structure, site.representative, site.coordination);
  const shells: Shell[] = [];
  for (const p of positions) {
    const d = dist(p, site.representative);
    const shell = shells.find((s) => Math.abs(s.distance - d) < 1e-4);
    if (shell) shell.count++;
    else shells.push({ count: 1, distance: d });
  }
  return shells.sort((a, b) => a.distance - b.distance);
}

export interface DoorwaySide {
  type: SiteType;
  position: Vec3;
  // from the doorway to that site, in units of a
  distance: number;
  // the largest sphere that fits in that site
  ratio: number;
}

// for a doorway (saddle point): the nearest site of each kind it connects. Null for a pocket.
export function doorwaySides(structure: Structure, site: SiteType): DoorwaySide[] | null {
  if (!site.doorwayBetween) return null;
  const used = new Set<string>();
  return site.doorwayBetween.map((id) => {
    const type = structure.sites.find((t) => t.id === id);
    if (!type) throw new Error(`${structure.id}: unknown site ${id}`);
    // every site of that kind near the doorway, closest first (skipping one already used on the other side)
    const candidates: Vec3[] = [];
    for (const p of orbit(type.representative, structure.centering)) {
      for (const offset of [-1, 0, 1]) {
        for (const o2 of [-1, 0, 1]) {
          for (const o3 of [-1, 0, 1]) candidates.push([p[0] + offset, p[1] + o2, p[2] + o3]);
        }
      }
    }
    candidates.sort((a, b) => dist(a, site.representative) - dist(b, site.representative));
    const nearest = candidates.find((p) => !used.has(objectKey(id, p))) as Vec3;
    used.add(objectKey(id, nearest));
    return { type, position: nearest, distance: dist(nearest, site.representative), ratio: siteInfo(structure, type).ratio };
  });
}

//////////////// objects in the block

export type PositionGroup = 'corner' | 'edge' | 'face' | 'interior';

export const POSITION_GROUPS: PositionGroup[] = ['corner', 'edge', 'face', 'interior'];

// where a position sits in its unit cell, by how many coordinates lie on a cell boundary:
// 3 → corner, 2 → edge, 1 → face, 0 → inside (in repeated cells, every cell counts)
export function positionGroup(pos: Vec3): PositionGroup {
  const onBoundary = pos.filter((v) => Math.abs(v - Math.round(v)) < EPS).length;
  return (['interior', 'face', 'edge', 'corner'] as const)[onBoundary];
}

export function atomObjects(structure: Structure, repeat: Vec3): CrystalObject[] {
  return imagesInBlock(orbit([0, 0, 0], structure.centering), repeat).map((pos) => ({
    key: objectKey('atom', pos),
    kind: 'atom',
    name: 'Atom',
    color: structure.color,
    pos,
    radius: structure.atomRadius,
  }));
}

export function siteObjects(structure: Structure, site: SiteType, repeat: Vec3): CrystalObject[] {
  const { radius } = siteInfo(structure, site);
  return imagesInBlock(orbit(site.representative, structure.centering), repeat).map((pos) => ({
    key: objectKey(site.id, pos),
    kind: site.id,
    name: site.name + ' site',
    color: site.color,
    pos,
    radius,
  }));
}

//////////////// formatting and integer indices

// 0.3333 -> "1/3", 1.5 -> "3/2", 0.375 -> "3/8"
export function fraction(x: number): string {
  if (Math.abs(x) < EPS) return '0';
  for (let den = 1; den <= 24; den++) {
    const num = Math.round(x * den);
    if (Math.abs(num / den - x) < 1e-4) return den === 1 ? String(num) : `${num}/${den}`;
  }
  return x.toFixed(3);
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

// scale a direction/normal to the smallest integers with the same ratio, e.g. (0.5, 0.5, 0) -> [1, 1, 0]
export function toIntegerIndices(v: Vec3): Vec3 {
  for (let den = 1; den <= 24; den++) {
    const scaled = v.map((x) => x * den);
    const ints = scaled.map(Math.round);
    if (scaled.every((x, i) => Math.abs(x - ints[i]) < 1e-4 * den)) {
      const g = ints.reduce((acc, x) => gcd(acc, x), 0) || 1;
      return ints.map((x) => x / g) as Vec3;
    }
  }
  // not a rational ratio with small denominators: normalise so the largest component is 1
  const m = Math.max(...v.map(Math.abs));
  return v.map((x) => +(x / m).toFixed(3)) as Vec3;
}
