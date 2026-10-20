import { expect, type Page, test } from '@playwright/test';

type Vec3 = [number, number, number];

// the dev build exposes these on window (src/main.ts)
interface DevWindow {
  store: { state: { neighbors: { target: string | null } } };
  viewer: {
    camera: {
      position: {
        constructor: new (...p: number[]) => { project(c: unknown): { x: number; y: number } };
        distanceTo(p: unknown): number;
      };
    };
    controls: { target: unknown };
    renderer: { domElement: HTMLCanvasElement };
  };
}

async function open(page: Page, query = '?s=fcc') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
  await page.waitForFunction(() => 'viewer' in window && document.querySelector('#viewer canvas'));
  return errors;
}

// where a point of the crystal (in units of a) appears on screen
async function screenPoint(page: Page, p: Vec3) {
  return page.evaluate((p) => {
    const { viewer } = window as unknown as DevWindow;
    const v = new viewer.camera.position.constructor(...p).project(viewer.camera);
    const r = viewer.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
}

// (mouse.click has no modifier option, so Shift is held on the keyboard around the click)
async function clickAt(page: Page, p: Vec3, { shift = false } = {}) {
  const { x, y } = await screenPoint(page, p);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up('Shift');
}

const info = (page: Page) => page.locator('#info');

test('loads without errors and switches structures', async ({ page }) => {
  const errors = await open(page);
  await expect(info(page).getByRole('heading', { level: 2 })).toHaveText('Face-Centered Cubic');
  await page.getByRole('button', { name: 'BCC', exact: true }).click();
  await expect(info(page).getByRole('heading', { level: 2 })).toHaveText('Body-Centered Cubic');
  await expect(page).toHaveURL(/\?s=bcc$/);
  await page.getByRole('button', { name: 'SC', exact: true }).click();
  await expect(info(page).getByRole('heading', { level: 2 })).toHaveText('Simple Cubic');
  expect(errors).toEqual([]);
});

test('toggles combine in any order (the old Coordination bug)', async ({ page }) => {
  await open(page);
  await page.getByLabel('Clip to unit cell').uncheck();
  await page.getByLabel('Neighbors tool').check();
  await page.getByLabel('Atoms', { exact: true }).uncheck();
  await page.getByLabel('Atoms', { exact: true }).check();
  await page.getByLabel('Neighbors tool').uncheck();
  // exactly the plain hard-sphere view, with nothing left over from the neighbors tool
  await expect(page).toHaveURL(/\?s=fcc&clip=0$/);
  await expect(info(page).locator('.card')).toHaveCount(0);
});

test('a shared link restores the setup', async ({ page }) => {
  await open(page, '?s=sc&sites=cubic&style=sparse&nb=solo');
  await expect(page.getByRole('button', { name: 'SC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Cubic sites')).toBeChecked();
  await expect(page.getByLabel('Square-planar sites')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Sparse' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Solo: hide everything else')).toBeChecked();
});

test.describe('neighbors tool', () => {
  test('a small site behind atoms can be clicked, and clicking again steps to what is behind', async ({ page }) => {
    await open(page, '?s=fcc&sites=oct,tet&nb=1');
    await clickAt(page, [0.75, 0.25, 0.75]);
    await expect(info(page).locator('.card.neighbors')).toContainText('Tetrahedral site at 3/4  1/4  3/4');
    await expect(info(page).locator('.card.neighbors')).toContainText('Surrounded by 4 atoms');

    await clickAt(page, [0.5, 0.5, 0.5]);
    await expect(info(page).locator('.card.neighbors')).toContainText('Octahedral site at 1/2  1/2  1/2');
    await clickAt(page, [0.5, 0.5, 0.5]);
    await expect(info(page).locator('.card.neighbors')).toContainText('Atom at');
  });

  test('Solo hides everything else and is kept in the link', async ({ page }) => {
    await open(page, '?s=fcc&sites=oct&nb=1');
    await page.getByLabel('Solo: hide everything else').check();
    await expect(page).toHaveURL(/nb=solo/);
    await page.getByLabel('Solo: hide everything else').uncheck();
    await expect(page).toHaveURL(/nb=1/);
  });

  test('grow sphere to fit stops at r/R for the BCC octahedral site', async ({ page }) => {
    await open(page, '?s=bcc&sites=oct&nb=1');
    await clickAt(page, [0.5, 0.5, 0]);
    await page.getByRole('button', { name: 'Grow sphere to fit' }).click();
    await expect(info(page).locator('.fit')).toHaveText('It stops at r/R = 0.155, where it touches the 2 closest atoms.', {
      timeout: 5000,
    });
  });
});

test('selecting 2 and 3 atoms gives the direction and the plane', async ({ page }) => {
  await open(page);
  // the face-centred atoms on the three faces turned towards the camera
  await clickAt(page, [1, 0.5, 0.5]);
  await clickAt(page, [0.5, 1, 0.5], { shift: true });
  await expect(info(page).locator('.card.selection')).toContainText('Direction [-1 1 0]');
  await clickAt(page, [0.5, 0.5, 1], { shift: true });
  await expect(info(page).locator('.card.selection')).toContainText('Plane (1 1 1)');
  await expect(page.getByLabel('Show plane')).toBeChecked();
});

test('pinch on the model zooms the model, not the page (Safari gesture events)', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const { viewer } = window as unknown as DevWindow;
    const canvas = viewer.renderer.domElement;
    const distance = () => viewer.camera.position.distanceTo(viewer.controls.target);
    const gesture = (type: string, scale: number) => {
      const e = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { scale });
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const before = distance();
    const prevented = [gesture('gesturestart', 1), gesture('gesturechange', 1.5), gesture('gestureend', 1.5)];
    return { before, after: distance(), prevented };
  });
  expect(result.prevented).toEqual([true, true, true]);
  expect(result.after).toBeCloseTo(result.before / 1.5, 2);
});

test('help opens and closes with Escape', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('hide atoms by position and with the hide tool', async ({ page }) => {
  // the longest test (each step redraws the scene); give it room when many browsers run at once
  test.slow();
  await open(page, '?s=fcc&sites=oct');
  const corners = page.getByRole('button', { name: 'Corners', exact: true });
  await corners.click();
  await expect(corners).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Show all hidden (8)' })).toBeEnabled();
  await expect(page).toHaveURL(/hide=0,0,0;/);

  // the hide tool turns the neighbors tool off, and clicks hide atoms
  await page.getByLabel('Neighbors tool').check();
  await page.getByLabel('Hide tool').check();
  await expect(page.getByLabel('Neighbors tool')).not.toBeChecked();
  await clickAt(page, [1, 0.5, 0.5]);
  await expect(page.getByRole('button', { name: 'Show all hidden (9)' })).toBeVisible();
  // clicking its outline brings it back
  await clickAt(page, [1, 0.5, 0.5]);
  await expect(page.getByRole('button', { name: 'Show all hidden (8)' })).toBeVisible();

  await page.getByRole('button', { name: 'Show all hidden (8)' }).click();
  await expect(page.getByRole('button', { name: 'No hidden atoms' })).toBeDisabled();
  await expect(corners).toHaveAttribute('aria-pressed', 'false');
});

test('Performance mode switches to the simple look and is remembered on this device, not in the link', async ({ page }) => {
  await open(page, '?s=fcc');
  const material = () =>
    page.evaluate(() => {
      const { viewer } = window as unknown as {
        viewer: { scene: { traverse(f: (o: { userData: { pick?: unknown }; material?: { type: string } }) => void): void } };
      };
      let type = '';
      viewer.scene.traverse((o) => {
        if (!type && o.userData.pick && o.material) type = o.material.type;
      });
      return type;
    });
  const toggle = page.getByRole('button', { name: 'Performance mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await material()).toBe('MeshPhysicalMaterial');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await material()).toBe('MeshStandardMaterial');
  await expect(page).toHaveURL(/\?s=fcc$/);

  await page.reload();
  await page.waitForFunction(() => 'viewer' in window);
  await expect(page.getByRole('button', { name: 'Performance mode' })).toHaveAttribute('aria-pressed', 'true');
  expect(await material()).toBe('MeshStandardMaterial');
});
