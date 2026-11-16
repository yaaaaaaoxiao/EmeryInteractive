// The dislocation page's two side panels: the controls (left) and what the model shows (right).
// The controls are built once and updated in place, so the slider keeps working while it is dragged.

import { STRUCTURES, type StructureId } from '../crystal/structures';
import { checkbox, h, segmented, swatch } from '../ui/dom';
import { direction, plane } from '../ui/notation';
import {
  burgersCircuit,
  characterAngle,
  crystalOf,
  halfPlaneThickness,
  type Kind,
  positionRange,
  rampCount,
  slippedFraction,
} from './field';
import { COLORS } from './scene';
import { type Coloring, configOf, type DislocationState, type Overlay, type Style, startOf } from './state';

export interface Actions {
  set: (patch: Partial<DislocationState>) => void;
  get: () => DislocationState;
  resetView: () => void;
  lookAlong: (dir: [number, number, number]) => void;
  snapshot: () => Promise<Blob>;
  togglePlay: () => void;
  walkCircuit: () => void;
  stepCircuit: () => void;
}

// what is running by itself at the moment
export interface Running {
  playing: boolean;
  walking: boolean;
}

const TITLES: Record<Kind, string> = { edge: 'Edge dislocation', screw: 'Screw dislocation', mixed: 'Mixed dislocation' };

const OVERLAY_LABELS: [Overlay, string, number | undefined][] = [
  ['line', 'Dislocation line', COLORS.line],
  ['burgers', 'Burgers vector b', COLORS.burgers],
  ['slipPlane', 'Slip plane', COLORS.slipped],
  ['halfPlane', 'Extra half-plane', COLORS.halfPlane],
  ['ramp', 'Spiral ramp', COLORS.ramps[0]],
  ['circuit', 'Burgers circuit', COLORS.circuit],
];

export class Panels {
  private syncers: ((s: DislocationState, running: Running) => void)[] = [];

  constructor(
    left: HTMLElement,
    private inspector: HTMLElement,
    private actions: Actions,
  ) {
    left.replaceChildren(h('div', { class: 'panel-body' }, ...this.controls()));
  }

  render(state: DislocationState, running: Running): void {
    this.syncers.forEach((sync) => sync(state, running));
    this.inspector.replaceChildren(...describe(state));
  }

  private controls(): HTMLElement[] {
    const { set, get } = this.actions;

    //////// glide
    const slider = h('input', {
      type: 'range',
      step: '0.05',
      id: 'line-position',
      'aria-label': 'Position of the dislocation line',
      oninput: (e: Event) => set({ position: Number((e.target as HTMLInputElement).value) }),
    });
    const slipped = h('span', { class: 'value' });
    const play = h('button', { type: 'button', class: 'primary', onclick: () => this.actions.togglePlay() });
    this.syncers.push((s, { playing }) => {
      // (each crystal's block has its own width)
      const [min, max] = positionRange(crystalOf(configOf(s)));
      slider.min = String(min);
      slider.max = String(max);
      slider.value = String(s.position);
      slipped.textContent = `${Math.round(slippedFraction(configOf(s)) * 100)}% slipped`;
      play.textContent = playing ? 'Pause' : 'Play glide';
    });
    const glide = group(
      'Move the line (glide)',
      h('label', { class: 'range', for: 'line-position' }, slider, slipped),
      h(
        'div',
        { class: 'buttons' },
        play,
        h(
          'button',
          {
            type: 'button',
            title: 'Put the line back in the middle of the crystal',
            onclick: () => set({ position: startOf(get().structure, get().kind) }),
          },
          'Back to the middle',
        ),
      ),
      h('p', { class: 'hint' }, '← / → also move the line; Space plays or pauses.'),
    );

    //////// how it's drawn
    const style = this.choice<Style>(
      [
        ['sticks', 'Ball and stick'],
        ['hard', 'Hard sphere'],
      ],
      (s) => s.style,
      (v) => set({ style: v }),
    );
    const coloring = this.choice<Coloring>(
      [
        ['plain', 'Plain'],
        ['planes', 'Planes'],
        ['strain', 'Strain'],
      ],
      (s) => s.coloring,
      (v) => set({ coloring: v }),
    );
    const legend = h('p', { class: 'hint legend' });
    this.syncers.push((s) => {
      legend.hidden = s.coloring === 'plain';
      if (s.coloring === 'strain') {
        legend.replaceChildren(swatch(COLORS.compression), 'squeezed ', swatch(COLORS.tension), 'stretched');
      } else if (s.coloring === 'planes') {
        legend.replaceChildren(
          s.kind === 'screw'
            ? 'Each colour is one layer of atoms across the line, as it was before the dislocation (four colours, repeating).'
            : 'Each colour is one plane of atoms across the glide direction (four colours, repeating).',
        );
      }
    });

    //////// overlays
    const checks = OVERLAY_LABELS.map(([overlay, text, color]) => {
      // (switching the circuit on or off always shows or hides the whole of it, not a walk in progress)
      const el = checkbox(
        text,
        get().show[overlay],
        (v) => set({ show: { ...get().show, [overlay]: v }, ...(overlay === 'circuit' ? { circuitSteps: null } : {}) }),
        color,
      );
      const input = el.querySelector('input')!;
      this.syncers.push((s) => {
        input.checked = s.show[overlay];
        // a screw dislocation has no extra half-plane, and an edge dislocation no spiral ramp
        if (overlay === 'halfPlane' || overlay === 'ramp') {
          input.disabled = crystalOf(configOf(s)).burgers[overlay === 'halfPlane' ? 0 : 1] === 0;
          el.classList.toggle('off', input.disabled);
        }
      });
      return el;
    });

    //////// finding the Burgers vector
    const walk = h('button', { type: 'button', class: 'primary', onclick: () => this.actions.walkCircuit() });
    this.syncers.push((_, { walking }) => {
      walk.textContent = walking ? 'Stop' : 'Walk the circuit';
    });
    const find = group(
      'Find the Burgers vector',
      h(
        'div',
        { class: 'buttons' },
        walk,
        h(
          'button',
          { type: 'button', title: 'Take the next step of the circuit by hand', onclick: () => this.actions.stepCircuit() },
          'One step',
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        'Steps from atom to atom around the line. The gap that is left at the end is the Burgers vector.',
      ),
    );

    //////// camera
    const view = (text: string, title: string, onclick: () => void) => h('button', { type: 'button', title, onclick }, text);
    const camera = group(
      'Camera',
      h(
        'div',
        { class: 'buttons' },
        view('Reset view', 'Back to the starting camera angle', () => this.actions.resetView()),
        view('Along the line', 'Look straight down the dislocation line', () => this.actions.lookAlong([0, -1, 0])),
        view('From above', 'Look down on the slip plane', () => this.actions.lookAlong([0, 0, 1])),
        view('From the side', 'Look along the glide direction', () => this.actions.lookAlong([1, 0, 0])),
      ),
      h(
        'div',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'small',
            title: 'Download the 3D view as a large PNG image, labels included',
            onclick: (e: Event) => this.saveImage(e.currentTarget as HTMLButtonElement),
          },
          'Save image (PNG)',
        ),
      ),
      h('p', { class: 'hint' }, 'Drag the model to rotate it; scroll or pinch to zoom.'),
    );

    return [glide, find, group('Style', style), group('Colour atoms by', coloring, legend), group('Show', ...checks), camera];
  }

  // a row of buttons, exactly one of them on
  private choice<T extends string>(options: [T, string][], get: (s: DislocationState) => T, set: (v: T) => void) {
    const el = segmented(options, get(this.actions.get()), set);
    this.syncers.push((s) =>
      el.querySelectorAll('button').forEach((b, i) => {
        const on = options[i][0] === get(s);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }),
    );
    return el;
  }

  // download the 3D view as a PNG, e.g. crystalview-edge-dislocation.png
  private async saveImage(button: HTMLButtonElement): Promise<void> {
    const text = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const blob = await this.actions.snapshot();
      const link = h('a', {
        href: URL.createObjectURL(blob),
        download: `crystalview-${this.actions.get().kind}-dislocation.png`,
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
}

function group(title: string, ...children: HTMLElement[]): HTMLElement {
  return h('section', { class: 'group' }, h('h3', {}, title), ...children);
}

//////////////// the right panel: what this dislocation is, and what to look for

const b = () => h('b', { class: 'math' }, 'b');

function describe(state: DislocationState): HTMLElement[] {
  const config = configOf(state);
  const crystal = crystalOf(config);
  const { name, shortName } = STRUCTURES[state.structure];
  const angle = Math.round(characterAngle(crystal));
  const planes = halfPlaneThickness(crystal);
  const ramps = rampCount(crystal);
  const count = ['', 'one', 'two', 'three'];

  const halfPlane =
    planes > 1
      ? `An extra half-plane of atoms ends at the line. In ${shortName} it is ${count[planes]} planes of atoms thick, because one Burgers vector spans ${count[planes]} of them.`
      : 'An extra half-plane of atoms ends at the line.';
  const ramp =
    ramps > 1
      ? `In ${shortName} one Burgers vector spans ${count[ramps]} layers, so the layers join into ${count[ramps]} ramps wound inside each other (one colour each), like a ${count[ramps]}-start screw thread.`
      : 'The green surface is that ramp, drawn near the line, where it is steepest.';

  const what: Record<Kind, HTMLElement[]> = {
    edge: [
      h('p', {}, 'The Burgers vector ', b(), ' is perpendicular to the dislocation line.'),
      h('p', {}, `${halfPlane} The crystal is squeezed on that side of the slip plane and stretched on the other.`),
    ],
    screw: [
      h('p', {}, 'The Burgers vector ', b(), ' is parallel to the dislocation line.'),
      h(
        'p',
        {},
        'There is no extra half-plane. The layers of atoms across the line join into a spiral ramp that climbs by ',
        b(),
        ` each time around it. ${ramp}`,
      ),
      h('p', {}, 'A screw dislocation only shears the crystal: nothing is squeezed or stretched.'),
    ],
    mixed: [
      h('p', {}, 'The Burgers vector ', b(), ` is at ${angle}° to the dislocation line: part edge, part screw.`),
      h('p', {}, 'It has both an extra half-plane, from its edge part, and a spiral ramp, from its screw part.'),
    ],
  };

  // what a real crystal of this structure does that this model leaves out
  const caveat: Partial<Record<StructureId, Partial<Record<Kind, string>>>> = {
    sc: {
      mixed:
        'A real simple-cubic crystal would split this Burgers vector into two shorter ones. It is here to show what mixed character looks like.',
    },
    fcc: Object.fromEntries(
      (['edge', 'screw', 'mixed'] as Kind[]).map((kind) => [
        kind,
        'In a real FCC metal this dislocation splits into two partial dislocations with a strip of stacking fault between them. The splitting isn’t shown here.',
      ]),
    ),
    bcc: {
      screw:
        'In a real BCC metal the core of this screw dislocation spreads onto three planes at once, which makes it hard to move. That isn’t shown here.',
    },
  };
  const note = caveat[state.structure]?.[state.kind];

  const { burgers, line, plane: slipPlane } = crystal.facts;
  const facts = h(
    'ul',
    { class: 'plain facts-list' },
    fact(
      'Burgers vector',
      h('span', {}, b(), ` = ${burgers.factorText}`, direction(burgers.uvw), `, length ${burgers.lengthText}`),
    ),
    fact('Line direction', direction(line)),
    fact('Angle between them', `${angle}°`),
    fact('Slip plane', plane(slipPlane)),
  );

  const try_: Record<Kind, string[]> = {
    edge: [
      'Press Along the line: the red half-plane stops at the slip plane.',
      'Play glide: the half-plane is handed from one set of atoms to the next. No atom moves more than one spacing.',
      'Colour by Strain to see the squeezed and stretched sides.',
      'Press Walk the circuit: equal steps around the line don’t return to the start.',
    ],
    screw: [
      'Follow the ramp around the line: after one full turn you are one Burgers vector further along it.',
      'Press From the side: the ramp is a screw thread, which is where the name comes from.',
      'Use Hard sphere and colour by Planes: the front face shows a step that ends at the line.',
      'Press Walk the circuit: one trip around the line ends a Burgers vector along it from the start.',
      'Play glide: the line moves sideways, at right angles to the slip it causes.',
    ],
    mixed: [
      'Compare the Burgers vector with the line: it is neither perpendicular nor parallel.',
      'Press Walk the circuit: the gap has a part across the line and a part along it.',
      'Switch the Spiral ramp off to see the extra half-plane in the whole block.',
    ],
  };

  const fraction = slippedFraction(config);
  const [min, max] = positionRange(crystal);
  const glide =
    state.position <= min + 0.25
      ? 'The line hasn’t entered the crystal: nothing has slipped yet.'
      : state.position >= max - 0.25
        ? 'The line has crossed the whole crystal. The top half (blue) has moved by one Burgers vector over the bottom half (grey), leaving a step on the surface.'
        : `The line has crossed ${Math.round(fraction * 100)}% of the slip plane. Behind it (orange) the top half (blue) has moved by one Burgers vector over the bottom half (grey); ahead of it nothing has slipped.`;

  const cards = [
    h(
      'div',
      { class: 'card focus' },
      h('div', { class: 'card-title' }, `${TITLES[state.kind]} in ${name}`),
      ...what[state.kind],
      note ? h('p', { class: 'hint' }, note) : null,
      facts,
    ),
    h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Slip so far'), h('p', {}, glide)),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, 'Things to try'),
      h('ul', {}, ...try_[state.kind].map((t) => h('li', {}, t))),
    ),
  ];
  if (state.show.circuit) cards.splice(1, 0, circuitCard(state));
  cards.push(
    h(
      'p',
      { class: 'hint' },
      'Atom positions follow the textbook elastic solution for a straight dislocation (isotropic, Poisson’s ratio 1/3). ',
      'It is a good picture away from the line and only a sketch within about one atom spacing of it.',
    ),
  );
  return cards;
}

// How the Burgers vector is found: the four sides of the circuit, ticked off as they are walked, then the gap.
function circuitCard(state: DislocationState) {
  const circuit = burgersCircuit(configOf(state));
  const title = h('div', { class: 'card-title' }, 'Finding the Burgers vector');
  if (!circuit) {
    return h(
      'div',
      { class: 'card' },
      title,
      h('p', {}, 'The circuit doesn’t fit around the line here. Move the line nearer the middle of the crystal.'),
    );
  }
  const { burgers } = crystalOf(configOf(state)).facts;
  const total = circuit.points.length - 1;
  const taken = state.circuitSteps ?? total;
  let before = 0;
  const legs = circuit.legs.map((leg) => {
    const done = Math.min(Math.max(taken - before, 0), leg.steps);
    before += leg.steps;
    const status = done === leg.steps ? 'done' : done > 0 || taken === before - leg.steps ? 'current' : '';
    return h(
      'li',
      { class: status },
      `${leg.steps} steps ${leg.heading}`,
      status === 'current' ? h('span', { class: 'hint' }, ` (${done} taken)`) : null,
    );
  });
  const result =
    taken < total
      ? h('p', { class: 'hint' }, 'In a perfect crystal these steps would end exactly where they started.')
      : h(
          'p',
          {},
          'In a perfect crystal these steps would end where they started. Here they end one atom away: the gap from start to finish (blue) is the Burgers vector, ',
          b(),
          ` = ${burgers.factorText}`,
          direction(burgers.uvw),
          '.',
        );
  const where: Record<Kind, string> = {
    edge: 'The gap is across the line. It is clearest with Along the line.',
    screw: 'The gap is along the line, so it can’t be seen from the front. Look from the side or at an angle.',
    mixed: 'The gap has a part across the line and a part along it.',
  };
  return h(
    'div',
    { class: 'card' },
    title,
    h('p', {}, 'Go around the line from atom to atom (as seen from the front), the same number of steps on opposite sides:'),
    h('ol', { class: 'legs' }, ...legs),
    result,
    h('p', { class: 'hint' }, where[state.kind]),
  );
}

function fact(name: string, value: HTMLElement | string): HTMLElement {
  return h(
    'li',
    {},
    h('span', { class: 'hint' }, `${name}: `),
    typeof value === 'string' ? h('span', { class: 'mono' }, value) : value,
  );
}
