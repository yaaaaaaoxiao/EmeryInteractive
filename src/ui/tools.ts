// Above the model: the tool bar (exactly one tool active), the active tool's options, and a status line under the model
// that says what a click does and whether a slice is cutting the model.

import { atomObjects, POSITION_GROUPS, type PositionGroup, positionGroup } from '../crystal/lattice';
import { STRUCTURES, type Vec3 } from '../crystal/structures';
import { activePlane, atomsInGroup, isSlicing, offsetRange, type Slice, type State, type Store, type Tool } from '../state';
import { h, segmented, triple } from './dom';
import { plane as planeText } from './notation';

const TOOLS: { id: Tool; name: string; key: string; icon: string; hint: string }[] = [
  {
    id: 'select',
    name: 'Select',
    key: 'S',
    icon: '<path d="M4 2l9 6-4 1 2 5-2 1-2-5-3 3z" fill="currentColor"/>',
    hint: 'Click an atom or site to inspect it. Shift+click to select several.',
  },
  {
    id: 'neighbors',
    name: 'Neighbors',
    key: 'N',
    icon: '<circle cx="8" cy="8" r="2.4" fill="currentColor"/><circle cx="2.5" cy="3" r="1.6" fill="currentColor"/><circle cx="13.5" cy="3" r="1.6" fill="currentColor"/><circle cx="2.5" cy="13" r="1.6" fill="currentColor"/><circle cx="13.5" cy="13" r="1.6" fill="currentColor"/><path d="M8 8L2.5 3M8 8l5.5-5M8 8l-5.5 5M8 8l5.5 5" stroke="currentColor"/>',
    hint: 'Click any atom or site to see what surrounds it. Sites are picked before the atoms in front of them.',
  },
  {
    id: 'hide',
    name: 'Hide',
    key: 'H',
    icon: '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-dasharray="2.5 2"/><path d="M3 13L13 3" stroke="currentColor" stroke-width="1.6"/>',
    hint: 'Click an atom to hide it; click its outline to bring it back.',
  },
  {
    id: 'plane',
    name: 'Plane',
    key: 'P',
    icon: '<path d="M1.5 11L6 4h8.5L10 11z" fill="currentColor" fill-opacity="0.35" stroke="currentColor"/>',
    hint: 'Choose or add a plane, then slice. ↑ / ↓ move it. Select 3 atoms to get the plane through them.',
  },
];

const GROUP_NAMES: Record<PositionGroup, string> = { corner: 'Corners', edge: 'Edges', face: 'Faces', interior: 'Inside' };

export class ToolBar {
  private optionsKey = '';
  private syncers: ((s: State) => void)[] = [];
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;
  // clicks add to the selection, like holding Shift (for touch screens, which have no Shift key). Not saved in the link.
  addToSelection = false;

  constructor(
    bar: HTMLElement,
    private options: HTMLElement,
    private status: HTMLElement,
    private store: Store,
  ) {
    for (const t of TOOLS) {
      const icon = h('span', { class: 'tool-icon', 'aria-hidden': 'true' });
      icon.innerHTML = `<svg viewBox="0 0 16 16">${t.icon}</svg>`;
      const b = h(
        'button',
        { type: 'button', class: 'tool', title: `${t.name} (${t.key})`, onclick: () => store.setTool(t.id) },
        icon,
        t.name,
        h('kbd', {}, t.key),
      );
      this.toolButtons.set(t.id, b);
    }
    this.undoButton = h(
      'button',
      { type: 'button', class: 'small', title: 'Undo (⌘Z / Ctrl+Z)', onclick: () => store.undo() },
      '↶ Undo',
    );
    this.redoButton = h(
      'button',
      { type: 'button', class: 'small', title: 'Redo (⇧⌘Z / Ctrl+Y)', onclick: () => store.redo() },
      '↷ Redo',
    );
    const reset = h(
      'button',
      { type: 'button', class: 'small', title: 'Back to the default setup', onclick: () => store.reset() },
      'Reset',
    );
    bar.replaceChildren(
      h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Tools' }, ...this.toolButtons.values()),
      h('div', { class: 'history' }, this.undoButton, this.redoButton, reset),
    );
  }

  render(state: State): void {
    for (const [id, b] of this.toolButtons) b.setAttribute('aria-pressed', String(id === state.tool));
    this.undoButton.disabled = !this.store.canUndo;
    this.redoButton.disabled = !this.store.canRedo;

    // rebuild the options only when their shape changes; otherwise update values in place (sliders keep working)
    const planes = state.constructions.filter((c) => c.kind === 'plane').map((c) => (c.kind === 'plane' ? [c.id, ...c.hkl] : []));
    const key = JSON.stringify([state.tool, state.structure, planes, state.activePlane]);
    if (key !== this.optionsKey) {
      this.optionsKey = key;
      this.syncers = [];
      this.options.replaceChildren(...this.buildOptions(state));
    }
    this.syncers.forEach((sync) => sync(state));
    this.renderStatus(state);
  }

  private bind<T extends HTMLElement>(el: T, sync: (el: T, s: State) => void): T {
    this.syncers.push((s) => sync(el, s));
    return el;
  }

  private buildOptions(state: State): HTMLElement[] {
    const { store } = this;
    const note = (text: string) => h('span', { class: 'hint' }, text);
    const addToSelection = () =>
      h(
        'label',
        { class: 'check', title: 'Each click adds to the selection or removes from it, like holding Shift' },
        h('input', {
          type: 'checkbox',
          checked: this.addToSelection,
          onchange: (e: Event) => {
            this.addToSelection = (e.target as HTMLInputElement).checked;
          },
        }),
        'Add to selection',
      );

    if (state.tool === 'select') {
      return [addToSelection(), note('Select 2 objects to get a direction, 3 for a plane, 4 or more for a polyhedron.')];
    }

    if (state.tool === 'neighbors') {
      const solo = this.bind(
        h('input', { type: 'checkbox', onchange: (e: Event) => store.set({ solo: (e.target as HTMLInputElement).checked }) }),
        (el, s) => (el.checked = s.solo),
      );
      // how faint everything except the target and its neighbours is (hidden while Solo hides it all)
      const othersValue = this.bind(h('span', { class: 'label' }), (el, s) => {
        el.textContent = `Other atoms ${Math.round(s.othersOpacity * 100)}%`;
      });
      const others = this.bind(
        h('input', {
          type: 'range',
          min: '0.05',
          max: '1',
          step: '0.05',
          'aria-label': 'Opacity of the other atoms',
          oninput: (e: Event) => store.preview({ othersOpacity: Number((e.target as HTMLInputElement).value) }),
          onchange: () => store.commitPreview(),
        }),
        (el, s) => (el.value = String(s.othersOpacity)),
      );
      const othersRow = this.bind(
        h('label', { class: 'range-inline', title: 'How visible the rest of the crystal is' }, othersValue, others),
        (el, s) => {
          el.hidden = s.solo;
        },
      );
      return [
        h('label', { class: 'check' }, solo, 'Solo: hide everything else'),
        othersRow,
        note('Turn on a site type in the left panel to pick sites.'),
      ];
    }

    if (state.tool === 'hide') {
      // only the positions this structure has atoms at (FCC: corners, faces; BCC: corners, inside; SC: corners)
      const s = STRUCTURES[state.structure];
      const groups = POSITION_GROUPS.filter((g) => atomObjects(s, [1, 1, 1]).some((a) => positionGroup(a.pos) === g));
      const allHidden = (st: State, g: PositionGroup) => {
        const keys = atomsInGroup(st, g);
        return keys.length > 0 && keys.every((k) => st.hidden.includes(k));
      };
      const buttons = groups.map((g) =>
        this.bind(
          h(
            'button',
            {
              type: 'button',
              title: `Hide or show all ${g === 'interior' ? 'inside' : g} atoms`,
              onclick: () => store.setGroupHidden(g, !allHidden(store.state, g)),
            },
            GROUP_NAMES[g],
          ),
          (el, st) => {
            el.classList.toggle('on', allHidden(st, g));
            el.setAttribute('aria-pressed', String(allHidden(st, g)));
          },
        ),
      );
      const showAll = this.bind(h('button', { type: 'button', class: 'small', onclick: () => store.setHidden([]) }), (el, st) => {
        el.textContent = st.hidden.length ? `Show all hidden (${st.hidden.length})` : 'No hidden atoms';
        el.disabled = st.hidden.length === 0;
        // red while there are hidden atoms, so it's easy to find the way back
        el.classList.toggle('danger', st.hidden.length > 0);
      });
      return [
        h('span', { class: 'label' }, 'Hide all'),
        h('div', { class: 'segmented toggles', role: 'group' }, ...buttons),
        showAll,
      ];
    }

    //////// plane tool: choose or add a plane, slice through it
    const planes = state.constructions.filter((c) => c.kind === 'plane');
    const select = h(
      'select',
      {
        'aria-label': 'Active plane',
        onchange: (e: Event) => store.set({ activePlane: Number((e.target as HTMLSelectElement).value) || null }),
      },
      ...(planes.length ? [] : [h('option', { value: '' }, 'none yet')]),
      ...planes.map((p) =>
        h('option', { value: String(p.id), selected: p.id === state.activePlane }, p.kind === 'plane' ? planeText(p.hkl) : ''),
      ),
    );
    const hkl = triple([1, 1, 1], '1');
    hkl.forEach((input, i) => input.setAttribute('aria-label', 'hkl'[i]));
    const add = h(
      'button',
      {
        type: 'button',
        class: 'small',
        onclick: () => {
          const v = hkl.map((i) => Math.round(Number(i.value) || 0)) as Vec3;
          // a plane added here becomes the one the tool works on
          if (v.some((x) => x !== 0)) store.addPlane(v, undefined, (id) => ({ activePlane: id }));
        },
      },
      'Add',
    );
    const parts: HTMLElement[] = [
      h('label', { class: 'row' }, h('span', { class: 'label' }, 'Plane'), select),
      h('span', { class: 'row' }, h('span', { class: 'label' }, 'New (h k l)'), ...hkl, add),
      addToSelection(),
    ];
    const active = activePlane(state);
    if (active) {
      const slice = segmented<Slice>(
        [
          ['off', 'Off'],
          ['section', 'Section'],
          ['cutaway', 'Cutaway'],
        ],
        state.slice,
        (v) => store.set({ slice: v }),
      );
      this.syncers.push((st) =>
        slice.querySelectorAll('button').forEach((b, i) => {
          const on = (['off', 'section', 'cutaway'] as Slice[])[i] === st.slice;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }),
      );
      const flip = this.bind(
        h('input', { type: 'checkbox', onchange: (e: Event) => store.set({ flip: (e.target as HTMLInputElement).checked }) }),
        (el, st) => (el.checked = st.flip),
      );
      const offsetLabel = this.bind(h('span', { class: 'label' }), (el, st) => {
        el.textContent = `Offset ${(activePlane(st)?.offset ?? 0).toFixed(3)}a`;
      });
      const offset = this.bind(
        h('input', {
          type: 'range',
          step: '0.005',
          'aria-label': 'Plane offset',
          oninput: (e: Event) =>
            store.updateConstruction(active.id, { offset: Number((e.target as HTMLInputElement).value) }, true),
          onchange: () => store.commitPreview(),
        }),
        (el, st) => {
          const p = activePlane(st);
          if (!p) return;
          const [lo, hi] = offsetRange(p.hkl, st.repeat);
          el.min = String(lo);
          el.max = String(hi);
          el.value = String(p.offset);
        },
      );
      parts.push(
        slice,
        h('label', { class: 'check' }, flip, 'Flip side'),
        h('label', { class: 'range-inline' }, offsetLabel, offset),
      );
    }
    return parts;
  }

  private renderStatus(state: State): void {
    const tool = TOOLS.find((t) => t.id === state.tool)!;
    const parts: (HTMLElement | string)[] = [h('span', {}, h('strong', {}, `${tool.name}: `), tool.hint)];
    // a slice keeps cutting the model whatever tool is active, so it always says so here
    const p = activePlane(state);
    if (isSlicing(state) && p && state.tool !== 'plane') {
      parts.push(
        h('span', { class: 'spacer' }),
        h('span', {}, `Slicing with ${planeText(p.hkl)} · ${state.slice}`),
        h('button', { type: 'button', class: 'small', onclick: () => this.store.set({ slice: 'off' }) }, 'Stop slicing'),
      );
    }
    this.status.replaceChildren(...parts);
  }
}
