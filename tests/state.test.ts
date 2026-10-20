import { describe, expect, it } from 'vitest';
import { objectKey } from '../src/crystal/lattice';
import type { Vec3 } from '../src/crystal/structures';
import { defaultState, MAX_SELECTED, type State, Store, stateFromURL, stateToURL, typicalAtom } from '../src/state';

const atom = (...p: Vec3) => objectKey('atom', p);
const store = (patch: Partial<State> = {}) => new Store({ ...defaultState(), ...patch });

describe('selection', () => {
  it('two objects give the direction between them', () => {
    const s = store();
    s.clickObject(atom(0, 0, 0), false);
    s.clickObject(atom(0.5, 0.5, 0), true);
    expect(s.state.direction?.uvw).toEqual([1, 1, 0]);
    expect(s.state.direction?.vector).toEqual([0.5, 0.5, 0]);
  });

  it('three objects set and show the plane through them', () => {
    const s = store();
    s.setSelection([atom(1, 1, 1), atom(1, 0, 0), atom(0, 1, 0)]);
    expect(s.state.plane.hkl).toEqual([1, 1, -1]);
    expect(s.state.plane.show).toBe(true);
    expect(s.state.plane.offset).toBeCloseTo(1 / Math.sqrt(3), 10);
    // the direction from the 2-object step is dropped
    expect(s.state.direction).toBeNull();
  });

  it('three objects on one line leave the plane alone', () => {
    const s = store();
    const before = s.state.plane;
    s.setSelection([atom(0, 0, 0), atom(0.5, 0.5, 0.5), atom(1, 1, 1)]);
    expect(s.state.plane).toEqual(before);
  });

  it('click toggles, shift+click adds and removes, empty space clears', () => {
    const s = store();
    s.clickObject(atom(0, 0, 0), false);
    expect(s.state.selection).toEqual([atom(0, 0, 0)]);
    s.clickObject(atom(0, 0, 0), false);
    expect(s.state.selection).toEqual([]);
    s.clickObject(atom(0, 0, 0), false);
    s.clickObject(atom(1, 0, 0), true);
    s.clickObject(atom(0, 0, 0), true);
    expect(s.state.selection).toEqual([atom(1, 0, 0)]);
    s.clickObject(null, false);
    expect(s.state.selection).toEqual([]);
  });

  it(`keeps at most ${MAX_SELECTED} objects`, () => {
    const s = store();
    const keys = [0, 0.5, 1].flatMap((x) => [0, 0.5, 1].map((y) => atom(x, y, 0)));
    for (const k of keys) s.clickObject(k, true);
    expect(s.state.selection).toHaveLength(MAX_SELECTED);
    expect(s.state.selection.at(-1)).toBe(keys.at(-1));
  });

  it('shrinking the repeated block drops objects that no longer exist', () => {
    const s = store({ repeat: [2, 1, 1] });
    s.setSelection([atom(0, 0, 0), atom(2, 0, 0)]);
    s.setRepeat([1, 1, 1]);
    expect(s.state.selection).toEqual([atom(0, 0, 0)]);
  });
});

describe('neighbors tool', () => {
  it('clicking picks the target instead of selecting', () => {
    const s = store();
    s.setNeighborsOn(true);
    s.clickObject('tet:0.2500,0.2500,0.2500', false);
    expect(s.state.neighbors.target).toBe('tet:0.2500,0.2500,0.2500');
    expect(s.state.selection).toEqual([]);
  });

  it('starts on a typical atom for each structure', () => {
    expect(typicalAtom('bcc')).toBe(atom(0.5, 0.5, 0.5));
    expect(typicalAtom('sc')).toBe(atom(0, 0, 0));
    const s = store();
    s.setNeighborsOn(true);
    expect(s.state.neighbors.target).toBe(typicalAtom('fcc'));
    s.setStructure('bcc');
    expect(s.state.neighbors.target).toBe(typicalAtom('bcc'));
  });

  it('turning Solo on also turns the tool on; turning the tool off keeps Solo for next time', () => {
    const s = store();
    s.setNeighborsSolo(true);
    expect(s.state.neighbors).toMatchObject({ on: true, solo: true });
    s.setNeighborsOn(false);
    expect(s.state.neighbors).toMatchObject({ on: false, solo: true });
  });

  it('switching structure clears the selection', () => {
    const s = store();
    s.setSelection([atom(0, 0, 0), atom(1, 0, 0)]);
    s.setStructure('sc');
    expect(s.state.selection).toEqual([]);
    expect(s.state.direction).toBeNull();
  });
});

describe('links (URL)', () => {
  const roundTrip = (s: State) => stateFromURL(stateToURL(s));
  const linkable = (s: State) => {
    const { selection: _selection, marker: _marker, direction: _direction, ...rest } = s;
    return rest;
  };

  it('the default view is just ?s=fcc', () => {
    expect(stateToURL(defaultState())).toBe('?s=fcc');
    expect(roundTrip(defaultState())).toEqual(defaultState());
  });

  it('restores every linkable setting', () => {
    const s: State = {
      ...defaultState(),
      structure: 'bcc',
      showAtoms: false,
      showSites: { oct: true, tri: true },
      style: 'sparse',
      clipToCell: false,
      opacity: 0.45,
      polyhedra: true,
      repeat: [2, 1, 3],
      plane: { hkl: [1, 1, -1], offset: 0.25, show: true },
      slice: { on: true, mode: 'cutaway', flip: true },
      neighbors: { on: true, target: typicalAtom('bcc'), solo: true },
      labels: false,
    };
    expect(linkable(roundTrip(s))).toEqual(linkable(s));
  });

  it('ignores invalid values', () => {
    const s = stateFromURL('?s=hcp&rep=9,1,1&op=7&plane=0,0,0,1,1');
    expect(s.structure).toBe('fcc');
    expect(s.repeat).toEqual([1, 1, 1]);
    expect(s.opacity).toBe(defaultState().opacity);
    expect(s.plane).toEqual(defaultState().plane);
  });
});

describe('hiding atoms', () => {
  it('the hide tool hides and shows atoms, and ignores sites', () => {
    const s = store();
    s.setHideTool(true);
    s.clickObject(atom(1, 0.5, 0.5), false);
    expect(s.state.hidden).toEqual([atom(1, 0.5, 0.5)]);
    s.clickObject('oct:0.5000,0.5000,0.5000', false);
    expect(s.state.hidden).toEqual([atom(1, 0.5, 0.5)]);
    s.clickObject(atom(1, 0.5, 0.5), false);
    expect(s.state.hidden).toEqual([]);
    expect(s.state.selection).toEqual([]);
  });

  it('the hide tool and the neighbors tool are never on together', () => {
    const s = store();
    s.setNeighborsOn(true);
    s.setHideTool(true);
    expect(s.state.neighbors.on).toBe(false);
    s.setNeighborsOn(true);
    expect(s.state.hideTool).toBe(false);
    s.setHideTool(true);
    s.setNeighborsSolo(true);
    expect(s.state.hideTool).toBe(false);
  });

  it('hiding a selected atom deselects it and updates the direction', () => {
    const s = store();
    s.setSelection([atom(0, 0, 0), atom(1, 0, 0), atom(0, 1, 0)]);
    s.setHidden([atom(0, 1, 0)]);
    expect(s.state.selection).toEqual([atom(0, 0, 0), atom(1, 0, 0)]);
    expect(s.state.direction?.uvw).toEqual([1, 0, 0]);
  });

  it('hides atoms by position', () => {
    const s = store();
    s.setGroupHidden('corner', true);
    expect(s.state.hidden).toHaveLength(8);
    s.setGroupHidden('face', true);
    expect(s.state.hidden).toHaveLength(14);
    s.setGroupHidden('corner', false);
    expect(s.state.hidden).toHaveLength(6);

    const bcc = store({ structure: 'bcc' });
    bcc.setGroupHidden('interior', true);
    expect(bcc.state.hidden).toEqual([atom(0.5, 0.5, 0.5)]);
  });

  it('switching structure clears hidden atoms; shrinking the block drops the ones outside it', () => {
    const s = store({ repeat: [2, 1, 1] });
    s.setHidden([atom(0, 0, 0), atom(2, 0, 0)]);
    s.setRepeat([1, 1, 1]);
    expect(s.state.hidden).toEqual([atom(0, 0, 0)]);
    s.setStructure('bcc');
    expect(s.state.hidden).toEqual([]);
  });

  it('hidden atoms are kept in links, and positions that are not atoms are ignored', () => {
    const s: State = { ...defaultState(), hidden: [atom(0, 0, 0), atom(1, 0.5, 0.5)] };
    expect(stateToURL(s)).toBe('?s=fcc&hide=0,0,0;1,0.5,0.5');
    expect(stateFromURL(stateToURL(s)).hidden).toEqual(s.hidden);
    expect(stateFromURL('?s=fcc&hide=0.5,0.5,0.5;9,9,9;0,0,0').hidden).toEqual([atom(0, 0, 0)]);
  });
});
