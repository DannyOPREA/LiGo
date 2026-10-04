// Screenshots of the game page at desktop and phone sizes (unit 9.7), compared with the committed
// baselines in __screenshots__/. After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/round/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { expect, test, type Page } from '@playwright/test';

import { openRound } from './page';

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/**
 * The board alone, held to the config's strict limit (a missing stone fails it), and the whole page
 * for the layout, which allows more: Chromium builds measure text a pixel or two differently (see the
 * playground's snapshots.spec.ts). One move each, so the clocks don't run yet (they start on Black's second move).
 */
async function snap(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0); // no hover stone in the picture
  await expect(page.locator('.round__go-board')).toHaveScreenshot(`${name}-board.png`);
  await expect(page).toHaveScreenshot(`${name}-page.png`, { fullPage: true, maxDiffPixels: 600 });
}

for (const [device, options] of Object.entries(viewports))
  test.describe(device, () => {
    test.use(options);

    test('a game under way, in the default look', async ({ page }) => {
      await openRound(page, { moves: ['ee'] });
      await snap(page, `${device}-game`);
    });

    test('a game under way, in the Night Play board with Glass stones', async ({ page }) => {
      await openRound(page, { moves: ['ee'], board: 'Night Play', stones: 'Glass' });
      await snap(page, `${device}-night-glass`);
    });
  });
