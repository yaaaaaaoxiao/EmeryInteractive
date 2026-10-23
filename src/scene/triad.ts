// The x, y, z axes as a small triad in the bottom-left corner of the view, as in VESTA or a CAD program: it turns
// with the model but stays in its corner, so it's always visible and never lies over the crystal's cell edges.

import * as THREE from 'three';
import { COLORS } from './build';

// in page pixels: the triad's square, and its gap from the corner
const SIZE = 104;
const MARGIN = 8;

export class AxisTriad {
  private scene = new THREE.Scene();
  // looks at the origin from the same direction as the main camera (orthographic: the triad shows directions only)
  private camera = new THREE.OrthographicCamera(-1.25, 1.25, 1.25, -1.25, 0.1, 10);
  private labels: HTMLElement[];

  constructor(layer: HTMLElement) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.8));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 2, 3);
    this.camera.add(light);
    this.scene.add(this.camera);

    // solid shaded arrows, like the atoms: a shaft and a cone along each axis
    const shaft = new THREE.CylinderGeometry(0.045, 0.045, 0.72, 20).translate(0, 0.36, 0);
    const head = new THREE.ConeGeometry(0.12, 0.28, 24).translate(0, 0.86, 0);
    const up = new THREE.Vector3(0, 1, 0);
    COLORS.axes.forEach((color, axis) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 });
      const arrow = new THREE.Group().add(new THREE.Mesh(shaft, material), new THREE.Mesh(head, material));
      arrow.quaternion.setFromUnitVectors(up, new THREE.Vector3().setComponent(axis, 1));
      this.scene.add(arrow);
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), new THREE.MeshStandardMaterial({ color: 0x555555 })));

    this.labels = ['x', 'y', 'z'].map((name, axis) => {
      const el = document.createElement('div');
      el.className = 'scene-label axis';
      el.style.position = 'absolute';
      el.style.left = el.style.top = '0';
      el.textContent = name;
      el.style.color = `#${COLORS.axes[axis].toString(16).padStart(6, '0')}`;
      layer.appendChild(el);
      return el;
    });
  }

  // draws the triad over the bottom-left corner of what `renderer` has just drawn, turned as `camera` sees the model
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.position.set(0, 0, 4).applyQuaternion(camera.quaternion);
    this.camera.updateMatrixWorld();

    const size = renderer.getSize(new THREE.Vector2());
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    // (viewport and scissor are measured from the bottom-left corner)
    renderer.setScissor(MARGIN, MARGIN, SIZE, SIZE);
    renderer.setViewport(MARGIN, MARGIN, SIZE, SIZE);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.autoClear = autoClear;

    // each label just beyond its arrow's tip
    this.labels.forEach((el, axis) => {
      const p = new THREE.Vector3().setComponent(axis, 1.12).project(this.camera);
      const x = MARGIN + ((p.x + 1) / 2) * SIZE;
      const y = size.y - MARGIN - ((p.y + 1) / 2) * SIZE;
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    });
  }
}
