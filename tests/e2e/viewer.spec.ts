import { expect, type Page, test } from '@playwright/test';

type Vec3 = [number, number, number];

// the dev build exposes these on window (src/main.ts)
interface DevWindow {
  viewer: {
    scene: { traverse(f: (o: { userData: { pick?: unknown }; material?: { type: string } }) => void): void };
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
  await page.goto(`/${query}`);
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

const inspector = (page: Page) => page.locator('#inspector');
const tool = (page: Page, name: string) => page.locator('#toolbar button.tool', { hasText: name });

test('loads without errors and switches structures', async ({ page }) => {
  const errors = await open(page);
  const title = inspector(page).locator('.facts summary');
  await expect(title).toHaveText('Face-Centered Cubic');
  await page.getByRole('button', { name: 'BCC', exact: true }).click();
  await expect(title).toHaveText('Body-Centered Cubic');
  await expect(page).toHaveURL(/\?s=bcc$/);
  await page.getByRole('button', { name: 'SC', exact: true }).click();
  await expect(title).toHaveText('Simple Cubic');
  expect(errors).toEqual([]);
});

test('exactly one tool is active, chosen by button or key', async ({ page }) => {
  await open(page);
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
  await tool(page, 'Neighbors').click();
  await expect(tool(page, 'Neighbors')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('h');
  await expect(tool(page, 'Hide')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#status')).toContainText('Click an atom to hide it');
  await page.keyboard.press('Escape');
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
});

test('toggles combine in any order (the old Coordination bug)', async ({ page }) => {
  await open(page);
  await page.getByLabel('Clip to unit cell').uncheck();
  await tool(page, 'Neighbors').click();
  await page.getByLabel('Atoms', { exact: true }).uncheck();
  await page.getByLabel('Atoms', { exact: true }).check();
  await tool(page, 'Select').click();
  // exactly the plain hard-sphere view, with nothing left over from the neighbors tool
  await expect(page).toHaveURL(/\?s=fcc&clip=0$/);
  await expect(inspector(page).locator('.card.focus')).toHaveCount(0);
});

test('undo and redo, from the buttons and the keyboard', async ({ page }) => {
  await open(page);
  await page.getByLabel('Atoms', { exact: true }).uncheck();
  // tool keys are ignored while a form control has focus
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/atoms=0&tool=hide/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page).toHaveURL(/\?s=fcc&atoms=0$/);
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await expect(page).toHaveURL(/\?s=fcc$/);
  await expect(page.getByRole('button', { name: '↶ Undo' })).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page).toHaveURL(/\?s=fcc&atoms=0$/);
  await page.locator('#toolbar').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page).toHaveURL(/\?s=fcc$/);
});

test('a shared link restores the setup (including links from before the tool bar)', async ({ page }) => {
  await open(page, '?s=sc&sites=cubic&style=sparse&nb=solo');
  await expect(page.getByRole('button', { name: 'SC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Cubic sites')).toBeChecked();
  await expect(page.getByLabel('Square-planar sites')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Sparse' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, 'Neighbors')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Solo: hide everything else')).toBeChecked();
  // it's rewritten in the new format
  await expect(page).toHaveURL(/tool=neighbors&solo=1/);
});

test.describe('neighbors tool', () => {
  test('a small site behind atoms can be clicked, and clicking again steps to what is behind', async ({ page }) => {
    await open(page, '?s=fcc&sites=oct,tet&tool=neighbors');
    const card = inspector(page).locator('.card.neighbors');
    await clickAt(page, [0.75, 0.25, 0.75]);
    await expect(card).toContainText('Tetrahedral site at 3/4  1/4  3/4');
    await expect(card).toContainText('Surrounded by 4 atoms');

    await clickAt(page, [0.5, 0.5, 0.5]);
    await expect(card).toContainText('Octahedral site at 1/2  1/2  1/2');
    await clickAt(page, [0.5, 0.5, 0.5]);
    await expect(card).toContainText('Atom at');
  });

  test('Solo hides everything else and is kept in the link', async ({ page }) => {
    await open(page, '?s=fcc&sites=oct&tool=neighbors');
    await page.getByLabel('Solo: hide everything else').check();
    await expect(page).toHaveURL(/solo=1/);
    await page.getByLabel('Solo: hide everything else').uncheck();
    await expect(page).not.toHaveURL(/solo=1/);
  });

  test('grow sphere to fit stops at r/R for the BCC octahedral site', async ({ page }) => {
    await open(page, '?s=bcc&sites=oct&tool=neighbors');
    await clickAt(page, [0.5, 0.5, 0]);
    await page.getByRole('button', { name: 'Grow sphere to fit' }).click();
    await expect(inspector(page).locator('.fit')).toHaveText(
      'It stops at r/R = 0.155 at this exact point, where it touches the 2 closest atoms. Moved into a neighbouring site, a bigger sphere fits.',
      { timeout: 5000 },
    );
  });

  test('the BCC octahedral site is described as a distorted doorway', async ({ page }) => {
    await open(page, '?s=bcc&sites=oct&tool=neighbors');
    await expect(inspector(page).locator('table.sites')).toContainText('6 (2 + 4)');
    await expect(inspector(page).locator('table.sites')).toContainText('doorway');
    await clickAt(page, [0.5, 0.5, 0]);
    const card = inspector(page).locator('.card.neighbors');
    await expect(card).toContainText('This is a doorway, not a pocket.');
    await expect(card).toContainText('two tetrahedral sites, each 0.250a away (r/R = 0.291)');
    await expect(card).toContainText('carbon still sits in octahedral sites');
  });
});

test('selecting atoms offers a direction and a plane; nothing is added until chosen', async ({ page }) => {
  await open(page);
  const card = inspector(page).locator('.card.selection');
  // the face-centred atoms on the three faces turned towards the camera
  await clickAt(page, [1, 0.5, 0.5]);
  await clickAt(page, [0.5, 1, 0.5], { shift: true });
  await expect(card).toContainText('Direction [1̅ 1 0]');
  await expect(inspector(page)).toContainText('None yet.');
  await card.getByRole('button', { name: 'Add this direction' }).click();
  await expect(inspector(page).locator('ul.constructions')).toContainText('Direction [1̅ 1 0]');

  await clickAt(page, [0.5, 0.5, 1], { shift: true });
  await expect(card).toContainText('Plane through them: (1 1 1)');
  await card.getByRole('button', { name: 'Add and slice' }).click();
  await expect(tool(page, 'Plane')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/slice=section/);
});

test('the Plane tool adds a plane and slices; the status line says so in other tools', async ({ page }) => {
  await open(page);
  await page.keyboard.press('p');
  await page.locator('#tool-options').getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('#tool-options').getByRole('button', { name: 'Section' }).click();
  await expect(page).toHaveURL(/c=p,1,1,1,0.5774&plane=1&slice=section,0/);
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL(/c=p,1,1,1,0.5974/);

  await page.keyboard.press('s');
  const status = page.locator('#status');
  await expect(status).toContainText('Slicing with (1 1 1) · section');
  await status.getByRole('button', { name: 'Stop slicing' }).click();
  await expect(status).not.toContainText('Slicing');
  await expect(page).not.toHaveURL(/slice=/);
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
  await tool(page, 'Hide').click();
  const corners = page.getByRole('button', { name: 'Corners', exact: true });
  await corners.click();
  await expect(corners).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Show all hidden (8)' })).toBeEnabled();
  // both ways back are red while atoms are hidden
  await expect(page.getByRole('button', { name: 'Show all hidden (8)' })).toHaveClass(/danger/);
  await expect(page.getByRole('button', { name: 'Show all hidden atoms' })).toHaveClass(/danger/);
  await expect(page).toHaveURL(/hide=0,0,0;/);

  await clickAt(page, [1, 0.5, 0.5]);
  await expect(page.getByRole('button', { name: 'Show all hidden (9)' })).toBeVisible();
  // clicking its outline brings it back
  await clickAt(page, [1, 0.5, 0.5]);
  await expect(page.getByRole('button', { name: 'Show all hidden (8)' })).toBeVisible();

  await page.getByRole('button', { name: 'Show all hidden (8)' }).click();
  await expect(page.getByRole('button', { name: 'No hidden atoms' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Show all hidden atoms' })).not.toHaveClass(/danger/);
  await expect(corners).toHaveAttribute('aria-pressed', 'false');
});

test('Performance mode switches to the simple look and is remembered on this device, not in the link', async ({ page }) => {
  await open(page, '?s=fcc');
  const material = () =>
    page.evaluate(() => {
      const { viewer } = window as unknown as DevWindow;
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
  // not an undo step
  await expect(page.getByRole('button', { name: '↶ Undo' })).toBeDisabled();

  await page.reload();
  await page.waitForFunction(() => 'viewer' in window);
  await expect(page.getByRole('button', { name: 'Performance mode' })).toHaveAttribute('aria-pressed', 'true');
  expect(await material()).toBe('MeshStandardMaterial');
});

test('holding ↑ moves the plane as one undo step', async ({ page }) => {
  await open(page, '?s=fcc&tool=plane&c=p,1,0,0,0.3&plane=1&slice=section,0');
  for (let i = 0; i < 5; i++) await page.keyboard.down('ArrowUp');
  await page.keyboard.up('ArrowUp');
  await expect(page).toHaveURL(/c=p,1,0,0,0.4&/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page).toHaveURL(/c=p,1,0,0,0.3&/);
});

test('keys do nothing to the model while Help is open', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.keyboard.press('h');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
});

test('the neighbors card follows the style', async ({ page }) => {
  await open(page, '?s=fcc&tool=neighbors');
  const card = inspector(page).locator('.card.neighbors');
  await expect(card).toContainText('see-through');
  await page.getByRole('button', { name: 'Sparse' }).click();
  await expect(card).not.toContainText('see-through');
});

test('"Add to selection" picks several objects without Shift, for touch screens', async ({ page }) => {
  await open(page);
  const card = inspector(page).locator('.card.selection');
  await page.locator('#tool-options').getByLabel('Add to selection').check();
  await clickAt(page, [1, 0.5, 0.5]);
  await clickAt(page, [0.5, 1, 0.5]);
  await expect(card).toContainText('Selected (2)');
  // clicking empty space keeps the selection while adding; the card's button clears it
  await page.mouse.click(30, 870);
  await expect(card).toContainText('Selected (2)');
  await card.getByRole('button', { name: 'Clear selection' }).click();
  await expect(card).toHaveCount(0);
  // the choice is kept when the tool's options are rebuilt
  await page.keyboard.press('p');
  await expect(page.locator('#tool-options').getByLabel('Add to selection')).toBeChecked();
});

test('dragging a slider for a long time keeps the address up to date (Safari limits address changes)', async ({ page }) => {
  const errors = await open(page);
  // 150 updates at once: more than Safari's 100 address changes per 10 s, which used to throw
  await page.evaluate(() => {
    const { store } = window as unknown as { store: { preview(p: object): void; commitPreview(): void } };
    for (let i = 0; i < 150; i++) store.preview({ opacity: 0.2 + (i % 80) / 100 });
    store.preview({ opacity: 0.5 });
    store.commitPreview();
  });
  await expect(page).toHaveURL(/op=0\.5/);
  expect(errors).toEqual([]);
});

test('the facts panel shows its formulas', async ({ page }) => {
  await open(page);
  const facts = inspector(page).locator('.facts');
  await expect(facts.locator('.katex')).toHaveCount(7);
  await expect(facts.locator('.katex-display')).toHaveCount(4);
  await expect(facts).toContainText('Atomic packing factor');
});

// (page loads are slow on CI, where Chromium draws WebGL in software, so each of these loads the page only once)
test('the theme can be switched, and the choice is saved on this device', async ({ page }) => {
  const errors = await open(page);
  const html = page.locator('html');
  const theme = page.getByLabel('Theme', { exact: true });
  const saved = () => page.evaluate(() => localStorage.getItem('crystalview.theme'));
  await expect(html).not.toHaveAttribute('data-theme');
  await theme.selectOption('skeuomorphic');
  await expect(html).toHaveAttribute('data-theme', 'skeuomorphic');
  expect(await saved()).toBe('skeuomorphic');
  await theme.selectOption('standard');
  await expect(html).not.toHaveAttribute('data-theme');
  expect(await saved()).toBe('standard');
  expect(errors).toEqual([]);
});

// "ios6" was the theme's first name
for (const saved of ['skeuomorphic', 'ios6']) {
  test(`a saved theme choice ("${saved}") is used when the page opens`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('crystalview.theme', value), saved);
    const errors = await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'skeuomorphic');
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('skeuomorphic');
    expect(errors).toEqual([]);
  });
}

test('changing the setup reuses the compiled shaders and still releases the old scene', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { store, viewer } = window as unknown as {
      store: { set(p: object): void; preview(p: object): void; commitPreview(): void };
      viewer: { renderer: { info: { programs: { id: number }[]; memory: { geometries: number } } } };
    };
    const { info } = viewer.renderer;
    const drawn = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const programs = () => info.programs.map((p) => p.id).join();
    store.set({ opacity: 0.5 });
    await drawn();
    const before = { programs: programs(), geometries: info.memory.geometries };
    // what dragging the opacity slider does
    for (const opacity of [0.45, 0.4, 0.35]) {
      store.preview({ opacity });
      await drawn();
    }
    store.preview({ opacity: 0.5 });
    store.commitPreview();
    await drawn();
    return { before, after: { programs: programs(), geometries: info.memory.geometries } };
  });
  // recompiling would replace the programs with new ones
  expect(result.after.programs).toBe(result.before.programs);
  expect(result.after.geometries).toBe(result.before.geometries);
});

test('going back to a tool reuses the shaders compiled for it', async ({ page }) => {
  await open(page);
  const programs = await page.evaluate(async () => {
    const { store, viewer } = window as unknown as {
      store: { setTool(t: string): void };
      viewer: { renderer: { info: { programs: { id: number }[] } } };
    };
    const drawn = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ids = () =>
      viewer.renderer.info.programs
        .map((p) => p.id)
        .sort((a, b) => a - b)
        .join();
    // Neighbors has shaders of its own (its rim glow, no clipping to the cell)
    store.setTool('neighbors');
    await drawn();
    store.setTool('select');
    await drawn();
    const seen = ids();
    store.setTool('neighbors');
    await drawn();
    store.setTool('select');
    await drawn();
    return { seen, after: ids() };
  });
  expect(programs.after).toBe(programs.seen);
});
