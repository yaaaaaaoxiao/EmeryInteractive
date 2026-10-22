import 'katex/dist/katex.min.css';
import './styles.css';
import './themes/skeuomorphic.css';
import { STRUCTURES, type StructureId } from './crystal/structures';
import { buildScene } from './scene/build';
import { LOOKS, savedGraphics, saveGraphics } from './scene/look';
import { Viewer } from './scene/viewer';
import { activePlane, isSlicing, type State, Store, stateFromURL, stateToURL, type Tool } from './state';
import { Inspector } from './ui/inspector';
import { LeftPanel } from './ui/left';
import { savedTheme, setTheme, type Theme } from './ui/theme';
import { ToolBar } from './ui/tools';

const $ = (id: string) => document.getElementById(id)!;

// the graphics choice is remembered per device; everything else comes from the link
const store = new Store({ ...stateFromURL(location.search), graphics: savedGraphics() });
const viewer = new Viewer($('viewer'), (key, additive) => store.clickObject(key, additive || tools.addToSelection));
const left = new LeftPanel($('left'), store, viewer);
const tools = new ToolBar($('toolbar'), $('tool-options'), $('status'), store);
const inspector = new Inspector($('inspector'), store, viewer);

// structure tabs
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-structure]')];
tabs.forEach((tab) => tab.addEventListener('click', () => store.setStructure(tab.dataset.structure as StructureId)));

// Performance mode: the simpler, faster look for older or slower computers (a device preference, not an undo step)
const graphicsToggle = $('graphics-toggle');
graphicsToggle.addEventListener('click', () =>
  store.setGraphics(store.state.graphics === 'performance' ? 'quality' : 'performance'),
);

// the page's theme (a device preference, not an undo step)
const themeSelect = $('theme-select') as HTMLSelectElement;
themeSelect.value = savedTheme();
themeSelect.addEventListener('change', () => setTheme(themeSelect.value as Theme));

function render(state: State, previous: State | null): void {
  // lights and reflections first, so the new materials are made for them
  viewer.setLook(LOOKS[state.graphics]);
  if (previous && previous.graphics !== state.graphics) saveGraphics(state.graphics);
  graphicsToggle.setAttribute('aria-pressed', String(state.graphics === 'performance'));
  viewer.sitesFirst = state.tool === 'neighbors';
  viewer.cycleOnRepeat = state.tool !== 'hide';
  viewer.show(
    buildScene(state, { onDeselect: (key) => store.set((s) => ({ selection: s.selection.filter((k) => k !== key) })) }),
    state.repeat,
  );
  left.render(state);
  tools.render(state);
  inspector.render(state);
  tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.structure === state.structure)));
  document.title = `${STRUCTURES[state.structure].shortName} · CrystalView`;
  scheduleURL();
}

// The address always describes the current setup. Safari allows at most 100 address rewrites per 10 seconds,
// which dragging a slider would exceed, so write it at most every 300 ms, always with the latest setup.
let urlTimer: number | undefined;
function scheduleURL(): void {
  if (urlTimer !== undefined) return;
  urlTimer = window.setTimeout(() => {
    urlTimer = undefined;
    try {
      history.replaceState(null, '', stateToURL(store.state));
    } catch {
      // refused by the browser's rate limit: the next change writes it
    }
  }, 300);
}

store.subscribe(render);
render(store.state, null);
requestAnimationFrame(() => graphicsToggle.classList.add('ready'));

//////////////// keyboard

const TOOL_KEYS: Record<string, Tool> = { s: 'select', n: 'neighbors', h: 'hide', p: 'plane' };

const helpOpen = () => !$('help').hidden;

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

  // while Help is open, Esc closes it and nothing else reaches the model behind it
  if (helpOpen()) {
    if (e.key === 'Escape') $('help').hidden = true;
    return;
  }

  const mod = e.metaKey || e.ctrlKey;
  // undo / redo
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
    return;
  }
  if (mod || e.altKey) return;

  if (e.key === 'Escape') {
    // back to Select; otherwise clear the selection
    if (store.state.tool !== 'select') store.setTool('select');
    else if (store.state.selection.length) store.set({ selection: [] });
    return;
  }

  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (tool) {
    store.setTool(tool);
    return;
  }

  // ↑ / ↓ move the active plane along its normal (Shift: fine steps), while slicing or in the Plane tool;
  // holding the key is one undo step (committed on keyup)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const s = store.state;
    if (!activePlane(s) || !(isSlicing(s) || s.tool === 'plane')) return;
    e.preventDefault();
    store.moveActivePlane((e.shiftKey ? 0.005 : 0.02) * (e.key === 'ArrowUp' ? 1 : -1), true);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') store.commitPreview();
});
// (if the window loses focus mid-hold the keyup never comes)
window.addEventListener('blur', () => store.commitPreview());

//////////////// help

$('help-open').addEventListener('click', () => ($('help').hidden = false));
$('help-close').addEventListener('click', () => ($('help').hidden = true));
$('help').addEventListener('click', (e) => {
  if (e.target === $('help')) $('help').hidden = true;
});

// handy for debugging in the browser console during development
if (import.meta.env.DEV) Object.assign(window, { store, viewer });
