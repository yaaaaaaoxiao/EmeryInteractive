// Owns the renderer, camera and controls. The scene content is replaced wholesale by `show()`.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../crystal/structures';
import type { Built, PickTarget } from './build';

const DEFAULT_VIEW = new THREE.Vector3(3.65, 1.95, 1.66).normalize();
// a site counts as clicked if the pointer is this close to its centre (in CSS pixels), even if it's tiny
const SITE_TOLERANCE_PX = 12;
// clicking again within this distance moves to the next object under the pointer
const REPEAT_CLICK_PX = 6;

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  private labelRenderer = new CSS2DRenderer();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private controls: OrbitControls;
  private light = new THREE.DirectionalLight(0xffffff, 2.2);
  private content: THREE.Group | null = null;
  private pickables: THREE.Object3D[] = [];
  private overlay = new THREE.Group();
  private animation: ((time: number) => boolean) | null = null;
  private blockSize: Vec3 = [1, 1, 1];
  private lastPick: { x: number; y: number; keys: string[]; index: number } | null = null;
  // in the neighbours tool, interstitial sites are picked before the atoms in front of them
  sitesFirst = false;

  constructor(
    private container: HTMLElement,
    onPick: (key: string | null, additive: boolean) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.scene.background = new THREE.Color(0xffffff);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
    this.camera.add(this.light);
    this.light.position.set(1, 2, 3);
    this.scene.add(this.camera);
    this.scene.add(this.overlay);

    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.rotateSpeed = 0.6;

    // a click (not a drag) picks the object under the pointer
    let down: { x: number; y: number } | null = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 5) onPick(this.pick(e), e.shiftKey);
    });

    // Safari on macOS reports trackpad pinches as its own gesture events instead of wheel events,
    // which OrbitControls ignores, so Safari zoomed the whole page. Zoom the model instead.
    let lastScale = 1;
    const onGesture = (e: Event) => {
      e.preventDefault();
      const { scale } = e as Event & { scale: number };
      if (e.type === 'gesturestart') lastScale = 1;
      if (e.type !== 'gesturechange' || !scale) return;
      // dollyIn multiplies the camera distance: spreading the fingers (scale up) moves closer
      this.controls.dollyIn(lastScale / scale);
      lastScale = scale;
    };
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      container.addEventListener(type, onGesture, { passive: false });
    }
    // OrbitControls skips wheel events while a rotation is in progress without blocking them,
    // which let a pinch (ctrl + wheel) zoom the page; never let the page zoom over the model
    container.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  show(built: Built, blockSize: Vec3): void {
    if (this.content) {
      this.scene.remove(this.content);
      dispose(this.content);
    }
    this.cancelAnimation();
    this.content = built.group;
    this.pickables = built.pickables;
    // keep the click-again cycle only while the same objects are clickable
    if (
      this.lastPick &&
      !this.lastPick.keys.every((k) => built.pickables.some((m) => (m.userData.pick as PickTarget).key === k))
    ) {
      this.lastPick = null;
    }
    this.scene.add(built.group);
    // so clicks right after a rebuild hit the new objects where they are
    this.scene.updateMatrixWorld();
    const sizeChanged = blockSize.some((v, i) => v !== this.blockSize[i]);
    this.blockSize = blockSize;
    if (sizeChanged || !this.controls.target.lengthSq()) this.resetCamera();
  }

  //////////////// camera

  private get center(): THREE.Vector3 {
    return new THREE.Vector3(...this.blockSize).multiplyScalar(0.5);
  }

  private get distance(): number {
    // fit the block and the axis labels (axes are max(repeat) + 0.5 long, see build.ts)
    const tip = Math.max(...this.blockSize) + 0.65;
    const tips = [0, 1, 2].map((axis) => new THREE.Vector3().setComponent(axis, tip).distanceTo(this.center));
    const radius = Math.max(new THREE.Vector3(...this.blockSize).length() / 2, ...tips) + 0.1;
    // use the narrower of the vertical and horizontal fields of view
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.min(1, this.camera.aspect));
    return radius / Math.sin(half);
  }

  resetCamera(): void {
    this.lookAlong(DEFAULT_VIEW);
  }

  // look at the block from direction `dir` (e.g. [1 1 1] looks down the body diagonal)
  lookAlong(dir: THREE.Vector3 | Vec3): void {
    const d = (dir instanceof THREE.Vector3 ? dir.clone() : new THREE.Vector3(...dir)).normalize();
    this.camera.up.set(0, 0, 1);
    if (Math.abs(d.z) > 0.999) this.camera.up.set(0, 1, 0);
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).add(d.multiplyScalar(this.distance));
    this.camera.lookAt(this.center);
    this.controls.update();
  }

  //////////////// picking

  private pick(e: PointerEvent): string | null {
    const keys = this.objectsUnderPointer(e.clientX, e.clientY);
    // clicking the same spot again steps to the next object behind
    const last = this.lastPick;
    const again =
      last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < REPEAT_CLICK_PX && last.keys.join() === keys.join();
    const index = again && keys.length ? (last.index + 1) % keys.length : 0;
    this.lastPick = { x: e.clientX, y: e.clientY, keys, index };
    return keys[index] ?? null;
  }

  // every object under the pointer, in the order a click should choose them
  objectsUnderPointer(clientX: number, clientY: number): string[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);

    // depth = distance from the camera to the front of the object;
    // offCenter = how far the pointer is from the object's centre on screen (px)
    const found = new Map<string, { target: PickTarget; depth: number; offCenter: number }>();
    const pxPerUnit = rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const screen = (target: PickTarget) => {
      const center = new THREE.Vector3(...target.center);
      const distance = center.distanceTo(this.camera.position);
      const p = center.clone().project(this.camera);
      const sx = rect.left + ((p.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - p.y) / 2) * rect.height;
      return {
        offCenter: Math.hypot(sx - clientX, sy - clientY),
        radiusPx: (target.radius * pxPerUnit) / distance,
        distance,
        behind: p.z > 1,
      };
    };
    const add = (target: PickTarget, depth: number) => {
      const prev = found.get(target.key);
      if (!prev || depth < prev.depth) found.set(target.key, { target, depth, offCenter: screen(target).offCenter });
    };

    for (const hit of ray.intersectObjects(this.pickables, false)) {
      if (isVisibleHit(hit)) add(hit.object.userData.pick as PickTarget, hit.distance);
    }

    // small sites are hard to hit exactly: accept clicks near their centre on screen
    for (const m of this.pickables) {
      const target = m.userData.pick as PickTarget;
      if (!target.isSite || found.has(target.key)) continue;
      const s = screen(target);
      if (!s.behind && s.offCenter <= Math.max(s.radiusPx, SITE_TOLERANCE_PX)) add(target, s.distance - target.radius);
    }

    const list = [...found.values()].sort((a, b) => {
      if (this.sitesFirst && a.target.isSite !== b.target.isSite) return a.target.isSite ? -1 : 1;
      // among sites in the neighbours tool, the one whose centre is closest to the pointer wins
      // (a small site seen through a larger one is still easy to pick)
      if (this.sitesFirst && a.target.isSite && Math.abs(a.offCenter - b.offCenter) > 2) return a.offCenter - b.offCenter;
      return a.depth - b.depth;
    });
    return list.map((f) => f.target.key);
  }

  //////////////// "grow sphere to fit" animation

  growSphere(center: Vec3, finalRadius: number, atomRadius: number, color: number, onDone: (ratio: number) => void): void {
    this.cancelAnimation();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }),
    );
    sphere.position.set(...center);
    const div = document.createElement('div');
    div.className = 'scene-label grow';
    const tag = new CSS2DObject(div);
    tag.position.set(...center);
    tag.center.set(-0.15, 1.4);
    this.overlay.add(sphere, tag);

    const duration = 2200;
    let start: number | null = null;
    this.animation = (time) => {
      start ??= time;
      const t = Math.min((time - start) / duration, 1);
      const r = finalRadius * (1 - (1 - t) ** 3);
      sphere.scale.setScalar(Math.max(r, 1e-4));
      div.textContent = `r/R = ${(r / atomRadius).toFixed(3)}`;
      if (t >= 1) {
        div.classList.add('done');
        onDone(finalRadius / atomRadius);
        return false;
      }
      return true;
    };
  }

  cancelAnimation(): void {
    this.animation = null;
    for (const child of [...this.overlay.children]) {
      this.overlay.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
    }
    dispose(this.overlay);
  }

  //////////////// loop

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number): void {
    if (this.animation && !this.animation(time)) this.animation = null;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

// the raycaster ignores clipping planes, so skip hits on parts that were clipped away
function isVisibleHit(hit: THREE.Intersection): boolean {
  const m = (hit.object as THREE.Mesh).material as THREE.Material | undefined;
  const planes = m?.clippingPlanes ?? [];
  return planes.every((p) => p.distanceToPoint(hit.point) >= -1e-3);
}

function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.cached) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    mats.forEach((m) => m.dispose());
    if (o instanceof CSS2DObject) o.element.remove();
  });
}
