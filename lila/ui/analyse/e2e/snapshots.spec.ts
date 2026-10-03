// Screenshots of the analysis board at desktop and phone sizes, compared with the committed
// baselines in __screenshots__/ (unit 7.4). After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/analyse/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { expect, test, type Page } from '@playwright/test';

import { boardMoves, moveList, openAnalysis, place, play, position } from './page';

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/** A short 9×9 game with a side line and a comment, as a player would paste it. */
const GAME =
  '(;GM[1]FF[4]SZ[9]KM[7]RU[Chinese]PB[Black]PW[White]' +
  ';B[ee]C[The centre.];W[cc];B[gc];W[cg](;B[gg];W[eg];B[ec])(;B[ce];W[dc]))';

/** The mouse off the board, so goban draws no hover stone into the picture. */
const park = (page: Page) => page.mouse.move(0, 0);

/**
 * Two pictures, as the playground's (ui/playground/e2e/snapshots.spec.ts): the board alone at the
 * config's strict limit (a missing stone fails it), and the whole page for the layout, with the
 * allowance for Chromium builds measuring button text a pixel or two differently.
 */
async function snap(page: Page, name: string): Promise<void> {
  await park(page);
  await expect(page.locator('.analyse__board')).toHaveScreenshot(`${name}-board.png`);
  await expect(page).toHaveScreenshot(`${name}-page.png`, { fullPage: true, maxDiffPixels: 600 });
}

for (const [device, options] of Object.entries(viewports)) {
  const touch = device === 'phone';

  test.describe(device, () => {
    test.use(options);

    test('an empty 19×19 board', async ({ page }) => {
      const { problems } = await openAnalysis(page);
      await snap(page, `${device}-19x19-empty`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a 9×9 record with a side line, on its fifth move', async ({ page }) => {
      const { problems } = await openAnalysis(page);
      await page.locator('#analyse-sgf').fill(GAME);
      await page.locator('.analyse__sgf-actions').getByText('Load SGF', { exact: true }).click();
      await expect(moveList(page)).toHaveCount(9);
      await moveList(page).filter({ hasText: 'G3' }).click();
      await boardMoves(page, 5);
      await snap(page, `${device}-9x9-record`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a refused move on 13×13, with its reason', async ({ page }) => {
      const { problems } = await openAnalysis(page);
      await page.locator('#analyse-sgf').fill('(;GM[1]FF[4]SZ[13];B[ab];W[aa];B[ba])');
      await page.locator('.analyse__sgf-actions').getByText('Load SGF', { exact: true }).click();
      await page.locator('.analyse__controls .jumps button').last().click();
      await boardMoves(page, 3);
      await expect.poll(async () => (await position(page))[0]).toMatch(/^\.X/);
      await play(page, 'aa', touch);
      await expect(page.locator('.analyse__go-notice')).toBeVisible();
      await snap(page, `${device}-13x13-refused`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('setup mode with stones of both colours', async ({ page }) => {
      const { problems } = await openAnalysis(page);
      await page.getByRole('button', { name: 'New position' }).click();
      await page.getByRole('button', { name: '9×9' }).click();
      await place(page, 9, ['cc', 'gg', 'gc'], touch);
      await page.getByRole('button', { name: 'White stones' }).click();
      await place(page, 9, ['cg', 'ee'], touch);
      await snap(page, `${device}-setup`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}
