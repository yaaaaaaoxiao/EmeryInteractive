// Tiny DOM helpers so the panels can be written declaratively without a framework.

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') el.addEventListener(name.slice(2), value);
    else if (name === 'class') el.className = String(value);
    else if (name in el && typeof value !== 'string') (el as unknown as Record<string, unknown>)[name] = value;
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const hex = (color: number) => '#' + color.toString(16).padStart(6, '0');

export function swatch(color: number): HTMLSpanElement {
  return h('span', { class: 'swatch', style: `background:${hex(color)}` });
}

export function checkbox(label: Child, checked: boolean, onChange: (checked: boolean) => void, color?: number) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
  return h('label', { class: 'check' }, input, color !== undefined ? swatch(color) : null, label);
}

export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void) {
  return h('div', { class: 'segmented', role: 'group' },
    ...options.map(([v, text]) =>
      h('button', { type: 'button', class: v === value ? 'on' : '', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, text)),
  );
}

// three small number inputs (h k l, u v w, q r s)
export function triple(values: (number | string)[], step: string): HTMLInputElement[] {
  return values.map((v) => h('input', { type: 'number', step, value: String(v), class: 'num' }));
}
