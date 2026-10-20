// Left panel. Built once per structure; every change goes through the store, and `sync` shows the current state.

import { atomObjects, POSITION_GROUPS, type PositionGroup, positionGroup } from '../crystal/lattice';
import { STRUCTURES, type Vec3 } from '../crystal/structures';
import type { Viewer } from '../scene/viewer';
import { atomsInGroup, offsetRange, parseKey, type State, type Store, standardOffset } from '../state';
import { checkbox, h, segmented, triple } from './dom';

export class ControlsPanel {
  private builtFor: string | null = null;
  private syncers: ((s: State) => void)[] = [];

  constructor(
    private root: HTMLElement,
    private store: Store,
    private viewer: Viewer,
  ) {}

  render(state: State): void {
    // rebuild only when the set of controls changes (structure); otherwise update values in place,
    // so sliders keep working while dragged and inputs keep focus
    if (this.builtFor !== state.structure) {
      this.builtFor = state.structure;
      this.syncers = [];
      this.root.replaceChildren(...this.sections(state));
    }
    this.syncers.forEach((sync) => sync(state));
  }

  private bind<T extends HTMLElement>(el: T, sync: (el: T, s: State) => void): T {
    this.syncers.push((s) => sync(el, s));
    return el;
  }

  private checkbox(label: string, get: (s: State) => boolean, set: (v: boolean) => void, color?: number) {
    const el = checkbox(label, get(this.store.state), set, color);
    const input = el.querySelector('input')!;
    this.syncers.push((s) => (input.checked = get(s)));
    return el;
  }

  private segmented<T extends string>(options: [T, string][], get: (s: State) => T, set: (v: T) => void) {
    const el = segmented(options, get(this.store.state), set);
    this.syncers.push((s) => {
      el.querySelectorAll('button').forEach((b, i) => {
        const on = options[i][0] === get(s);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    });
    return el;
  }

  private sections(state: State): HTMLElement[] {
    const store = this.store;
    const structure = STRUCTURES[state.structure];
    const set = store.set.bind(store);

    //////// show
    const show = section(
      'Show',
      true,
      this.checkbox(
        'Atoms',
        (s) => s.showAtoms,
        (v) => set({ showAtoms: v }),
        structure.color,
      ),
      ...structure.sites.map((site) =>
        this.checkbox(
          `${site.name} sites`,
          (s) => !!s.showSites[site.id],
          (v) => set((s) => ({ showSites: { ...s.showSites, [site.id]: v } })),
          site.color,
        ),
      ),
    );

    //////// appearance
    const opacity = this.bind(
      h('input', {
        type: 'range',
        min: '0.1',
        max: '1',
        step: '0.05',
        'aria-label': 'Atom opacity',
        oninput: (e: Event) => set({ opacity: Number((e.target as HTMLInputElement).value) }),
      }),
      (el, s) => (el.value = String(s.opacity)),
    );
    const appearance = section(
      'Appearance',
      true,
      this.segmented(
        [
          ['hard', 'Hard sphere'],
          ['sparse', 'Sparse'],
        ],
        (s) => s.style,
        (v) => set({ style: v }),
      ),
      // the sparse style shrinks every sphere (and keeps the tiniest sites visible), so sizes can't be compared
      this.bind(h('p', { class: 'hint' }, 'Sparse shows positions only: sphere sizes are not to scale.'), (el, s) => {
        el.hidden = s.style !== 'sparse';
      }),
      this.checkbox(
        'Clip to unit cell',
        (s) => s.clipToCell,
        (v) => set({ clipToCell: v }),
      ),
      h('label', { class: 'range' }, 'Atom opacity', opacity),
      this.checkbox(
        'Site polyhedra',
        (s) => s.polyhedra,
        (v) => set({ polyhedra: v }),
      ),
      this.checkbox(
        'Coordinate labels',
        (s) => s.labels,
        (v) => set({ labels: v }),
      ),
    );

    //////// neighbours
    const neighbors = section(
      'Neighbors',
      true,
      this.checkbox(
        'Neighbors tool',
        (s) => s.neighbors.on,
        (v) => store.setNeighborsOn(v),
      ),
      this.checkbox(
        'Solo: hide everything else',
        (s) => s.neighbors.on && s.neighbors.solo,
        (v) => store.setNeighborsSolo(v),
      ),
      h(
        'p',
        { class: 'hint' },
        'Click any atom or site to see its nearest atoms, bonds and count. Turn on a site type under Show to pick sites.',
      ),
    );

    //////// hide atoms
    const groupNames: Record<PositionGroup, string> = { corner: 'Corners', edge: 'Edges', face: 'Faces', interior: 'Inside' };
    // only the positions this structure has atoms at (FCC: corners, faces; BCC: corners, inside; SC: corners)
    const groups = POSITION_GROUPS.filter((g) => atomObjects(structure, [1, 1, 1]).some((a) => positionGroup(a.pos) === g));
    const groupButtons = groups.map((g) =>
      this.bind(
        h(
          'button',
          {
            type: 'button',
            title: `Hide or show all ${g === 'interior' ? 'inside' : g} atoms`,
            onclick: () => store.setGroupHidden(g, !allHidden(store.state, g)),
          },
          groupNames[g],
        ),
        (el, s) => {
          const on = allHidden(s, g);
          el.classList.toggle('on', on);
          el.setAttribute('aria-pressed', String(on));
        },
      ),
    );
    const showAll = this.bind(h('button', { type: 'button', class: 'small', onclick: () => store.setHidden([]) }), (el, s) => {
      el.textContent = s.hidden.length ? `Show all hidden (${s.hidden.length})` : 'No hidden atoms';
      el.disabled = s.hidden.length === 0;
    });
    const hide = section(
      'Hide atoms',
      true,
      this.checkbox(
        'Hide tool',
        (s) => s.hideTool,
        (v) => store.setHideTool(v),
      ),
      h('p', { class: 'hint' }, 'Click an atom to hide it; click its outline to bring it back.'),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'row-label' }, 'Hide'),
        h('div', { class: 'segmented toggles' }, ...groupButtons),
      ),
      showAll,
    );

    //////// plane and slice
    const hkl = triple(state.plane.hkl, '1');
    const applyPlane = () => {
      const v = hkl.map((i) => Math.round(Number(i.value) || 0)) as Vec3;
      if (v.every((x) => x === 0)) return;
      set((s) => ({ plane: { ...s.plane, hkl: v, offset: standardOffset(v) } }));
    };
    hkl.forEach((i) => i.addEventListener('change', applyPlane));
    this.syncers.push((s) =>
      hkl.forEach((i, n) => {
        if (document.activeElement !== i) i.value = String(s.plane.hkl[n]);
      }),
    );

    const offset = this.bind(
      h('input', {
        type: 'range',
        step: '0.005',
        'aria-label': 'Plane offset',
        oninput: (e: Event) => set((s) => ({ plane: { ...s.plane, offset: Number((e.target as HTMLInputElement).value) } })),
      }),
      (el, s) => {
        const [lo, hi] = offsetRange(s.plane.hkl, s.repeat);
        el.min = String(lo);
        el.max = String(hi);
        el.value = String(s.plane.offset);
      },
    );
    const offsetValue = this.bind(h('span', { class: 'value' }), (el, s) => (el.textContent = `${s.plane.offset.toFixed(3)} a`));

    const slice = section(
      'Plane & slice',
      true,
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, '(h k l)'), ...hkl),
      h('label', { class: 'range' }, h('span', {}, 'Offset ', offsetValue), offset),
      this.checkbox(
        'Show plane',
        (s) => s.plane.show,
        (v) => set((s) => ({ plane: { ...s.plane, show: v } })),
      ),
      this.checkbox(
        'Slice',
        (s) => s.slice.on,
        (v) => set((s) => ({ slice: { ...s.slice, on: v } })),
      ),
      this.segmented(
        [
          ['section', 'Section'],
          ['cutaway', 'Cutaway'],
        ],
        (s) => s.slice.mode,
        (v) => set((s) => ({ slice: { ...s.slice, mode: v, on: true } })),
      ),
      this.checkbox(
        'Flip side',
        (s) => s.slice.flip,
        (v) => set((s) => ({ slice: { ...s.slice, flip: v } })),
      ),
      h('p', { class: 'hint' }, '↑ / ↓ move the plane (hold Shift for fine steps). Selecting 3 objects sets the plane.'),
    );

    //////// repeat
    const repeatSelects = [0, 1, 2].map((axis) =>
      this.bind(
        h(
          'select',
          {
            'aria-label': 'xyz'[axis] + ' repeats',
            onchange: () => {
              store.setRepeat(repeatSelects.map((s) => Number(s.value)) as Vec3);
            },
          },
          ...[1, 2, 3].map((n) => h('option', { value: String(n) }, String(n))),
        ),
        (el, s) => (el.value = String(s.repeat[axis])),
      ),
    );
    const repeat = section(
      'Repeat cells',
      false,
      h('div', { class: 'row' }, ...repeatSelects.flatMap((s, i) => [h('span', { class: 'axis' }, 'xyz'[i]), s])),
    );

    //////// lattice position and direction
    const qrs = triple(['', '', ''], 'any');
    const uvw = triple(['', '', ''], '1');
    this.syncers.push((s) => {
      if (!qrs.includes(document.activeElement as HTMLInputElement))
        qrs.forEach((i, n) => (i.value = s.marker ? String(s.marker[n]) : ''));
      if (!uvw.includes(document.activeElement as HTMLInputElement))
        uvw.forEach((i, n) => (i.value = s.direction ? String(s.direction.uvw[n]) : ''));
    });
    const read = (inputs: HTMLInputElement[]) => {
      const v = inputs.map((i) => (i.value.trim() === '' ? NaN : Number(i.value)));
      return v.some(Number.isNaN) ? null : (v as Vec3);
    };
    const showMarker = () => set({ marker: read(qrs) });
    const showDirection = () => {
      const v = read(uvw);
      if (!v || v.every((x) => x === 0)) return set({ direction: null });
      // start from the first selected object, as in the original site, or the origin
      const first = store.state.selection[0];
      const from: Vec3 = first ? parseKey(first).pos : [0, 0, 0];
      set({ direction: { uvw: v, vector: v, from, fromSelection: false } });
    };
    qrs.forEach((i) => i.addEventListener('change', showMarker));
    uvw.forEach((i) => i.addEventListener('change', showDirection));
    const indices = section(
      'Lattice indices',
      false,
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'row-label' }, 'Position'),
        ...qrs,
        h('button', { type: 'button', class: 'small', onclick: () => set({ marker: null }) }, 'Clear'),
      ),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'row-label' }, '[u v w]'),
        ...uvw,
        h('button', { type: 'button', class: 'small', onclick: () => set({ direction: null }) }, 'Clear'),
      ),
      h('p', { class: 'hint' }, 'Selecting 2 objects fills in the direction between them.'),
    );

    //////// camera
    const camera = section(
      'Camera',
      false,
      h(
        'div',
        { class: 'buttons' },
        h('button', { type: 'button', onclick: () => this.viewer.resetCamera() }, 'Reset'),
        ...(
          [
            [1, 0, 0],
            [1, 1, 0],
            [1, 1, 1],
          ] as Vec3[]
        ).map((d) =>
          h(
            'button',
            { type: 'button', title: `Look down [${d.join('')}]`, onclick: () => this.viewer.lookAlong(d) },
            `[${d.join('')}]`,
          ),
        ),
      ),
    );

    return [show, appearance, neighbors, hide, slice, repeat, indices, camera];
  }
}

// every atom in this group is hidden (and the group isn't empty)
function allHidden(s: State, group: PositionGroup): boolean {
  const keys = atomsInGroup(s, group);
  return keys.length > 0 && keys.every((k) => s.hidden.includes(k));
}

function section(title: string, open: boolean, ...children: HTMLElement[]): HTMLElement {
  return h('details', { class: 'section', open }, h('summary', {}, title), h('div', { class: 'section-body' }, ...children));
}
