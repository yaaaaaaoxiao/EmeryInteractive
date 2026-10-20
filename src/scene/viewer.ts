// Owns the renderer, camera and controls. The scene content is replaced wholesale by `show()`.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Vec3 } from '../crystal/structures';
import type { Built } from './build';

const DEFAULT_VIEW = new THREE.Vector3(3.65, 1.95, 1.66).normalize();

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

  constructor(private container: HTMLElement, onPick: (key: string | null, additive: boolean) => void) {
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
    this.scene.add(built.group);
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
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.pickables, false).find((h) => isVisibleHit(h));
    return hit ? (hit.object.userData.key as string) : null;
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
      const r = finalRadius * (1 - Math.pow(1 - t, 3));
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
