// Screenshots of the lobby's quick pairing at desktop and phone sizes (unit 6.6), compared with the
// committed baselines in __screenshots__/. The page's clock is frozen, so the elapsed time on a waiting
// tile is the same in every picture. After a deliberate visual change, re-record them with
// `pnpm exec playwright test -c ui/lobby/e2e/playwright.config.ts --update-snapshots` (from lila/)
// and look at every changed picture before committing it.
import { expect, test, type Page } from '@playwright/test';

import { openLobby, tile } from './page';

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

/** The whole page for the layout, which allows a few pixels of difference (Chromium builds measure text differently). */
async function snap(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0); // no hover on a tile in the picture
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixels: 600 });
}

/** The custom-game window scrolls inside its dialog: show its end, where the advanced options are. */
const scrollWindowToEnd = (page: Page) =>
  page
    .locator('.dialog-content.game-setup')
    .evaluate(el => el.closest('.scrollable')!.scrollTo({ top: 1e6, behavior: 'instant' }));

for (const [device, options] of Object.entries(viewports))
  test.describe(device, () => {
    test.use(options);

    test('quick pairing, idle, with players waiting', async ({ page }) => {
      const { server } = await openLobby(page, { member: true });
      server.poolSizes({ '9x9-3m-2s': 12, '9x9-1m-5x10s': 3, '19x19-10m-5x30s': 7, '19x19-5m-5x10s': 1 });
      await expect(tile(page, '9x9-3m-2s').locator('.lpool__count')).toHaveText('12 waiting');
      await snap(page, `${device}-idle`);
    });

    test('quick pairing, casual, for a guest', async ({ page }) => {
      await openLobby(page);
      await snap(page, `${device}-guest`);
    });

    test('a waiting tile with the ranks it can meet', async ({ page }) => {
      const { server } = await openLobby(page, { member: true });
      server.poolSizes({ '19x19-10m-5x30s': 7 });
      await tile(page, '19x19-10m-5x30s').click();
      await expect(tile(page, '19x19-10m-5x30s')).toHaveClass(/active/);
      server.poolRange({ id: '19x19-10m-5x30s', weakest: '3k', strongest: '1d', stones: 2 });
      await expect(tile(page, '19x19-10m-5x30s').locator('.range')).toBeVisible();
      await page.clock.runFor(95_000);
      await expect(tile(page, '19x19-10m-5x30s').locator('.lpool__elapsed')).toHaveText('1:35');
      await snap(page, `${device}-waiting`);
    });

    test('a waiting tile before the server has said who it can meet', async ({ page }) => {
      await openLobby(page, { member: true });
      await tile(page, '9x9-3m-2s').click();
      await expect(tile(page, '9x9-3m-2s')).toHaveClass(/active/);
      await snap(page, `${device}-searching`);
    });

    // the custom-game window (unit 6.8): folded, unfolded, and for a named player from a profile
    test('the custom-game window, options folded', async ({ page }) => {
      await openLobby(page, { member: true });
      await page.locator('.lpool--custom').click();
      await expect(page.locator('.dialog-content.game-setup .setup-presets')).toBeVisible();
      await snap(page, `${device}-custom-folded`);
    });

    test('the custom-game window, options unfolded', async ({ page }) => {
      await openLobby(page, { member: true });
      await page.locator('.lpool--custom').click();
      await page.locator('.setup-advanced summary').click();
      await expect(page.locator('.setup-advanced #sf_komi')).toBeVisible();
      await scrollWindowToEnd(page);
      await snap(page, `${device}-custom-unfolded`);
    });

    test('the custom-game window for a named player', async ({ page }) => {
      await openLobby(page, { member: true, path: '/?user=Shiro#friend' });
      await expect(page.locator('#sf_handicap')).toHaveValue('5');
      await scrollWindowToEnd(page);
      await snap(page, `${device}-custom-named`);
    });
  });
