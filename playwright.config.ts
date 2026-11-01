import { defineConfig, devices } from '@playwright/test';

const PORT = 4174; // not 4173, so it doesn't collide with a running `npm run preview`

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
  },
  // Tests run against the production build, which is what actually ships.
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-phone', use: { ...devices['Pixel 9'] } },
    { name: 'android-phone-landscape', use: { ...devices['Pixel 9 landscape'] } },
    // WebKit is the engine every browser on iPhone/iPad uses; this is the closest to Safari on Windows.
    { name: 'iphone', use: { ...devices['iPhone 17'] } },
    { name: 'iphone-landscape', use: { ...devices['iPhone 17 landscape'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 11)'] } },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 11) landscape'] } },
  ],
});
