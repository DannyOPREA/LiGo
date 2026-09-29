// Screenshots of the playground at desktop and phone sizes, compared with the committed baselines in
// __screenshots__/ (unit 2.4). After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/playground/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { expect, test, type Page } from '@playwright/test';

import { ConfirmMoves, captures, newGame, openPlayground, play, status } from './page';

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/** The mouse off the board, so goban draws no hover stone into the picture. */
const park = (page: Page) => page.mouse.move(0, 0);

/**
 * Two pictures: the board alone, held to the config's strict limit (a missing stone fails it), and
 * the whole page for the layout. Buttons are as wide as their text, and Chromium builds measure
 * text a pixel or two differently, so the page picture allows more: a lost button or a moved panel
 * changes thousands of pixels, CI's Chromium moved button edges by ~120.
 */
async function snap(page: Page, name: string): Promise<void> {
  await park(page);
  await expect(page.locator('.playground__board')).toHaveScreenshot(`${name}-board.png`);
  await expect(page).toHaveScreenshot(`${name}-page.png`, { fullPage: true, maxDiffPixels: 600 });
}

for (const [device, options] of Object.entries(viewports)) {
  const touch = device === 'phone';

  test.describe(device, () => {
    test.use(options);

    test('empty 9×9', async ({ page }) => {
      const { problems } = await openPlayground(page);
      await snap(page, `${device}-9x9-empty`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('empty 19×19', async ({ page }) => {
      const { problems } = await openPlayground(page);
      await newGame(page, 19);
      await snap(page, `${device}-19x19-empty`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a capture', async ({ page }) => {
      // Moves play at once: confirmation off, whatever the device.
      const { problems } = await openPlayground(page, ConfirmMoves.NEVER);
      for (const move of ['ba', 'aa', 'ab']) await play(page, move, 9, touch);
      await expect(captures(page)).toContainText('Black prisoners: 1');
      await expect(status(page)).toHaveText('White to play.');
      await snap(page, `${device}-9x9-capture`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a preview stone waiting for Confirm move', async ({ page }) => {
      const { problems } = await openPlayground(page, ConfirmMoves.ALWAYS);
      await play(page, 'ee', 9, touch);
      await expect(page.getByRole('button', { name: 'Confirm move' })).toBeEnabled();
      await expect(status(page)).toHaveText('Black to play.');
      await snap(page, `${device}-9x9-preview`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}
