import { describe, expect, it } from 'vitest';
import { objectKey } from '../src/crystal/lattice';
import type { Vec3 } from '../src/crystal/structures';
import {
  activePlane,
  defaultState,
  isSlicing,
  MAX_SELECTED,
  type State,
  Store,
  selectionDirection,
  selectionPlane,
  stateFromURL,
  stateToURL,
  typicalAtom,
} from '../src/state';

const atom = (...p: Vec3) => objectKey('atom', p);
const store = (patch: Partial<State> = {}) => new Store({ ...defaultState(), ...patch });

describe('selection offers, never applies', () => {
  it('two objects offer the direction between them; adding it is a separate step', () => {
    const s = store();
    s.clickObject(atom(0, 0, 0), false);
    s.clickObject(atom(0.5, 0.5, 0), true);
    expect(selectionDirection(s.state)?.uvw).toEqual([1, 1, 0]);
    expect(s.state.constructions).toEqual([]);
    s.addDirectionFromSelection();
    expect(s.state.constructions).toMatchObject([{ kind: 'direction', uvw: [1, 1, 0], vector: [0.5, 0.5, 0], from: [0, 0, 0] }]);
  });

  it('three objects offer the plane through them, which becomes the active plane when added', () => {
    const s = store({ selection: [atom(1, 1, 1), atom(1, 0, 0), atom(0, 1, 0)] });
    const p = selectionPlane(s.state);
    expect(p?.hkl).toEqual([1, 1, -1]);
    expect(p?.offset).toBeCloseTo(1 / Math.sqrt(3), 10);
    expect(s.state.constructions).toEqual([]);
    s.addPlaneFromSelection();
    expect(activePlane(s.state)?.hkl).toEqual([1, 1, -1]);
    expect(isSlicing(s.state)).toBe(false);
  });

  it('"Add and slice" adds the plane, switches to the Plane tool and shows the section', () => {
    const s = store({ selection: [atom(1, 0, 0), atom(0, 1, 0), atom(0, 0, 1)] });
    s.addPlaneFromSelection(true);
    expect(s.state).toMatchObject({ tool: 'plane', slice: 'section' });
    expect(activePlane(s.state)?.hkl).toEqual([1, 1, 1]);
  });

  it('three objects on one line offer no plane', () => {
    const s = store({ selection: [atom(0, 0, 0), atom(0.5, 0.5, 0.5), atom(1, 1, 1)] });
    expect(selectionPlane(s.state)).toBeNull();
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
    const s = store({ repeat: [2, 1, 1], selection: [atom(0, 0, 0), atom(2, 0, 0)], hidden: [atom(2, 1, 1)] });
    s.setRepeat([1, 1, 1]);
    expect(s.state.selection).toEqual([atom(0, 0, 0)]);
    expect(s.state.hidden).toEqual([]);
  });
});

describe('tools', () => {
  it('what a click does depends on the one active tool', () => {
    const s = store();
    s.setTool('neighbors');
    s.clickObject('tet:0.2500,0.2500,0.2500', false);
    expect(s.state.target).toBe('tet:0.2500,0.2500,0.2500');
    expect(s.state.selection).toEqual([]);

    s.setTool('hide');
    s.clickObject(atom(1, 0.5, 0.5), false);
    s.clickObject('oct:0.5000,0.5000,0.5000', false); // sites can't be hidden
    expect(s.state.hidden).toEqual([atom(1, 0.5, 0.5)]);
    s.clickObject(atom(1, 0.5, 0.5), false);
    expect(s.state.hidden).toEqual([]);

    s.setTool('plane');
    s.clickObject(atom(0, 0, 0), false);
    expect(s.state.selection).toEqual([atom(0, 0, 0)]);
  });

  it('the neighbors tool starts on the selected object, or a typical atom', () => {
    const s = store({ selection: ['oct:0.5000,0.5000,0.5000'] });
    s.setTool('neighbors');
    expect(s.state.target).toBe('oct:0.5000,0.5000,0.5000');
    const t = store();
    t.setTool('neighbors');
    expect(t.state.target).toBe(typicalAtom('fcc'));
    expect(typicalAtom('bcc')).toBe(atom(0.5, 0.5, 0.5));
    expect(typicalAtom('sc')).toBe(atom(0, 0, 0));
  });

  it('switching structure clears the selection and hidden atoms but keeps directions and planes', () => {
    const s = store({ selection: [atom(0, 0, 0)], hidden: [atom(1, 1, 1)] });
    s.addPlane([1, 1, 1]);
    s.setStructure('bcc');
    expect(s.state).toMatchObject({ structure: 'bcc', selection: [], hidden: [] });
    expect(s.state.constructions).toHaveLength(1);
  });

  it('hiding a selected atom deselects it', () => {
    const s = store({ selection: [atom(0, 0, 0), atom(1, 0, 0)] });
    s.setHidden([atom(1, 0, 0)]);
    expect(s.state.selection).toEqual([atom(0, 0, 0)]);
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
});

describe('directions, planes and points', () => {
  it('removing the plane being sliced through stops the slice', () => {
    const s = store();
    const id = s.addPlane([1, 0, 0]);
    s.set({ slice: 'cutaway' });
    expect(isSlicing(s.state)).toBe(true);
    s.removeConstruction(id);
    expect(s.state).toMatchObject({ activePlane: null, slice: 'off' });
  });

  it('↑ / ↓ move the active plane, but not past the block', () => {
    const s = store();
    s.addPlane([1, 0, 0], 0.5);
    s.moveActivePlane(0.02);
    expect(activePlane(s.state)?.offset).toBeCloseTo(0.52, 10);
    for (let i = 0; i < 50; i++) s.moveActivePlane(0.02);
    expect(activePlane(s.state)?.offset).toBe(1);
  });

  it('a hidden construction stays in the list', () => {
    const s = store();
    const id = s.addConstruction({ kind: 'point', pos: [0.5, 0.5, 0.5], visible: true });
    s.updateConstruction(id, { visible: false });
    expect(s.state.constructions).toMatchObject([{ id, visible: false }]);
  });
});

describe('undo and redo', () => {
  it('every change can be undone and redone', () => {
    const s = store();
    s.set({ showAtoms: false });
    s.setTool('hide');
    s.clickObject(atom(0, 0, 0), false);
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.state.hidden).toEqual([]);
    s.undo();
    expect(s.state.tool).toBe('select');
    s.undo();
    expect(s.state.showAtoms).toBe(true);
    expect(s.canUndo).toBe(false);
    s.redo();
    s.redo();
    expect(s.state).toMatchObject({ showAtoms: false, tool: 'hide' });
    // a new change clears what could be redone
    s.set({ opacity: 0.5 });
    expect(s.canRedo).toBe(false);
  });

  it('holding ↑ moves the plane as one undo step', () => {
    const s = store();
    s.addPlane([1, 0, 0], 0.3);
    for (let i = 0; i < 10; i++) s.moveActivePlane(0.02, true);
    s.commitPreview();
    expect(activePlane(s.state)?.offset).toBeCloseTo(0.5, 10);
    s.undo();
    expect(activePlane(s.state)?.offset).toBeCloseTo(0.3, 10);
  });

  it('dragging a slider is one undo step', () => {
    const s = store();
    for (const v of [0.7, 0.6, 0.5, 0.4]) s.preview({ opacity: v });
    s.commitPreview();
    expect(s.state.opacity).toBe(0.4);
    s.undo();
    expect(s.state.opacity).toBe(defaultState().opacity);
    expect(s.canUndo).toBe(false);
  });

  it('the graphics choice belongs to the device: not an undo step, and kept through undo and reset', () => {
    const s = store();
    s.set({ polyhedra: true });
    s.setGraphics('performance');
    s.undo();
    expect(s.state).toMatchObject({ polyhedra: false, graphics: 'performance' });
    s.set({ labels: false });
    s.reset();
    expect(s.state).toMatchObject({ labels: true, graphics: 'performance' });
    s.undo();
    expect(s.state.labels).toBe(false);
  });

  it('clicks that change nothing are not undo steps', () => {
    const s = store();
    s.clickObject(null, false);
    s.setTool('select');
    expect(s.canUndo).toBe(false);
  });
});

describe('links (URL)', () => {
  const roundTrip = (s: State) => stateFromURL(stateToURL(s));
  // what a link doesn't carry: the selection and the device's graphics choice
  const linkable = ({ selection: _s, graphics: _g, ...rest }: State) => rest;

  it('the default view is just ?s=fcc', () => {
    expect(stateToURL(defaultState())).toBe('?s=fcc');
    expect(roundTrip(defaultState())).toEqual(defaultState());
  });

  it('restores every linkable setting, including directions, planes, points and the slice', () => {
    const s: State = {
      ...defaultState(),
      structure: 'bcc',
      showAtoms: false,
      showSites: { oct: true, tri: true },
      repeat: [2, 1, 3],
      hidden: [atom(0, 0, 0)],
      style: 'sparse',
      clipToCell: false,
      opacity: 0.45,
      polyhedra: true,
      labels: false,
      tool: 'neighbors',
      target: 'oct:0.5000,0.5000,0.0000',
      solo: true,
      othersOpacity: 0.55,
      constructions: [
        { id: 1, kind: 'direction', uvw: [-1, 1, 0], from: [1, 0.5, 0.5], vector: [-0.5, 0.5, 0], visible: true },
        { id: 2, kind: 'plane', hkl: [1, 1, -1], offset: 0.25, visible: false },
        { id: 3, kind: 'point', pos: [0.25, 0.25, 0.25], visible: true },
      ],
      activePlane: 2,
      slice: 'cutaway',
      flip: true,
    };
    expect(linkable(roundTrip(s))).toEqual(linkable(s));
  });

  it('ignores invalid values', () => {
    const s = stateFromURL('?s=hcp&rep=9,1,1&op=7&tool=paint&c=p,0,0,0,1;x,1,2,3;d,1,0,0&plane=5&slice=section,0');
    expect(s.structure).toBe('fcc');
    expect(s.repeat).toEqual([1, 1, 1]);
    expect(s.opacity).toBe(defaultState().opacity);
    expect(s.tool).toBe('select');
    expect(s.constructions).toEqual([]);
    expect(s.slice).toBe('off');
  });

  it('links from before the tool bar still open', () => {
    const s = stateFromURL('?s=fcc&sites=oct&nb=solo&plane=1,1,1,0.9,1&slice=1,cutaway,1');
    expect(s).toMatchObject({ tool: 'neighbors', solo: true, target: typicalAtom('fcc'), slice: 'cutaway', flip: true });
    expect(activePlane(s)).toMatchObject({ hkl: [1, 1, 1], offset: 0.9, visible: true });
  });

  it('the graphics choice is never part of a link', () => {
    expect(stateToURL({ ...defaultState(), graphics: 'performance' })).toBe('?s=fcc');
    expect(stateFromURL('?s=fcc&graphics=performance').graphics).toBe('quality');
  });

  it('hidden atoms are kept in links, and positions that are not atoms are ignored', () => {
    const s: State = { ...defaultState(), hidden: [atom(0, 0, 0), atom(1, 0.5, 0.5)] };
    expect(stateToURL(s)).toBe('?s=fcc&hide=0,0,0;1,0.5,0.5');
    expect(stateFromURL(stateToURL(s)).hidden).toEqual(s.hidden);
    expect(stateFromURL('?s=fcc&hide=0.5,0.5,0.5;9,9,9;0,0,0').hidden).toEqual([atom(0, 0, 0)]);
  });
});
