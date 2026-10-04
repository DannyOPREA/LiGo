// The Phase 9 demo on the real stack (unit 9.10): 9.4's accessibility check over every page LiGo serves,
// at desktop and phone size. Each page is opened as a guest or as a signed-in player and axe-core looks
// for serious or critical WCAG 2.2 AA problems (the same check and tags as the page tests, ADR 0026 §4).
// Every page is checked before the test fails, so one run lists every problem. The size budget over
// every page is dev/ci/budget.mjs (the `ui` job); the Go-club checklist is docs/demos/phase-9.md.
// Needs `dev/ligo up`. Waits are on DOM state only. Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { axeProblems } from '../../ui/playground/e2e/axe';
import { newPlayer, rankedAccount } from './players';

test.describe.configure({ timeout: 300_000 });
test.use({ actionTimeout: 15_000 });

// A game from 1846 (public domain), as the Phase 7 demo uses: imported, it gives a stored game page
const fixture = resolve(__dirname, 'fixtures/ear-reddening-1846.sgf');

/** Opens a page and waits until lila's scripts have drawn it: its main content is there and the network is quiet. */
async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.locator('main, #main-wrap').first()).toBeVisible();
  // lazily loaded parts (the board, the lobby's lists) come in after the load event; the sockets don't count
  await page.waitForLoadState('networkidle');
}

/** Opens a page and records what axe finds there, under `label`. */
async function check(page: Page, path: string, label: string, problems: Record<string, string[]>) {
  await open(page, path);
  problems[label] = await axeProblems(page, 'body');
}

test('every page: no serious or critical WCAG 2.2 AA problem, as a guest and signed in', async ({
  browser,
}, info) => {
  const contexts: BrowserContext[] = [];
  const problems: Record<string, string[]> = {};
  try {
    // A guest: the public pages, and a stored game imported from SGF
    const guest = await newPlayer(browser, info, contexts, 'guest');
    const g = guest.page;
    await g.goto('/paste');
    await g.locator('textarea[name="sgf"]').fill(readFileSync(fixture, 'utf8'));
    await g.locator('form.import button[type="submit"]').click();
    await expect(g).toHaveURL(/\/[A-Za-z0-9]{8}(\/(white|black))?$/);
    const id = new URL(g.url()).pathname.slice(1, 9);
    for (const path of [
      '/',
      '/training',
      '/analysis',
      '/paste',
      `/${id}`,
      `/${id}/analysis`,
      '/player',
      '/playground',
      '/signup',
      '/login',
      '/faq',
      '/source',
      '/credits',
    ])
      await check(g, path, path, problems);

    // A signed-in player (the Phase 6 demo's 5k, signed up once per server): their own pages
    const player = await newPlayer(browser, info, contexts, 'player');
    const p = player.page;
    const name = await rankedAccount(p, info, '5k');
    for (const path of [
      '/',
      `/@/${name}`,
      '/account/profile',
      '/account/preferences/display',
      '/training/dashboard/30',
    ])
      await check(p, path, `${path} (signed in)`, problems);

    expect([...guest.errors, ...player.errors]).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
  for (const [path, found] of Object.entries(problems)) expect.soft(found, path).toEqual([]);
});
