// @vitest-environment happy-dom
// (the scene's coordinate labels are HTML elements)

import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildScene, type PickTarget } from '../src/scene/build';
import { defaultState, type State, Store, typicalAtom } from '../src/state';

const noop = { onDeselect: () => {} };

// a comparable summary of what is drawn: every mesh with its colour, opacity and clipping
function summary(state: State): string[] {
  const { group } = buildScene(state, noop);
  const out: string[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    const p = mesh.position;
    out.push(
      [
        mesh.geometry.type,
        m.color?.getHexString(),
        m.opacity.toFixed(3),
        m.clippingPlanes?.length ?? 0,
        p.x.toFixed(3),
        p.y.toFixed(3),
        p.z.toFixed(3),
      ].join(' '),
    );
  });
  return out.sort();
}

const picked = (state: State) => new Set(buildScene(state, noop).pickables.map((m) => (m.userData.pick as PickTarget).key));

describe('scene depends only on the settings', () => {
  it('hard sphere → neighbors → atoms off/on → neighbors off looks like plain hard spheres', () => {
    // the toggle sequence that used to leave the old site in the wrong state
    const s = new Store(defaultState());
    s.set({ clipToCell: false });
    s.setNeighborsOn(true);
    s.set({ showAtoms: false });
    s.set({ showAtoms: true });
    s.setNeighborsOn(false);

    const fresh = { ...defaultState(), clipToCell: false };
    expect(summary(s.state)).toEqual(summary(fresh));
  });

  it('building the same settings twice gives the same scene', () => {
    const state: State = { ...defaultState(), showSites: { oct: true, tet: true, tri: true }, style: 'sparse', polyhedra: true };
    expect(summary(state)).toEqual(summary(state));
  });
});

describe('what can be clicked', () => {
  it('only atoms and sites inside the cell, never the neighbor overlay', () => {
    const state: State = {
      ...defaultState(),
      showSites: { oct: true },
      neighbors: { on: true, target: typicalAtom('fcc'), solo: false },
    };
    const keys = [...picked(state)];
    expect(keys.filter((k) => k.startsWith('atom:'))).toHaveLength(14);
    expect(keys.filter((k) => k.startsWith('oct:'))).toHaveLength(13);
    // every clickable object is inside the unit cell
    for (const k of keys) {
      for (const v of k.split(':')[1].split(',').map(Number)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('in Solo only the drawn neighbors are clickable', () => {
    const state: State = {
      ...defaultState(),
      showSites: { oct: true, tet: true },
      neighbors: { on: true, target: 'atom:0.5000,0.5000,0.0000', solo: true },
    };
    const keys = picked(state);
    expect(keys.size).toBe(12);
    expect([...keys].every((k) => k.startsWith('atom:'))).toBe(true);
  });

  it('nothing is clickable for a hidden type', () => {
    const state: State = { ...defaultState(), showAtoms: false, showSites: { tet: true } };
    expect([...picked(state)].every((k) => k.startsWith('tet:'))).toBe(true);
  });
});

describe('slice', () => {
  it('a (100) section at x = 1/2 in FCC cuts the 4 face-centred atoms', () => {
    const state: State = { ...defaultState(), slice: { on: true, mode: 'section', flip: false } };
    // corner atoms (R = 0.354a) don't reach x = 1/2
    expect(picked(state)).toEqual(
      new Set([
        'atom:0.5000,0.5000,0.0000',
        'atom:0.5000,0.0000,0.5000',
        'atom:0.5000,1.0000,0.5000',
        'atom:0.5000,0.5000,1.0000',
      ]),
    );
  });

  it('turning the slice off restores the full model', () => {
    const s = new Store(defaultState());
    const before = summary(s.state);
    s.set({ slice: { on: true, mode: 'cutaway', flip: true } });
    s.set({ slice: { on: false, mode: 'cutaway', flip: true } });
    expect(summary(s.state)).toEqual(before);
  });
});

describe('hidden atoms', () => {
  const hidden = ['atom:1.0000,0.5000,0.5000'];

  it('are drawn as outlines that only the hide tool can click', () => {
    const state: State = { ...defaultState(), showSites: { oct: true }, hidden };
    const keys = picked(state);
    expect(keys.has(hidden[0])).toBe(false);
    expect(keys.has('oct:0.5000,0.5000,0.5000')).toBe(true);

    const withTool = picked({ ...state, hideTool: true });
    expect(withTool.has(hidden[0])).toBe(true);
    // sites in front of atoms don't get in the way of hiding
    expect([...withTool].every((k) => k.startsWith('atom:'))).toBe(true);
  });

  it('leave no solid sphere and no cross-section', () => {
    const solid = (state: State) =>
      summary(state).filter((m) => m.includes(' 1.000 0.500 0.500') && !m.includes(' 0.080 ')).length;
    expect(solid(defaultState())).toBeGreaterThan(0);
    // only the outline (wire grid + faint fill) is left where the atom was
    const outlineOnly = summary({ ...defaultState(), hidden }).filter((m) => m.includes(' 1.000 0.500 0.500'));
    expect(outlineOnly.every((m) => m.startsWith('SphereGeometry'))).toBe(true);
    expect(outlineOnly).toHaveLength(2);

    const section: State = {
      ...defaultState(),
      slice: { on: true, mode: 'section', flip: false },
      plane: { hkl: [1, 0, 0], offset: 1, show: false },
    };
    expect(picked(section).has(hidden[0])).toBe(true);
    expect(picked({ ...section, hidden }).has(hidden[0])).toBe(false);
  });
});
