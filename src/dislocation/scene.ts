// Builds the 3D scene of the dislocation page from its state. As on the main page, nothing here depends on what
// was drawn before: every change rebuilds the scene (about a thousand atoms, drawn as one instanced mesh).

import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../crystal/structures';
import type { Built } from '../scene/build';
import { LOOKS, type Look, makeMaterial } from '../scene/look';
import {
  atomDilatation,
  atomPosition,
  atomShear,
  bonds,
  burgersCircuit,
  type Config,
  crystalOf,
  type Grid,
  inHalfPlane,
  lineInBlock,
  onRamp,
  place,
  rampLayers,
  rampOf,
  rampTurn,
} from './field';
import { configOf, type DislocationState } from './state';

export const COLORS = {
  // the two halves of the crystal, above and below the slip plane: the same metal in two tones, so the half
  // that slips can be told from the half it slips over
  atomAbove: 0x7f9fcb,
  atomBelow: 0xb4bfcc,
  halfPlane: 0xff6347,
  // the spiral ramp; where the layers make two or three ramps wound inside each other, one colour each
  ramps: [0x0d9488, 0x7c3aed, 0x65a30d],
  // the annotations: strong, deep colours, so they stand apart from the soft colours of the atoms
  line: 0xa21caf,
  burgers: 0x1d4ed8,
  circuit: 0x334155,
  walker: 0xf97316,
  bond: 0x96a2b0,
  slipped: 0xf59e0b,
  unslipped: 0x94a3b8,
  // lattice planes, cycling (so a plane can be told from the ones next to it)
  planes: [0x4e79a7, 0xf28e2b, 0x59a14f, 0xedc948],
  compression: 0x2563eb,
  tension: 0xdc2626,
  unstrained: 0xdfe3e8,
  // a pure screw dislocation, which shears the crystal without changing its volume
  shear: 0xea580c,
};

// the volume change at which the strain colours are fully blue or red (it is about 0.16 right beside the line of
// a simple-cubic edge dislocation, and falls off as 1/distance)
export const STRAIN_FULL_SCALE = 0.04;
// the shear strain at which the shear colour is full (reached about one atom spacing from a screw dislocation)
export const SHEAR_FULL_SCALE = 0.12;

// an atom's radius as a fraction of the nearest-neighbour distance: touching, or small enough to see between
const ATOM_RADIUS = { hard: 0.5, sticks: 0.2 };
// a bond's thickness as a fraction of the nearest-neighbour distance (not in pixels, so bonds further away are
// drawn thinner, as the atoms are). Bonds are hairlines, and a little see-through, so the many that cross behind
// one another in a block this deep stay a light mesh instead of a dark tangle.
const BOND_WIDTH = 0.02;
const BOND_OPACITY = 0.65;
// how see-through the atoms away from the spiral ramp are while it is shown (big hard spheres need to be fainter)
const FADED_OPACITY = { hard: 0.05, sticks: 0.14 };
// how far the slip plane and the line reach beyond the atoms, so they show outside a hard-sphere block
const MARGIN = 1.2;
// The line, the vectors and the circuit are annotations, like the labels: drawn after the crystal and always in
// front of it (see `overlay`), but shaded like the atoms, each with a thin white outline that keeps it apart from
// whatever is behind it.
const ON_TOP = 10;
const OUTLINE = 0.028;
const OUTLINE_COLOR = 0xffffff;
// how thick the annotations are, in units of a
const LINE_RADIUS = 0.07;
const BURGERS_RADIUS = 0.085;
const CIRCUIT_RADIUS = 0.05;
const KNOB_RADIUS = 0.14;
const WALKER_RADIUS = 0.18;

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

// the block's size for the camera
export const blockSize = (state: DislocationState): Vec3 => crystalOf(configOf(state)).size;

export function atomColor(state: DislocationState, config: Config, atom: number): number | THREE.Color {
  const crystal = crystalOf(config);
  if (state.coloring === 'strain') {
    // a pure screw dislocation squeezes and stretches nothing: its strain is shear, shown in a colour of its own
    if (crystal.burgers[0] === 0) {
      const t = Math.min(atomShear(config, atom) / SHEAR_FULL_SCALE, 1);
      return new THREE.Color(COLORS.unstrained).lerp(new THREE.Color(COLORS.shear), t);
    }
    const t = THREE.MathUtils.clamp(atomDilatation(config, atom) / STRAIN_FULL_SCALE, -1, 1);
    return new THREE.Color(COLORS.unstrained).lerp(new THREE.Color(t < 0 ? COLORS.compression : COLORS.tension), Math.abs(t));
  }
  if (state.show.halfPlane && inHalfPlane(config, atom)) return COLORS.halfPlane;
  if (state.show.ramp && state.coloring === 'plain' && onRamp(config, atom)) {
    return COLORS.ramps[rampOf(crystal, crystal.atoms[atom][1])];
  }
  if (state.coloring === 'planes') {
    // the planes the Burgers vector steps between: across the line for an edge part, along it for a pure screw
    const axis = crystal.burgers[0] !== 0 ? 0 : 1;
    const plane = Math.round(crystal.atoms[atom][axis] / crystal.spacing[axis]);
    return COLORS.planes[plane % COLORS.planes.length];
  }
  return crystal.atoms[atom][2] > crystal.slipHeight ? COLORS.atomAbove : COLORS.atomBelow;
}

export function buildDislocationScene(state: DislocationState): Built {
  const look = LOOKS[state.graphics];
  const config = configOf(state);
  const crystal = crystalOf(config);
  const [edge, screw] = crystal.burgers;
  const group = new THREE.Group();

  // the Burgers circuit, if it is shown and fits around the line
  const circuit = state.show.circuit ? burgersCircuit(config) : null;
  const onCircuit = new Set(circuit?.atoms);

  //////// atoms
  // While the spiral ramp is shown, only the atoms on it (and the extra half-plane, and the Burgers circuit) are
  // drawn solid: the ramp is steep only near the line, and the rest of the block would hide it. Not when atoms are
  // coloured by strain, though: then the colours of the whole block are the point.
  const inside = lineInBlock(config);
  const rampShown = inside && state.show.ramp && screw !== 0;
  const fadeRest = rampShown && state.coloring !== 'strain';
  const isSolid = (atom: number) =>
    !fadeRest || onRamp(config, atom) || (state.show.halfPlane && inHalfPlane(config, atom)) || onCircuit.has(atom);
  const atoms = crystal.atoms.map((_, n) => n);
  const solid = atoms.filter(isSolid);
  const faded = atoms.filter((atom) => !isSolid(atom));
  const detail = state.graphics === 'performance' ? [16, 10] : [32, 20];
  const geometry = new THREE.SphereGeometry(ATOM_RADIUS[state.style] * crystal.nearest, detail[0], detail[1]);
  const spheres = (list: number[], opacity: number, name: string) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      makeMaterial(look, { color: 0xffffff, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }),
      list.length,
    );
    mesh.name = name;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    list.forEach((atom, n) => {
      mesh.setMatrixAt(n, matrix.setPosition(...atomPosition(config, atom)));
      mesh.setColorAt(n, color.set(atomColor(state, config, atom)));
    });
    // (the instances are far from the mesh's own origin, so it must never be culled as off-screen)
    mesh.frustumCulled = false;
    return mesh;
  };
  group.add(spheres(solid, 1, 'atoms'));
  if (faded.length) group.add(spheres(faded, FADED_OPACITY[state.style], 'atoms-faded'));

  //////// bonds (faded unless both of their atoms are solid)
  if (state.style === 'sticks') {
    const width = BOND_WIDTH * crystal.nearest;
    const ends: number[][] = [[], []];
    for (const [a, b] of bonds(config)) {
      ends[isSolid(a) && isSolid(b) ? 0 : 1].push(...atomPosition(config, a), ...atomPosition(config, b));
    }
    const lines = segments(ends[0], COLORS.bond, width, { inWorldUnits: true, opacity: BOND_OPACITY });
    lines.name = 'bonds';
    group.add(lines);
    if (ends[1].length) {
      const rest = segments(ends[1], COLORS.bond, width, {
        inWorldUnits: true,
        opacity: FADED_OPACITY.sticks * BOND_OPACITY,
      });
      rest.name = 'bonds-faded';
      group.add(rest);
    }
  }

  //////// the spiral ramp of a screw dislocation: the layers of atoms across the line, near the line
  if (rampShown) {
    const ramp = new THREE.Group();
    ramp.name = 'ramp';
    const layers = rampLayers(crystal);
    // (with many layers, each turn is drawn a little more coarsely)
    const around = layers.length > 12 ? 48 : 72;
    COLORS.ramps.forEach((color, which) => {
      const turns = layers.filter((layer) => layer.ramp === which);
      if (!turns.length) return;
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const rim: number[] = [];
      for (const layer of turns) {
        const turn = rampTurn(config, layer.y, around);
        ramp.add(new THREE.Mesh(surface(turn), material));
        rim.push(...outerEdge(turn));
      }
      ramp.add(segments(rim, color, 2.5));
    });
    group.add(ramp);
  }

  const z0 = crystal.slipHeight;
  const front = -MARGIN;
  const back = crystal.size[1] + MARGIN;

  //////// the slip plane: the part the line has passed (slipped by b) and the part it hasn't reached
  if (state.show.slipPlane) {
    const left = -MARGIN;
    const right = crystal.size[0] + MARGIN;
    const split = THREE.MathUtils.clamp(state.position, left, right);
    if (split > left) group.add(sheet(left, split, front, back, z0, COLORS.slipped, 0.3, 'slipped'));
    if (split < right) group.add(sheet(split, right, front, back, z0, COLORS.unslipped, 0.14, 'unslipped'));
  }

  //////// the line and its Burgers vector (only while the line is in the block)
  const paint = (color: number) => overlayMaterial(look, color);
  const tip = new THREE.Vector3(state.position, front, z0);
  const annotations: THREE.Object3D[] = [];
  if (inside && state.show.line) {
    // an arrow along the line's sense (−y, out of the front face)
    const line = arrow(new THREE.Vector3(state.position, back, z0), tip, paint(COLORS.line), LINE_RADIUS);
    line.name = 'line';
    annotations.push(line, label('dislocation line', COLORS.line, new THREE.Vector3(state.position, back, z0), [-0.15, 2.2]));
  }
  if (inside && state.show.burgers) {
    const end = tip.clone().add(new THREE.Vector3(edge, screw, 0));
    const b = arrow(tip, end, paint(COLORS.burgers), BURGERS_RADIUS);
    b.name = 'burgers';
    annotations.push(b, label('b', COLORS.burgers, end, [-0.4, 0.5], true));
  }

  //////// the Burgers circuit: the steps taken so far, and once it is complete, the gap from start to finish
  if (circuit) {
    const total = circuit.points.length - 1;
    const taken = Math.min(state.circuitSteps ?? total, total);
    const points = circuit.points.slice(0, taken + 1).map((p) => v3(place(config, p)));
    const start = points[0];
    const here = points[taken];
    const ink = paint(COLORS.circuit);
    annotations.push(...knob(start, ink, KNOB_RADIUS), label('start', COLORS.circuit, start, [1.15, 1.2]));
    if (taken > 0) {
      const path = tubes(points, ink, CIRCUIT_RADIUS);
      path.name = 'circuit';
      // an arrowhead in the middle of each side, once the walk has passed it: which way round the circuit goes
      const heads = new THREE.Group();
      let first = 0;
      for (const leg of circuit.legs) {
        const middle = first + Math.floor(leg.steps / 2);
        if (middle < taken) heads.add(arrowhead(points[middle], points[middle + 1], ink, CIRCUIT_RADIUS));
        first += leg.steps;
      }
      annotations.push(path, heads);
    }
    if (taken < total) {
      // where the walk has got to
      const [walker, outline] = knob(here, paint(COLORS.walker), WALKER_RADIUS);
      walker.name = 'circuit-walker';
      annotations.push(walker, outline);
    } else {
      const gap = arrow(start, here, paint(COLORS.burgers), LINE_RADIUS);
      gap.name = 'circuit-gap';
      // (below the point, so it never covers "start" when the gap points at the viewer)
      annotations.push(gap, ...knob(here, ink, KNOB_RADIUS), label('finish', COLORS.circuit, here, [-0.2, -0.5]));
    }
  }
  if (annotations.length) group.add(overlay(), ...annotations);

  return { group, pickables: [] };
}

//////////////// parts

// line segments (x1, y1, z1, x2, y2, z2, …) as "fat lines", which keep their width in a large saved image.
// `width` is in pixels, or in units of a with `inWorldUnits`.
function segments(
  ends: number[],
  color: number,
  width: number,
  { inWorldUnits = false, opacity = 1 }: { inWorldUnits?: boolean; opacity?: number } = {},
): LineSegments2 {
  const material = new LineMaterial({
    color,
    linewidth: width,
    worldUnits: inWorldUnits,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
  return new LineSegments2(new LineSegmentsGeometry().setPositions(ends), material);
}

// a grid of points as a smooth surface
function surface(grid: Grid): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(grid.points.flat(), 3));
  const index: number[] = [];
  for (let r = 0; r + 1 < grid.rows; r++) {
    for (let c = 0; c + 1 < grid.columns; c++) {
      const a = r * grid.columns + c;
      const b = a + grid.columns;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// the last row of a grid (the ramp's outer edge), as line segments
function outerEdge(grid: Grid): number[] {
  const row = grid.points.slice((grid.rows - 1) * grid.columns);
  const ends: number[] = [];
  for (let c = 0; c + 1 < row.length; c++) ends.push(...row[c], ...row[c + 1]);
  return ends;
}

// a flat, see-through rectangle at height z, with its edge drawn (so it reads as a sheet, not as a tint)
function sheet(x1: number, x2: number, y1: number, y2: number, z: number, color: number, opacity: number, name: string) {
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(x2 - x1, y2 - y1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  fill.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
  const corners = [x1, y1, z, x2, y1, z, x2, y1, z, x2, y2, z, x2, y2, z, x1, y2, z, x1, y2, z, x1, y1, z];
  const group = new THREE.Group().add(fill, segments(corners, color, 1.5, { opacity: Math.min(1, opacity * 2.6) }));
  group.name = name;
  return group;
}

//////////////// annotations

// Everything added to the scene after this is drawn in front of the crystal, whatever is in the way, yet the
// annotations still hide one another as solid things do: this clears the depth the crystal left behind, just
// before the first of them is drawn. (They are all marked see-through only so that they are drawn last, after the
// parts of the crystal that really are.)
function overlay(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, colorWrite: false, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = ON_TOP - 1;
  mesh.onBeforeRender = (renderer) => renderer.clearDepth();
  return mesh;
}

// shaded like the atoms
function overlayMaterial(look: Look, color: number): THREE.Material {
  return makeMaterial(look, { color, transparent: true });
}

// the white outline of an annotation: the same shape a little larger, of which only the inside of the far side is
// drawn, so it shows as a rim around the shape itself
const outlineMaterial = () => new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, transparent: true });

function onTop<T extends THREE.Object3D>(object: T): T {
  object.renderOrder = ON_TOP;
  return object;
}

// A cone with its base at height `base` on the y axis, pointing up, and its outline: the same cone with its
// surface moved out by OUTLINE all round.
function cone(base: number, height: number, wide: number, material: THREE.Material): THREE.Mesh[] {
  const sharpness = Math.hypot(height, wide) / wide;
  return [0, OUTLINE].map((grow) => {
    const from = base - grow;
    const to = base + height + grow * sharpness;
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(((to - from) * wide) / height, to - from, 32),
      grow ? outlineMaterial() : material,
    );
    mesh.position.y = (from + to) / 2;
    return onTop(mesh);
  });
}

// a round arrow from one point to another, with its outline
function arrow(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material, radius: number): THREE.Group {
  const length = from.distanceTo(to);
  const head = Math.min(radius * 5.5, length * 0.45);
  const group = new THREE.Group().add(...cone(length - head, head, radius * 2.5, material));
  for (const grow of [0, OUTLINE]) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + grow, radius + grow, length - head + grow, 24),
      grow ? outlineMaterial() : material,
    );
    shaft.position.y = (length - head - grow) / 2;
    group.add(onTop(shaft));
  }
  group.position.copy(from);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return group;
}

// the head of an arrow alone, in the middle of the way from one point to the next
function arrowhead(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material, radius: number): THREE.Group {
  const length = radius * 6.5;
  const group = new THREE.Group().add(...cone(-length / 2, length, radius * 2.9, material));
  group.position.copy(from).lerp(to, 0.5);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return group;
}

// a ball at a point, with its outline
function knob(at: THREE.Vector3, material: THREE.Material, radius: number): [THREE.Mesh, THREE.Mesh] {
  const ball = onTop(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material));
  const outline = onTop(new THREE.Mesh(new THREE.SphereGeometry(radius + OUTLINE, 24, 16), outlineMaterial()));
  ball.position.copy(at);
  outline.position.copy(at);
  return [ball, outline];
}

// a path through the points as round rods with round joints, and its outline; the rods come first
function tubes(points: THREE.Vector3[], material: THREE.Material, radius: number): THREE.Group {
  const steps = points.length - 1;
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  for (const grow of [0, OUTLINE]) {
    const paint = grow ? outlineMaterial() : material;
    const rods = onTop(
      new THREE.InstancedMesh(new THREE.CylinderGeometry(radius + grow, radius + grow, 1, 16, 1, true), paint, steps),
    );
    const joints = onTop(new THREE.InstancedMesh(new THREE.SphereGeometry(radius + grow, 16, 10), paint, points.length));
    points.forEach((point, n) => {
      joints.setMatrixAt(n, matrix.makeTranslation(point));
      if (n === steps) return;
      const along = points[n + 1].clone().sub(point);
      const length = along.length();
      turn.setFromUnitVectors(up, along.normalize());
      rods.setMatrixAt(n, matrix.compose(point.clone().lerp(points[n + 1], 0.5), turn, new THREE.Vector3(1, length, 1)));
    });
    // (its parts are spread over the block, so it is drawn wherever the camera looks)
    rods.frustumCulled = joints.frustumCulled = false;
    group.add(rods, joints);
  }
  return group;
}

// a small tag in the 3D view; `anchor` is where the point sits in the tag (0 0 = its top-left corner)
function label(text: string, color: number, at: THREE.Vector3, anchor: [number, number], math = false): CSS2DObject {
  const div = document.createElement('div');
  div.className = math ? 'scene-label note math' : 'scene-label note';
  div.textContent = text;
  div.style.setProperty('--tag', `#${color.toString(16).padStart(6, '0')}`);
  const object = new CSS2DObject(div);
  object.position.copy(at);
  object.center.set(...anchor);
  return object;
}
