// Screenshots of the playground at desktop and phone sizes, compared with the committed baselines in
// __screenshots__/ (unit 2.4). After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/playground/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { BOARD_THEMES, STONE_THEMES } from '@ligo/board/themes';
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

    // Every theme ADR 0026 §3 offers: each board with Plain stones, each stone pair on the Plain board.
    const looks = [
      ...BOARD_THEMES.map(board => ({ board, stones: 'Plain' })),
      ...STONE_THEMES.filter(stones => stones !== 'Plain').map(stones => ({ board: 'Plain', stones })),
    ];
    for (const look of looks)
      test(`board look: ${look.board} board, ${look.stones} stones`, async ({ page }) => {
        const { problems } = await openPlayground(page, ConfirmMoves.NEVER);
        for (const move of ['ee', 'dd', 'fe']) await play(page, move, 9, touch);
        await page.getByLabel('Board', { exact: true }).selectOption(look.board);
        await page.getByLabel('Stones', { exact: true }).selectOption(look.stones);
        await park(page);
        const name = `${device}-theme-${look.board}-${look.stones}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await expect(page.locator('.playground__board')).toHaveScreenshot(`${name}.png`);
        expect(problems).toEqual({ requests: [], errors: [] });
      });

    test('the board look is remembered after a reload', async ({ page }) => {
      await openPlayground(page);
      await page.getByLabel('Board', { exact: true }).selectOption('HNG');
      await page.getByLabel('Stones', { exact: true }).selectOption('Glass');
      await page.reload();
      await expect(page.getByLabel('Board', { exact: true })).toHaveValue('HNG');
      await expect(page.getByLabel('Stones', { exact: true })).toHaveValue('Glass');
    });
  });
}
