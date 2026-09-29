// A two-colour game played through the playground page (unit 2.4): clicks on a desktop, taps and
// the Confirm move button on a phone. Checks what a player sees: whose turn it is, prisoners, a
// refused move, undo, two passes and playing on after them.
import { expect, test, type Page } from '@playwright/test';

import { ConfirmMoves, captures, openPlayground, play, sounds, status } from './page';

/** Plays one move: a click, or on a phone a tap that previews it and Confirm move. */
async function move(page: Page, point: string, phone: boolean): Promise<void> {
  const before = await status(page).textContent();
  await play(page, point, 9, phone);
  if (!phone) return expect(status(page)).not.toHaveText(before!);
  // goban ignores a confirm that comes within 50 ms of the tap (a real finger can't be that quick),
  // so press again until the move lands; a confirm after it has landed has nothing to play.
  const confirm = page.getByRole('button', { name: 'Confirm move' });
  await expect(async () => {
    if (await confirm.isEnabled()) await confirm.click();
    await expect(status(page)).not.toHaveText(before!, { timeout: 200 });
  }).toPass();
}

for (const phone of [false, true]) {
  test.describe(phone ? 'phone, confirming each move' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('a short game: captures, a refused move, undo, two passes, play on', async ({ page }) => {
      const { problems } = await openPlayground(page, phone ? ConfirmMoves.TOUCH : ConfirmMoves.NEVER);
      await expect(page.getByRole('button', { name: 'Confirm move' })).toHaveCount(phone ? 1 : 0);
      await expect(status(page)).toHaveText('Black to play.');

      // White surrounds Black's two corner stones (A9, B9) and takes them with C9.
      const moves = ['ee', 'ab', 'ba', 'bb', 'aa', 'ca'];
      for (const [i, point] of moves.entries()) {
        await move(page, point, phone);
        await expect(status(page)).toHaveText(i % 2 === 0 ? 'White to play.' : 'Black to play.');
      }
      await expect(captures(page)).toContainText('Black prisoners: 0');
      await expect(captures(page)).toContainText('White prisoners: 2');

      // Black surrounds White's C9 stone and takes it with B9.
      for (const point of ['da', 'ec', 'cb', 'gc', 'ba']) await move(page, point, phone);
      await expect(captures(page)).toContainText('Black prisoners: 1');
      await expect(status(page)).toHaveText('White to play.');

      // A point that's taken is refused: still White's turn, nothing changes.
      await play(page, 'ee', 9, phone);
      if (phone) await expect(page.getByRole('button', { name: 'Confirm move' })).toBeDisabled();
      await expect(status(page)).toHaveText('White to play.');

      // Undo takes Black's capture back, prisoners included.
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(status(page)).toHaveText('Black to play.');
      await expect(captures(page)).toContainText('Black prisoners: 0');

      await page.getByRole('button', { name: 'Pass' }).click();
      await expect(status(page)).toHaveText('White to play.');
      await page.getByRole('button', { name: 'Pass' }).click();
      await expect(status(page)).toHaveText(/^Both players passed\. .* Black to play\.$/);

      // Playing on after the passes is allowed, and the passes no longer count.
      await move(page, 'ba', phone);
      await expect(status(page)).toHaveText('White to play.');
      await expect(captures(page)).toContainText('Black prisoners: 1');

      // Each move that counted made one sound (ADR 0026 §2); the refused click and undo made none.
      const stone = (n: number) => Array<string>(n).fill('move');
      expect(await sounds(page)).toEqual([
        ...stone(5),
        'capture',
        ...stone(4),
        'capture',
        'confirmation',
        'confirmation',
        'capture',
      ]);
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });
}
