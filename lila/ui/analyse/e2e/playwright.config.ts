// The analysis board's browser tests (unit 7.4): moves, variations, SGF and setup mode on the built
// page, and screenshots at desktop and phone sizes against committed baselines. Like the
// playground's tests (ui/playground/e2e), they load the built page from lila/public through
// Playwright's request routing, so no lila server, Mongo or Redis is needed and they run in CI and
// cloud sessions. Run `ui/build` first.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cloudChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.LIGO_CHROMIUM || (existsSync(cloudChromium) ? cloudChromium : undefined);

export default defineConfig({
  testDir: '.',
  forbidOnly: !!process.env.CI,
  // A retry would hide a flaky screenshot; a failure here is looked at, not re-rolled.
  retries: 0,
  outputDir: 'test-results',
  // On CI, `github` also posts each failure as an annotation on the check, so it can be read without
  // downloading the report.
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  // One baseline for every machine, as the playground's (ui/playground/e2e/playwright.config.ts).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
      stylePath: fileURLToPath(new URL('./screenshot.css', import.meta.url)),
    },
  },
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath },
  },
});
