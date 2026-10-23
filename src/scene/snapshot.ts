// "Save image": the current view redrawn much larger than the screen, with its labels, as a PNG.
// (A vector SVG isn't possible for this view: the shading, reflections, transparency and cut-aways only exist
// as rendered pixels.)

import type * as THREE from 'three';

// the image's long side, in pixels (the screen shows the view at roughly 1000-1600)
const LONG_SIDE = 4096;
// Safari's largest canvas (4096 × 4096 pixels); other browsers allow more
const MAX_PIXELS = 4096 * 4096;

// `draw` renders the scene into the renderer's canvas; `restore` puts its size back afterwards
export function captureView(
  renderer: THREE.WebGLRenderer,
  labelLayer: HTMLElement,
  draw: () => void,
  restore: () => void,
): Promise<Blob> {
  const canvas = renderer.domElement;
  const { clientWidth: w, clientHeight: h } = canvas;
  const gl = renderer.getContext();
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxSide = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, viewport[0], viewport[1]);
  const scale = Math.min(Math.min(LONG_SIDE, maxSide) / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));

  const image = document.createElement('canvas');
  const ctx = image.getContext('2d') as CanvasRenderingContext2D;
  try {
    // redraw at `scale` pixels per screen pixel, without changing the canvas's size on the page, and copy it
    // straight away (a WebGL canvas keeps its picture only until the browser next shows it)
    renderer.setPixelRatio(scale);
    renderer.setSize(w, h, false);
    draw();
    image.width = canvas.width;
    image.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
  } finally {
    restore();
  }
  drawLabels(ctx, labelLayer, canvas.getBoundingClientRect(), image.width / w);

  return new Promise((resolve, reject) =>
    image.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be made'))), 'image/png'),
  );
}

// The labels are HTML on top of the 3D view, not part of it: draw each one where it is on screen, with its own
// font, colour and box, `scale` times larger. (Buttons on a label, like a selection's ×, are left out.)
function drawLabels(ctx: CanvasRenderingContext2D, layer: HTMLElement, origin: DOMRect, scale: number): void {
  const x = (px: number) => (px - origin.left) * scale;
  const y = (px: number) => (px - origin.top) * scale;

  for (const el of layer.querySelectorAll<HTMLElement>('.scene-label')) {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || !box.width) continue;

    // each piece of text, and where the browser put it
    const pieces: { text: string; rect: DOMRect; font: CSSStyleDeclaration }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement as HTMLElement;
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text || parent.closest('button')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      pieces.push({ text, rect: range.getBoundingClientRect(), font: getComputedStyle(parent) });
    }
    if (!pieces.length) continue;

    // the box, around the text only when a left-out button took up some of it
    const border = parseFloat(style.borderTopWidth) || 0;
    let { left, right } = box;
    if (el.querySelector('button')) {
      left = Math.min(...pieces.map((p) => p.rect.left)) - (parseFloat(style.paddingLeft) || 0) - border;
      right = Math.max(...pieces.map((p) => p.rect.right)) + (parseFloat(style.paddingRight) || 0) + border;
    }
    const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    if (filled || border) {
      ctx.beginPath();
      ctx.roundRect(
        x(left),
        y(box.top),
        (right - left) * scale,
        box.height * scale,
        (parseFloat(style.borderTopLeftRadius) || 0) * scale,
      );
      if (filled) {
        ctx.fillStyle = style.backgroundColor;
        ctx.fill();
      }
      if (border) {
        ctx.lineWidth = border * scale;
        ctx.strokeStyle = style.borderTopColor;
        ctx.stroke();
      }
    }

    for (const { text, rect, font } of pieces) {
      ctx.font = `${font.fontStyle} ${font.fontWeight} ${parseFloat(font.fontSize) * scale}px ${font.fontFamily}`;
      ctx.fillStyle = font.color;
      // centred where the page shows it (the page may set digits wider, as it does in coordinates)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x(rect.left + rect.width / 2), y(rect.top + rect.height / 2));
    }
  }
}
