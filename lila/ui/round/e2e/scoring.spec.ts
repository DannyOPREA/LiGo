// The scoring phase and byo-yomi on the round page (unit 4.10) against a stand-in server: the
// proposal drawn on the board, a chain toggled, the count accepted and the result shown; resuming
// play; a spectator's view; byo-yomi periods beside the clocks. Screenshots of the scoring board are
// compared with the baselines in __screenshots__/ (see snapshots.spec.ts).
import { expect, test, type Page } from '@playwright/test';

import { ConfirmMoves, type FakeServer, moveList, openRound, play, position } from './page';

// A 9×9 game where Black holds the left and White the right; White's G7 stone is inside Black's area.
const moves = ['cc', 'gg', 'cg', 'gc', 'dd', 'fe'];
const owner = (dead: string[]) =>
  Array.from({ length: 81 }, (_, i) => {
    const [x, y] = [i % 9, Math.floor(i / 9)];
    if (dead.includes(String.fromCharCode(97 + x, 97 + y))) return 'b';
    return x < 4 ? 'b' : x > 4 ? 'w' : '.';
  }).join('');

const count = (v: string, dead: string[], o: Record<string, unknown> = {}) => ({
  phase: 1,
  v,
  expiresIn: 180,
  src: 'katago',
  dead,
  seal: ['ea'],
  owner: owner(dead),
  score: {
    b: { territory: 31 + 2 * dead.length, stones: 0, prisoners: dead.length, total: 31 + 3 * dead.length },
    w: { territory: 28, stones: 0, prisoners: 0, komi: 6.5, compensation: 0, total: 34.5 },
  },
  accepted: { b: false, w: false },
  pending: false,
  ...o,
});

/** Plays on to two passes (Black's, then White's) and the scoring service's proposal. */
async function toScoring(page: Page, server: FakeServer): Promise<void> {
  await expect(moveList(page)).toHaveCount(moves.length);
  await page.getByRole('button', { name: 'Pass' }).click();
  await expect(moveList(page)).toHaveCount(moves.length + 1);
  server.move('pass', { phase: 'scoring' });
  server.event('scoring', { phase: 1, expiresIn: 600, counting: true });
  await expect(page.locator('.go-scoring__status')).toHaveText('Counting the score…');
  server.event('scoring', count('1:1', ['gc']));
  await expect(page.locator('.go-scoring__count')).toBeVisible();
}

const sentOf = (server: FakeServer, t: string) => server.received.filter(m => m.t === t).map(m => m.d);

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('a proposal, a chain toggled, both accept: the result and the count stay', async ({ page }) => {
      const { server, problems } = await openRound(page, {
        moves,
        confirmMoves: phone ? ConfirmMoves.TOUCH : ConfirmMoves.NEVER,
      });
      await toScoring(page, server);
      await expect(page.locator('.go-scoring__status')).toHaveText(
        'Tap a group to mark it dead, or alive again.',
      );
      await expect(page.locator('.go-scoring__count tfoot')).toHaveText(/Total\s*34\s*34\.5/);
      await expect(page.locator('.go-scoring__seal')).toBeVisible();
      await expect(page.locator('.go-scoring__countdown')).toHaveText(/^3:00|^2:5\d/);
      await page.mouse.move(0, 0);
      await expect(page.locator('.round__go-board')).toHaveScreenshot(
        `${phone ? 'phone' : 'desktop'}-scoring-board.png`,
      );

      // A tap on White's G3 stone asks the server to toggle its chain; nothing changes until it answers.
      await play(page, 'gg', 9, phone);
      await expect.poll(() => sentOf(server, 'score-toggle')).toEqual([{ p: 'gg', v: '1:1' }]);
      await expect(page.locator('.go-scoring__status')).toHaveText('Recounting…');
      await expect(page.getByRole('button', { name: 'Accept score' })).toBeDisabled();
      expect((await position(page))[6][6]).toBe('O');
      server.event('scoring', count('1:2', ['gc', 'gg']));
      await expect(page.locator('.go-scoring__count tfoot')).toHaveText(/Total\s*37\s*34\.5/);

      // Accept: the version on show goes to the server, then the opponent accepts too and the game ends.
      await page.getByRole('button', { name: 'Accept score' }).click();
      expect(sentOf(server, 'score-accept')).toEqual([{ v: '1:2' }]);
      server.event('scoring', count('1:2', ['gc', 'gg'], { accepted: { b: true, w: false } }));
      await expect(page.locator('.go-scoring__accepted')).toHaveText(
        'You accepted this score. Waiting for your opponent.',
      );
      server.event('endData', {
        status: { id: 60, name: 'variantEnd' },
        winner: 'black',
        boosted: false,
        result: 'B+2.5',
      });
      await expect(page.locator('.result-wrap .result')).toHaveText('B+2.5');
      await expect(page.locator('.result-wrap .status')).toHaveText('Black wins by 2.5 points');
      await expect(page.locator('.go-scoring--final .go-scoring__count')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Accept score' })).toHaveCount(0);
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('Resume play: the marks go and the game goes on', async ({ page }) => {
      const { server, problems } = await openRound(page, { moves, confirmMoves: ConfirmMoves.NEVER });
      await toScoring(page, server);
      await page.getByRole('button', { name: 'Resume play' }).click();
      expect(server.received.map(m => m.t)).toContain('score-resume');
      // White passed second, so Black plays on.
      server.event('resume', { ply: server.ply, turn: 'black', phase: 'play', board: '' });
      await expect(page.locator('.go-scoring')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled();
      await play(page, 'ea', 9);
      await expect
        .poll(() => server.received.filter(m => m.t === 'move').map(m => m.d.u))
        .toEqual(['pass', 'ea']);
      await expect(moveList(page)).toHaveCount(moves.length + 3);
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });

test.describe('reloading', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a game loaded in its scoring phase shows the count and who has accepted', async ({ page }) => {
    const { problems } = await openRound(page, {
      moves: [...moves, 'pass', 'pass'],
      color: 'white',
      scoring: count('1:1', ['gc'], { accepted: { b: true, w: false } }),
    });
    await expect(page.locator('.go-scoring__accepted')).toHaveText('Your opponent accepted this score.');
    await expect(page.getByRole('button', { name: 'Accept score' })).toBeEnabled();
    expect(problems).toEqual({ requests: [], errors: [] });
  });
});

test.describe('byo-yomi', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the periods show beside each clock, and a period that runs out starts the next', async ({ page }) => {
    const { problems } = await openRound(page, {
      moves: ['ee', 'cc'],
      clock: 1,
      byoyomi: { periods: 3, byo: 3 },
    });
    const bottom = page.locator('.rclock-bottom .byoyomi');
    await expect(page.locator('.rclock-top .byoyomi')).toHaveText('3×3s');
    // Black's 1 s runs out: the first period starts (one second showing is taken as byo-yomi, so the
    // page counts it as the first period), then each 3 s period runs out in turn.
    await expect(bottom).toHaveText('3×3s');
    await expect(bottom).toHaveText('2×3s', { timeout: 6000 });
    await expect(bottom).toHaveClass(/byoyomi--in/);
    await expect(page.locator('.rclock-bottom .time')).not.toHaveText('00:00');
    expect(problems).toEqual({ requests: [], errors: [] });
  });
});
