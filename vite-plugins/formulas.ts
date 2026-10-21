// Renders the info panel's formulas with KaTeX when the site is built (and in the dev server), so the page ships
// finished HTML instead of the 75 KB KaTeX library. Only KaTeX's stylesheet and fonts are still needed.
// The app imports the result as `virtual:formulas` (types in src/formulas.d.ts).

import katex from 'katex';
import type { Plugin } from 'vite';
import { nearestAtoms } from '../src/crystal/lattice.ts';
import { STRUCTURES, type StructureId } from '../src/crystal/structures.ts';

const ID = 'virtual:formulas';
const RESOLVED = `\0${ID}`;

const DENSITY =
  '\\rho = \\frac{\\color{green}{n}\\,\\color{maroon}{A}}{\\color{darkcyan}{V_\\mathrm{u.c.}}\\,\\color{purple}{N_\\mathrm{A}}}';

// a formula that doesn't parse fails the build rather than showing broken text
const render = (tex: string, displayMode = false) => katex.renderToString(tex, { displayMode, throwOnError: true });

export function buildFormulas() {
  const structures = Object.fromEntries(
    (Object.keys(STRUCTURES) as StructureId[]).map((id) => {
      const s = STRUCTURES[id];
      return [
        id,
        {
          positions: render(s.info.positions),
          touchEquation: render(s.info.touchEquation),
          coordination: render(`\\color{maroon}{${nearestAtoms(s, [0, 0, 0]).positions.length}}`),
          atomsPerCell: render(s.info.atomsPerCell, true),
          latticeParameter: render(s.info.latticeParameter, true),
          apf: render(s.info.apf, true),
        },
      ];
    }),
  );
  return { structures, density: render(DENSITY, true) };
}

export function formulasPlugin(): Plugin {
  return {
    name: 'crystalview-formulas',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load: (id) => (id === RESOLVED ? `export default ${JSON.stringify(buildFormulas())};` : undefined),
  };
}
