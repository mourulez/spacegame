import { defineConfig, devices } from '@playwright/test';

const PORT = 4174; // not 4173, so it doesn't collide with a running `npm run preview`
const VIEWER_PORT = 4175;

// Game tests run on every device; the viewer and repo checks have their own projects.
const GAME_ONLY = { testIgnore: ['viewer.spec.ts', 'boundaries.spec.ts'] };

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  // Headless browsers render WebGL in software: more than a few game pages at once
  // starve each other of CPU until screenshots time out.
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
  },
  // Tests run against the production builds, which are what actually ship.
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: false,
    },
    {
      // The game's build above already typechecks everything.
      command: `npx vite build -c vite.viewer.config.ts && npx vite preview -c vite.viewer.config.ts --port ${VIEWER_PORT} --strictPort`,
      url: `http://localhost:${VIEWER_PORT}/`,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, ...GAME_ONLY },
    { name: 'android-phone', use: { ...devices['Pixel 9'] }, ...GAME_ONLY },
    { name: 'android-phone-landscape', use: { ...devices['Pixel 9 landscape'] }, ...GAME_ONLY },
    // WebKit is the engine every browser on iPhone/iPad uses; this is the closest to Safari on Windows.
    { name: 'iphone', use: { ...devices['iPhone 17'] }, ...GAME_ONLY },
    { name: 'iphone-landscape', use: { ...devices['iPhone 17 landscape'] }, ...GAME_ONLY },
    { name: 'ipad', use: { ...devices['iPad (gen 11)'] }, ...GAME_ONLY },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 11) landscape'] }, ...GAME_ONLY },
    {
      name: 'viewer',
      testMatch: 'viewer.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${VIEWER_PORT}/` },
    },
    // No browser: checks that the game, the viewer and the render libraries only import what they may.
    { name: 'repo', testMatch: 'boundaries.spec.ts' },
  ],
});
