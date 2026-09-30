// The round page's browser tests (unit 3.18): a Go game played through the built page against a
// stand-in for lila's game socket. Like the playground's tests (ui/playground/e2e), they load the
// built page from lila/public through Playwright's request routing, so no lila server, Mongo or
// Redis is needed and they run in CI and cloud sessions. Run `ui/build` first.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const cloudChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.LIGO_CHROMIUM || (existsSync(cloudChromium) ? cloudChromium : undefined);

export default defineConfig({
  testDir: '.',
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: 'test-results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath },
  },
});
