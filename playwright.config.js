// End-to-end tests for the desktop app. `desktop` drives the built Electron
// app (run `npm run build` first); `web` is a normal browser for the pages the
// app pairs with (sttm-web /sync and /control, the OBS overlay page).
//
//   npx playwright test                       everything
//   npx playwright test --grep @fast          the quick set CI runs on every PR
//   npx playwright test --project desktop     only the app
//
// On Linux without a display: xvfb-run -a npx playwright test
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e/tests',
  outputDir: 'e2e/results/artifacts',
  globalSetup: './e2e/global-setup.js',
  timeout: 90000,
  expect: { timeout: 10000 },
  // One Electron app at a time: they share the keyboard focus of the display.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/results.json' }],
    ['html', { outputFolder: 'e2e/results/html', open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /.*\.desktop\.spec\.js/,
    },
    {
      name: 'web',
      testMatch: /.*\.web\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
