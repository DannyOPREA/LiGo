// The playground's browser tests (unit 2.4): screenshots against committed baselines, and a scripted
// game played through the page. They load the built page from lila/public (run `ui/build` first)
// through Playwright's request routing, so no lila server, Mongo or Redis is needed; that keeps
// them runnable in CI and in cloud sessions, where the full site can't start.
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
  // Next to this file, not next to package.json (Playwright's default); CI uploads both on failure.
  outputDir: 'test-results',
  // On CI, `github` also posts each failure as an annotation on the check, so it can be read without
  // downloading the report.
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  // One baseline for every machine: no browser or platform in the file name, so CI and a
  // contributor compare against the same picture (the tolerance below absorbs anti-aliasing).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      // Anti-aliased edges and hinting differ a little between Chromium builds and machines, and
      // the comparison skips anti-aliased pixels. A count, not a share of the page: a stone
      // painted out of the 1280×800 capture picture changed ~1,800 pixels, under 0.2% of it. The
      // smallest thing that matters, a stone on a phone's 19×19 board, is ~200 pixels.
      maxDiffPixels: 100,
      threshold: 0.2,
      stylePath: fileURLToPath(new URL('./screenshot.css', import.meta.url)),
    },
  },
  use: {
    browserName: 'chromium',
    launchOptions: {
      executablePath,
      // Notifications go to Chromium's own message centre, not the desktop's notification service over
      // D-Bus. CI's runner has no such service; while Chromium 153 waits on it, a shown notification
      // isn't "displayed" yet, so getNotifications() hides it and the push tests failed (PRs #70, #71,
      // #79). The feature was renamed from NativeNotifications to SystemNotifications; both are listed.
      args: ['--disable-features=NativeNotifications,SystemNotifications'],
    },
  },
});
