// Right panel: structure facts, the interstitial-site table (computed), and details for the neighbours tool and selection.

import katex from 'katex';
import { dist, fraction, nearestAtoms, siteInfo } from '../crystal/lattice';
import { STRUCTURES } from '../crystal/structures';
import type { Viewer } from '../scene/viewer';
import { neighborsOf, parseKey, type State } from '../state';
import { h, swatch } from './dom';

const tex = (s: string, display = false) => {
  const span = h('span');
  katex.render(s, span, { displayMode: display, throwOnError: false });
  return span;
};

const coords = (p: number[]) => p.map(fraction).join('  ');

export function renderInfo(root: HTMLElement, state: State, viewer: Viewer): void {
  const s = STRUCTURES[state.structure];
  const { info } = s;
  const blocks: HTMLElement[] = [];

  //////// neighbours tool
  if (state.neighbors.on && state.neighbors.target) {
    const n = neighborsOf(state.structure, state.neighbors.target);
    const name = n.site ? `${n.site.name} site` : 'Atom';
    // group the surrounding atoms by distance (the BCC octahedron has 2 close + 4 farther)
    const shells = new Map<string, number>();
    for (const p of n.positions) {
      const d = dist(p, n.pos).toFixed(3);
      shells.set(d, (shells.get(d) ?? 0) + 1);
    }
    const shellText = [...shells].map(([d, count]) => `${count} at ${d} a`).join(', ');
    const card = h(
      'div',
      { class: 'card neighbors' },
      h('div', { class: 'card-title' }, swatch(n.site ? n.site.color : s.color), `${name} at ${coords(n.pos)}`),
      h('p', {}, `Surrounded by ${n.positions.length} atoms: ${shellText}.`),
    );
    if (n.site) {
      const fit = siteInfo(s, n.site);
      const touching = shells.get(n.distance.toFixed(3)) ?? 0;
      const result = h('p', { class: 'fit' });
      card.append(
        h(
          'p',
          {},
          'Largest sphere that fits: ',
          tex(`r/R = ${fit.ratio.toFixed(3)}`),
          touching < n.positions.length ? ` (limited by the ${touching} closest atoms)` : '',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'primary',
            onclick: () => {
              result.textContent = '';
              viewer.growSphere(
                n.pos,
                fit.radius,
                s.atomRadius,
                n.site!.color,
                (ratio) =>
                  (result.textContent = `It stops at r/R = ${ratio.toFixed(3)}, where it touches the ${touching} closest atoms.`),
              );
            },
          },
          'Grow sphere to fit',
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
        state.neighbors.solo
          ? 'Solo: click a neighboring atom to move to it. Turn off Solo to pick a site.'
          : 'Click another atom or site to compare. Sites are picked before the atoms in front of them; click the same spot again to pick the next object behind.',
      ),
    );
    blocks.push(card);
  }

  //////// selection
  if (state.selection.length) {
    const pos = state.selection.map((k) => parseKey(k).pos);
    const card = h(
      'div',
      { class: 'card selection' },
      h('div', { class: 'card-title' }, `Selected (${pos.length})`),
      h('ul', {}, ...pos.map((p) => h('li', {}, coords(p)))),
    );
    if (pos.length === 2 && state.direction)
      card.append(h('p', {}, 'Direction ', h('strong', {}, `[${state.direction.uvw.join(' ')}]`)));
    if (pos.length === 3) card.append(h('p', {}, 'Plane ', h('strong', {}, `(${state.plane.hkl.join(' ')})`)));
    card.append(h('p', { class: 'hint' }, 'Shift+click adds or removes objects. Click empty space to clear.'));
    blocks.push(card);
  }

  //////// structure facts
  const fact = (title: string, body: Node) => h('div', { class: 'fact' }, h('div', { class: 'fact-title' }, title), body);
  blocks.push(
    h('h2', {}, s.name),
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
  );

  //////// interstitial sites (all numbers computed from the geometry)
  const rows = s.sites.map((site) => {
    const i = siteInfo(s, site);
    return h(
      'tr',
      {},
      h('td', {}, swatch(site.color), site.name),
      h('td', {}, String(i.coordination)),
      h('td', {}, String(i.perCell)),
      h('td', {}, i.ratio.toFixed(3)),
    );
  });
  blocks.push(
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
            h('th', { title: 'Largest sphere that fits, relative to the atom radius' }, 'r/R'),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
  );

  root.replaceChildren(...blocks);
}
