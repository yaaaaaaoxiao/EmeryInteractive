import 'katex/dist/katex.min.css';
import './styles.css';
import { STRUCTURES, type StructureId } from './crystal/structures';
import { buildScene } from './scene/build';
import { Viewer } from './scene/viewer';
import { Store, stateFromURL, stateToURL, type State } from './state';
import { ControlsPanel } from './ui/controls';
import { renderInfo } from './ui/info';

const $ = (id: string) => document.getElementById(id)!;

const store = new Store(stateFromURL(location.search));
const viewer = new Viewer($('viewer'), (key, additive) => store.clickObject(key, additive));
const controls = new ControlsPanel($('controls'), store, viewer);

// structure tabs
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-structure]')];
tabs.forEach((tab) => tab.addEventListener('click', () => store.setStructure(tab.dataset.structure as StructureId)));

// the info panel only depends on a few fields; skip re-rendering it while e.g. a slider is dragged
const infoKey = (s: State) =>
  JSON.stringify([s.structure, s.neighbors, s.selection, s.direction?.uvw, s.plane.hkl]);

function render(state: State, previous: State | null): void {
  viewer.sitesFirst = state.neighbors.on;
  viewer.show(buildScene(state, { onDeselect: (key) => store.setSelection(store.state.selection.filter((k) => k !== key)) }), state.repeat);
  controls.render(state);
  if (!previous || infoKey(state) !== infoKey(previous)) renderInfo($('info'), state, viewer);
  tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.structure === state.structure)));
  document.title = `${STRUCTURES[state.structure].shortName} · Crystal Structure Viewer`;
  history.replaceState(null, '', stateToURL(state));
}

store.subscribe(render);
render(store.state, null);

// ↑ / ↓ move the plane along its normal
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (e.key === 'Escape') {
    $('help').hidden = true;
    return;
  }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const s = store.state;
  if (!s.slice.on && !s.plane.show) return;
  e.preventDefault();
  const step = (e.shiftKey ? 0.005 : 0.02) * (e.key === 'ArrowUp' ? 1 : -1);
  store.set({ plane: { ...s.plane, offset: +(s.plane.offset + step).toFixed(4) } });
});

// help
$('help-open').addEventListener('click', () => ($('help').hidden = false));
$('help-close').addEventListener('click', () => ($('help').hidden = true));
$('help').addEventListener('click', (e) => {
  if (e.target === $('help')) $('help').hidden = true;
});

// handy for debugging in the browser console during development
if (import.meta.env.DEV) Object.assign(window, { store, viewer });
