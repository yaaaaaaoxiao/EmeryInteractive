// The info panel's formulas, rendered to HTML when the site is built (see vite-plugins/formulas.ts).
declare module 'virtual:formulas' {
  import type { StructureId } from './crystal/structures';

  export interface StructureFormulas {
    positions: string;
    touchEquation: string;
    coordination: string;
    atomsPerCell: string;
    latticeParameter: string;
    apf: string;
  }

  const formulas: { structures: Record<StructureId, StructureFormulas>; density: string };
  export default formulas;
}
