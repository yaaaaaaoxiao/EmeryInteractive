// @vitest-environment happy-dom
// (the scene's coordinate labels are HTML elements)

import * as THREE from 'three';
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
    s.setTool('neighbors');
    s.set({ showAtoms: false });
    s.set({ showAtoms: true });
    s.setTool('select');

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
      tool: 'neighbors',
      target: typicalAtom('fcc'),
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
      tool: 'neighbors',
      target: 'atom:0.5000,0.5000,0.0000',
      solo: true,
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
    const state: State = {
      ...defaultState(),
      constructions: [{ id: 1, kind: 'plane', hkl: [1, 0, 0], offset: 0.5, visible: true }],
      activePlane: 1,
      slice: 'section',
    };
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
    s.addPlane([1, 1, 1]);
    const before = summary(s.state);
    s.set({ slice: 'cutaway', flip: true });
    expect(summary(s.state)).not.toEqual(before);
    s.set({ slice: 'off' });
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

    const withTool = picked({ ...state, tool: 'hide' });
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
      constructions: [{ id: 1, kind: 'plane', hkl: [1, 0, 0], offset: 1, visible: true }],
      activePlane: 1,
      slice: 'section',
    };
    expect(picked(section).has(hidden[0])).toBe(true);
    expect(picked({ ...section, hidden }).has(hidden[0])).toBe(false);
  });
});

describe('graphics', () => {
  const materialTypes = (state: State) => {
    const types = new Set<string>();
    for (const m of buildScene(state, noop).pickables) types.add(((m as THREE.Mesh).material as THREE.Material).type);
    return [...types];
  };

  it('the default look is glossy; Performance mode uses the cheaper original material', () => {
    expect(materialTypes(defaultState())).toEqual(['MeshPhysicalMaterial']);
    expect(materialTypes({ ...defaultState(), graphics: 'performance' })).toEqual(['MeshStandardMaterial']);
  });
});

describe('directions, planes and points', () => {
  it('only visible ones are drawn, and a selection alone draws nothing extra', () => {
    const count = (state: State) => summary(state).length;
    const base = defaultState();
    const selected = { ...base, selection: ['atom:0.0000,0.0000,0.0000', 'atom:1.0000,1.0000,0.0000'] };
    // a selection only recolours the atoms; the direction appears once it's added
    expect(count(selected)).toBe(count(base));
    const withDirection: State = {
      ...base,
      constructions: [{ id: 1, kind: 'direction', uvw: [1, 1, 0], from: [0, 0, 0], vector: [1, 1, 0], visible: true }],
    };
    expect(count(withDirection)).toBeGreaterThan(count(base));
    expect(count({ ...withDirection, constructions: [{ ...withDirection.constructions[0], visible: false }] })).toBe(count(base));
  });
});

describe('materials', () => {
  // a 3×3×3 block cut away by a (111) plane: many spheres, caps and ghosts
  const cutaway: State = {
    ...defaultState(),
    repeat: [3, 3, 3],
    constructions: [{ id: 1, kind: 'plane', hkl: [1, 1, 1], offset: 1.5, visible: true }],
    activePlane: 1,
    slice: 'cutaway',
  };
  const meshes = (state: State) => {
    const out: THREE.Mesh[] = [];
    buildScene(state, noop).group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  };

  it('meshes with the same settings share one (each new material costs time when first drawn)', () => {
    const all = meshes(cutaway);
    expect(all.length).toBeGreaterThan(300);
    expect(new Set(all.map((m) => m.material)).size).toBeLessThan(30);
  });

  it('cut faces are drawn from both sides and spheres from the front, so they never share one', () => {
    const all = meshes(cutaway);
    const sides = (type: string) =>
      new Set(all.filter((m) => m.geometry.type === type).map((m) => (m.material as THREE.Material).side));
    expect(sides('CircleGeometry')).toEqual(new Set([THREE.DoubleSide]));
    expect(sides('SphereGeometry')).toEqual(new Set([THREE.FrontSide]));
  });

  it('neighbors that fade as the camera turns each have their own', () => {
    const state: State = { ...defaultState(), tool: 'neighbors', target: typicalAtom('fcc') };
    const fading = meshes(state).filter((m) => m.userData.xray);
    expect(fading).toHaveLength(12);
    expect(new Set(fading.map((m) => m.material)).size).toBe(12);
  });

  it('a new scene gets new materials, so releasing the old scene never affects it', () => {
    const a = new Set(meshes(cutaway).map((m) => m.material));
    expect(meshes(cutaway).some((m) => a.has(m.material as THREE.Material))).toBe(false);
  });
});

describe('cell edges', () => {
  // every line in the scene, by how it's drawn
  const lineSets = (state: State) => {
    const out: { segments: number; dashed: boolean; behind: boolean }[] = [];
    buildScene(state, noop).group.traverse((o) => {
      const line = o as THREE.Mesh & { isLineSegments2?: boolean };
      if (!line.isLineSegments2) return;
      const m = line.material as THREE.Material & { dashed: boolean };
      out.push({
        segments: (line.geometry as THREE.InstancedBufferGeometry).getAttribute('instanceStart').count,
        dashed: m.dashed,
        behind: m.depthFunc === THREE.GreaterDepth,
      });
    });
    return out;
  };

  it('one cell: just the box, solid, and faint and dashed where hidden', () => {
    expect(lineSets(defaultState())).toEqual([
      { segments: 12, dashed: false, behind: false },
      { segments: 12, dashed: true, behind: true },
    ]);
  });

  it('2×2×2: each inner boundary segment once, dashed, none along the outside edges', () => {
    // 54 cell-edge segments in a 2×2×2 block, 24 of them on its 12 outside edges
    const inner = lineSets({ ...defaultState(), repeat: [2, 2, 2] }).filter((s) => s.dashed && !s.behind);
    expect(inner.map((s) => s.segments)).toEqual([30]);
  });
});
