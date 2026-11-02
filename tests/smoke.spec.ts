import { expect, test } from '@playwright/test';

test('boots, runs the loop and stays offline', async ({ page, baseURL }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:')) externalRequests.push(url);
  });

  await page.goto('/');

  // The FPS counter only gets text once frames have actually been rendered.
  await expect(page.locator('.hud-fps')).toHaveText(/\d+ fps/);

  const canvas = await page.locator('#game').boundingBox();
  const viewport = page.viewportSize()!;
  expect(canvas).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  await page.screenshot({ path: `screenshots/${testInfo.project.name}.png` });

  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('cumulus clouds prototype renders without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/?clouds=blobs');
  await expect(page.locator('.hud-fps')).toHaveText(/\d+ fps/);
  await page.screenshot({ path: `screenshots/${testInfo.project.name}-clouds.png` });

  expect(errors).toEqual([]);
});

test('fullscreen button matches browser support', async ({ page }) => {
  await page.goto('/');
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  await expect(page.locator('.fullscreen-button')).toHaveCount(supported ? 1 : 0);
});

test('portrait shows the rotate prompt, landscape shows the game', async ({ page }) => {
  await page.goto('/');
  const { width, height } = page.viewportSize()!;
  const prompt = page.locator('.rotate-prompt');
  if (height > width) {
    await expect(prompt).toBeVisible();
  } else {
    await expect(prompt).toBeHidden();
  }
});
