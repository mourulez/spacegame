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

test('shield and barrel roll meters sit in the bottom corners in landscape', async ({ page }) => {
  await page.goto('/');
  const shield = page.locator('.hud-shield');
  const roll = page.locator('.hud-roll');
  await expect(shield).toHaveAttribute('data-value', '5');
  await expect(roll).toHaveAttribute('data-ready', 'true');
  const { width, height } = page.viewportSize()!;
  test.skip(height > width, 'portrait shows the rotate prompt over the game');
  await expect(shield).toBeVisible();
  await expect(roll).toBeVisible();
  await expect(shield.locator('.hud-shield-cell.full')).toHaveCount(5);
  const left = (await shield.boundingBox())!;
  const right = (await roll.boundingBox())!;
  for (const box of [left, right]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.y).toBeGreaterThan(height * 0.75);
  }
  expect(left.x + left.width).toBeLessThan(width / 2);
  expect(right.x).toBeGreaterThan(width / 2);
});

test('Q and E barrel roll, and the roll recharges', async ({ page }) => {
  await page.goto('/');
  const roll = page.locator('.hud-roll');
  await expect(page.locator('.hud-fps')).toHaveText(/\d+ fps/);
  await expect(roll).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('KeyQ');
  await expect(roll).toHaveAttribute('data-ready', 'false');
  await expect(roll).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await page.keyboard.press('KeyE');
  await expect(roll).toHaveAttribute('data-ready', 'false');
});

test('a quick swipe in the left half that lifts the finger barrel rolls, a drag does not', async ({ page }) => {
  await page.goto('/');
  const roll = page.locator('.hud-roll');
  await expect(page.locator('.hud-fps')).toHaveText(/\d+ fps/);
  await expect(roll).toHaveAttribute('data-ready', 'true');

  // Touch pointer events dispatched in the page, so their timing is the test's own and
  // not tied to how fast the emulated device renders (browsers deliver moves once per frame).
  // `holdMs`: how long the finger stays down after moving, before lifting.
  const touch = (stepHeights: number, stepMs: number, holdMs: number) =>
    page.evaluate(
      async ({ stepHeights, stepMs, holdMs }) => {
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
        canvas.setPointerCapture = () => {}; // synthetic pointers cannot be captured
        const { width, height } = canvas.getBoundingClientRect();
        const send = (type: string, x: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: height * 0.6, bubbles: true }),
          );
        let x = width * 0.15;
        send('pointerdown', x);
        for (let i = 0; i < 4; i++) {
          if (stepMs > 0) await wait(stepMs);
          x += height * stepHeights;
          send('pointermove', x);
        }
        if (holdMs > 0) await wait(holdMs);
        send('pointerup', x);
      },
      { stepHeights, stepMs, holdMs },
    );

  await touch(0.03, 120, 0); // a slow drag
  await touch(0.06, 0, 400); // a fast move that stays on the screen
  await page.waitForTimeout(500);
  await expect(roll).toHaveAttribute('data-ready', 'true');
  await touch(0.06, 0, 0); // a swipe: fast, and lifted at once
  await expect(roll).toHaveAttribute('data-ready', 'false');
});

test('enemy fire hits a ship that stays in the line of fire', async ({ page }) => {
  test.slow(); // waits for waves to come and fire, at whatever speed the emulated device renders
  await page.goto('/');
  const shield = page.locator('.hud-shield');
  await expect(shield).toHaveAttribute('data-value', '5');
  // Bullets are aimed at where the ship is when fired: a ship held still at rest gets hit.
  await expect.poll(async () => Number(await shield.getAttribute('data-value')), { timeout: 45_000 }).toBeLessThan(5);
});
