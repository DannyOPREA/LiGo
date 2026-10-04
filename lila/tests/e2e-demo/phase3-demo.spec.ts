// The Phase 3 demo (unit 3.20): two anonymous players, in two separate browser contexts, play a
// casual 9x9 Fischer (5+3) game on the real stack to a resignation: one creates a lobby game, the
// other joins it from the "Open challenges" list, they trade stones by clicking (desktop) or tapping
// and confirming (phone), and the first resigns. Waits are on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const size = 9;
type Color = 'black' | 'white';

/** The stones of a colour on a page's goban board: goban draws each as a <use> of a colour-named symbol. */
const stones = (page: Page, color: Color) =>
  page.locator(`.round__go-board svg g.grid use[href*="-${color}-"]`);

/** Where an SGF-style coordinate (column, row from 0) is on screen: one square-wide coordinate band surrounds the grid. */
async function pointOf(page: Page, col: number, row: number) {
  const box = (await page.locator('.round__go-board svg').first().boundingBox())!;
  const square = box.width / (size + 2);
  return { x: box.x + (col + 1.5) * square, y: box.y + (row + 1.5) * square };
}

/** Plays a stone: a click, or on a phone a tap and Confirm move (goban ignores a confirm within 50 ms of the tap). */
async function playStone(page: Page, color: Color, col: number, row: number, phone: boolean) {
  const before = await stones(page, color).count();
  const p = await pointOf(page, col, row);
  if (!phone) {
    await page.mouse.click(p.x, p.y);
    await expect(stones(page, color)).toHaveCount(before + 1);
    return;
  }
  await page.touchscreen.tap(p.x, p.y);
  const confirm = page.getByRole('button', { name: 'Confirm move' });
  await expect(async () => {
    if (await confirm.isVisible()) await confirm.click();
    await expect(stones(page, color)).toHaveCount(before + 1, { timeout: 500 });
  }).toPass();
}

const colorOf = async (page: Page): Promise<Color> =>
  (await page.locator('.rclock-bottom').getAttribute('class'))!.includes('rclock-black') ? 'black' : 'white';

test('two players play a casual 9x9 Fischer game from the lobby to a resignation', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  const newPlayer = async (name: string) => {
    // browser.newContext() doesn't inherit the project's `use`: pass what matters here.
    const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = info.project.use;
    const ctx = await browser.newContext({
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      userAgent,
    });
    contexts.push(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    return { page, errors };
  };
  try {
    const A = await newPlayer('A');
    const B = await newPlayer('B');
    const [a, b] = [A.page, B.page];

    // Player A: lobby, Create lobby game, 9x9, casual (a guest's only mode), the default Fischer 5+3.
    await a.goto('/');
    await a.locator('.lobby__start button.lobby__start__button--hook').click();
    const setup = a.getByRole('dialog');
    await setup.locator('label[for=sf_size_9]').click();
    await expect(setup.locator('#sf_size_9')).toBeChecked();
    await expect(setup.getByText('Sign up to play rated games')).toBeVisible(); // guests only play casual
    await setup.locator('button.lobby__start__button--hook').click();

    // Player B: lobby, Open challenges, A's game, join.
    await b.goto('/');
    await b.getByText('Open challenges').click();
    const hook = b.locator('tr.hook.join');
    await expect(hook).toHaveCount(1);
    await expect(hook.locator('td.board')).toHaveText('9×9');
    await expect(hook.locator('td.time')).toHaveText('5+3');
    await expect(hook.locator('td.mode')).toHaveText('Casual');
    await hook.click();

    // Both land on the same round page.
    const round = /\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/;
    await expect(a).toHaveURL(round);
    await expect(b).toHaveURL(round);
    expect(new URL(a.url()).pathname.slice(1, 9)).toBe(new URL(b.url()).pathname.slice(1, 9));
    for (const p of [a, b]) {
      await expect(p.locator('.round__go-board svg').first()).toBeVisible();
      await expect(p.locator('.go-setup')).toHaveText('9×9 • Japanese • komi 6.5');
      await expect(p.locator('.game__meta__infos .setup')).toContainText('5+3');
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Casual');
      // The clocks are shown, and each player is online (the socket is up).
      await expect(p.locator('.rclock')).toHaveCount(2);
      for (const clock of await p.locator('.rclock').all())
        await expect(clock.locator('.time')).toHaveText(/^\d\d\s*:\s*\d\d$/);
      await expect(p.locator('.ruser.online')).toHaveCount(2);
    }

    // Who has which colour is random: find out from each page.
    const [colorA, colorB] = [await colorOf(a), await colorOf(b)];
    expect(new Set([colorA, colorB]).size).toBe(2);
    const [blackPage, whitePage] = colorA === 'black' ? [a, b] : [b, a];

    // Alternate three moves each, Black first; each stone shows on both boards.
    const blackMoves = [
      [2, 2],
      [6, 2],
      [4, 6],
    ];
    const whiteMoves = [
      [6, 6],
      [2, 6],
      [4, 2],
    ];
    for (let i = 0; i < 3; i++) {
      await expect(blackPage.getByRole('button', { name: 'Pass' })).toBeEnabled(); // Black's turn
      await playStone(blackPage, 'black', blackMoves[i][0], blackMoves[i][1], phone);
      await expect(stones(whitePage, 'black')).toHaveCount(i + 1);
      await expect(whitePage.getByRole('button', { name: 'Pass' })).toBeEnabled(); // White's turn
      await playStone(whitePage, 'white', whiteMoves[i][0], whiteMoves[i][1], phone);
      await expect(stones(blackPage, 'white')).toHaveCount(i + 1);
    }
    for (const p of [a, b]) {
      await expect(stones(p, 'black')).toHaveCount(3);
      await expect(stones(p, 'white')).toHaveCount(3);
    }

    // The clocks run now: the side to move (Black) has ticked down on both pages.
    for (const p of [a, b]) await expect(p.locator('.rclock-black .time')).not.toHaveText(/^05\s*:\s*00$/);

    // Player A resigns: the resign button and its confirmation.
    await a.locator('button.fbt.resign').click();
    await a.locator('.act-confirm button.yes, button.fbt.yes').first().click();

    // Both pages show the game over, B the winner by resignation.
    const winner: Color = colorB;
    const result = winner === 'black' ? 'B+R' : 'W+R';
    for (const p of [a, b]) {
      await expect(p.locator('.result-wrap .result')).toHaveText(result);
      await expect(p.locator('.result-wrap .status')).toContainText(/resign/i);
      await expect(p.locator('.result-wrap')).toContainText(
        winner === 'black' ? 'Black is victorious' : 'White is victorious',
      );
      await expect(p.locator('button.fbt.resign')).toHaveCount(0);
    }
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
