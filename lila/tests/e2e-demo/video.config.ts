// The handoff demo video (unit 9.9 part two, handoff-video.spec.ts): the demo specs' config, running only
// that spec, with every action slowed down so a viewer can follow it. Needs the full stack (`dev/ligo up`).
// Run: `dev/ligo e2e video`, or `pnpm exec playwright test -c tests/e2e-demo/video.config.ts` from lila/.
// The videos land in tests/e2e-demo/video/ (git-ignored).
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { defineConfig } from '@playwright/test';

import demo from './playwright.config';

export default defineConfig({
  ...demo,
  testMatch: 'handoff-video.spec.ts',
  testIgnore: undefined,
  retries: 0,
  outputDir: 'test-results/video-run',
  use: {
    ...demo.use,
    launchOptions: { ...demo.use!.launchOptions, slowMo: 300 },
  },
});
