// Builds the 3D scene of the dislocation page from its state. As on the main page, nothing here depends on what
// was drawn before: every change rebuilds the scene (about a thousand atoms, drawn as one instanced mesh).

import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../crystal/structures';
import type { Built } from '../scene/build';
import { LOOKS, makeMaterial } from '../scene/look';
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
  line: 0xb5179e,
  burgers: 0x2563eb,
  circuit: 0x1d2026,
  walker: 0xf97316,
  bond: 0x96a2b0,
  slipped: 0xf59e0b,
  unslipped: 0x64748b,
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
// drawn after, and over, the atoms: the line, the vectors and the circuit are annotations, like the labels
const ON_TOP = 10;

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
    if (split > left) group.add(sheet(left, split, front, back, z0, COLORS.slipped, 0.32, 'slipped'));
    if (split < right) group.add(sheet(split, right, front, back, z0, COLORS.unslipped, 0.16, 'unslipped'));
  }

  //////// the line and its Burgers vector (only while the line is in the block)
  const tip = new THREE.Vector3(state.position, front, z0);
  if (inside && state.show.line) {
    // an arrow along the line's sense (−y, out of the front face)
    const line = arrow(new THREE.Vector3(state.position, back, z0), tip, COLORS.line, 0.07);
    line.name = 'line';
    group.add(line, label('dislocation line', COLORS.line, new THREE.Vector3(state.position, back, z0), [-0.15, 2.2]));
  }
  if (inside && state.show.burgers) {
    const end = tip.clone().add(new THREE.Vector3(edge, screw, 0));
    const b = arrow(tip, end, COLORS.burgers, 0.07);
    b.name = 'burgers';
    group.add(b, label('b', COLORS.burgers, end, [-0.4, 0.5], true));
  }

  //////// the Burgers circuit: the steps taken so far, and once it is complete, the gap from start to finish
  if (circuit) {
    const total = circuit.points.length - 1;
    const taken = Math.min(state.circuitSteps ?? total, total);
    const points = circuit.points.slice(0, taken + 1).map((p) => place(config, p));
    const start = v3(points[0]);
    const here = v3(points[taken]);
    group.add(dot(start, COLORS.circuit), label('start', COLORS.circuit, start, [1.15, 1.2]));
    if (taken > 0) {
      const ends: number[] = [];
      for (let n = 1; n < points.length; n++) ends.push(...points[n - 1], ...points[n]);
      const path = segments(ends, COLORS.circuit, 3.5, { onTop: true });
      path.name = 'circuit';
      group.add(path);
    }
    if (taken < total) {
      // where the walk has got to
      const walker = dot(here, COLORS.walker, 0.17);
      walker.name = 'circuit-walker';
      group.add(walker);
    } else {
      const gap = arrow(start, here, COLORS.burgers, 0.06);
      gap.name = 'circuit-gap';
      // (below the point, so it never covers "start" when the gap points at the viewer)
      group.add(gap, dot(here, COLORS.circuit), label('finish', COLORS.circuit, here, [-0.15, -0.2]));
    }
  }

  return { group, pickables: [] };
}

//////////////// parts

// line segments (x1, y1, z1, x2, y2, z2, …) as "fat lines", which keep their width in a large saved image.
// `width` is in pixels, or in units of a with `inWorldUnits`.
function segments(
  ends: number[],
  color: number,
  width: number,
  { onTop = false, inWorldUnits = false, opacity = 1 }: { onTop?: boolean; inWorldUnits?: boolean; opacity?: number } = {},
): LineSegments2 {
  const material = new LineMaterial({
    color,
    linewidth: width,
    worldUnits: inWorldUnits,
    depthTest: !onTop,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
  const lines = new LineSegments2(new LineSegmentsGeometry().setPositions(ends), material);
  if (onTop) lines.renderOrder = ON_TOP;
  return lines;
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

// a flat, see-through rectangle at height z
function sheet(x1: number, x2: number, y1: number, y2: number, z: number, color: number, opacity: number, name: string) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(x2 - x1, y2 - y1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
  mesh.name = name;
  return mesh;
}

// a solid arrow drawn over the atoms, in one flat colour (so it reads as an annotation, not as part of the crystal)
function arrow(from: THREE.Vector3, to: THREE.Vector3, color: number, radius: number): THREE.Group {
  const length = from.distanceTo(to);
  const head = Math.min(radius * 5, length * 0.45);
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length - head, 20), material);
  shaft.position.y = (length - head) / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.4, head, 24), material);
  cone.position.y = length - head / 2;
  shaft.renderOrder = cone.renderOrder = ON_TOP;
  const group = new THREE.Group().add(shaft, cone);
  group.position.copy(from);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return group;
}

function dot(at: THREE.Vector3, color: number, radius = 0.11): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 10), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  mesh.position.copy(at);
  mesh.renderOrder = ON_TOP;
  return mesh;
}

// a small tag in the 3D view; `anchor` is where the point sits in the tag (0 0 = its top-left corner)
function label(text: string, color: number, at: THREE.Vector3, anchor: [number, number], math = false): CSS2DObject {
  const div = document.createElement('div');
  div.className = math ? 'scene-label note math' : 'scene-label note';
  div.textContent = text;
  div.style.borderColor = div.style.color = `#${color.toString(16).padStart(6, '0')}`;
  const object = new CSS2DObject(div);
  object.position.copy(at);
  object.center.set(...anchor);
  return object;
}
