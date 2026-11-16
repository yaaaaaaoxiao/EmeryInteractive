// What the dislocation page shows. Like the main page's state it is the single source of truth: the controls
// change it, the scene is rebuilt from it, and the page address describes it so a setup can be shared as a link.

import type { StructureId } from '../crystal/structures';
import type { Graphics } from '../scene/look';
import { type Config, crystalOf, type Kind, positionRange, startPosition } from './field';

export type Style = 'hard' | 'sticks';
// one colour; the planes the Burgers vector steps between; or compression and tension
export type Coloring = 'plain' | 'planes' | 'strain';

export const OVERLAYS = ['line', 'burgers', 'slipPlane', 'halfPlane', 'ramp', 'circuit'] as const;
export type Overlay = (typeof OVERLAYS)[number];

export interface DislocationState {
  structure: StructureId;
  kind: Kind;
  // where the line is along the glide direction, in units of a
  position: number;
  style: Style;
  coloring: Coloring;
  show: Record<Overlay, boolean>;
  // while the Burgers circuit is being walked: how many of its steps have been taken (null = all of them).
  // Not part of links: a link shows the finished circuit.
  circuitSteps: number | null;
  // a per-device preference (remembered in the browser, not in links)
  graphics: Graphics;
}

// where the line starts in a crystal: the middle of the block (see startPosition)
export const startOf = (structure: StructureId, kind: Kind) => startPosition(crystalOf({ structure, kind, position: 0 }));

export function defaultState(): DislocationState {
  return {
    structure: 'sc',
    kind: 'edge',
    position: startOf('sc', 'edge'),
    style: 'sticks',
    coloring: 'plain',
    show: { line: true, burgers: true, slipPlane: true, halfPlane: true, ramp: true, circuit: false },
    circuitSteps: null,
    graphics: 'quality',
  };
}

export const configOf = (state: DislocationState): Config => ({
  structure: state.structure,
  kind: state.kind,
  position: state.position,
});

export function clampPosition(state: DislocationState, position: number): number {
  const [min, max] = positionRange(crystalOf(configOf(state)));
  return Math.min(Math.max(position, min), max);
}

//////////////// links

const STRUCTURE_IDS: StructureId[] = ['sc', 'fcc', 'bcc'];
const KINDS: Kind[] = ['edge', 'screw', 'mixed'];
const STYLES: Style[] = ['hard', 'sticks'];
const COLORINGS: Coloring[] = ['plain', 'planes', 'strain'];

// only what differs from the default is written, so the plain page keeps a plain address
export function stateToURL(state: DislocationState): string {
  const d = defaultState();
  const q = new URLSearchParams();
  if (state.structure !== d.structure) q.set('s', state.structure);
  if (state.kind !== d.kind) q.set('type', state.kind);
  // (the line starts in the middle of whichever block this is)
  if (state.position !== startOf(state.structure, state.kind)) q.set('x', String(Number(state.position.toFixed(2))));
  if (state.style !== d.style) q.set('style', state.style);
  if (state.coloring !== d.coloring) q.set('color', state.coloring);
  const shown = OVERLAYS.filter((o) => state.show[o]);
  if (shown.join() !== OVERLAYS.filter((o) => d.show[o]).join()) q.set('show', shown.join('.'));
  const text = q.toString();
  return text ? `?${text}` : location.pathname;
}

// anything missing or not understood falls back to the default
export function stateFromURL(search: string): DislocationState {
  const q = new URLSearchParams(search);
  const state = defaultState();
  const pick = <T extends string>(name: string, allowed: T[], fallback: T): T =>
    allowed.includes(q.get(name) as T) ? (q.get(name) as T) : fallback;
  state.structure = pick('s', STRUCTURE_IDS, state.structure);
  state.kind = pick('type', KINDS, state.kind);
  state.style = pick('style', STYLES, state.style);
  state.coloring = pick('color', COLORINGS, state.coloring);
  state.position = startOf(state.structure, state.kind);
  const x = Number(q.get('x'));
  if (q.has('x') && Number.isFinite(x)) state.position = clampPosition(state, x);
  if (q.has('show')) {
    const shown = (q.get('show') ?? '').split('.');
    for (const o of OVERLAYS) state.show[o] = shown.includes(o);
  }
  return state;
}
