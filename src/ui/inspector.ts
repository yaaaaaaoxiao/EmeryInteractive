// Right panel ("Inspector"): what you clicked with actions you can take on it, the directions, planes and points
// you've added, and the structure's facts with its interstitial-site table.

import katex from 'katex';
import { dist, doorwaySides, fraction, nearestAtoms, neighborShells, siteInfo } from '../crystal/lattice';
import { type SiteType, STRUCTURES, type Structure, type Vec3 } from '../crystal/structures';
import type { Viewer } from '../scene/viewer';
import { type Construction, neighborsOf, parseKey, type State, type Store, selectionDirection, selectionPlane } from '../state';
import { h, swatch } from './dom';
import { direction, plane } from './notation';

const tex = (s: string, display = false) => {
  const span = h('span');
  katex.render(s, span, { displayMode: display, throwOnError: false });
  return span;
};

const coords = (p: number[]) => p.map(fraction).join('  ');
const lower = (name: string) => name.toLowerCase();
const article = (n: string) => (/^[aeiou]/i.test(n) ? 'an' : 'a');

// "a tetrahedral site 0.144a away (r/R = 0.225) and an octahedral site 0.289a away (r/R = 0.414)",
// or for two of the same kind, "two tetrahedral sites, each 0.250a away (r/R = 0.291)"
function doorwayText(s: Structure, site: SiteType): string | null {
  const sides = doorwaySides(s, site);
  if (!sides) return null;
  const [a, b] = sides;
  const at = (x: (typeof sides)[number]) => `${x.distance.toFixed(3)}a away (r/R = ${x.ratio.toFixed(3)})`;
  if (a.type.id === b.type.id) return `two ${lower(a.type.name)} sites, each ${at(a)}`;
  return `${article(a.type.name)} ${lower(a.type.name)} site ${at(a)} and ${article(b.type.name)} ${lower(b.type.name)} site ${at(b)}`;
}

export function constructionLabel(c: Construction): string {
  if (c.kind === 'direction') return `Direction ${direction(c.uvw)}`;
  if (c.kind === 'plane') return `Plane ${plane(c.hkl)}`;
  return `Point ${coords(c.pos)}`;
}

const button = (label: string, onclick: () => void, cls = 'small') => h('button', { type: 'button', class: cls, onclick }, label);

export class Inspector {
  private key = '';
  // remembered across re-renders
  private factsOpen = true;

  constructor(
    private root: HTMLElement,
    private store: Store,
    private viewer: Viewer,
  ) {}

  render(state: State): void {
    // only what the panel shows (not e.g. a plane's offset while its slider is dragged)
    const key = JSON.stringify([
      state.structure,
      state.tool,
      state.target,
      state.solo,
      // the neighbors card says front atoms are see-through only for hard spheres
      state.style,
      state.selection,
      state.hidden.length,
      state.activePlane,
      state.slice,
      state.constructions.map((c) => [
        c.id,
        c.kind,
        c.visible,
        c.kind === 'plane' ? c.hkl : c.kind === 'direction' ? c.uvw : c.pos,
      ]),
    ]);
    if (key === this.key) return;
    this.key = key;
    const facts = this.facts(state);
    facts.addEventListener('toggle', () => (this.factsOpen = (facts as HTMLDetailsElement).open));
    this.root.replaceChildren(this.focus(state), this.constructions(state), facts);
  }

  //////////////// what you clicked

  private focus(state: State): HTMLElement {
    const { store } = this;
    const s = STRUCTURES[state.structure];

    if (state.tool === 'neighbors' && state.target) {
      const n = neighborsOf(state.structure, state.target);
      const name = n.site ? `${n.site.name} site` : 'Atom';
      // group the surrounding atoms by distance (the BCC octahedron has 2 close + 4 farther)
      const shells = new Map<string, number>();
      for (const p of n.positions) {
        const d = dist(p, n.pos).toFixed(3);
        shells.set(d, (shells.get(d) ?? 0) + 1);
      }
      const shellText = [...shells].map(([d, count]) => `${count} at ${d}a`).join(', ');
      const card = h(
        'div',
        { class: 'card focus neighbors' },
        h('div', { class: 'card-title' }, swatch(n.site ? n.site.color : s.color), `${name} at ${coords(n.pos)}`),
        h('p', {}, `Surrounded by ${n.positions.length} atoms: ${shellText}.`),
      );
      // how the 3D view shows them (see build.ts and Viewer.updateXray)
      const shading = [
        shells.size > 1
          ? `Darker: the ${[...shells.values()][0]} closest atoms; lighter: the ${[...shells.values()].slice(1).join(' + ')} farther ones.`
          : null,
        state.style === 'hard' ? 'Atoms in front of it are see-through, so you can look inside.' : null,
      ].filter(Boolean);
      if (shading.length) card.append(h('p', { class: 'hint' }, shading.join(' ')));
      if (n.site) {
        const site = n.site;
        const fit = siteInfo(s, site);
        const doorway = doorwayText(s, site);
        const touching = shells.get(n.distance.toFixed(3)) ?? 0;
        const result = h('p', { class: 'fit' });
        card.append(
          h(
            'p',
            {},
            'Largest sphere that fits here: ',
            tex(`r/R = ${fit.ratio.toFixed(3)}`),
            touching < n.positions.length ? ` (limited by the ${touching} closest atoms)` : '',
          ),
        );
        // a doorway is not a pocket: a sphere there can grow by moving into a neighbouring site
        if (doorway) {
          card.append(
            h(
              'p',
              { class: 'doorway' },
              h('strong', {}, 'This is a doorway, not a pocket. '),
              `It connects ${doorway}. A sphere here can grow by moving into either one.`,
            ),
          );
        }
        if (site.note) card.append(h('p', { class: 'hint' }, site.note));
        card.append(
          h(
            'div',
            { class: 'actions' },
            button(
              'Grow sphere to fit',
              () => {
                result.textContent = '';
                this.viewer.growSphere(
                  n.pos,
                  fit.radius,
                  s.atomRadius,
                  site.color,
                  (ratio) =>
                    (result.textContent =
                      `It stops at r/R = ${ratio.toFixed(3)} at this exact point, where it touches the ${touching} closest atoms.` +
                      (doorway ? ' Moved into a neighbouring site, a bigger sphere fits.' : '')),
                );
              },
              'small primary',
            ),
          ),
          result,
        );
      } else {
        card.append(h('p', {}, 'Coordination number = ', h('strong', {}, String(n.positions.length))));
      }
      card.append(
        h(
          'p',
          { class: 'hint' },
          state.solo
            ? 'Solo: click a neighboring atom to move to it. Turn off Solo to pick a site.'
            : 'Click another atom or site to compare. Click the same spot again to pick the next object behind.',
        ),
      );
      return card;
    }

    if (state.selection.length && state.tool !== 'hide') {
      const items = state.selection.map((k) => parseKey(k));
      const name = (kind: string) => (kind === 'atom' ? 'Atom' : `${s.sites.find((t) => t.id === kind)?.name ?? kind} site`);
      const card = h(
        'div',
        { class: 'card focus selection' },
        h('div', { class: 'card-title' }, `Selected (${items.length})`),
        h(
          'ul',
          { class: 'plain' },
          ...items.map((x) => h('li', {}, `${name(x.kind)} `, h('span', { class: 'mono' }, coords(x.pos)))),
        ),
      );
      if (items.length === 1) {
        const key = state.selection[0];
        card.append(
          h(
            'div',
            { class: 'actions' },
            button('Show neighbors', () => store.set({ tool: 'neighbors', target: key })),
            items[0].kind === 'atom' ? button('Hide this atom', () => store.setHidden([...state.hidden, key])) : null,
          ),
        );
      }
      const d = selectionDirection(state);
      if (d) {
        card.append(
          h('p', {}, 'Direction ', h('strong', { class: 'mono' }, direction(d.uvw)), ' from the first to the second.'),
          h(
            'div',
            { class: 'actions' },
            button('Add this direction', () => store.addDirectionFromSelection(), 'small primary'),
          ),
        );
      }
      if (items.length === 3) {
        const p = selectionPlane(state);
        card.append(
          p
            ? h('p', {}, 'Plane through them: ', h('strong', { class: 'mono' }, plane(p.hkl)))
            : h('p', { class: 'hint' }, 'These three are on one line, so they don’t define a plane.'),
        );
        if (p) {
          card.append(
            h(
              'div',
              { class: 'actions' },
              button('Add this plane', () => store.addPlaneFromSelection(), 'small primary'),
              button('Add and slice', () => store.addPlaneFromSelection(true)),
            ),
          );
        }
      }
      if (items.length >= 4) card.append(h('p', {}, `Polyhedron through ${items.length} objects (drawn in the model).`));
      card.append(h('p', { class: 'hint' }, 'Shift+click adds or removes objects. Click empty space to clear.'));
      return card;
    }

    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, 'Nothing selected'),
      h(
        'p',
        { class: 'hint' },
        state.tool === 'hide'
          ? 'The Hide tool hides atoms. Switch to Select (S) to inspect them.'
          : 'Click an atom or site in the model to see its details here.',
      ),
    );
  }

  //////////////// directions, planes and points

  private constructions(state: State): HTMLElement {
    const { store } = this;
    const items = state.constructions.map((c) => {
      const label = constructionLabel(c);
      const active = c.kind === 'plane' && c.id === state.activePlane;
      return h(
        'li',
        {},
        h(
          'span',
          { class: `what mono${c.visible ? '' : ' off'}` },
          label,
          active ? h('span', { class: 'tag' }, state.slice !== 'off' ? `slicing · ${state.slice}` : 'active') : null,
        ),
        h(
          'span',
          { class: 'row' },
          c.kind === 'plane' && !active
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'icon',
                  title: `Use ${label} for the Plane tool`,
                  onclick: () => store.set({ activePlane: c.id }),
                },
                'Use',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: 'icon',
              'aria-label': `${c.visible ? 'Hide' : 'Show'} ${label}`,
              onclick: () => store.updateConstruction(c.id, { visible: !c.visible }),
            },
            c.visible ? 'Hide' : 'Show',
          ),
          h(
            'button',
            { type: 'button', class: 'icon', 'aria-label': `Delete ${label}`, onclick: () => store.removeConstruction(c.id) },
            '✕',
          ),
        ),
      );
    });

    // add one by typing indices
    const kind = h(
      'select',
      { 'aria-label': 'Kind' },
      h('option', { value: 'direction' }, '[u v w]'),
      h('option', { value: 'plane' }, '(h k l)'),
      h('option', { value: 'point' }, 'q r s'),
    );
    const inputs = [1, 1, 0].map((v, i) =>
      h('input', { type: 'number', step: 'any', value: String(v), class: 'num', 'aria-label': `value ${i + 1}` }),
    );
    const add = () => {
      const v = inputs.map((i) => Number(i.value) || 0) as Vec3;
      if (kind.value === 'point') store.addConstruction({ kind: 'point', pos: v, visible: true });
      else if (v.every((x) => x === 0)) return;
      // a direction typed in starts at the first selected object, as in the original site, or the origin
      else if (kind.value === 'direction') {
        const from: Vec3 = state.selection[0] ? parseKey(state.selection[0]).pos : [0, 0, 0];
        store.addConstruction({ kind: 'direction', uvw: v, vector: v, from, visible: true });
      } else store.addPlane(v.map(Math.round) as Vec3);
    };

    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, 'Directions, planes and points'),
      items.length
        ? h('ul', { class: 'constructions' }, ...items)
        : h('p', { class: 'hint' }, 'None yet. Add one here, or select atoms and use the buttons above.'),
      h('div', { class: 'row' }, kind, ...inputs, button('Add', add)),
    );
  }

  //////////////// the structure's facts

  private facts(state: State): HTMLElement {
    const s = STRUCTURES[state.structure];
    const { info } = s;
    const fact = (title: string, body: Node) => h('div', { class: 'fact' }, h('div', { class: 'fact-title' }, title), body);

    // interstitial sites (all numbers computed from the geometry)
    const rows = s.sites.map((site) => {
      const i = siteInfo(s, site);
      // distorted sites show their shells, e.g. the BCC octahedron "6 (2 + 4)"
      const shells = neighborShells(s, site);
      const atoms =
        shells.length > 1
          ? h(
              'span',
              { title: shells.map((x) => `${x.count} at ${x.distance.toFixed(3)}a`).join(', ') },
              `${i.coordination} (${shells.map((x) => x.count).join(' + ')})`,
            )
          : String(i.coordination);
      return h(
        'tr',
        {},
        h('td', {}, swatch(site.color), site.name, site.doorwayBetween ? h('span', { class: 'tag' }, 'doorway') : null),
        h('td', {}, atoms),
        h('td', {}, String(i.perCell)),
        h('td', {}, i.ratio.toFixed(3)),
      );
    });
    const notes = [
      s.sites.some((t) => t.doorwayBetween)
        ? 'Doorway: not a pocket but the window between two pockets. Its r/R is the largest sphere that fits exactly there; a sphere can grow by moving into either neighbouring site.'
        : null,
      ...s.sites
        .filter((t) => neighborShells(s, t).length > 1)
        .map((t) => {
          const shells = neighborShells(s, t);
          return `${t.name} (${shells.map((x) => x.count).join(' + ')}): distorted, ${shells.map((x) => `${x.count} atoms at ${x.distance.toFixed(3)}a`).join(' and ')}.`;
        }),
    ].filter((x): x is string => !!x);

    return h(
      'details',
      { class: 'facts', open: this.factsOpen },
      h('summary', {}, s.name),
      fact('Atomic positions', tex(info.positions)),
      fact(
        `Atoms touch along the ${info.touchAlong}`,
        h(
          'div',
          {},
          tex(info.touchEquation),
          h('br'),
          'Coordination number = ',
          tex(`\\color{maroon}{${nearestAtoms(s, [0, 0, 0]).positions.length}}`),
        ),
      ),
      fact('Atoms per unit cell', tex(info.atomsPerCell, true)),
      fact('Lattice parameter', tex(info.latticeParameter, true)),
      fact('Atomic packing factor', tex(info.apf, true)),
      fact(
        'Density',
        tex(
          '\\rho = \\frac{\\color{green}{n}\\,\\color{maroon}{A}}{\\color{darkcyan}{V_\\mathrm{u.c.}}\\,\\color{purple}{N_\\mathrm{A}}}',
          true,
        ),
      ),
      fact(
        'Interstitial sites',
        h(
          'table',
          { class: 'sites' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, 'Site'),
              h('th', { title: 'Number of surrounding atoms' }, 'Atoms'),
              h('th', {}, 'Per cell'),
              h('th', { title: 'Largest sphere that fits at the site, relative to the atom radius R' }, 'r/R'),
            ),
          ),
          h('tbody', {}, ...rows),
        ),
      ),
      ...notes.map((t) => h('p', { class: 'hint table-note' }, t)),
    );
  }
}
