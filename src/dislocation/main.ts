// The dislocation page: an edge, screw or mixed dislocation in a block of simple-cubic, FCC or BCC crystal, which
// can be moved through the crystal (glide). It shares the 3D viewer, looks and themes with the main page.

import '../styles.css';
import '../themes/skeuomorphic.css';
import './dislocation.css';
import { STRUCTURES, type StructureId } from '../crystal/structures';
import { LOOKS, savedGraphics, saveGraphics } from '../scene/look';
import { Viewer } from '../scene/viewer';
import { savedTheme, setTheme, type Theme } from '../ui/theme';
import { burgersCircuit, crystalOf, type Kind, positionRange } from './field';
import { Panels } from './panels';
import { blockSize, buildDislocationScene } from './scene';
import { clampPosition, configOf, type DislocationState, startOf, stateFromURL, stateToURL } from './state';

const $ = (id: string) => document.getElementById(id)!;

// the starting camera: from the front and a little to the side and above, so the line comes toward the viewer
const DEFAULT_VIEW: [number, number, number] = [0.75, -1, 0.55];
// how fast "Play" moves the line, in atom spacings per second
const GLIDE_SPEED = 1.5;

// the timer that walks the Burgers circuit by itself, while it is running (see "walking the Burgers circuit")
let walkTimer: number | undefined;

let state: DislocationState = { ...stateFromURL(location.search), graphics: savedGraphics() };
const viewer = new Viewer($('viewer'), () => {});

function set(patch: Partial<DislocationState>): void {
  const previous = state;
  state = { ...state, ...patch };
  if (previous.graphics !== state.graphics) saveGraphics(state.graphics);
  // another crystal or kind of dislocation is another block: the line starts in its middle again, any walk of the
  // Burgers circuit is over, and the camera is fitted to it
  const newBlock = previous.structure !== state.structure || previous.kind !== state.kind;
  if (newBlock) {
    stopWalk();
    state = { ...state, position: patch.position ?? startOf(state.structure, state.kind), circuitSteps: null };
  }
  render();
  if (newBlock && blockSize(previous).join() !== blockSize(state).join()) viewer.lookAlong(DEFAULT_VIEW);
}

const panels = new Panels($('left'), $('inspector'), {
  set,
  get: () => state,
  resetView: () => viewer.lookAlong(DEFAULT_VIEW),
  lookAlong: (dir) => viewer.lookAlong(dir),
  snapshot: () => viewer.snapshot(),
  togglePlay,
  walkCircuit,
  stepCircuit,
});

//////////////// header

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-kind]')];
tabs.forEach((tab) => tab.addEventListener('click', () => set({ kind: tab.dataset.kind as Kind })));
const structureTabs = [...document.querySelectorAll<HTMLButtonElement>('[data-structure]')];
structureTabs.forEach((tab) => tab.addEventListener('click', () => set({ structure: tab.dataset.structure as StructureId })));

const graphicsToggle = $('graphics-toggle');
graphicsToggle.addEventListener('click', () => set({ graphics: state.graphics === 'performance' ? 'quality' : 'performance' }));

const themeSelect = $('theme-select') as HTMLSelectElement;
themeSelect.value = savedTheme();
themeSelect.addEventListener('change', () => setTheme(themeSelect.value as Theme));

//////////////// drawing

const NAMES: Record<Kind, string> = { edge: 'Edge', screw: 'Screw', mixed: 'Mixed' };

function render(): void {
  viewer.setLook(LOOKS[state.graphics]);
  viewer.show(buildDislocationScene(state), blockSize(state));
  panels.render(state, { playing, walking: walkTimer !== undefined });
  tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.kind === state.kind)));
  structureTabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.structure === state.structure)));
  graphicsToggle.setAttribute('aria-pressed', String(state.graphics === 'performance'));
  document.title = `${NAMES[state.kind]} dislocation · ${STRUCTURES[state.structure].shortName} · CrystalView`;
  scheduleURL();
}

// as on the main page: the address describes the setup, rewritten at most every 300 ms (Safari's limit)
let urlTimer: number | undefined;
function scheduleURL(): void {
  if (urlTimer !== undefined) return;
  urlTimer = window.setTimeout(() => {
    urlTimer = undefined;
    try {
      history.replaceState(null, '', stateToURL(state));
    } catch {
      // refused by the browser's rate limit: the next change writes it
    }
  }, 300);
}

//////////////// glide

let playing = false;
let lastTime: number | null = null;

function togglePlay(): void {
  playing = !playing;
  lastTime = null;
  if (playing) {
    // from the far side again, if the line has already left the crystal
    const [min, max] = positionRange(crystalOf(configOf(state)));
    if (state.position >= max) state = { ...state, position: min };
    requestAnimationFrame(tick);
  }
  render();
}

function tick(time: number): void {
  if (!playing) return;
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  const position = clampPosition(state, state.position + GLIDE_SPEED * dt);
  if (position >= positionRange(crystalOf(configOf(state)))[1]) playing = false;
  set({ position });
  if (playing) requestAnimationFrame(tick);
}

//////////////// walking the Burgers circuit, one atom-to-atom step at a time

// the time between steps when the circuit walks by itself, in ms
const WALK_STEP_MS = 320;

function stopWalk(): void {
  window.clearInterval(walkTimer);
  walkTimer = undefined;
}

// shows the circuit with no steps taken (moving the line back to the middle if the circuit wouldn't fit around it)
function restartCircuit(): void {
  const fits = burgersCircuit(configOf(state)) !== null;
  set({
    show: { ...state.show, circuit: true },
    circuitSteps: 0,
    position: fits ? state.position : startOf(state.structure, state.kind),
  });
}

// "Walk the circuit": from the start, a step at a time, until it is complete; pressing it again stops
function walkCircuit(): void {
  if (walkTimer !== undefined) {
    stopWalk();
    render();
    return;
  }
  walkTimer = window.setInterval(takeStep, WALK_STEP_MS);
  restartCircuit();
}

// "One step": the next step by hand (starting the circuit over if it is complete or not shown)
function stepCircuit(): void {
  stopWalk();
  if (!state.show.circuit || state.circuitSteps === null) restartCircuit();
  else takeStep();
}

function takeStep(): void {
  const circuit = state.show.circuit ? burgersCircuit(configOf(state)) : null;
  const total = circuit ? circuit.points.length - 1 : 0;
  const taken = (state.circuitSteps ?? total) + 1;
  // the last step completes the circuit, which then shows its gap
  if (taken >= total) stopWalk();
  set({ circuitSteps: taken >= total ? null : taken });
}

//////////////// keyboard

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // ← / → move the line (Shift: one atom spacing at a time); Space plays or pauses
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const step = (e.shiftKey ? 1 : 0.25) * (e.key === 'ArrowRight' ? 1 : -1);
    set({ position: clampPosition(state, state.position + step) });
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'Home') {
    set({ position: startOf(state.structure, state.kind) });
  }
});

render();
viewer.lookAlong(DEFAULT_VIEW);
requestAnimationFrame(() => graphicsToggle.classList.add('ready'));

// handy for debugging in the browser console during development
if (import.meta.env.DEV) Object.assign(window, { viewer, dislocation: { get: () => state, set } });
