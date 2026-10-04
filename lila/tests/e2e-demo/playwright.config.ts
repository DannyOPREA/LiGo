// The Phase 3 demo (unit 3.20): two real browsers play a casual 9x9 Fischer game on the running
// stack (lila + lila-ws + Mongo + Redis), desktop and phone. The Phase 5 demo (unit 5.8,
// phase5-demo.spec.ts): rated handicap games between new ranked players, and a guest's casual game.
// The Phase 6 demo (unit 6.10, phase6-demo.spec.ts): the lobby's one click, pool, table and profile.
// Unlike the ui/*/e2e suites it needs the full server: `dev/ligo up` first. BASE_URL: native mode
// is :9663 (default), docker mode :8080.
// Run: `pnpm exec playwright test -c tests/e2e-demo/playwright.config.ts` from lila/.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const cloudChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.LIGO_CHROMIUM || (existsSync(cloudChromium) ? cloudChromium : undefined);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // the handoff video (unit 9.9) runs with its own config, video.config.ts
  testIgnore: 'handoff-video.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one game at a time: a player can only be in one live game
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:9663',
    browserName: 'chromium',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // lila files "HeadlessChrome" under crawlers (HttpFilter) and shows crawlers no challenge page
    // (Round.watcher 404s): use a desktop Chrome user agent, as a real visitor sends (unit 5.8).
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 }, userAgent: devices['Desktop Chrome'].userAgent },
    },
    {
      name: 'phone',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent: devices['Pixel 7'].userAgent,
      },
    },
  ],
});
