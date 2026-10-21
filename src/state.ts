// The single source of truth for what is on screen. Controls change fields here; the scene is rebuilt from it.
// Every change made through the store is an undo step (except the per-device graphics choice).

import {
  atomObjects,
  dist,
  nearestAtoms,
  type ObjectKind,
  objectKey,
  type PositionGroup,
  positionGroup,
  sub,
  toIntegerIndices,
} from './crystal/lattice';
import { type SiteId, STRUCTURES, type StructureId, type Vec3 } from './crystal/structures';
import type { Graphics } from './scene/look';

export type Style = 'hard' | 'sparse';
// what a click in the 3D view does; exactly one is active
export type Tool = 'select' | 'neighbors' | 'hide' | 'plane';
export type Slice = 'off' | 'section' | 'cutaway';

// directions, planes and points the user added (by typing indices or from a selection)
export type Construction =
  // `vector` is what is drawn from `from`; `uvw` is its integer index
  | { id: number; kind: 'direction'; uvw: Vec3; from: Vec3; vector: Vec3; visible: boolean }
  // the plane h x + k y + l z = offset · |(h k l)|, i.e. `offset` along the unit normal, in units of a
  | { id: number; kind: 'plane'; hkl: Vec3; offset: number; visible: boolean }
  | { id: number; kind: 'point'; pos: Vec3; visible: boolean };
export type PlaneConstruction = Extract<Construction, { kind: 'plane' }>;
export type NewConstruction =
  | Omit<Extract<Construction, { kind: 'direction' }>, 'id'>
  | Omit<PlaneConstruction, 'id'>
  | Omit<Extract<Construction, { kind: 'point' }>, 'id'>;

export interface State {
  structure: StructureId;
  //////// what's in the model
  showAtoms: boolean;
  showSites: Partial<Record<SiteId, boolean>>;
  repeat: Vec3;
  // keys of hidden atoms (drawn as outlines)
  hidden: string[];
  //////// how it's drawn
  style: Style;
  clipToCell: boolean;
  opacity: number;
  polyhedra: boolean;
  labels: boolean;
  // a per-device preference (remembered in the browser, not in links or the undo history)
  graphics: Graphics;
  //////// what a click does
  tool: Tool;
  // the neighbors tool's atom or site, whether everything else is hidden, and how faint everything else is
  target: string | null;
  solo: boolean;
  othersOpacity: number;
  // keys of selected objects (see objectKey); selecting never changes anything else
  selection: string[];
  //////// directions, planes and points, and the slice through one of the planes
  constructions: Construction[];
  activePlane: number | null;
  slice: Slice;
  flip: boolean;
}

export const MAX_SELECTED = 8;

export function defaultState(): State {
  return {
    structure: 'fcc',
    showAtoms: true,
    showSites: {},
    repeat: [1, 1, 1],
    hidden: [],
    style: 'hard',
    clipToCell: true,
    opacity: 1,
    polyhedra: false,
    labels: true,
    graphics: 'quality',
    tool: 'select',
    target: null,
    solo: false,
    othersOpacity: 0.3,
    selection: [],
    constructions: [],
    activePlane: null,
    slice: 'off',
    flip: false,
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
  for (const x of [0, repeat[0]])
    for (const y of [0, repeat[1]])
      for (const z of [0, repeat[2]]) {
        values.push(n[0] * x + n[1] * y + n[2] * z);
      }
  return [Math.min(...values), Math.max(...values)];
}

//////////////// what follows from the state (computed, never stored)

export function activePlane(s: State): PlaneConstruction | null {
  const c = s.constructions.find((x) => x.id === s.activePlane);
  return c?.kind === 'plane' ? c : null;
}

export const isSlicing = (s: State) => s.slice !== 'off' && activePlane(s) !== null;

// two selected objects: the direction from the first to the second
export function selectionDirection(s: State): { uvw: Vec3; from: Vec3; vector: Vec3 } | null {
  if (s.selection.length !== 2) return null;
  const [a, b] = s.selection.map((k) => parseKey(k).pos);
  const vector = sub(b, a);
  return { uvw: toIntegerIndices(vector), from: a, vector };
}

// three selected objects: the plane through them (null if they are on one line)
export function selectionPlane(s: State): { hkl: Vec3; offset: number } | null {
  if (s.selection.length !== 3) return null;
  const p = s.selection.map((k) => parseKey(k).pos);
  const a = sub(p[1], p[0]);
  const b = sub(p[2], p[0]);
  const normal: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  if (Math.hypot(...normal) < 1e-6) return null;
  const hkl = toIntegerIndices(normal);
  const n = unitNormal(hkl);
  return { hkl, offset: n[0] * p[0][0] + n[1] * p[0][1] + n[2] * p[0][2] };
}

//////////////// store

type Listener = (state: State, previous: State) => void;
type Update = Partial<State> | ((s: State) => Partial<State>);

export class Store {
  private listeners: Listener[] = [];
  private past: State[] = [];
  private future: State[] = [];
  // the state before a slider started moving, so the whole drag is one undo step
  private previewFrom: State | null = null;

  constructor(public state: State) {}

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  private apply(next: State): void {
    const previous = this.state;
    this.state = next;
    this.listeners.forEach((l) => l(this.state, previous));
  }

  // a change that can be undone
  set(update: Update): void {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.past.push(this.previewFrom ?? this.state);
    if (this.past.length > 200) this.past.shift();
    this.previewFrom = null;
    this.future = [];
    this.apply({ ...this.state, ...patch });
  }

  // a change while a slider is being dragged: drawn now, recorded as one step by commitPreview()
  preview(update: Update): void {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.previewFrom ??= this.state;
    this.apply({ ...this.state, ...patch });
  }

  commitPreview(): void {
    if (this.previewFrom) this.set({});
  }

  // the graphics choice belongs to the device, so it isn't an undo step
  setGraphics(graphics: Graphics): void {
    this.apply({ ...this.state, graphics });
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.state);
    this.previewFrom = null;
    this.apply({ ...previous, graphics: this.state.graphics });
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state);
    this.apply({ ...next, graphics: this.state.graphics });
  }

  reset(): void {
    this.set((s) => ({ ...defaultState(), graphics: s.graphics }));
  }

  //////////////// actions with rules between fields

  setStructure(structure: StructureId): void {
    this.set((s) => ({
      structure,
      selection: [],
      hidden: [],
      target: s.tool === 'neighbors' ? typicalAtom(structure) : null,
    }));
  }

  setRepeat(repeat: Vec3): void {
    // drop selected and hidden objects that no longer exist in the smaller block
    const inside = (k: string) => parseKey(k).pos.every((v, i) => v <= repeat[i] + 1e-6);
    this.set((s) => ({ repeat, selection: s.selection.filter(inside), hidden: s.hidden.filter(inside) }));
  }

  setTool(tool: Tool): void {
    if (tool === this.state.tool) return;
    this.set((s) => ({
      tool,
      // the neighbors tool starts on the selected object, or a typical atom
      target: tool === 'neighbors' ? (s.target ?? s.selection[0] ?? typicalAtom(s.structure)) : s.target,
    }));
  }

  // what a click on an object (or on empty space: null) does depends on the tool
  clickObject(key: string | null, additive: boolean): void {
    const s = this.state;
    if (s.tool === 'hide') {
      if (key && parseKey(key).kind === 'atom') {
        this.setHidden(s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key]);
      }
      return;
    }
    if (s.tool === 'neighbors') {
      if (key && key !== s.target) this.set({ target: key });
      return;
    }
    // select and plane tools: clicking selects (3 selected atoms offer a plane)
    let selection: string[];
    if (!key) selection = additive ? s.selection : [];
    else if (!additive) selection = s.selection.length === 1 && s.selection[0] === key ? [] : [key];
    else if (s.selection.includes(key)) selection = s.selection.filter((k) => k !== key);
    else selection = [...s.selection, key].slice(-MAX_SELECTED);
    if (selection.join() !== s.selection.join()) this.set({ selection });
  }

  // hidden atoms can't stay selected
  setHidden(hidden: string[]): void {
    this.set((s) => ({ hidden, selection: s.selection.filter((k) => !hidden.includes(k)) }));
  }

  // hide (or show again) every atom at corners, edges, faces or inside the cells
  setGroupHidden(group: PositionGroup, hide: boolean): void {
    const s = this.state;
    const keys = atomsInGroup(s, group);
    this.setHidden(hide ? [...new Set([...s.hidden, ...keys])] : s.hidden.filter((k) => !keys.includes(k)));
  }

  //////////////// directions, planes and points

  // adds it (one undo step, together with `extra`, which can depend on the new id) and returns its id;
  // a new plane becomes the active one if there is none
  addConstruction(c: NewConstruction, extra: Partial<State> | ((id: number) => Partial<State>) = {}): number {
    const id = Math.max(0, ...this.state.constructions.map((x) => x.id)) + 1;
    this.set((s) => ({
      constructions: [...s.constructions, { ...c, id } as Construction],
      activePlane: c.kind === 'plane' && s.activePlane === null ? id : s.activePlane,
      ...(typeof extra === 'function' ? extra(id) : extra),
    }));
    return id;
  }

  addPlane(hkl: Vec3, offset = standardOffset(hkl), extra: Partial<State> | ((id: number) => Partial<State>) = {}): number {
    return this.addConstruction({ kind: 'plane', hkl, offset, visible: true }, extra);
  }

  addDirectionFromSelection(): void {
    const d = selectionDirection(this.state);
    if (d) this.addConstruction({ kind: 'direction', ...d, visible: true });
  }

  // `slice`: also make it the active plane and show the section through it
  addPlaneFromSelection(slice = false): void {
    const p = selectionPlane(this.state);
    if (p) this.addPlane(p.hkl, p.offset, slice ? (id) => ({ activePlane: id, slice: 'section', tool: 'plane' }) : {});
  }

  updateConstruction(id: number, patch: Partial<Construction>, preview = false): void {
    const update = (s: State) => ({
      constructions: s.constructions.map((c) => (c.id === id ? ({ ...c, ...patch } as Construction) : c)),
    });
    if (preview) this.preview(update);
    else this.set(update);
  }

  removeConstruction(id: number): void {
    this.set((s) => ({
      constructions: s.constructions.filter((c) => c.id !== id),
      ...(s.activePlane === id ? { activePlane: null, slice: 'off' as Slice } : {}),
    }));
  }

  // ↑ / ↓: move the active plane along its normal, within the block. While a key is held the moves are previews,
  // committed as one undo step when it's released (see main.ts)
  moveActivePlane(step: number, preview = false): void {
    const p = activePlane(this.state);
    if (!p) return;
    const [lo, hi] = offsetRange(p.hkl, this.state.repeat);
    this.updateConstruction(p.id, { offset: +Math.min(hi, Math.max(lo, p.offset + step)).toFixed(4) }, preview);
  }
}

// keys of the atoms in the block at corners, edges, faces or inside the cells
export function atomsInGroup(s: State, group: PositionGroup): string[] {
  return atomObjects(STRUCTURES[s.structure], s.repeat)
    .filter((a) => positionGroup(a.pos) === group)
    .map((a) => a.key);
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
const fmt = (v: number) => String(+v.toFixed(4));
const TOOLS: Tool[] = ['select', 'neighbors', 'hide', 'plane'];

// constructions in a link: d,u,v,w,from…,vector… · p,h,k,l,offset · q,x,y,z — joined by ';', '~' marks a hidden one
function encodeConstruction(c: Construction): string {
  const body =
    c.kind === 'direction'
      ? ['d', ...c.uvw, ...c.from, ...c.vector]
      : c.kind === 'plane'
        ? ['p', ...c.hkl, c.offset]
        : ['q', ...c.pos];
  return (c.visible ? '' : '~') + body.map((v) => (typeof v === 'number' ? fmt(v) : v)).join(',');
}

function decodeConstruction(text: string, id: number): Construction | null {
  const visible = !text.startsWith('~');
  const [kind, ...rest] = text.replace(/^~/, '').split(',');
  const v = rest.map(Number);
  if (v.some((x) => !Number.isFinite(x))) return null;
  if (kind === 'd' && v.length === 9 && v.slice(6).some((x) => x !== 0)) {
    return {
      id,
      kind: 'direction',
      uvw: v.slice(0, 3) as Vec3,
      from: v.slice(3, 6) as Vec3,
      vector: v.slice(6) as Vec3,
      visible,
    };
  }
  if (kind === 'p' && v.length === 4 && v.slice(0, 3).some((x) => x !== 0)) {
    return { id, kind: 'plane', hkl: v.slice(0, 3).map(Math.round) as Vec3, offset: v[3], visible };
  }
  if (kind === 'q' && v.length === 3) return { id, kind: 'point', pos: v as Vec3, visible };
  return null;
}

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
  s.labels = bool(q.get('labels'), s.labels);

  // hidden atoms: x,y,z;x,y,z — only atoms that exist in this block
  const atoms = new Set(atomObjects(STRUCTURES[s.structure], s.repeat).map((a) => a.key));
  for (const p of (q.get('hide') ?? '').split(';').filter(Boolean)) {
    const pos = p.split(',').map(Number);
    const key = pos.length === 3 ? objectKey('atom', pos as Vec3) : '';
    if (atoms.has(key) && !s.hidden.includes(key)) s.hidden.push(key);
  }

  // tool, and the neighbors tool's target (t=oct:0.5,0.5,0.5)
  const tool = q.get('tool') as Tool | null;
  if (tool && TOOLS.includes(tool)) s.tool = tool;
  s.solo = bool(q.get('solo'), false);
  const others = Number(q.get('others'));
  if (others >= 0.05 && others <= 1) s.othersOpacity = others;
  const t = q.get('t');
  if (t && /^[a-z]+:-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(t)) {
    const { kind, pos } = parseKey(t);
    if (kind === 'atom' || STRUCTURES[s.structure].sites.some((x) => x.id === kind)) s.target = objectKey(kind, pos);
  }

  // directions, planes and points; plane=N is the active plane (N-th construction), slice=section,1 adds the slice
  (q.get('c') ?? '')
    .split(';')
    .filter(Boolean)
    .forEach((text) => {
      const c = decodeConstruction(text, s.constructions.length + 1);
      if (c) s.constructions.push(c);
    });
  const active = Number(q.get('plane'));
  if (s.constructions[active - 1]?.kind === 'plane') s.activePlane = active;
  const slice = q.get('slice')?.split(',');
  if (slice && s.activePlane !== null && (slice[0] === 'section' || slice[0] === 'cutaway')) {
    s.slice = slice[0];
    s.flip = slice[1] === '1';
  }

  // links from before the tool bar: nb=1|solo, plane=h,k,l,offset,show and slice=on,mode,flip
  const nb = q.get('nb');
  if (nb === '1' || nb === 'solo') {
    s.tool = 'neighbors';
    s.solo = nb === 'solo';
  }
  const old = nums(q.get('plane'));
  if (old?.length === 5 && old.slice(0, 3).some((v) => v !== 0)) {
    const [on, mode, flip] = (q.get('slice') ?? '').split(',');
    const id = s.constructions.length + 1;
    s.constructions.push({ id, kind: 'plane', hkl: old.slice(0, 3) as Vec3, offset: old[3], visible: true });
    s.activePlane = id;
    if (on === '1') {
      s.slice = mode === 'cutaway' ? 'cutaway' : 'section';
      s.flip = flip === '1';
    }
  }

  if (s.tool === 'neighbors' && !s.target) s.target = typicalAtom(s.structure);
  return s;
}

export function stateToURL(s: State): string {
  const d = defaultState();
  const q = new URLSearchParams();
  q.set('s', s.structure);
  if (s.showAtoms !== d.showAtoms) q.set('atoms', '0');
  const sites = Object.entries(s.showSites)
    .filter(([, on]) => on)
    .map(([id]) => id);
  if (sites.length) q.set('sites', sites.join(','));
  if (s.style !== d.style) q.set('style', s.style);
  if (s.clipToCell !== d.clipToCell) q.set('clip', '0');
  if (s.opacity !== d.opacity) q.set('op', String(s.opacity));
  if (s.polyhedra) q.set('poly', '1');
  if (s.repeat.some((v) => v !== 1)) q.set('rep', s.repeat.join(','));
  if (!s.labels) q.set('labels', '0');
  if (s.hidden.length) q.set('hide', s.hidden.map((k) => parseKey(k).pos.map(fmt).join(',')).join(';'));
  if (s.tool !== 'select') q.set('tool', s.tool);
  if (s.solo) q.set('solo', '1');
  if (s.othersOpacity !== d.othersOpacity) q.set('others', String(s.othersOpacity));
  if (s.tool === 'neighbors' && s.target) {
    const { kind, pos } = parseKey(s.target);
    q.set('t', `${kind}:${pos.map(fmt).join(',')}`);
  }
  if (s.constructions.length) {
    q.set('c', s.constructions.map(encodeConstruction).join(';'));
    const index = s.constructions.findIndex((c) => c.id === s.activePlane);
    if (index >= 0) q.set('plane', String(index + 1));
    if (isSlicing(s)) q.set('slice', `${s.slice},${s.flip ? 1 : 0}`);
  }
  return `?${q.toString().replace(/%2C/g, ',').replace(/%3B/g, ';').replace(/%3A/g, ':').replace(/%7E/g, '~')}`;
}
