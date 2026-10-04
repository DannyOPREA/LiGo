// A correspondence Go game on the round page (unit 7.7, ADR 0023 §4): lila's days clock beside the
// board, the scoring phase's countdown in days and hours, "Time to count the game" in the tab and the
// way on to the next game once the player has answered the count. A stand-in server, as in the other
// round tests. The page screenshots are compared with the baselines in __screenshots__/ (see
// snapshots.spec.ts); the picture hides the page's glyphs, so the words are checked in the tests.
import { expect, test, type Page } from '@playwright/test';

import { openRound, play } from './page';

const HOUR = 3600,
  DAY = 86400;

// 3 days a move. Black (the player) has 2 days 5 hours to move; White has 1 day 3 hours left.
const days = { days: 3, white: DAY + 3 * HOUR + 600, black: 2 * DAY + 5 * HOUR + 600 };
const moves = ['cc', 'gg', 'cg', 'gc', 'dd', 'fe'];

// The count of the 9×9 game used by scoring.spec.ts, trimmed to what these tests read.
const owner = (dead: string[]) =>
  Array.from({ length: 81 }, (_, i) => {
    const [x, y] = [i % 9, Math.floor(i / 9)];
    if (dead.includes(String.fromCharCode(97 + x, 97 + y))) return 'b';
    return x < 4 ? 'b' : x > 4 ? 'w' : '.';
  }).join('');

const count = (o: Record<string, unknown> = {}) => ({
  phase: 1,
  v: '1:1',
  expiresIn: DAY + 2 * HOUR + 1800,
  src: 'katago',
  dead: ['gc'],
  seal: [],
  owner: owner(['gc']),
  score: {
    b: { territory: 33, stones: 0, prisoners: 1, total: 34 },
    w: { territory: 28, stones: 0, prisoners: 0, komi: 6.5, compensation: 0, total: 34.5 },
  },
  accepted: { b: false, w: false },
  pending: false,
  ...o,
});

const scoringGame = (o: Record<string, unknown> = {}) => ({
  moves: [...moves, 'pass', 'pass'],
  correspondence: days,
  clock: 0,
  scoring: count(o),
});

async function snap(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`${name}-page.png`, { fullPage: true, maxDiffPixels: 600 });
}

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

for (const [device, options] of Object.entries(viewports))
  test.describe(device, () => {
    test.use(options);

    test('the days clock counts days and hours, then hours and minutes', async ({ page }) => {
      const { server, problems } = await openRound(page, { moves, correspondence: days, clock: 0 });
      const bottom = page.locator('.rclock-bottom .time');
      const top = page.locator('.rclock-top .time');
      await expect(bottom).toHaveText('2 days 5 hours');
      await expect(top).toHaveText('One day 3 hours');
      // Black is to move: the player's clock runs.
      await expect(page.locator('.rclock-bottom')).toHaveClass(/running/);
      await expect(page.locator('.rclock-top')).not.toHaveClass(/running/);
      await snap(page, `${device}-correspondence`);

      // The server's clock event (a move's, or a resume's) sets both clocks; under a day, hours and minutes.
      server.event('cclock', { white: 20 * HOUR + 15 * 60 + 30, black: 3 * HOUR + 7 * 60 + 5 });
      await expect(top).toHaveText('20:15');
      await expect(bottom).toHaveText('03:07');
      expect(problems).toEqual({ requests: [], errors: [] });
    });

    test('in the scoring phase the countdown is in days and hours and the days clocks stand still', async ({
      page,
    }) => {
      // White's clock is at zero in the stored game, which must not read as a flag in the phase. The
      // page's clock is Playwright's, so the days clock's 1 s ticks can be run without waiting.
      await page.clock.install();
      const { server, problems } = await openRound(page, {
        ...scoringGame(),
        correspondence: { ...days, white: 0 },
      });
      await expect(page.locator('.go-scoring__countdown')).toHaveText(
        '1 day 2 hours left to agree. Then the marks stand as they are.',
      );
      await expect(page.locator('.rclock-correspondence.running')).toHaveCount(0);
      await expect(page.locator('.rclock-correspondence.outoftime')).toHaveCount(0);
      await expect(page.locator('.rclock-bottom .time')).toHaveText('2 days 5 hours');
      await expect(page).toHaveTitle(/^Time to count the game/);
      expect(server.received.map(m => m.t)).not.toContain('outoftime');
      await snap(page, `${device}-correspondence-scoring`);

      // A new count from the server (a toggle) carries the time left to the phase's end.
      server.event('scoring', count({ v: '1:2', expiresIn: 5 * HOUR + 12 * 60 + 30 }));
      await expect(page.locator('.go-scoring__countdown')).toHaveText(
        '5 hours 12 minutes left to agree. Then the marks stand as they are.',
      );

      // Even with the player to move (Black) at zero, the clock's ticks take nothing off and never flag.
      server.event('cclock', { white: 0, black: 0 });
      await page.clock.runFor(3000);
      await expect(page.locator('.rclock-correspondence.outoftime')).toHaveCount(0);
      // The socket keeps its order: once a toggle sent after the ticks arrives, any flag would have too.
      await play(page, 'gg', 9, device === 'phone');
      await expect.poll(() => server.received.map(m => m.t)).toContain('score-toggle');
      expect(server.received.map(m => m.t)).not.toContain('flag');
      expect(problems).toEqual({ requests: [], errors: [] });
    });
  });

test.describe('answering the count', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a player who accepted waits for the opponent: the tab says so', async ({ page }) => {
    const { server, problems } = await openRound(page, scoringGame());
    await expect(page).toHaveTitle(/^Time to count the game/);
    await page.getByRole('button', { name: 'Accept score' }).click();
    server.event('scoring', count({ accepted: { b: true, w: false } }));
    await expect(page.locator('.go-scoring__accepted')).toBeVisible();
    await expect(page).toHaveTitle(/^Waiting for opponent/);
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('with "play the next game" on, accepting the count goes on to the next game', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('move-on', '1'));
    const { server } = await openRound(page, scoringGame());
    // Routes added later answer first, so these come after openRound's catch-all.
    const asked: string[] = [];
    await page.route('**/whats-next/**', route => {
      asked.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ next: 'zzzzzzzzpppp' }),
      });
    });
    await page.route('**/zzzzzzzzpppp', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>next game</title>' }),
    );
    // Not while the count is waiting for this player.
    await expect(page.getByRole('button', { name: 'Accept score' })).toBeEnabled();
    expect(asked).toEqual([]);
    server.event('scoring', count({ accepted: { b: true, w: false } }));
    await expect(page).toHaveTitle('next game');
    expect(asked).toEqual(['/whats-next/abcdefghpppp']);
  });
});
