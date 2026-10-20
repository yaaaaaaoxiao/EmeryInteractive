// The single source of truth for what is on screen. Controls change fields here; the scene is rebuilt from it.

import { STRUCTURES, type SiteId, type StructureId, type Vec3 } from './crystal/structures';
import { atomObjects, dist, nearestAtoms, sub, toIntegerIndices, type ObjectKind } from './crystal/lattice';

export type Style = 'hard' | 'sparse';
export type SliceMode = 'section' | 'cutaway';

export interface State {
  structure: StructureId;
  showAtoms: boolean;
  showSites: Partial<Record<SiteId, boolean>>;
  style: Style;
  clipToCell: boolean;
  opacity: number;
  polyhedra: boolean;
  repeat: Vec3;
  // one plane: (h k l) and its distance from the origin along the unit normal, in units of a
  plane: { hkl: Vec3; offset: number; show: boolean };
  slice: { on: boolean; mode: SliceMode; flip: boolean };
  neighbors: { on: boolean; target: string | null };
  // keys of selected objects (see objectKey)
  selection: string[];
  marker: Vec3 | null;
  // `vector` is what is drawn; `uvw` is the integer index shown in the inputs
  direction: { uvw: Vec3; from: Vec3; vector: Vec3; fromSelection: boolean } | null;
  labels: boolean;
}

export const MAX_SELECTED = 8;

export function defaultState(): State {
  return {
    structure: 'fcc',
    showAtoms: true,
    showSites: {},
    style: 'hard',
    clipToCell: true,
    opacity: 0.8,
    polyhedra: false,
    repeat: [1, 1, 1],
    plane: { hkl: [1, 0, 0], offset: 0.5, show: false },
    slice: { on: false, mode: 'section', flip: false },
    neighbors: { on: false, target: null },
    selection: [],
    marker: null,
    direction: null,
    labels: true,
  };
}

//////////////// keys

export function parseKey(key: string): { kind: ObjectKind; pos: Vec3 } {
  const [kind, coords] = key.split(':');
  return { kind: kind as ObjectKind, pos: coords.split(',').map(Number) as Vec3 };
}

//////////////// planes

export function unitNormal(hkl: Vec3): Vec3 {
  const len = Math.hypot(...hkl) || 1;
  return hkl.map((v) => v / len) as Vec3;
}

// textbook plane for (h k l): intercepts 1/h, 1/k, 1/l, with the origin moved to the far side for negative indices
export function standardOffset(hkl: Vec3): number {
  const len = Math.hypot(...hkl) || 1;
  const shift = hkl.reduce((acc, v) => acc + (v < 0 ? v : 0), 0);
  return (1 + shift) / len;
}

// range of offsets for which the plane cuts the block
export function offsetRange(hkl: Vec3, repeat: Vec3): [number, number] {
  const n = unitNormal(hkl);
  const values: number[] = [];
  for (const x of [0, repeat[0]]) for (const y of [0, repeat[1]]) for (const z of [0, repeat[2]]) {
    values.push(n[0] * x + n[1] * y + n[2] * z);
  }
  return [Math.min(...values), Math.max(...values)];
}

//////////////// store

type Listener = (state: State, previous: State) => void;

export class Store {
  private listeners: Listener[] = [];
  constructor(public state: State) {}

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  set(update: Partial<State> | ((s: State) => Partial<State>)): void {
    const previous = this.state;
    const patch = typeof update === 'function' ? update(previous) : update;
    this.state = { ...previous, ...patch };
    this.listeners.forEach((l) => l(this.state, previous));
  }

  //////////////// actions with rules between fields

  setStructure(structure: StructureId): void {
    this.set((s) => ({
      structure,
      selection: [],
      direction: null,
      neighbors: { on: s.neighbors.on, target: s.neighbors.on ? typicalAtom(structure) : null },
    }));
  }

  setRepeat(repeat: Vec3): void {
    // drop selected objects that no longer exist in the smaller block
    this.set((s) => ({
      repeat,
      selection: s.selection.filter((k) => parseKey(k).pos.every((v, i) => v <= repeat[i] + 1e-6)),
    }));
  }

  setNeighborsOn(on: boolean): void {
    this.set((s) => ({ neighbors: { on, target: on ? s.neighbors.target ?? typicalAtom(s.structure) : s.neighbors.target } }));
  }

  // click on an object: select it (shift adds/removes), or pick the neighbours target in that mode
  clickObject(key: string | null, additive: boolean): void {
    const s = this.state;
    if (s.neighbors.on) {
      if (key) this.set({ neighbors: { on: true, target: key } });
      return;
    }
    let selection: string[];
    if (!key) selection = additive ? s.selection : [];
    else if (!additive) selection = s.selection.length === 1 && s.selection[0] === key ? [] : [key];
    else if (s.selection.includes(key)) selection = s.selection.filter((k) => k !== key);
    else selection = [...s.selection, key].slice(-MAX_SELECTED);
    this.setSelection(selection);
  }

  setSelection(selection: string[]): void {
    const s = this.state;
    const pos = selection.map((k) => parseKey(k).pos);
    const patch: Partial<State> = { selection };

    if (pos.length === 2) {
      // two objects: the direction between them
      const vector = sub(pos[1], pos[0]);
      patch.direction = { uvw: toIntegerIndices(vector), from: pos[0], vector, fromSelection: true };
    } else if (s.direction?.fromSelection) {
      patch.direction = null;
    }

    if (pos.length === 3) {
      // three objects: the plane through them, if they are not on one line
      const a = sub(pos[1], pos[0]);
      const b = sub(pos[2], pos[0]);
      const normal: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (Math.hypot(...normal) > 1e-6) {
        const hkl = toIntegerIndices(normal);
        const n = unitNormal(hkl);
        const offset = n[0] * pos[0][0] + n[1] * pos[0][1] + n[2] * pos[0][2];
        patch.plane = { hkl, offset, show: true };
      }
    }
    this.set(patch);
  }
}

// a representative atom for the neighbours tool: the one closest to the cell centre
export function typicalAtom(structure: StructureId): string {
  const atoms = atomObjects(STRUCTURES[structure], [1, 1, 1]);
  const center: Vec3 = [0.5, 0.5, 0.5];
  atoms.sort((a, b) => dist(a.pos, center) - dist(b.pos, center));
  return atoms[0].key;
}

export function neighborsOf(structure: StructureId, key: string) {
  const s = STRUCTURES[structure];
  const { kind, pos } = parseKey(key);
  const site = s.sites.find((t) => t.id === kind);
  return { kind, pos, site, ...nearestAtoms(s, pos, site?.coordination) };
}

//////////////// URL

const bool = (v: string | null, fallback: boolean) => (v === null ? fallback : v === '1');
const nums = (v: string | null) => (v ? v.split(',').map(Number) : null);

export function stateFromURL(search: string): State {
  const s = defaultState();
  const q = new URLSearchParams(search);
  const id = q.get('s');
  if (id && id in STRUCTURES) s.structure = id as StructureId;
  s.showAtoms = bool(q.get('atoms'), s.showAtoms);
  for (const site of (q.get('sites') ?? '').split(',').filter(Boolean)) s.showSites[site as SiteId] = true;
  if (q.get('style') === 'sparse') s.style = 'sparse';
  s.clipToCell = bool(q.get('clip'), s.clipToCell);
  const op = Number(q.get('op'));
  if (op >= 0.1 && op <= 1) s.opacity = op;
  s.polyhedra = bool(q.get('poly'), s.polyhedra);
  const rep = nums(q.get('rep'));
  if (rep?.length === 3 && rep.every((v) => v >= 1 && v <= 3)) s.repeat = rep.map(Math.round) as Vec3;
  const pl = nums(q.get('plane'));
  if (pl?.length === 5 && pl.slice(0, 3).some((v) => v !== 0)) {
    s.plane = { hkl: pl.slice(0, 3) as Vec3, offset: pl[3], show: pl[4] === 1 };
  }
  const sl = q.get('slice');
  if (sl) {
    const [on, mode, flip] = sl.split(',');
    s.slice = { on: on === '1', mode: mode === 'cutaway' ? 'cutaway' : 'section', flip: flip === '1' };
  }
  if (bool(q.get('nb'), false)) s.neighbors = { on: true, target: typicalAtom(s.structure) };
  s.labels = bool(q.get('labels'), s.labels);
  return s;
}

export function stateToURL(s: State): string {
  const d = defaultState();
  const q = new URLSearchParams();
  q.set('s', s.structure);
  if (s.showAtoms !== d.showAtoms) q.set('atoms', '0');
  const sites = Object.entries(s.showSites).filter(([, on]) => on).map(([id]) => id);
  if (sites.length) q.set('sites', sites.join(','));
  if (s.style !== d.style) q.set('style', s.style);
  if (s.clipToCell !== d.clipToCell) q.set('clip', '0');
  if (s.opacity !== d.opacity) q.set('op', String(s.opacity));
  if (s.polyhedra) q.set('poly', '1');
  if (s.repeat.some((v) => v !== 1)) q.set('rep', s.repeat.join(','));
  if (s.plane.show || s.slice.on || s.plane.hkl.join() !== d.plane.hkl.join() || s.plane.offset !== d.plane.offset) {
    q.set('plane', [...s.plane.hkl, +s.plane.offset.toFixed(4), s.plane.show ? 1 : 0].join(','));
  }
  if (s.slice.on) q.set('slice', ['1', s.slice.mode, s.slice.flip ? '1' : '0'].join(','));
  if (s.neighbors.on) q.set('nb', '1');
  if (!s.labels) q.set('labels', '0');
  return '?' + q.toString().replace(/%2C/g, ',');
}
