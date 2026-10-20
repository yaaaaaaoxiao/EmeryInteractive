// Crystallographic index notation: negative indices are written with a bar over the digits, e.g. [1̄ 1 0], (1 1 1̄).
// The bar is the combining overline (U+0305), so it survives copy and paste.

const OVERLINE = String.fromCharCode(0x0305);

export function indices(values: number[]): string {
  return values.map((v) => (v < 0 ? [...String(-v)].map((ch) => ch + OVERLINE).join('') : String(v))).join(' ');
}

export const direction = (uvw: number[]) => `[${indices(uvw)}]`;
export const plane = (hkl: number[]) => `(${indices(hkl)})`;
