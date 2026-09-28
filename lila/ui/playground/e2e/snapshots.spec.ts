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

for (const [device, options] of Object.entries(viewports)) {
  const touch = device === 'phone';

  test.describe(device, () => {
    test.use(options);

    test('empty 9×9', async ({ page }) => {
      const { problems } = await openPlayground(page);
      await park(page);
      await expect(page).toHaveScreenshot(`${device}-9x9-empty.png`, { fullPage: true });
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('empty 19×19', async ({ page }) => {
      const { problems } = await openPlayground(page);
      await newGame(page, 19);
      await park(page);
      await expect(page).toHaveScreenshot(`${device}-19x19-empty.png`, { fullPage: true });
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a capture', async ({ page }) => {
      // Moves play at once: confirmation off, whatever the device.
      const { problems } = await openPlayground(page, ConfirmMoves.NEVER);
      for (const move of ['ba', 'aa', 'ab']) await play(page, move, 9, touch);
      await expect(captures(page)).toContainText('Black prisoners: 1');
      await expect(status(page)).toHaveText('White to play.');
      await park(page);
      await expect(page).toHaveScreenshot(`${device}-9x9-capture.png`, { fullPage: true });
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a preview stone waiting for Confirm move', async ({ page }) => {
      const { problems } = await openPlayground(page, ConfirmMoves.ALWAYS);
      await play(page, 'ee', 9, touch);
      await expect(page.getByRole('button', { name: 'Confirm move' })).toBeEnabled();
      await expect(status(page)).toHaveText('Black to play.');
      await park(page);
      await expect(page).toHaveScreenshot(`${device}-9x9-preview.png`, { fullPage: true });
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}
