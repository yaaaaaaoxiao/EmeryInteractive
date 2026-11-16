// @vitest-environment happy-dom
// (the scene's labels are HTML elements, and links are read from the page address)

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { StructureId } from '../src/crystal/structures';
import { crystalOf, inHalfPlane, type Kind, onRamp, positionRange, rampCount } from '../src/dislocation/field';
import { buildDislocationScene, COLORS } from '../src/dislocation/scene';
import { configOf, type DislocationState, defaultState, startOf, stateFromURL, stateToURL } from '../src/dislocation/state';

const STRUCTURE_IDS: StructureId[] = ['sc', 'fcc', 'bcc'];
const KINDS: Kind[] = ['edge', 'screw', 'mixed'];

// a state with the line in the middle of its block, unless a position is given
function state(patch: Partial<DislocationState> = {}): DislocationState {
  const s = { ...defaultState(), ...patch };
  if (patch.position === undefined) s.position = startOf(s.structure, s.kind);
  return s;
}
const names = (s: DislocationState) => buildDislocationScene(s).group.children.map((o) => o.name);
const atomsOf = (s: DislocationState) => crystalOf(configOf(s)).atoms.map((_, n) => n);

function atomColors(s: DislocationState): string[] {
  const mesh = buildDislocationScene(s).group.getObjectByName('atoms') as THREE.InstancedMesh;
  const color = new THREE.Color();
  return Array.from({ length: mesh.count }, (_, n) => {
    mesh.getColorAt(n, color);
    return color.getHexString();
  });
}
const hex = (color: number) => new THREE.Color(color).getHexString();
const count = (s: DislocationState, name: string) =>
  (buildDislocationScene(s).group.getObjectByName(name) as THREE.InstancedMesh | undefined)?.count ?? 0;

describe('dislocation scene', () => {
  it('builds for every structure and kind of dislocation, drawing every atom once', () => {
    for (const structure of STRUCTURE_IDS) {
      for (const kind of KINDS) {
        for (const style of ['sticks', 'hard'] as const) {
          const s = state({ structure, kind, style });
          expect(count(s, 'atoms') + count(s, 'atoms-faded')).toBe(atomsOf(s).length);
        }
      }
    }
  });

  it('draws every atom solid when there is no spiral ramp to show', () => {
    for (const structure of STRUCTURE_IDS) {
      const s = state({ structure });
      expect(count(s, 'atoms')).toBe(atomsOf(s).length);
      expect(names(s)).not.toContain('atoms-faded');
    }
  });

  it('draws bonds only in the ball-and-stick style', () => {
    expect(names(state({ style: 'sticks' }))).toContain('bonds');
    expect(names(state({ style: 'hard' }))).not.toContain('bonds');
  });

  it('colours the extra half-plane of an edge dislocation, and nothing for a screw', () => {
    const red = (s: DislocationState) => atomColors(s).filter((c) => c === hex(COLORS.halfPlane)).length;
    for (const structure of STRUCTURE_IDS) {
      const edge = state({ structure });
      const expected = atomsOf(edge).filter((n) => inHalfPlane(configOf(edge), n)).length;
      expect(expected).toBeGreaterThan(10);
      expect(red(edge)).toBe(expected);
      expect(red(state({ structure, kind: 'screw' }))).toBe(0);
      expect(red(state({ structure, show: { ...defaultState().show, halfPlane: false } }))).toBe(0);
    }
  });

  it('colours an edge dislocation by strain: blue on the squeezed side, red on the stretched side', () => {
    const colors = atomColors(state({ coloring: 'strain' })).map((c) => new THREE.Color(`#${c}`));
    expect(new Set(colors.map((c) => c.getHexString())).size).toBeGreaterThan(10);
    // (blue has more blue than red in it, red more red than blue)
    expect(colors.some((c) => c.b > c.r + 0.2)).toBe(true);
    expect(colors.some((c) => c.r > c.b + 0.2)).toBe(true);
  });

  it('colours a screw dislocation by its shear, strongest at the line and the same all around it', () => {
    for (const structure of STRUCTURE_IDS) {
      const s = state({ structure, kind: 'screw', coloring: 'strain' });
      const config = configOf(s);
      const crystal = crystalOf(config);
      const colors = atomColors(s);
      // every atom is drawn solid, so the colours of the whole block show (not just the atoms on the ramp)
      expect(colors).toHaveLength(crystal.atoms.length);
      expect(names(s)).not.toContain('atoms-faded');
      // how far each atom's colour is from unstrained toward the shear colour
      const amount = colors.map((c) => new THREE.Color(`#${c}`).r - new THREE.Color(COLORS.unstrained).r);
      const distanceFromLine = crystal.atoms.map((p) => Math.hypot(p[0] - config.position, p[2] - crystal.slipHeight));
      const nearest = distanceFromLine.indexOf(Math.min(...distanceFromLine));
      const farthest = distanceFromLine.indexOf(Math.max(...distanceFromLine));
      expect(colors[nearest]).toBe(hex(COLORS.shear));
      expect(amount[nearest]).toBeGreaterThan(amount[farthest]);
      // no blue or red: nothing is squeezed or stretched
      expect(colors.every((c) => new THREE.Color(`#${c}`).b <= new THREE.Color(COLORS.unstrained).b + 1e-6)).toBe(true);
      // atoms the same distance from the line have the same colour, wherever they are around it
      const byDistance = new Map<string, Set<string>>();
      distanceFromLine.forEach((d, n) => {
        const key = d.toFixed(4);
        byDistance.set(key, (byDistance.get(key) ?? new Set()).add(colors[n]));
      });
      expect([...byDistance.values()].every((set) => set.size === 1)).toBe(true);
    }
  });

  it('still colours a mixed dislocation by the squeezing and stretching of its edge part', () => {
    const colors = atomColors(state({ kind: 'mixed', coloring: 'strain' })).map((c) => new THREE.Color(`#${c}`));
    expect(colors.some((c) => c.b > c.r + 0.2)).toBe(true);
    expect(colors.some((c) => c.r > c.b + 0.2)).toBe(true);
  });

  it('draws the spiral ramp, and colours its atoms, only for a dislocation with a screw part', () => {
    const rampColors = COLORS.ramps.map(hex);
    for (const structure of STRUCTURE_IDS) {
      const screw = state({ structure, kind: 'screw' });
      const around = atomsOf(screw).filter((n) => onRamp(configOf(screw), n)).length;
      expect(around).toBeGreaterThan(40);
      expect(names(screw)).toContain('ramp');
      // only the atoms on the ramp are solid, in one colour per ramp
      const colors = atomColors(screw);
      expect(colors).toHaveLength(around);
      expect(new Set(colors).size).toBe(rampCount(crystalOf(configOf(screw))));
      expect(colors.every((c) => rampColors.includes(c))).toBe(true);
      expect(count(screw, 'atoms-faded')).toBe(atomsOf(screw).length - around);

      expect(names(state({ structure, kind: 'mixed' }))).toContain('ramp');
      expect(names(state({ structure, kind: 'edge' }))).not.toContain('ramp');
      expect(names(state({ structure, kind: 'screw', position: -1 }))).not.toContain('ramp');
      const off = { ...defaultState().show, ramp: false };
      expect(names(state({ structure, kind: 'screw', show: off }))).not.toContain('ramp');
      expect(names(state({ structure, kind: 'screw', show: off }))).not.toContain('atoms-faded');
    }
  });

  it('shows the line and its Burgers vector only while the line is in the block', () => {
    expect(names(state())).toEqual(expect.arrayContaining(['line', 'burgers', 'slipped', 'unslipped']));
    const before = names(state({ position: -1 }));
    expect(before).not.toContain('line');
    expect(before).not.toContain('burgers');
    // nothing has slipped yet / everything has
    expect(names(state({ position: -1.2 }))).not.toContain('slipped');
    expect(names(state({ position: 13 }))).toContain('slipped');
  });

  it('draws the Burgers circuit one step at a time while it is walked, and its gap only at the end', () => {
    const show = { ...defaultState().show, circuit: true };
    const segmentsOf = (s: DislocationState) => {
      const path = buildDislocationScene(s).group.getObjectByName('circuit') as THREE.Mesh | undefined;
      return path ? path.geometry.getAttribute('instanceStart').count : 0;
    };
    // before the first step: only the start, with the walker on it
    const begun = state({ show, circuitSteps: 0 });
    expect(names(begun)).toContain('circuit-walker');
    expect(names(begun)).not.toContain('circuit');
    expect(names(begun)).not.toContain('circuit-gap');
    expect(segmentsOf(state({ show, circuitSteps: 7 }))).toBe(7);
    expect(names(state({ show, circuitSteps: 7 }))).not.toContain('circuit-gap');
    // complete: every step, the gap, and no walker
    const complete = state({ show });
    expect(segmentsOf(complete)).toBe(22);
    expect(names(complete)).toContain('circuit-gap');
    expect(names(complete)).not.toContain('circuit-walker');
  });

  it('keeps the atoms of the circuit solid when the rest is faded for the spiral ramp', () => {
    const show = { ...defaultState().show, circuit: true };
    for (const structure of STRUCTURE_IDS) {
      expect(count(state({ structure, kind: 'screw', show }), 'atoms')).toBeGreaterThan(
        count(state({ structure, kind: 'screw' }), 'atoms'),
      );
    }
  });

  it('draws the Burgers circuit when asked, where it fits', () => {
    const show = { ...defaultState().show, circuit: true };
    expect(names(state({ show }))).toEqual(expect.arrayContaining(['circuit', 'circuit-gap']));
    expect(names(state({ show, position: 1 }))).not.toContain('circuit');
    expect(names(state())).not.toContain('circuit');
  });
});

describe('dislocation links', () => {
  it('writes a plain address for the default setup, and only the structure and type for another block', () => {
    expect(stateToURL(defaultState())).not.toContain('?');
    expect(stateToURL(state({ structure: 'fcc', kind: 'screw' }))).toBe('?s=fcc&type=screw');
  });

  it('restores a setup from its link', () => {
    for (const structure of STRUCTURE_IDS) {
      const s = state({
        structure,
        kind: 'screw',
        position: 3.25,
        style: 'hard',
        coloring: 'planes',
        show: { line: false, burgers: true, slipPlane: false, halfPlane: true, ramp: false, circuit: true },
      });
      expect(stateFromURL(stateToURL(s))).toEqual(s);
    }
  });

  it('starts the line in the middle of the block a link names', () => {
    for (const structure of STRUCTURE_IDS) {
      for (const kind of KINDS) {
        expect(stateFromURL(`?s=${structure}&type=${kind}`).position).toBe(startOf(structure, kind));
      }
    }
  });

  it('falls back to the default for anything it does not understand', () => {
    expect(stateFromURL('?s=hcp&type=twist&x=abc&style=wire&color=rainbow')).toEqual(defaultState());
    const far = stateFromURL('?s=bcc&x=999');
    expect(far.position).toBe(positionRange(crystalOf(configOf(far)))[1]);
  });
});
