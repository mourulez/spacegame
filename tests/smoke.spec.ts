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

test('fullscreen button matches browser support', async ({ page }) => {
  await page.goto('/');
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  await expect(page.locator('.fullscreen-button')).toHaveCount(supported ? 1 : 0);
});

test('pointer drag shows the joystick and releasing hides it', async ({ page }) => {
  await page.goto('/');
  const { width, height } = page.viewportSize()!;
  const knob = page.locator('.stick-knob');

  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  await page.mouse.move(width / 2 + 40, height / 2 - 20);
  await expect(knob).toBeVisible();

  await page.mouse.up();
  await expect(knob).toBeHidden();
});
