// The Phase 6 demo (unit 6.10, PLAN §5 row 6.10), on the real stack at desktop and phone sizes:
// - one click: a guest lands on the lobby, clicks the tile someone is already waiting on, and the
//   game's first stone is on the board, timed against PLAN §4's 10 seconds;
// - a 5k and a 1d sign up, click the same rated 19×19 pool tile with Handicap OK, and are paired into a
//   rated game with the five stones their ranks call for (ADR 0022 §3–§4);
// - the 1d creates a rated game from the Custom tile's window (unit 6.8) and the 5k accepts it from the
//   Open challenges table (unit 6.7);
// - the 5k challenges the 1d from the 1d's profile: the window names the 1d and has the suggested stones
//   filled in (units 5.7, 6.8), and the 1d accepts.
// Each game ends after two stones each with a resignation, so the next one can start. Like the other
// demos it waits on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { dismissAlert } from './lobby';
import {
  colorOf,
  createGame,
  newPlayer,
  playAndResign,
  playStone,
  sameGame,
  rankedAccount,
  stones,
  type Color,
} from './players';

// PLAN §4: "one click from the landing page to a game (the first move) in under 10 s".
const oneClickBudgetMs = 10_000;

// the tile itself: a waiting tile's Cancel button carries the same data-id
const tile = (page: Page, id: string) => page.locator(`.lpools div.lpool[data-id="${id}"]`);

test.describe.configure({ timeout: 300_000 });

test('a guest gets from the landing page to the first move with one click, within 10 seconds', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  const blitz = '9x9-3m-2s'; // the casual 9×9 3+2 tile: a guest's click is a casual open game (ADR 0022 §2)
  try {
    const A = await newPlayer(browser, info, contexts, 'guest A');
    const B = await newPlayer(browser, info, contexts, 'guest B');
    const [a, b] = [A.page, B.page];

    // A is already waiting on the tile (a click, but it isn't the one being timed).
    await a.goto('/');
    await expect(async () => {
      await dismissAlert(a);
      const [sent] = await Promise.all([
        a.waitForResponse(r => r.url().includes('/setup/hook/') && r.request().method() === 'POST', {
          timeout: 5000,
        }),
        tile(a, blitz).click({ timeout: 5000 }),
      ]);
      expect(sent.ok()).toBe(true); // lila's game-creation limit can refuse it: try again
    }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 });
    await expect(tile(a, blitz)).toHaveClass(/active/);

    // B: the clock starts with the landing page and stops when the game's first stone is on B's board.
    // A click refused by the same limit restarts the attempt from the landing page; once lila takes the
    // click, the rest must work first time.
    let start = 0;
    await expect(async () => {
      await dismissAlert(b);
      start = Date.now();
      await b.goto('/');
      const [sent] = await Promise.all([
        b.waitForResponse(r => r.url().includes('/setup/hook/') && r.request().method() === 'POST', {
          timeout: 5000,
        }),
        tile(b, blitz).click({ timeout: 5000 }), // the one click
      ]);
      expect(sent.ok()).toBe(true);
    }).toPass({ intervals: [15_000], timeout: 120_000 });
    await sameGame(a, b);
    const first: Record<Color, Page> =
      (await colorOf(a)) === 'black' ? { black: a, white: b } : { black: b, white: a };
    // Black plays at once (if Black is B, its own move is part of the time)
    await playStone(first.black, 'black', 9, [4, 4], phone);
    await expect(stones(b, 'black')).toHaveCount(1);
    const elapsed = Date.now() - start;

    info.annotations.push({ type: 'one click to the first move', description: `${elapsed} ms` });
    console.log(`[${info.project.name}] landing page to the first move: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(oneClickBudgetMs);

    // the game is a casual 9×9 3+2 game; end it
    const pages: Record<Color, Page> =
      (await colorOf(a)) === 'black' ? { black: a, white: b } : { black: b, white: a };
    for (const p of [a, b]) {
      await expect(p.locator('.game__meta__infos .setup')).toContainText('3+2');
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Casual');
      await expect(p.locator('.go-setup')).toContainText('9×9');
    }
    await playStone(pages.white, 'white', 9, [0, 0], phone);
    await playStone(pages.black, 'black', 9, [8, 8], phone);
    await playStone(pages.white, 'white', 9, [1, 0], phone);
    await pages.black.locator('button.fbt.resign').click();
    await pages.black.locator('.act-confirm button.yes, button.fbt.yes').first().click();
    for (const p of [a, b]) await expect(p.locator('.result-wrap .result')).toHaveText('W+R');
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('a 5k and a 1d meet in a rated handicap pool, from the open challenges table and from a profile', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  try {
    const K = await newPlayer(browser, info, contexts, '5k');
    const D = await newPlayer(browser, info, contexts, '1d');
    const [k, d] = [K.page, D.page];
    // one 5k and one 1d per run, shared by desktop and phone (rankedAccount explains why)
    await rankedAccount(k, info, '5k');
    const danName = await rankedAccount(d, info, '1d');

    // 1. The rated pool. A signed-in player's chips start at Rated and Handicap OK (ADR 0022 §2); both
    // click the 19×19 5 min + 5×10 s tile and the next wave pairs them.
    const rapid = '19x19-5m-5x10s';
    for (const p of [k, d]) {
      await p.goto('/');
      await expect(p.locator('button.lpools__chip.active', { hasText: 'Rated' })).toBeVisible();
      await expect(p.locator('button.lpools__chip.active', { hasText: 'Handicap OK' })).toBeVisible();
      await tile(p, rapid).click();
      await expect(tile(p, rapid)).toHaveClass(/active/);
    }
    await sameGame(k, d);
    // A 5k against a 1d: five stones for Black, the 5k (ADR 0021 §4), komi 0.5, rated.
    await expect(k.locator('.rclock-bottom')).toHaveClass(/rclock-black/);
    await expect(d.locator('.rclock-bottom')).toHaveClass(/rclock-white/);
    for (const p of [k, d]) {
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Rated');
      await expect(p.locator('.go-setup')).toContainText('19×19');
      await expect(p.locator('.go-setup')).toContainText('0.5');
      await expect(stones(p, 'black')).toHaveCount(5);
      await expect(stones(p, 'white')).toHaveCount(0);
    }
    // White moves first in a handicap game; the 1d resigns
    await playAndResign({ black: k, white: d }, 'white', 19, 'white', phone);

    // 2. A custom game: the 1d opens the Custom tile's window, picks the 9×9 Blitz preset, keeps Anyone,
    // chooses Rated and creates it.
    await d.goto('/');
    const setup = d.getByRole('dialog');
    const openCustom = async () => {
      if (!(await setup.isVisible())) await tile(d, 'custom').click({ timeout: 5000 });
      await expect(setup.locator('#sf_opponent_anyone')).toBeChecked();
      await setup.locator('button.setup-preset', { hasText: '9×9 Blitz' }).click({ timeout: 5000 });
      await expect(setup.locator('#sf_size_9')).toBeChecked();
      await setup.locator('label[for=sf_mode_rated]').click({ timeout: 5000 });
      await expect(setup.locator('#sf_mode_rated')).toBeChecked();
      // Chinese rules under Advanced: a rated game with exactly a pool's settings would join that pool
      // (setupCtrl's hookToPoolMember) rather than wait in Open challenges
      const advanced = setup.locator('details.setup-advanced');
      if ((await advanced.getAttribute('open')) === null) await advanced.locator('summary').click();
      await setup.locator('#sf_ruleset').selectOption('chinese', { timeout: 5000 });
      await expect(advanced.locator('.setup-advanced__digest')).toContainText('Chinese');
    };
    await openCustom();
    await createGame(d, '/setup/hook', openCustom, () =>
      setup.locator('button.lobby__start__button--hook').click({ timeout: 5000 }),
    );

    // The 5k finds it in Open challenges, with the 1d's name, and joins it from the table.
    await k.goto('/');
    await k.getByText('Open challenges').click();
    const row = k.locator('tr.hook.join', { hasText: danName });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td.board')).toHaveText('9×9');
    await expect(row.locator('td.mode')).toHaveText('Rated');
    await expect(row.locator('td.rules')).toContainText('Chinese');
    await row.click();
    await sameGame(k, d);
    for (const p of [k, d]) {
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Rated');
      await expect(p.locator('.go-setup')).toContainText('9×9');
      await expect(p.locator('.go-setup')).toContainText('Chinese');
    }
    const kColor = await colorOf(k);
    const custom: Record<Color, Page> = kColor === 'black' ? { black: k, white: d } : { black: d, white: k };
    await playAndResign(custom, 'black', 9, kColor, phone);

    // 3. A profile challenge: the 5k opens the 1d's profile and its "Challenge to a game" action, which
    // lands on the lobby's window with the 1d named and the suggested five stones filled in.
    await k.goto(`/@/${danName}`);
    const challenge = k.locator('.user-actions a[href*="#friend"]');
    if (!(await challenge.isVisible())) {
      // the action sits in the "More" dropdown when the rack is too narrow (a phone): open it
      const more = k.locator('.user-actions .dropdown');
      if (phone) await more.click();
      else await more.hover();
    }
    await challenge.click();
    const dialog = k.getByRole('dialog');
    await expect(dialog.locator('#sf_opponent_named')).toBeChecked();
    await expect(dialog.locator('h2')).toContainText(danName);
    const fillIn = async () => {
      if (!(await dialog.isVisible())) await k.goto(`/?user=${danName}#friend`);
      await dialog.locator('label[for=sf_size_19]').click({ timeout: 5000 });
      await dialog.locator('label[for=sf_mode_rated]').click({ timeout: 5000 });
      await expect(dialog.locator('.setup-suggested-stones')).toHaveText(
        'Suggested for your ranks: 5 handicap stones',
      );
      await expect(dialog.locator('#sf_handicap')).toHaveValue('5'); // filled in, not just suggested
      await expect(dialog.locator('.setup-locked-color')).toHaveText('You play Black.');
    };
    await fillIn();
    await createGame(k, '/setup/friend', fillIn, () =>
      dialog.locator('button.lobby__start__button--friend-user').click({ timeout: 5000 }),
    );
    await expect(k).toHaveURL(/\/[A-Za-z0-9]{8}$/);
    // The 1d opens the challenge and accepts it.
    await d.goto(new URL(k.url()).pathname);
    await d.locator('form.accept button, form[action$="/accept"] button').first().click();
    await sameGame(k, d);
    for (const p of [k, d]) {
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Rated');
      await expect(stones(p, 'black')).toHaveCount(5);
    }
    await expect(k.locator('.rclock-bottom')).toHaveClass(/rclock-black/);
    await playAndResign({ black: k, white: d }, 'white', 19, 'black', phone);

    expect(K.errors).toEqual([]);
    expect(D.errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
