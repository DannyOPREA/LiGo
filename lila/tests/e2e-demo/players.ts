// What the Phase 6 demo (unit 6.10) does with its players: browser contexts at the project's size,
// signing up with a Go rank, playing stones, ending a game, and creating games past lila's rate limit.
// The Phase 3, 4 and 5 specs keep their own copies of some of these.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { dismissAlert } from './lobby';

export type Color = 'black' | 'white';

export const roundUrl = /\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/;

export interface Player {
  page: Page;
  errors: string[];
}

/** A player in a browser context of their own, at the project's size and with its user agent. */
export async function newPlayer(
  browser: Browser,
  info: TestInfo,
  contexts: BrowserContext[],
  name: string,
): Promise<Player> {
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

/** Signs up on /signup with a declared Go rank, which lands the new player signed in (as unit 5.8's demo). */
export async function signUp(page: Page, username: string, rank: string): Promise<void> {
  await page.goto('/signup');
  await page.locator('#form3-username').fill(username);
  await page.locator('#form3-password').fill(randomUUID());
  // a domain on lila's allowlist skips its MX check; dev lila never sends mail
  await page.locator('#form3-email').fill(`${username}@gmail.com`);
  await page.locator('#form3-goRank').selectOption(rank);
  for (const box of ['assistance', 'nice', 'account']) {
    await page.locator(`label.form-check__label[for=form3-agreement_${box}]`).click();
    await expect(page.locator(`#form3-agreement_${box}`)).toBeChecked();
  }
  await page.locator('form button.submit').click();
  await expect(page).not.toHaveURL(/\/signup/);
  await expect(page.locator('#user_tag')).toHaveText(username);
}

/** The stones of a colour on a page's goban board: goban draws each as a <use> of a colour-named symbol. */
export const stones = (page: Page, color: Color) =>
  page.locator(`.round__go-board svg g.grid use[href*="-${color}-"]`);

export const passButton = (page: Page) => page.getByRole('button', { name: 'Pass' });

/** The colour this page plays: its own clock is at the bottom. */
export const colorOf = async (page: Page): Promise<Color> =>
  (await page.locator('.rclock-bottom').getAttribute('class'))!.includes('rclock-black') ? 'black' : 'white';

/** Where a point (column, row from 0) is on screen: one square-wide coordinate band surrounds the grid. */
async function pointOf(page: Page, size: number, col: number, row: number) {
  const box = (await page.locator('.round__go-board svg').first().boundingBox())!;
  const square = box.width / (size + 2);
  return { x: box.x + (col + 1.5) * square, y: box.y + (row + 1.5) * square };
}

/**
 * Plays a stone: a click, or on a phone a tap and Confirm move. The move has gone to the server once the
 * player's own Pass button is back and disabled (it is hidden while a previewed stone waits for Confirm).
 */
export async function playStone(
  page: Page,
  color: Color,
  size: number,
  [col, row]: number[],
  phone: boolean,
) {
  const before = await stones(page, color).count();
  await expect(passButton(page)).toBeEnabled();
  const p = await pointOf(page, size, col, row);
  if (!phone) await page.mouse.click(p.x, p.y);
  else {
    await page.touchscreen.tap(p.x, p.y);
    const confirm = page.getByRole('button', { name: 'Confirm move' });
    await expect(confirm).toBeVisible();
    await expect(async () => {
      if (await confirm.isVisible()) await confirm.click();
      await expect(passButton(page)).toBeDisabled({ timeout: 1000 });
    }).toPass();
  }
  await expect(passButton(page)).toBeDisabled();
  await expect(stones(page, color)).toHaveCount(before + 1);
}

/** Both pages show the same game. */
export async function sameGame(a: Page, b: Page): Promise<void> {
  await expect(a).toHaveURL(roundUrl);
  await expect(b).toHaveURL(roundUrl);
  expect(new URL(a.url()).pathname.slice(1, 9)).toBe(new URL(b.url()).pathname.slice(1, 9));
  for (const p of [a, b]) await expect(p.locator('.round__go-board svg').first()).toBeVisible();
}

/**
 * Two stones each, in turn from whoever moves first, then `loser` resigns (lila only offers resigning once
 * both sides have moved). The stones go on the first rows of each side, away from any handicap stones.
 */
export async function playAndResign(
  pages: Record<Color, Page>,
  first: Color,
  size: number,
  loser: Color,
  phone: boolean,
): Promise<void> {
  const moves: Record<Color, number[][]> = {
    black: [
      [0, size - 1],
      [1, size - 1],
    ],
    white: [
      [0, 0],
      [1, 0],
    ],
  };
  const order: Color[] = first === 'black' ? ['black', 'white'] : ['white', 'black'];
  for (let i = 0; i < 2; i++)
    for (const c of order) {
      const other = c === 'black' ? 'white' : 'black';
      const shown = await stones(pages[other], c).count();
      await playStone(pages[c], c, size, moves[c][i], phone);
      await expect(stones(pages[other], c)).toHaveCount(shown + 1);
    }
  const page = pages[loser];
  await page.locator('button.fbt.resign').click();
  await page.locator('.act-confirm button.yes, button.fbt.yes').first().click();
  const result = loser === 'black' ? 'W+R' : 'B+R';
  for (const p of [pages.black, pages.white])
    await expect(p.locator('.result-wrap .result')).toHaveText(result);
}

/**
 * Sends a create-game window's form and checks lila took it. lila takes 5 game-creation posts a minute from
 * one address, and the whole e2e run makes more than that: on a refusal, close lila's alert, set the game
 * up again with `setUp` and retry, as the other demos do.
 */
export async function createGame(
  page: Page,
  path: string,
  setUp: () => Promise<void>,
  create: () => Promise<void>,
): Promise<void> {
  let again = false;
  await expect(async () => {
    await dismissAlert(page);
    if (again) await setUp();
    again = true;
    const [sent] = await Promise.all([
      page.waitForResponse(
        r => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith(path),
        {
          timeout: 5000,
        },
      ),
      create(),
    ]);
    expect(sent.status()).toBeLessThan(400);
  }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 });
}
