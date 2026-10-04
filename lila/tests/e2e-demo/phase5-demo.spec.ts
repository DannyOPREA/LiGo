// The Phase 5 demo (unit 5.8, PLAN §5 row 5.8): on the real stack, a 5k and a 1d sign up with those
// ranks, the 1d challenges the 5k to a rated 19x19 game, takes the suggested five stones, and resigns
// after 21 stones each; both ratings then move exactly as goratings (OGS's rating code, which 5.2's maths
// ports) predicts for that game. And a guest can't choose rated: their game is casual. Like the Phase 3
// demo next to it, it waits on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

// up to two waits for lila's game-creation limit on top of the game itself (unit 4.12 does the same)
test.describe.configure({ timeout: 240_000 });
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Color = 'black' | 'white';

/* The expected numbers come from goratings itself: 5.2's goRatingCases.json, written by OGS's
 * goratings @ 6cab309 (goRatingCases.py), case "a 5k (middle of the rank, deviation 250) beats a 1d
 * (the same) in a 19x19 Chinese game with five stones and komi 0.5". Those are the ratings LiGo's
 * signup gives a declared 5k and 1d (ADR 0021 §2), and the game below is that game. */
interface HandicapGame {
  black: [number, number, number];
  white: [number, number, number];
  blackWon: boolean;
  handicap: number;
  size: number;
  komi: number;
  rules: string;
  blackAfter: [number, number, number];
  whiteAfter: [number, number, number];
}
const cases: { handicapGames: HandicapGame[] } = JSON.parse(
  readFileSync(join(__dirname, '../../modules/rating/src/test/resources/goRatingCases.json'), 'utf8'),
);
const expected = cases.handicapGames.find(
  g => g.size === 19 && g.handicap === 5 && g.rules === 'chinese' && g.blackWon && g.black[1] === 250,
)!;

/** The stones of a colour on a page's goban board: goban draws each as a <use> of a colour-named symbol. */
const stones = (page: Page, color: Color) =>
  page.locator(`.round__go-board svg g.grid use[href*="-${color}-"]`);

/** Where an SGF-style coordinate (column, row from 0) is on screen: one square-wide coordinate band surrounds the grid. */
async function pointOf(page: Page, size: number, col: number, row: number) {
  const box = (await page.locator('.round__go-board svg').first().boundingBox())!;
  const square = box.width / (size + 2);
  return { x: box.x + (col + 1.5) * square, y: box.y + (row + 1.5) * square };
}

/** Plays a stone by click, or on a phone by tap and Confirm move, as the Phase 3 demo does. */
async function playStone(page: Page, color: Color, size: number, [col, row]: number[], phone: boolean) {
  const before = await stones(page, color).count();
  const p = await pointOf(page, size, col, row);
  const pass = page.getByRole('button', { name: 'Pass' });
  if (!phone) await page.mouse.click(p.x, p.y);
  else {
    await page.touchscreen.tap(p.x, p.y);
    const confirm = page.getByRole('button', { name: 'Confirm move' });
    await expect(confirm).toBeVisible();
    await expect(async () => {
      if (await confirm.isVisible()) await confirm.click();
      await expect(pass).toBeDisabled({ timeout: 1000 });
    }).toPass();
  }
  await expect(pass).toBeDisabled();
  await expect(stones(page, color)).toHaveCount(before + 1);
}

/** Sends a create-game window's form and checks lila took it. lila takes 5 game-creation posts a minute
 * from one address (Limiters.setupPost), and the whole e2e run (Phases 3, 4 and 5, desktop then phone)
 * makes more than that. If lila answers 429 Too Many
 * Requests, the window is left stuck, so wait for the limit to clear and set the game up again. */
async function createGame(page: Page, path: string, setUp: () => Promise<void>, create: () => Promise<void>) {
  let again = false;
  await expect(async () => {
    if (again) await setUp();
    again = true;
    const sent = page.waitForResponse(
      r => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith(path),
    );
    await create();
    expect((await sent).status()).toBeLessThan(400);
  }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 }); // as the Phase 3 and 4 demos wait
}

async function newPlayer(browser: Browser, info: TestInfo, contexts: BrowserContext[], name: string) {
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
}

/** Signs up on /signup with a declared Go rank, which lands the new player signed in. */
async function signUp(page: Page, username: string, rank: string) {
  await page.goto('/signup');
  await page.locator('#form3-username').fill(username);
  await page.locator('#form3-password').fill(randomUUID());
  // A domain on lila's own allowlist (DisposableEmailDomain.whitelist) skips its MX DNS check, which a
  // made-up domain fails wherever DNS works (CI). Dev lila never sends mail (mailer.mock).
  await page.locator('#form3-email').fill(`${username}@gmail.com`);
  await page.locator('#form3-goRank').selectOption(rank);
  // the agreement inputs are hidden behind styled toggles: click each toggle
  for (const box of ['assistance', 'nice', 'account']) {
    await page.locator(`label.form-check__label[for=form3-agreement_${box}]`).click();
    await expect(page.locator(`#form3-agreement_${box}`)).toBeChecked();
  }
  await page.locator('form button.submit').click();
  await expect(page).not.toHaveURL(/\/signup/);
  await expect(page.locator('#user_tag')).toHaveText(username);
}

/** A player's Go rating and rank as the public API gives them (ADR 0021 §3: `goRank` beside `rating`). */
async function goPerf(
  page: Page,
  username: string,
): Promise<{ rating: number; goRank: string; games: number }> {
  const res = await page.request.get(`/api/user/${username}`);
  expect(res.ok()).toBe(true);
  const go = (await res.json()).perfs.go;
  return { rating: go.rating, goRank: go.goRank, games: go.games };
}

const roundUrl = /\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/;

test('a 5k and a 1d sign up, play a rated 19x19 handicap game, and their ratings move as goratings predicts', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  // fresh accounts each run: a letter, the rank, and a random tail (usernames are 2 to 20 characters)
  const tail = randomUUID().replace(/-/g, '').slice(0, 9);
  const [kyuName, danName] = [`k5${tail}${phone ? 'p' : 'd'}`, `d1${tail}${phone ? 'p' : 'd'}`];
  try {
    const K = await newPlayer(browser, info, contexts, '5k');
    const D = await newPlayer(browser, info, contexts, '1d');
    const [k, d] = [K.page, D.page];

    // Both sign up with their ranks: the server starts each in the middle of the rank (ADR 0021 §2).
    await signUp(k, kyuName, '5k');
    await signUp(d, danName, '1d');
    const [k0, d0] = [await goPerf(k, kyuName), await goPerf(d, danName)];
    expect(k0).toEqual({ rating: Math.trunc(expected.black[0]), goRank: '5k?', games: 0 });
    expect(d0).toEqual({ rating: Math.trunc(expected.white[0]), goRank: '1d?', games: 0 });
    // and the profile shows the declared rank beside the name before any game
    await k.goto(`/@/${kyuName}`);
    await expect(k.locator('.user-show__rank')).toHaveText('5k?');

    // The 1d challenges the 5k: rated, 19x19 (the default), Chinese rules, Fischer 5+3 (the default).
    await d.goto(`/?user=${kyuName}&gameMode=rated&minutesPerSide=5&increment=3#friend`);
    const setup = d.getByRole('dialog');
    await expect(setup.locator('#sf_mode_rated')).toBeChecked();
    await setup.locator('#sf_ruleset').selectOption('chinese');
    // The window asks the server for the suggestion: five stones for a 5k against a 1d, ±1 allowed.
    await expect(setup.locator('.setup-suggested-stones')).toHaveText(
      'Suggested for your ranks: 5 handicap stones',
    );
    await setup.locator('#sf_handicap').selectOption('5');
    await expect(setup.locator('#sf_komi')).toHaveValue('0.5'); // handicap games have komi 0.5
    // The ranks pick the colours (ADR 0021 §4): the 1d gives the stones, so takes White.
    await expect(setup.locator('.setup-locked-color')).toHaveText('You play White.');
    await expect(setup.locator('.setup-rated-problem')).toHaveText('');
    // Too many stones for these ranks: the window says so, as the server would refuse it.
    await setup.locator('#sf_handicap').selectOption('7');
    await expect(setup.locator('.setup-rated-problem')).toHaveText(
      'A rated game between you two has 4 to 6 handicap stones, or none.',
    );
    await setup.locator('#sf_handicap').selectOption('5');
    await createGame(
      d,
      '/setup/friend',
      async () => {
        await d.goto(`/?user=${kyuName}&gameMode=rated&minutesPerSide=5&increment=3#friend`);
        await setup.locator('#sf_ruleset').selectOption('chinese');
        await expect(setup.locator('.setup-suggested-stones')).toContainText('5');
        await setup.locator('#sf_handicap').selectOption('5');
      },
      () => setup.locator('button.lobby__start__button--friend-user').click(),
    );

    // The challenge page: the 5k opens it and accepts.
    await expect(d).toHaveURL(/\/[A-Za-z0-9]{8}$/);
    const challengeUrl = new URL(d.url()).pathname;
    await k.goto(challengeUrl);
    await k.locator('form.accept button, form[action$="/accept"] button').first().click();

    // Both land on the same rated game: 19x19, Chinese, komi 0.5, five black stones already placed.
    await expect(k).toHaveURL(roundUrl);
    await expect(d).toHaveURL(roundUrl);
    expect(new URL(k.url()).pathname.slice(1, 9)).toBe(new URL(d.url()).pathname.slice(1, 9));
    for (const p of [k, d]) {
      await expect(p.locator('.round__go-board svg').first()).toBeVisible();
      await expect(p.locator('.game__meta__infos .setup')).toContainText('Rated');
      await expect(p.locator('.go-setup')).toContainText('19×19');
      await expect(p.locator('.go-setup')).toContainText('Chinese');
      await expect(stones(p, 'black')).toHaveCount(5);
      await expect(stones(p, 'white')).toHaveCount(0);
    }
    // The 5k plays Black, the 1d White.
    await expect(k.locator('.rclock-bottom')).toHaveClass(/rclock-black/);
    await expect(d.locator('.rclock-bottom')).toHaveClass(/rclock-white/);

    // White moves first in a handicap game. Each side plays 21 stones on its own rows, far from the
    // other's, so nothing is captured. The game has to be this long: lila's anti-boosting check gives
    // two new accounts from one address no rating change for a game under 40 moves played in under
    // 90 seconds (FarmBoostDetection.newAccountBoosting).
    const row = (r: number) => Array.from({ length: 19 }, (_, c) => [c, r]);
    const whiteMoves = [...row(1), [0, 5], [18, 5]];
    const blackMoves = [...row(17), [0, 13], [18, 13]];
    for (let i = 0; i < whiteMoves.length; i++) {
      await expect(d.getByRole('button', { name: 'Pass' })).toBeEnabled();
      await playStone(d, 'white', 19, whiteMoves[i], phone);
      await expect(stones(k, 'white')).toHaveCount(i + 1);
      await expect(k.getByRole('button', { name: 'Pass' })).toBeEnabled();
      await playStone(k, 'black', 19, blackMoves[i], phone);
      await expect(stones(d, 'black')).toHaveCount(6 + i);
    }

    // The 1d resigns: the 5k wins, as in goratings' case.
    await d.locator('button.fbt.resign').click();
    await d.locator('.act-confirm button.yes, button.fbt.yes').first().click();
    for (const p of [k, d]) {
      await expect(p.locator('.result-wrap .result')).toHaveText('B+R');
      await expect(p.locator('.result-wrap')).toContainText('Black is victorious');
    }

    // Both ratings moved exactly as goratings computes for this game (lila keeps whole points).
    const [k1, d1] = [await goPerf(k, kyuName), await goPerf(d, danName)];
    expect(k1.rating).toBe(Math.trunc(expected.blackAfter[0]));
    expect(d1.rating).toBe(Math.trunc(expected.whiteAfter[0]));
    expect([k1.games, d1.games]).toEqual([1, 1]);
    // and the game page shows each player's change, after a reload too
    await k.reload();
    const ruser = (name: string) => k.locator('.ruser-top, .ruser-bottom').filter({ hasText: name });
    const change = (after: number, before: number) => Math.trunc(after) - Math.trunc(before);
    await expect(ruser(kyuName)).toContainText(`+${change(expected.blackAfter[0], expected.black[0])}`);
    // lila writes a loss with a minus sign (−), not a hyphen
    const loss = -change(expected.whiteAfter[0], expected.white[0]);
    await expect(ruser(danName)).toContainText(new RegExp(`[−-]${loss}\\b`));
    expect(K.errors).toEqual([]);
    expect(D.errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

test("a guest can't choose rated: their game is casual", async ({ browser }, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  try {
    const A = await newPlayer(browser, info, contexts, 'guest A');
    const B = await newPlayer(browser, info, contexts, 'guest B');
    const [a, b] = [A.page, B.page];

    // The create-game window offers a guest no casual/rated choice, only a sign-up link.
    await a.goto('/');
    await a.locator('.lobby__start button.lobby__start__button--hook').click();
    const setup = a.getByRole('dialog');
    await expect(setup.getByRole('link', { name: 'Sign up to play rated games' })).toBeVisible();
    await expect(setup.locator('#sf_mode_rated')).toHaveCount(0);
    // A rated game asked for in the URL is casual for a guest too.
    const setUpGuestGame = async () => {
      await a.goto('/?gameMode=rated#hook');
      await expect(a.getByRole('dialog').locator('#sf_mode_rated')).toHaveCount(0);
      await a.getByRole('dialog').locator('label[for=sf_size_9]').click();
    };
    await setUpGuestGame();
    await createGame(a, '/setup/hook', setUpGuestGame, () =>
      a.getByRole('dialog').locator('button.lobby__start__button--hook').click(),
    );

    // Another guest joins it from Open challenges: it says Casual.
    await b.goto('/');
    await b.getByText('Open challenges').click();
    const hook = b.locator('tr.hook.join');
    await expect(hook).toHaveCount(1);
    await expect(hook.locator('td.mode')).toHaveText('Casual');
    await hook.click();
    await expect(a).toHaveURL(roundUrl);
    await expect(b).toHaveURL(roundUrl);
    for (const p of [a, b]) await expect(p.locator('.game__meta__infos .setup')).toContainText('Casual');

    // One stone each, then a resignation: a casual game ends like any other.
    const colorOf = async (p: Page): Promise<Color> =>
      (await p.locator('.rclock-bottom').getAttribute('class'))!.includes('rclock-black') ? 'black' : 'white';
    const [blackPage, whitePage] = (await colorOf(a)) === 'black' ? [a, b] : [b, a];
    await playStone(blackPage, 'black', 9, [2, 2], phone);
    await expect(whitePage.getByRole('button', { name: 'Pass' })).toBeEnabled();
    await playStone(whitePage, 'white', 9, [6, 6], phone);
    await blackPage.locator('button.fbt.resign').click();
    await blackPage.locator('.act-confirm button.yes, button.fbt.yes').first().click();
    for (const p of [a, b]) await expect(p.locator('.result-wrap .result')).toHaveText('W+R');
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
