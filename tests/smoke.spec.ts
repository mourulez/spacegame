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

test('shows a full shield bar on screen in landscape', async ({ page }) => {
  await page.goto('/');
  const shield = page.locator('.hud-shield');
  await expect(shield).toHaveAttribute('data-value', '5');
  const { width, height } = page.viewportSize()!;
  test.skip(height > width, 'portrait shows the rotate prompt over the game');
  await expect(shield).toBeVisible();
  await expect(shield.locator('.hud-shield-cell.full')).toHaveCount(5);
  const box = (await shield.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
});

test('enemy fire hits a ship that stays in the line of fire', async ({ page }) => {
  test.slow(); // waits for waves to come and fire, at whatever speed the emulated device renders
  await page.goto('/');
  const shield = page.locator('.hud-shield');
  await expect(shield).toHaveAttribute('data-value', '5');
  // Bullets are aimed at where the ship is when fired: a ship held still at rest gets hit.
  await expect.poll(async () => Number(await shield.getAttribute('data-value')), { timeout: 45_000 }).toBeLessThan(5);
});
