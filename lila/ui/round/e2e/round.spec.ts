// A Go game played on the round page against a stand-in server (unit 3.18): clicks on a desktop,
// taps and Confirm move on a phone. Checks what a player sees: the move sent to the server, the
// opponent's moves arriving, prisoners, Pass, looking back through the moves, and the end of the game.
import { expect, test, type Page } from '@playwright/test';

import { boardSvg, ConfirmMoves, moveList, openRound, play, position, sounds } from './page';

/** Plays one of the player's stones: a click, or on a phone a tap and Confirm move. */
async function move(page: Page, point: string, phone: boolean): Promise<void> {
  const before = await moveList(page).count();
  await play(page, point, 9, phone);
  if (phone) {
    // goban ignores a confirm within 50 ms of the tap (no finger is that quick): press until it lands.
    const confirm = page.getByRole('button', { name: 'Confirm move' });
    await expect(async () => {
      if (await confirm.isVisible()) await confirm.click();
      await expect(moveList(page)).toHaveCount(before + 1, { timeout: 200 });
    }).toPass();
  } else await expect(moveList(page)).toHaveCount(before + 1);
}

for (const phone of [false, true]) {
  test.describe(phone ? 'phone, confirming each move' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('a game: moves both ways, a capture, looking back, Pass, and resigning', async ({ page }) => {
      const { server, problems } = await openRound(page, {
        confirmMoves: phone ? ConfirmMoves.TOUCH : ConfirmMoves.NEVER,
      });
      await expect(page.locator('.go-prisoners')).toHaveCount(2);
      await expect(page.locator('.go-prisoners').first()).toContainText('White');
      await expect(page.locator('.go-prisoners').last()).toContainText('Black');

      // Black's stone goes to the server as an SGF point and comes back as the move event.
      await move(page, 'ab', phone);
      expect(server.received.filter(m => m.t === 'move').map(m => m.d.u)).toEqual(['ab']);
      await expect(moveList(page)).toHaveText(['A8']);

      // White's answer arrives from the server.
      server.move('aa');
      await expect(moveList(page)).toHaveText(['A8', 'A9']);
      await expect.poll(() => position(page)).toContainEqual(expect.stringMatching(/^O/));

      // Black takes White's A9 stone with B9.
      await move(page, 'ba', phone);
      server.move('ee', { prisoners: { b: 1, w: 0 } });
      await expect(page.locator('.go-prisoners').last()).toContainText('1 prisoner');
      await expect(page.locator('.go-prisoners').first()).toContainText('0 prisoners');
      expect((await position(page))[0]).toMatch(/^\.X/);

      // Looking back to the first move shows that position, then the latest again.
      await moveList(page).first().dispatchEvent('mousedown');
      await expect.poll(async () => (await position(page))[0]).toMatch(/^\.\.\./);
      await moveList(page).last().dispatchEvent('mousedown');
      await expect.poll(async () => (await position(page))[4]).toMatch(/^\.\.\.\.O/);

      // Pass: sent as "pass", listed, and then it's White's turn so Pass is off.
      await page.getByRole('button', { name: 'Pass' }).click();
      expect(server.received.filter(m => m.t === 'move').map(m => m.d.u)).toEqual(['ab', 'ba', 'pass']);
      await expect(moveList(page)).toHaveText(['A8', 'A9', 'B9', 'E5', 'Pass']);
      await expect(page.getByRole('button', { name: 'Pass' })).toBeDisabled();

      // Resigning ends the game with the result shown.
      server.move('cc');
      await page.locator('button.fbt.resign').click();
      await page.locator('.act-confirm button.yes, button.fbt.yes').first().click();
      await expect(page.locator('.result-wrap .result')).toHaveText('W+R');
      await expect(page.getByRole('button', { name: 'Pass' })).toHaveCount(0);

      expect(await sounds(page)).toContain('capture');
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('two passes end the game, said in words', async ({ page }) => {
      const { server, problems } = await openRound(page, { moves: ['ee', 'cc'] });
      await expect(moveList(page)).toHaveText(['E5', 'C7']);
      await page.getByRole('button', { name: 'Pass' }).click();
      server.move('pass');
      server.event('endData', { status: { id: 38, name: 'unknownFinish' }, boosted: false });
      await expect(page.locator('.result-wrap')).toContainText('Both players passed');
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}

test.describe('a handicap game', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('White moves first after the handicap stones; the list starts on White', async ({ page }) => {
    const { server, problems } = await openRound(page, { handicap: 2, color: 'white' });
    const stones = (rows: string[], c: string) => rows.join('').split(c).length - 1;
    expect(stones(await position(page), 'X')).toBe(2);
    await play(page, 'ee', 9);
    // Row 1 has no Black move (…) before White's E5.
    await expect(moveList(page)).toHaveText(['…', 'E5']);
    expect(server.received.filter(m => m.t === 'move').map(m => m.d.u)).toEqual(['ee']);
    server.move('cc');
    await expect(moveList(page)).toHaveText(['…', 'E5', 'C7']);
    await expect(page.locator('aPp qZM')).toHaveText(['1', '2']);
    expect(problems).toEqual({ requests: [], errors: [] });
  });
});

test.describe('keyboard and themes (units 9.3, 9.4)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a stone played from the keyboard is sent and read out', async ({ page }) => {
    const { server, problems } = await openRound(page);
    await page.getByRole('application', { name: /^9 by 9$/ }).focus();
    // The cursor starts on E5; Enter plays there.
    await page.keyboard.press('Enter');
    await expect(moveList(page)).toHaveText(['E5']);
    expect(server.received.filter(m => m.t === 'move').map(m => m.d.u)).toEqual(['ee']);
    await expect(page.locator('.round__go-board [role=status]')).toHaveText(/^Black E5\s?$/);
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test("the board and stone preferences apply, and an unknown one falls back to goban's plain look", async ({
    page,
  }) => {
    await openRound(page, { moves: ['ee', 'cc'], board: 'brown', stones: 'cburnett' });
    expect(await page.evaluate(() => (window as any).round.theme)).toEqual({ board: 'Plain', stones: 'Plain' });
    const plain = await boardSvg(page).screenshot();
    const night = await page.context().newPage();
    await openRound(night, { moves: ['ee', 'cc'], board: 'Night Play', stones: 'Glass' });
    expect(await night.evaluate(() => (window as any).round.theme)).toEqual({
      board: 'Night Play',
      stones: 'Glass',
    });
    expect((await boardSvg(night).screenshot()).equals(plain)).toBe(false);
  });
});
