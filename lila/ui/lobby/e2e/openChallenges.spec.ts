// The lobby's Open challenges list (unit 6.7 part two, ADR 0022 §5) on the built page, against the
// stand-in socket (page.ts): the rows that suit you follow the Quick tab's chip row and come first by
// rank closeness, the even/handicap filter chips, a greyed row that does nothing, and a phone card that
// says why it is greyed. Then screenshots at desktop and phone sizes, compared with the baselines in
// __screenshots__/ (re-record them as snapshots.spec.ts says). Run `ui/build` first.
// Licence: AGPL-3.0-or-later, like the rest of lila.
import { expect, test, type Page } from '@playwright/test';

import { openLobby, type Opened } from './page';

const go = (handicap = 0) => ({ size: 19, rules: 'japanese', komi: handicap ? 0.5 : 6.5, handicap });

const hook = (id: string, over: Record<string, unknown>) => ({
  id,
  sri: `sri-${id}`,
  clock: '10+5×30s',
  t: 1350,
  s: 5,
  i: 0,
  byo: { limit: 600, periods: 5, period: 30 },
  perf: 'go',
  action: 'join',
  auth: true,
  go: go(),
  ...over,
});

// The viewer is Kuro, rated 1650: 4k (1615 to 1685).
const hooks = [
  hook('ShiroAAA', { u: 'Shiro', rating: 1700, goRank: '3k', ra: 1 }), // rated, a rank away
  hook('AoAAAAAA', { u: 'Ao', rating: 1620, goRank: '4k', ra: 1 }), // rated, 4k, 30 points
  hook('MidoriAA', { u: 'Midori', rating: 1640, goRank: '4k', ra: 1, go: go(2) }), // rated, 2 stones
  hook('AkaAAAAA', { u: 'Aka', rating: 1670, goRank: '4k', clock: '5+5×10s', t: 600, s: 2 }), // casual
  hook('KiiroAAA', {
    u: 'Kiiro',
    rating: 2000,
    goRank: '2d',
    ra: 1,
    rr: { min: 1919, max: 2900, low: '1d' },
  }), // rated, 1d and up only
  hook('GuestAAA', { auth: false, clock: '3+2', t: 300, s: 2, i: 2, byo: undefined, go: go() }), // a guest's
];

const seeks = [
  { id: 'sk1', username: 'Shiro', rating: 1700, goRank: '3k', mode: 1, days: 3, perf: { key: 'go' } },
  { id: 'sk2', username: 'Ao', rating: 1620, goRank: '4k', mode: 0, days: 1, perf: { key: 'go' } },
  {
    id: 'sk3',
    username: 'Midori',
    rating: 1640,
    goRank: '4k',
    mode: 1,
    days: 7,
    perf: { key: 'go' },
    rr: { min: 400, max: 1600, high: '5k' },
  },
].map(s => ({ action: 'joinSeek', go: go(), ...s }));

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const rows = (page: Page) => page.locator('.hooks__list tbody tr');
const ids = (page: Page) => rows(page).evaluateAll(trs => trs.map(tr => (tr as HTMLElement).dataset['id']));
const suiting = (page: Page) =>
  page
    .locator('.hooks__list tbody tr.suits')
    .evaluateAll(trs => trs.map(tr => (tr as HTMLElement).dataset['id']));
const row = (page: Page, id: string) => page.locator(`.hooks__list tbody tr[data-id="${id}"]`);
const chip = (page: Page, group: string, name: string) =>
  page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true });

/** Opens the Open challenges tab's Live list with the hooks above. */
async function openLive(page: Page, member: boolean): Promise<Opened> {
  const opened = await openLobby(page, { member });
  await tab(page, 'Open challenges').click();
  await expect.poll(() => opened.server.sent('hookIn').length).toBe(1);
  opened.server.hooks(hooks);
  await expect(rows(page)).toHaveCount(hooks.length);
  return opened;
}

test.describe('as a member', () => {
  test('what suits you comes first, closest rank first, then the other joinable games, then the greyed ones', async ({
    page,
  }) => {
    const { problems } = await openLive(page, true);
    // Rated and Handicap OK (the Quick tab's defaults): every rated game you can join suits you
    await expect
      .poll(() => ids(page))
      .toEqual(['MidoriAA', 'AoAAAAAA', 'ShiroAAA', 'AkaAAAAA', 'KiiroAAA', 'GuestAAA']);
    expect(await suiting(page)).toEqual(['MidoriAA', 'AoAAAAAA', 'ShiroAAA']);
    // the accent: a green inset edge on a suiting row's first cell, none on the others
    const edge = (id: string) =>
      row(page, id)
        .locator('td')
        .first()
        .evaluate(td => getComputedStyle(td).boxShadow);
    expect(await edge('MidoriAA')).toMatch(/inset/);
    expect(await edge('AkaAAAAA')).toBe('none');
    await expect(row(page, 'KiiroAAA')).toHaveClass(/unjoinable/);
    await expect(row(page, 'GuestAAA')).toHaveClass(/unjoinable/);
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test("the order follows the Quick tab's chips", async ({ page }) => {
    await openLive(page, true);
    await tab(page, 'Quick pairing').click();
    await page.getByRole('button', { name: 'Even only', exact: true }).click();
    await tab(page, 'Open challenges').click();
    await expect
      .poll(() => ids(page))
      .toEqual(['AoAAAAAA', 'ShiroAAA', 'MidoriAA', 'AkaAAAAA', 'KiiroAAA', 'GuestAAA']);
    expect(await suiting(page)).toEqual(['AoAAAAAA', 'ShiroAAA']);

    await tab(page, 'Quick pairing').click();
    await page.getByRole('button', { name: 'Casual', exact: true }).click();
    await tab(page, 'Open challenges').click();
    await expect.poll(() => suiting(page)).toEqual(['AkaAAAAA']);
    expect((await ids(page))[0]).toBe('AkaAAAAA');
  });

  test('the even/handicap chips filter the list, and remember it', async ({ page }) => {
    await openLive(page, true);
    await chip(page, 'Handicap', 'Handicap').click();
    await expect(chip(page, 'Handicap', 'Handicap')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => ids(page)).toEqual(['MidoriAA']);
    await chip(page, 'Handicap', 'Even').click();
    await expect(rows(page)).toHaveCount(hooks.length);
    await chip(page, 'Handicap', 'Handicap').click();
    await expect.poll(() => ids(page)).toEqual(['AoAAAAAA', 'ShiroAAA', 'AkaAAAAA', 'KiiroAAA', 'GuestAAA']);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('lobby.chips') ?? 'null')?.handicap),
    ).toEqual(['even']);
  });

  test('a greyed row does nothing when clicked; a joinable one joins', async ({ page }) => {
    const { server } = await openLive(page, true);
    // aria-disabled, so Playwright would wait for it to be enabled: a person can still click it
    await row(page, 'KiiroAAA').click({ force: true });
    await row(page, 'AoAAAAAA').click();
    await expect.poll(() => server.sent('join')).toEqual(['AoAAAAAA']);
  });

  test('a greyed row gives its reason as its title on a desktop, not as a line', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLive(page, true);
    await expect(row(page, 'KiiroAAA')).toHaveAttribute(
      'title',
      "Your rank is outside this game's range (1d+)",
    );
    await expect(row(page, 'KiiroAAA').locator('td.reason')).toBeHidden();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a greyed card says why on a line of its own', async ({ page }) => {
    await openLive(page, true);
    await expect(row(page, 'KiiroAAA').locator('td.reason')).toBeVisible();
    await expect(row(page, 'KiiroAAA').locator('td.reason')).toHaveText(
      "Your rank is outside this game's range (1d+)",
    );
    await expect(row(page, 'GuestAAA').locator('td.reason')).toHaveText('For guests');
    await expect(row(page, 'AoAAAAAA').locator('td.reason')).toHaveCount(0);
    // the reason is not faded with the rest of the greyed card, and the card (not its cell) has the accent
    expect(
      await row(page, 'KiiroAAA')
        .locator('td.reason')
        .evaluate(td => getComputedStyle(td).opacity),
    ).toBe('1');
    expect(await row(page, 'AoAAAAAA').evaluate(tr => getComputedStyle(tr).boxShadow)).toMatch(/inset/);
    expect(
      await row(page, 'AoAAAAAA')
        .locator('td.player')
        .evaluate(td => getComputedStyle(td).boxShadow),
    ).toBe('none');
    // the line sits under the card's other two
    const [reason, board] = await Promise.all([
      row(page, 'KiiroAAA').locator('td.reason').boundingBox(),
      row(page, 'KiiroAAA').locator('td.board').boundingBox(),
    ]);
    expect(reason!.y).toBeGreaterThan(board!.y + board!.height - 1);
  });
});

// ---- screenshots ----

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

async function snap(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0); // no hover on a row in the picture
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixels: 600 });
}

for (const [device, options] of Object.entries(viewports))
  test.describe(`${device} pictures`, () => {
    test.use(options);

    test('open challenges, live, as a member', async ({ page }) => {
      await openLive(page, true);
      await snap(page, `${device}-open-live`);
    });

    test('open challenges, live, as a guest', async ({ page }) => {
      await openLive(page, false);
      await snap(page, `${device}-open-guest`);
    });

    test('open challenges, correspondence', async ({ page }) => {
      const { seeks: served } = await openLobby(page, { member: true });
      served.push(...seeks);
      await tab(page, 'Open challenges').click();
      await page.getByRole('button', { name: 'Correspondence', exact: true }).click();
      await expect(rows(page)).toHaveCount(seeks.length);
      await snap(page, `${device}-open-corres`);
    });

    test('open challenges, filters pressed', async ({ page }) => {
      await openLive(page, true);
      await chip(page, 'Board size', '19×19').click();
      await chip(page, 'Handicap', 'Even').click();
      await expect(rows(page)).toHaveCount(hooks.length - 1);
      await snap(page, `${device}-open-filters`);
    });
  });
