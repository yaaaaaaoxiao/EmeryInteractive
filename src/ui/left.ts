// Left panel: what's in the model and how it's drawn, together, then the teaching tasks.
// Built once per structure; `render` updates values in place so sliders keep working while dragged.

import { STRUCTURES, type Vec3 } from '../crystal/structures';
import type { Viewer } from '../scene/viewer';
import type { State, Store } from '../state';
import { checkbox, h, segmented } from './dom';

export class LeftPanel {
  private builtFor: string | null = null;
  private syncers: ((s: State) => void)[] = [];
  // remembered when the panel is rebuilt for another structure
  private tasksOpen = false;

  constructor(
    private root: HTMLElement,
    private store: Store,
    private viewer: Viewer,
  ) {}

  render(state: State): void {
    if (this.builtFor !== state.structure) {
      this.builtFor = state.structure;
      this.syncers = [];
      this.build(state);
    }
    this.syncers.forEach((sync) => sync(state));
  }

  private bind<T extends HTMLElement>(el: T, sync: (el: T, s: State) => void): T {
    this.syncers.push((s) => sync(el, s));
    return el;
  }

  private check(label: string, get: (s: State) => boolean, set: (v: boolean) => void, color?: number, extra?: Node) {
    const el = checkbox(label, get(this.store.state), set, color);
    if (extra) el.append(extra);
    const input = el.querySelector('input')!;
    this.syncers.push((s) => (input.checked = get(s)));
    return el;
  }

  private build(state: State): void {
    const { store } = this;
    const structure = STRUCTURES[state.structure];
    const set = store.set.bind(store);

    //////// what's in the crystal
    const model = [
      group(
        'Contents',
        this.check(
          'Atoms',
          (s) => s.showAtoms,
          (v) => set({ showAtoms: v }),
          structure.color,
        ),
        ...structure.sites.map((site) =>
          this.check(
            `${site.name} sites`,
            (s) => !!s.showSites[site.id],
            (v) => set((s) => ({ showSites: { ...s.showSites, [site.id]: v } })),
            site.color,
            site.doorwayBetween
              ? h('span', { class: 'tag', title: 'A window between two pockets, not a pocket' }, 'doorway')
              : undefined,
          ),
        ),
      ),
      group('Repeat cells', h('div', { class: 'row' }, ...this.repeatSelects())),
      group(
        'Hidden atoms',
        this.bind(h('p', { class: 'hint' }), (el, s) => {
          el.textContent = `${s.hidden.length ? `${s.hidden.length} hidden.` : 'None hidden.'} Use the Hide tool (H) to hide atoms.`;
        }),
        h(
          'div',
          {},
          // red while there are hidden atoms, so it's easy to find the way back
          this.bind(
            h('button', { type: 'button', class: 'small', onclick: () => store.setHidden([]) }, 'Show all hidden atoms'),
            (el, s) => {
              el.disabled = s.hidden.length === 0;
              el.classList.toggle('danger', s.hidden.length > 0);
            },
          ),
        ),
      ),
    ];

    //////// how it's drawn
    const opacity = this.bind(
      h('input', {
        type: 'range',
        min: '0.1',
        max: '1',
        step: '0.05',
        id: 'atom-opacity',
        'aria-label': 'Atom opacity',
        oninput: (e: Event) => store.preview({ opacity: Number((e.target as HTMLInputElement).value) }),
        onchange: () => store.commitPreview(),
      }),
      (el, s) => (el.value = String(s.opacity)),
    );
    const styleButtons = segmented(
      [
        ['hard', 'Hard sphere'],
        ['sparse', 'Sparse'],
      ],
      state.style,
      (v) => set({ style: v }),
    );
    this.syncers.push((s) =>
      styleButtons.querySelectorAll('button').forEach((b, i) => {
        const on = (i === 0 ? 'hard' : 'sparse') === s.style;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }),
    );
    const display = [
      group(
        'Style',
        styleButtons,
        // the sparse style shrinks every sphere (and keeps the tiniest sites visible), so sizes can't be compared
        this.bind(h('p', { class: 'hint' }, 'Sparse shows positions only: sphere sizes are not to scale.'), (el, s) => {
          el.hidden = s.style !== 'sparse';
        }),
        this.check(
          'Clip to unit cell',
          (s) => s.clipToCell,
          (v) => set({ clipToCell: v }),
        ),
        h('label', { class: 'range', for: 'atom-opacity' }, h('span', { class: 'hint' }, 'Atom opacity'), opacity),
      ),
      group(
        'Extras',
        this.check(
          'Site polyhedra',
          (s) => s.polyhedra,
          (v) => set({ polyhedra: v }),
        ),
        this.check(
          'Coordinate labels',
          (s) => s.labels,
          (v) => set({ labels: v }),
        ),
      ),
      group(
        'Camera',
        h(
          'div',
          { class: 'buttons' },
          h(
            'button',
            { type: 'button', title: 'Back to the starting camera angle', onclick: () => this.viewer.resetCamera() },
            'Reset view',
          ),
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
        h(
          'div',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'small',
              title: 'Download the 3D view as a large PNG image (about 4000 pixels wide), labels included',
              onclick: (e: Event) => this.saveImage(e.currentTarget as HTMLButtonElement),
            },
            'Save image (PNG)',
          ),
        ),
        h('p', { class: 'hint' }, 'Drag the model to rotate it. The camera isn’t part of undo.'),
      ),
    ];

    //////// teaching tasks (collapsed until opened)
    const step = (title: string, how: string) => h('li', {}, h('b', {}, title), h('span', { class: 'hint' }, how));
    const tasks = h(
      'details',
      {
        class: 'group tasks-box',
        open: this.tasksOpen,
        ontoggle: (e: Event) => (this.tasksOpen = (e.target as HTMLDetailsElement).open),
      },
      h('summary', {}, 'Try it: teaching tasks'),
      h(
        'ol',
        { class: 'tasks' },
        step('Count the atoms in an FCC cell', 'Turn on Clip to unit cell. Then Hide (H) ▸ Corners, and back.'),
        step('Find a tetrahedral site’s neighbours', 'Turn on Tetrahedral sites. Press N and click a gold site.'),
        step('See the close-packed (111) plane', 'Press P, add (1 1 1), then Section.'),
        step('Get [u v w] between two atoms', 'Click an atom, Shift+click another. Inspector ▸ Add this direction.'),
        step('Why carbon likes the BCC octahedral site', 'BCC tab, turn on Octahedral sites, press N and click a purple site.'),
        step('Look inside a hard-sphere model', 'Press H and click the front atoms. Undo with ⌘Z (Ctrl+Z).'),
      ),
    );

    this.root.replaceChildren(h('div', { class: 'panel-body' }, ...model, ...display, tasks));
  }

  // download the 3D view as a PNG, named after the structure and the time, e.g. crystalview-fcc-2026-10-22-1405.png
  private async saveImage(button: HTMLButtonElement): Promise<void> {
    const text = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const blob = await this.viewer.snapshot();
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      const link = h('a', {
        href: URL.createObjectURL(blob),
        download: `crystalview-${this.store.state.structure}-${stamp}.png`,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (e) {
      alert(`The image couldn't be saved: ${(e as Error).message}`);
    } finally {
      button.disabled = false;
      button.textContent = text;
    }
  }

  private repeatSelects(): HTMLElement[] {
    const selects = [0, 1, 2].map((axis) =>
      this.bind(
        h(
          'select',
          {
            'aria-label': `${'xyz'[axis]} repeats`,
            onchange: () => this.store.setRepeat(selects.map((s) => Number(s.value)) as Vec3),
          },
          ...[1, 2, 3].map((n) => h('option', { value: String(n) }, String(n))),
        ),
        (el, s) => (el.value = String(s.repeat[axis])),
      ),
    );
    return selects.flatMap((s, i) => [h('span', { class: 'axis' }, 'xyz'[i]), s]);
  }
}

function group(title: string, ...children: HTMLElement[]): HTMLElement {
  return h('section', { class: 'group' }, h('h3', {}, title), ...children);
}
