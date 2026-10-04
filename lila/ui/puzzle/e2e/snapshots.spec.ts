// Screenshots of the trainer page at desktop and phone sizes, compared with the committed baselines
// in __screenshots__/ (unit 8.7). After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/puzzle/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { expect, test, type Page } from '@playwright/test';

import { feedback, openPuzzle, play } from './page';
import { centreThree, pyramidFour, rightFirst, straightThree, wrongFirst } from './puzzles';

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/**
 * Two pictures, as the analysis board's (ui/analyse/e2e/snapshots.spec.ts): the board alone at the
 * config's strict limit (a missing stone fails it), and the whole page for the layout, with the
 * allowance for Chromium builds measuring button text a pixel or two differently.
 */
async function snap(page: Page, name: string): Promise<void> {
  // The mouse off the board, so goban draws no hover stone into the picture.
  await page.mouse.move(0, 0);
  await expect(page.locator('.puzzle__board')).toHaveScreenshot(`${name}-board.png`);
  await expect(page).toHaveScreenshot(`${name}-page.png`, { fullPage: true, maxDiffPixels: 600 });
}

for (const [device, options] of Object.entries(viewports)) {
  const touch = device === 'phone';

  test.describe(device, () => {
    test.use(options);

    test('the straight three in the corner, to play', async ({ page }) => {
      const { problems } = await openPuzzle(page, { puzzle: straightThree, rating: 1500 });
      await snap(page, `${device}-straight-three-play`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a wrong move, with White’s refutation on the board', async ({ page }) => {
      const { problems } = await openPuzzle(page, { puzzle: straightThree, rating: 1500, next: centreThree });
      await play(page, wrongFirst(straightThree), touch);
      if (touch) await play(page, wrongFirst(straightThree), true);
      await expect(feedback(page)).toHaveClass(/fail/);
      await expect(page.locator('.puzzle__side__user__rating bad.rp')).toBeVisible();
      await snap(page, `${device}-straight-three-wrong`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('solved, with the rating change and the session strip', async ({ page }) => {
      const { problems } = await openPuzzle(page, { puzzle: straightThree, rating: 1500, next: centreThree });
      await play(page, rightFirst(straightThree), touch);
      if (touch) await play(page, rightFirst(straightThree), true);
      await expect(feedback(page)).toHaveClass(/after/);
      await expect(page.locator('.puzzle__side__user__rating good.rp')).toBeVisible();
      await snap(page, `${device}-straight-three-solved`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a corner puzzle with a three-move solution, on its second move', async ({ page }) => {
      const { problems } = await openPuzzle(page, { puzzle: pyramidFour, rating: 1500 });
      await expect(feedback(page).locator('.view_solution')).toHaveClass(/show/, { timeout: 8000 });
      await feedback(page).getByRole('button', { name: 'View the solution' }).click();
      await page.locator('.puzzle__moves move').nth(1).click();
      await expect(page.locator('.puzzle__moves move').nth(1)).toHaveClass(/active/);
      await snap(page, `${device}-pyramid-solution`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('a puzzle in the middle of the board, for a guest', async ({ page }) => {
      const { problems } = await openPuzzle(page, { puzzle: centreThree });
      await snap(page, `${device}-centre-guest`);
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}
