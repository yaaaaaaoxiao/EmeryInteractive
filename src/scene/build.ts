// Builds the whole 3D scene from the state. Nothing here depends on what was drawn before.

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { atomObjects, type CrystalObject, fraction, objectKey, siteObjects } from '../crystal/lattice';
import { STRUCTURES, type Vec3 } from '../crystal/structures';
import { neighborsOf, parseKey, type State, unitNormal } from '../state';

export const COLORS = {
  highlight: 0xff6347,
  slice: 0x9fe3e3,
  bond: 0x777777,
  cellEdge: 0xc8c8c8,
  outerEdge: 0x111111,
  axes: [0xff8c00, 0x5aa800, 0x1e90ff],
};

const SPARSE_SCALE = 0.25;
const SPARSE_MIN_RADIUS = 0.03; // keeps the smallest sites visible in the sparse style
const GHOST_OPACITY = 0.1;
const FADED_OPACITY = 0.07;
// sites stay visible in the neighbours tool so they can be found and clicked
const FADED_SITE_OPACITY = 0.45;
const SITE_OPACITY = 0.95;
const EPS = 1e-4;

// what a clickable mesh stands for (several meshes, e.g. a sphere and its cut faces, share one object)
export interface PickTarget {
  key: string;
  isSite: boolean;
  center: Vec3;
  radius: number;
}

export interface Built {
  group: THREE.Group;
  // only atoms and sites inside the block; overlays (neighbours, labels, planes) are never clickable
  pickables: THREE.Object3D[];
}

export interface BuildCallbacks {
  onDeselect: (key: string) => void;
}

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

export function displayRadius(state: State, radius: number): number {
  return state.style === 'sparse' ? Math.max(radius * SPARSE_SCALE, SPARSE_MIN_RADIUS) : radius;
}

//////////////// shared geometry

const sphereCache = new Map<string, THREE.SphereGeometry>();
function sphereGeometry(radius: number): THREE.SphereGeometry {
  const key = radius.toFixed(5);
  let g = sphereCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(radius, 48, 32);
    g.userData.cached = true;
    sphereCache.set(key, g);
  }
  return g;
}

function material(color: number, opacity: number, clippingPlanes: THREE.Plane[] = [], depthWrite = opacity > 0.5) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
    depthWrite,
    clippingPlanes,
    side: THREE.FrontSide,
  });
}

//////////////// planes

// planes that keep the inside of the block [0, repeat]
function boxPlanes(repeat: Vec3): THREE.Plane[] {
  const planes: THREE.Plane[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const n = new THREE.Vector3().setComponent(axis, 1);
    planes.push(new THREE.Plane(n.clone(), EPS));
    planes.push(new THREE.Plane(n.clone().negate(), repeat[axis] + EPS));
  }
  return planes;
}

// the slice plane, keeping the side the normal points to (or the other side if flipped)
function slicePlane(state: State): THREE.Plane {
  const n = v3(unitNormal(state.plane.hkl));
  const plane = new THREE.Plane(n, -state.plane.offset);
  return state.slice.flip ? plane.negate() : plane;
}

// a flat disk filling the cut where `plane` crosses a sphere (null if it doesn't)
// (`onTop` pulls it in front of a translucent slice sheet drawn on the same plane)
function capDisk(
  center: Vec3,
  radius: number,
  plane: THREE.Plane,
  color: number,
  opacity: number,
  clip: THREE.Plane[],
  onTop = false,
) {
  const c = v3(center);
  const s = plane.distanceToPoint(c);
  if (Math.abs(s) >= radius) return null;
  const r = Math.sqrt(radius * radius - s * s);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 64), material(color, opacity, clip));
  mesh.material.side = THREE.DoubleSide;
  if (onTop) {
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -1;
    mesh.material.polygonOffsetUnits = -4;
  }
  mesh.position.copy(c.sub(plane.normal.clone().multiplyScalar(s)));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
  return mesh;
}

// a large square on a plane, clipped to the block
function planeSheet(plane: THREE.Plane, repeat: Vec3, color: number, opacity: number) {
  const size = 4 * Math.max(...repeat);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      clippingPlanes: boxPlanes(repeat),
    }),
  );
  const center = v3(repeat).multiplyScalar(0.5);
  plane.projectPoint(center, mesh.position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
  return mesh;
}

//////////////// small helpers

function label(text: string, className = 'scene-label'): CSS2DObject {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

function bond(a: Vec3, b: Vec3, radius: number, color: number): THREE.Mesh {
  const pa = v3(a);
  const dir = v3(b).sub(pa);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 16), material(color, 1));
  mesh.position.copy(pa.add(dir.clone().multiplyScalar(0.5)));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// convex polyhedron (or flat polygon) through the points, with its edges
export function polyhedron(points: Vec3[], color: number, opacity: number): THREE.Group {
  const group = new THREE.Group();
  const vs = points.map(v3);
  let geometry: THREE.BufferGeometry | null = null;

  const center = vs.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / vs.length);
  const plane = vs.length >= 3 ? new THREE.Plane().setFromCoplanarPoints(vs[0], vs[1], vs[2]) : null;
  const flat = plane && plane.normal.lengthSq() > 0.5 && vs.every((v) => Math.abs(plane.distanceToPoint(v)) < 1e-6);
  if (flat && plane) {
    // sort around the centre and fan-triangulate
    const u = vs[0].clone().sub(center).normalize();
    const w = plane.normal.clone().cross(u);
    const sorted = [...vs].sort((a, b) => {
      const da = a.clone().sub(center);
      const db = b.clone().sub(center);
      return Math.atan2(da.dot(w), da.dot(u)) - Math.atan2(db.dot(w), db.dot(u));
    });
    const positions: number[] = [];
    for (let i = 1; i < sorted.length - 1; i++) {
      for (const v of [sorted[0], sorted[i], sorted[i + 1]]) positions.push(v.x, v.y, v.z);
    }
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(sorted), new THREE.LineBasicMaterial({ color }));
    group.add(outline);
  } else if (vs.length >= 4) {
    geometry = new ConvexGeometry(vs);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color })));
  }
  if (geometry) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    group.add(new THREE.Mesh(geometry, m));
  }
  return group;
}

//////////////// the scene

export function buildScene(state: State, callbacks: BuildCallbacks): Built {
  const structure = STRUCTURES[state.structure];
  const group = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const { repeat } = state;

  // which objects are visible
  const objects: CrystalObject[] = [];
  if (state.showAtoms) objects.push(...atomObjects(structure, repeat));
  for (const site of structure.sites) {
    if (state.showSites[site.id]) objects.push(...siteObjects(structure, site, repeat));
  }

  const section = state.slice.on && state.slice.mode === 'section';
  const cutaway = state.slice.on && state.slice.mode === 'cutaway';
  const box = state.clipToCell ? boxPlanes(repeat) : [];
  const slice = slicePlane(state);
  // every plane that cuts the spheres
  const cuts = [...box, ...(cutaway ? [slice] : [])];
  const selected = new Set(state.selection);
  // neighbours tool in solo: only the target and its surrounding atoms are drawn
  const solo = state.neighbors.on && state.neighbors.solo;

  //////// atoms and sites
  for (const obj of solo ? [] : objects) {
    const r = displayRadius(state, obj.radius);
    const isAtom = obj.kind === 'atom';
    const faded = state.neighbors.on;
    const color = selected.has(obj.key) ? COLORS.highlight : obj.color;
    const fadedOpacity = isAtom ? FADED_OPACITY : FADED_SITE_OPACITY;
    const opacity = faded ? fadedOpacity : isAtom ? state.opacity : SITE_OPACITY;
    const pick: PickTarget = { key: obj.key, isSite: !isAtom, center: obj.pos, radius: r };

    const tag = (m: THREE.Object3D) => {
      m.userData.pick = pick;
      pickables.push(m);
      group.add(m);
    };

    if (section) {
      // only the cross-section on the slice plane
      const disk = capDisk(obj.pos, r, slice, color, faded ? fadedOpacity : 1, box, true);
      if (disk) tag(disk);
      continue;
    }

    const mesh = new THREE.Mesh(sphereGeometry(r), material(color, opacity, cuts, !faded && opacity > 0.5));
    mesh.position.copy(v3(obj.pos));
    tag(mesh);

    // fill every cut so the sphere looks solid
    cuts.forEach((plane, i) => {
      const others = cuts.filter((_, j) => j !== i);
      const disk = capDisk(obj.pos, r, plane, color, opacity, others, plane === slice);
      if (disk) tag(disk);
    });

    // faint full atom behind the clipped one
    if (isAtom && state.clipToCell && !faded) {
      const outside = obj.pos.some((v, axis) => v - r < 0 || v + r > repeat[axis]);
      if (outside) {
        const ghost = new THREE.Mesh(sphereGeometry(r), material(obj.color, GHOST_OPACITY, cutaway ? [slice] : [], false));
        ghost.position.copy(v3(obj.pos));
        group.add(ghost);
      }
    }
  }

  //////// slice and plane
  if (state.slice.on) {
    group.add(planeSheet(slice, repeat, COLORS.slice, section ? 0.55 : 0.18));
  } else if (state.plane.show) {
    const plane = new THREE.Plane(v3(unitNormal(state.plane.hkl)), -state.plane.offset);
    // drawn on top so it stays visible inside a hard-sphere model
    const sheet = planeSheet(plane, repeat, COLORS.highlight, 0.3);
    sheet.material.depthTest = false;
    sheet.renderOrder = 5;
    group.add(sheet);
  }

  //////// polyhedra around every visible site
  if (state.polyhedra && !section && !solo) {
    for (const obj of objects) {
      if (obj.kind === 'atom') continue;
      const n = neighborsOf(state.structure, obj.key);
      group.add(polyhedron(n.positions, obj.color, state.neighbors.on ? 0.04 : 0.15));
    }
  }

  //////// neighbours tool
  if (state.neighbors.on && state.neighbors.target) {
    const n = neighborsOf(state.structure, state.neighbors.target);
    const targetRadius = n.site ? n.distance - structure.atomRadius : structure.atomRadius;
    const targetColor = n.site ? n.site.color : structure.color;
    const center = new THREE.Mesh(sphereGeometry(displayRadius(state, targetRadius)), material(targetColor, 1));
    center.position.copy(v3(n.pos));
    group.add(center);

    const neighborOpacity = state.style === 'hard' ? 0.35 : 1;
    const neighborRadius = displayRadius(state, structure.atomRadius);
    for (const p of n.positions) {
      const m = new THREE.Mesh(sphereGeometry(neighborRadius), material(structure.color, neighborOpacity));
      m.position.copy(v3(p));
      group.add(m);
      // in solo these are the only atoms on screen, so clicking one moves to it
      if (solo) {
        m.userData.pick = { key: objectKey('atom', p), isSite: false, center: p, radius: neighborRadius } satisfies PickTarget;
        pickables.push(m);
      }
      group.add(bond(n.pos, p, 0.015, COLORS.bond));
    }
    if (n.positions.length >= 3) group.add(polyhedron(n.positions, targetColor, 0.2));
  }

  //////// selection: labels and the polyhedron through 4+ objects
  if (state.selection.length >= 4) {
    group.add(
      polyhedron(
        state.selection.map((k) => parseKey(k).pos),
        COLORS.highlight,
        0.35,
      ),
    );
  }
  if (state.labels) {
    for (const key of state.selection) {
      const { pos } = parseKey(key);
      const l = label(pos.map(fraction).join('  '), 'scene-label selected');
      const close = document.createElement('button');
      close.textContent = '×';
      close.title = 'Deselect';
      close.addEventListener('pointerdown', (e) => e.stopPropagation());
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onDeselect(key);
      });
      l.element.prepend(close);
      l.position.copy(v3(pos));
      l.center.set(-0.15, 1.2);
      group.add(l);
    }
  }

  //////// direction arrow and lattice position marker
  if (state.direction) {
    const { from, vector, uvw } = state.direction;
    const dir = v3(vector);
    const length = dir.length();
    if (length > 1e-6) {
      const arrow = new THREE.ArrowHelper(dir.clone().normalize(), v3(from), length, COLORS.highlight, 0.1, 0.06);
      // always on top, so it isn't hidden inside the atoms
      arrow.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.depthTest = false;
        o.renderOrder = 10;
      });
      group.add(arrow);
      const l = label(`[${uvw.join(' ')}]`, 'scene-label direction');
      l.position.copy(v3(from).add(dir.multiplyScalar(0.5)));
      group.add(l);
    }
  }
  if (state.marker) {
    const m = new THREE.Mesh(sphereGeometry(0.04), material(0x000000, 1));
    m.position.copy(v3(state.marker));
    group.add(m);
    const l = label(state.marker.map(fraction).join('  '));
    l.position.copy(m.position);
    l.center.set(-0.2, 1.2);
    group.add(l);
  }

  //////// cell edges, axes and the lattice parameter
  group.add(cellEdges(repeat));
  group.add(axes(repeat));

  return { group, pickables };
}

function cellEdges(repeat: Vec3): THREE.Group {
  const group = new THREE.Group();
  const inner: number[] = [];
  for (let i = 0; i < repeat[0]; i++)
    for (let j = 0; j < repeat[1]; j++)
      for (let k = 0; k < repeat[2]; k++) {
        const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        const p = g.getAttribute('position');
        for (let n = 0; n < p.count; n++) inner.push(p.getX(n) + i + 0.5, p.getY(n) + j + 0.5, p.getZ(n) + k + 0.5);
      }
  if (repeat.some((v) => v > 1)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(inner, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.cellEdge })));
  }
  // drawn a hair outside the cell so the filled cuts on the cell faces don't hide it
  const outer = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(...(repeat.map((v) => v + 0.006) as Vec3))),
    new THREE.LineBasicMaterial({ color: COLORS.outerEdge }),
  );
  outer.position.copy(v3(repeat).multiplyScalar(0.5));
  group.add(outer);

  // the lattice parameter a, on one vertical edge
  const edge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.003, 1.003, 0), new THREE.Vector3(1.003, 1.003, 1)]),
    new THREE.LineBasicMaterial({ color: 0xd00000 }),
  );
  group.add(edge);
  const a = label('a', 'scene-label lattice');
  a.position.set(1.06, 1.06, 0.5);
  group.add(a);
  return group;
}

function axes(repeat: Vec3): THREE.Group {
  const group = new THREE.Group();
  const length = Math.max(...repeat) + 0.5;
  ['x', 'y', 'z'].forEach((name, axis) => {
    const dir = new THREE.Vector3().setComponent(axis, 1);
    group.add(new THREE.ArrowHelper(dir, new THREE.Vector3(), length, COLORS.axes[axis], 0.1, 0.05));
    const l = label(name, 'scene-label axis');
    l.position.copy(dir.multiplyScalar(length + 0.12));
    group.add(l);
  });
  return group;
}
