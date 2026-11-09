import { expect, test } from '@playwright/test';

test('viewer boots with render-next, its settings work, and it stays offline', async ({ page, baseURL }) => {
  test.setTimeout(90_000); // shader variants, compiled by a software renderer
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:')) externalRequests.push(url);
  });

  await page.goto('./');
  await expect(page.locator('#status')).toHaveText(/triángulos/);
  // The ground, the model, its outline and its shadow.
  await expect(page.locator('#hud')).toHaveText(/\b4 draw calls/);
  await page.screenshot({ path: 'screenshots/viewer.png' });

  // A setting that recompiles the shaders, and one that hides the outline.
  await page.getByRole('button', { name: '3 tonos' }).click();
  await expect(page.getByRole('button', { name: '3 tonos' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Contorno', { exact: true }).uncheck();
  await expect(page.locator('#hud')).toHaveText(/\b3 draw calls/);

  // The other ground shadow, then no ground at all (and so no shadow).
  await page.getByRole('button', { name: 'Elipse' }).click();
  await expect(page.locator('#hud')).toHaveText(/\b3 draw calls/);
  await page.getByLabel('Suelo', { exact: true }).uncheck();
  await expect(page.locator('#hud')).toHaveText(/\b1 draw calls/);
  await page.getByLabel('Suelo', { exact: true }).check();

  // Settings the sample model has no data for are greyed out.
  await expect(page.getByLabel('Sombra pintada')).toBeDisabled();

  await page.getByRole('button', { name: 'Valores por defecto' }).click();
  await expect(page.getByRole('button', { name: '2 tonos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hud')).toHaveText(/\b4 draw calls/);

  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('the test asset loads with everything it carries, and every setting compiles', async ({ page }) => {
  test.setTimeout(90_000); // many shader variants, compiled by a software renderer
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('./?model=samples/demo-ship/demo-ship.glb');
  await expect(page.locator('#status')).toHaveText(/7 zonas · 2 emisivos · 1 calcomanías · 2 toberas · 2 cañones/, { timeout: 20_000 });
  // The ground, then the whole ship in one mesh, its outline and its shadow; and 8 small passes of bloom.
  await expect(page.locator('#hud')).toHaveText(/\b12 draw calls/);
  for (const label of ['Sombra pintada', 'Metal falso', 'Grosor pintado', 'Aristas', 'Trazos', 'Áreas emisivas', 'Calcomanías']) {
    await expect(page.getByLabel(label, { exact: true })).toBeEnabled();
  }
  await page.screenshot({ path: 'screenshots/viewer-demo-ship.png' });

  // Variants of the shaders: every switch flipped, then 3 tones and a flat outline.
  await page.getByLabel('Sombra pintada').check();
  await page.getByLabel('Áreas emisivas').uncheck();
  await page.getByLabel('Calcomanías').uncheck();
  await page.getByLabel('Trazos', { exact: true }).uncheck();
  await page.getByLabel('Aristas', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Casco' }).click();
  await page.getByRole('button', { name: '3 tonos' }).click();
  await page.getByRole('button', { name: 'Uniforme' }).click();
  await expect(page.locator('#hud')).toHaveText(/\b4 draw calls/); // no emissive areas, so no bloom
  await page.waitForTimeout(300); // let a few frames render with the new programs

  // The four views: effects and wireframe, each on or off. Without effects: the ground and the bare model.
  const hud = page.locator('#hud');
  await page.getByRole('button', { name: 'Wireframe' }).click();
  await expect(hud).toHaveText(/\b5 draw calls/);
  await page.getByRole('button', { name: 'Efectos' }).click();
  await expect(hud).toHaveText(/\b3 draw calls/);
  await page.getByRole('button', { name: 'Wireframe' }).click();
  await expect(hud).toHaveText(/\b2 draw calls/);
  await page.screenshot({ path: 'screenshots/viewer-demo-ship-plain.png' });
  await page.getByRole('button', { name: 'Efectos' }).click();
  await expect(hud).toHaveText(/\b4 draw calls/);

  expect(errors).toEqual([]);
});

test('a model exported from Blender carries its edge lines', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // viewer/samples/edge-test: a cube and a cylinder, exported by npm run asset:blend.
  await page.goto('./?model=samples/edge-test/edge-test.glb');
  await expect(page.locator('#status')).toHaveText(/72 triángulos/, { timeout: 20_000 });
  await expect(page.getByLabel('Aristas', { exact: true })).toBeEnabled();
  await expect(page.locator('#hud')).toHaveText(/\b4 draw calls/);
  await page.screenshot({ path: 'screenshots/viewer-edge-test.png' });
  expect(errors).toEqual([]);
});
