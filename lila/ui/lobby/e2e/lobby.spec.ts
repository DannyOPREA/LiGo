// The lobby page's quick pairing (unit 6.6, ADR 0022 §1, §2, §4): the tiles in three columns, a click
// that waits on a tile, the server's word on who you can meet, the chips and their memory, against a
// stand-in for the lobby's socket (page.ts). Run `ui/build` first. The page's clock is frozen, so the
// elapsed time moves only when a test runs the clock.
import { expect, test, type Page } from '@playwright/test';

import { corres, openLobby, pools, tile } from './page';

const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const column = (page: Page, title: string) => page.getByRole('group', { name: title, exact: true });

test.describe('as a member', () => {
  test('the seven pools and two correspondence tiles sit in three columns', async ({ page }) => {
    const { problems } = await openLobby(page, { member: true });
    await expect(page.locator('.lpools__title')).toHaveText(['9×9', '19×19', 'Correspondence']);
    await expect(column(page, '9×9').locator('.lpool')).toHaveCount(3);
    await expect(column(page, '19×19').locator('.lpool')).toHaveCount(4);
    await expect(column(page, 'Correspondence').locator('.lpool')).toHaveCount(2);
    await expect(page.locator('.lpool--custom')).toHaveText('Custom');
    for (const p of pools) await expect(tile(page, p.id).locator('.clock')).toHaveText(p.clock);
    for (const c of corres) await expect(tile(page, c.id)).toBeVisible();
    // side by side: the columns share one row, in order
    const boxes = await page
      .locator('.lpools__col')
      .evaluateAll(cols => cols.map(c => c.getBoundingClientRect()));
    expect(boxes).toHaveLength(3);
    expect(boxes[1].left).toBeGreaterThan(boxes[0].right - 1);
    expect(boxes[2].left).toBeGreaterThan(boxes[1].right - 1);
    expect(boxes[0].top).toBe(boxes[1].top);
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('a click on a tile joins its pool, accepting handicap games', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => server.sent('poolIn')).toEqual([{ id: '9x9-3m-2s', handicap: true }]);
    await expect(tile(page, '9x9-3m-2s')).toHaveClass(/active/);
    await expect(tile(page, '9x9-1m-5x10s')).toHaveClass(/transp/);
  });

  test('the ranks you can meet appear on the tile once the server sends them', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '19x19-10m-5x30s').click();
    await expect(tile(page, '19x19-10m-5x30s').locator('.spinner')).toBeVisible();
    server.poolRange({ id: '19x19-10m-5x30s', weakest: '3k', strongest: '1d', stones: 2 });
    const waiting = tile(page, '19x19-10m-5x30s').locator('.lpool__waiting');
    await expect(waiting).toContainText('Can meet 3k–1d');
    await expect(waiting.locator('.lpool__stones')).toContainText('2');
    await expect(waiting.locator('.spinner')).toHaveCount(0);
  });

  test('a range for another pool is ignored', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '19x19-10m-5x30s').click();
    server.poolRange({ id: '9x9-3m-2s', weakest: '3k', strongest: '1d', stones: 0 });
    server.poolSizes({ '19x19-10m-5x30s': 1 }); // a later redraw, so the ignored range had its chance
    await expect(tile(page, '19x19-10m-5x30s').locator('.lpool__count')).toHaveText('1 waiting');
    await expect(tile(page, '19x19-10m-5x30s').locator('.spinner')).toBeVisible();
    await expect(page.locator('.range')).toHaveCount(0);
  });

  test('the waiting tile counts the time since the click', async ({ page }) => {
    await openLobby(page, { member: true });
    await tile(page, '9x9-3m-2s').click();
    const elapsed = tile(page, '9x9-3m-2s').locator('.lpool__elapsed');
    await expect(elapsed).toHaveText('0:00');
    await page.clock.runFor(65_000);
    await expect(elapsed).toHaveText('1:05');
  });

  test('Cancel leaves the pool and the tile goes back to idle', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '9x9-3m-2s').click();
    server.poolRange({ id: '9x9-3m-2s', weakest: '3k', strongest: '1d', stones: 0 });
    await expect(tile(page, '9x9-3m-2s').locator('.range')).toBeVisible();
    await tile(page, '9x9-3m-2s').getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => server.sent('poolOut')).toEqual(['9x9-3m-2s']);
    await expect(tile(page, '9x9-3m-2s')).not.toHaveClass(/active/);
    await expect(tile(page, '9x9-3m-2s').locator('.lpool__waiting')).toHaveCount(0);
    await expect(page.locator('.lpool.transp')).toHaveCount(0);
  });

  test('a second click on the waiting tile cancels it too', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '9x9-3m-2s').click();
    await expect(tile(page, '9x9-3m-2s')).toHaveClass(/active/);
    await tile(page, '9x9-3m-2s').locator('.clock').click();
    await expect.poll(() => server.sent('poolOut')).toEqual(['9x9-3m-2s']);
    await expect(tile(page, '9x9-3m-2s')).not.toHaveClass(/active/);
  });

  test('the pushed pool sizes show as waiting counts', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await expect(tile(page, '9x9-3m-2s').locator('.lpool__count')).toBeVisible(); // an honest 0 is shown
    await expect(tile(page, '9x9-3m-2s').locator('.lpool__count')).toHaveText('0 waiting');
    server.poolSizes({ '9x9-3m-2s': 3, '19x19-10m-5x30s': 1 });
    await expect(tile(page, '9x9-3m-2s').locator('.lpool__count')).toHaveText('3 waiting');
    await expect(tile(page, '19x19-10m-5x30s').locator('.lpool__count')).toHaveText('1 waiting');
    await expect(tile(page, '9x9-1m-5x10s').locator('.lpool__count')).toHaveText('0 waiting');
    await expect(tile(page, '9x9-1m-5x10s').locator('.lpool__count')).toBeVisible();
  });

  test('choosing Casual switches the handicap chips off', async ({ page }) => {
    await openLobby(page, { member: true });
    await expect(chip(page, 'Rated')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Handicap OK')).toBeEnabled();
    await chip(page, 'Casual').click();
    await expect(chip(page, 'Casual')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Handicap OK')).toBeDisabled();
    await expect(chip(page, 'Even only')).toBeDisabled();
    await chip(page, 'Rated').click();
    await expect(chip(page, 'Handicap OK')).toBeEnabled();
  });

  test('a Casual click on a tile posts an open game with the tile’s board and clock', async ({ page }) => {
    const { server, hooks } = await openLobby(page, { member: true });
    await chip(page, 'Casual').click();
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({
      mode: '0',
      size: '9',
      timeMode: '1',
      time: '3',
      increment: '2',
      variant: '1',
    });
    expect(server.sent('poolIn')).toEqual([]);
    await expect(tile(page, '9x9-3m-2s')).toHaveClass(/active/);
  });

  test('a Casual click on a byo-yomi tile posts its periods', async ({ page }) => {
    const { hooks } = await openLobby(page, { member: true });
    await chip(page, 'Casual').click();
    await tile(page, '19x19-10m-5x30s').click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({
      mode: '0',
      size: '19',
      timeMode: '3',
      time: '10',
      periods: '5',
      periodTime: '30',
    });
  });

  test('a correspondence click posts a rated seek, then reads the seeks', async ({ page }) => {
    const { hooks } = await openLobby(page, { member: true });
    const seeks = page.waitForRequest(r => new URL(r.url()).pathname === '/lobby/seeks');
    await tile(page, '19x19-3d').click();
    await seeks;
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ timeMode: '2', days: '3', size: '19', ruleset: 'japanese', mode: '1' });
  });

  test('Even only joins the pool refusing handicap games', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await chip(page, 'Even only').click();
    await expect(chip(page, 'Even only')).toHaveAttribute('aria-pressed', 'true');
    await tile(page, '9x9-1m-5x10s').click();
    await expect.poll(() => server.sent('poolIn')).toEqual([{ id: '9x9-1m-5x10s', handicap: false }]);
  });

  test('changing Handicap OK while waiting tells the pool', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '9x9-1m-5x10s').click();
    await expect.poll(() => server.sent('poolIn')).toHaveLength(1);
    await chip(page, 'Even only').click();
    await expect
      .poll(() => server.sent('poolIn'))
      .toEqual([
        { id: '9x9-1m-5x10s', handicap: true },
        { id: '9x9-1m-5x10s', handicap: false },
      ]);
  });

  test('the chip choice survives a reload', async ({ page }) => {
    await openLobby(page, { member: true });
    await chip(page, 'Even only').click();
    await page.reload();
    await page.locator('.lpool').first().waitFor();
    await expect(chip(page, 'Even only')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Handicap OK')).toHaveAttribute('aria-pressed', 'false');
    await chip(page, 'Casual').click();
    await page.reload();
    await page.locator('.lpool').first().waitFor();
    await expect(chip(page, 'Casual')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Even only')).toBeDisabled();
  });

  test('Enter on a focused tile joins it', async ({ page }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '19x19-5m-5x10s').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => server.sent('poolIn')).toEqual([{ id: '19x19-5m-5x10s', handicap: true }]);
  });

  test('Space on a focused tile joins it, and Enter on Cancel cancels without joining again', async ({
    page,
  }) => {
    const { server } = await openLobby(page, { member: true });
    await tile(page, '19x19-5m-5x10s').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => server.sent('poolIn')).toHaveLength(1);
    await tile(page, '19x19-5m-5x10s').getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => server.sent('poolOut')).toEqual(['19x19-5m-5x10s']);
    expect(server.sent('poolIn')).toHaveLength(1);
  });
  test('switching to Casual while waiting in a pool leaves the pool', async ({ page }) => {
    const { server, hooks } = await openLobby(page, { member: true });
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => server.sent('poolIn')).toHaveLength(1);
    await chip(page, 'Casual').click();
    await expect.poll(() => server.sent('poolOut')).toEqual(['9x9-3m-2s']);
    await expect(tile(page, '9x9-3m-2s')).not.toHaveClass(/active/);
    expect(server.sent('poolIn')).toHaveLength(1);
    expect(hooks).toEqual([]);
  });

  test('Cancel on a Casual tile cancels the open game', async ({ page }) => {
    const { server, hooks } = await openLobby(page, { member: true });
    await chip(page, 'Casual').click();
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => hooks.length).toBe(1);
    await tile(page, '9x9-3m-2s').getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => server.received.filter(m => m.t === 'cancel')).toHaveLength(1);
    await expect(tile(page, '9x9-3m-2s')).not.toHaveClass(/active/);
  });

  test('moving from one Casual tile to another posts the new game without cancelling it', async ({
    page,
  }) => {
    const { server, hooks } = await openLobby(page, { member: true });
    await chip(page, 'Casual').click();
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => hooks.length).toBe(1);
    await tile(page, '9x9-1m-5x10s').click();
    await expect.poll(() => hooks.length).toBe(2);
    expect(hooks[1]).toMatchObject({ size: '9', timeMode: '3', time: '1' });
    // the new open game replaces the old one on the server; a socket cancel could race it and remove it
    expect(server.received.filter(m => m.t === 'cancel')).toEqual([]);
    await expect(tile(page, '9x9-1m-5x10s')).toHaveClass(/active/);
  });

  test('Cancel on a correspondence tile cancels your seek', async ({ page }) => {
    const { server, hooks, seeks } = await openLobby(page, { member: true });
    seeks.push({
      id: 'seek1',
      username: 'Kuro',
      rating: 1650,
      mode: 1,
      days: 3,
      perf: { key: 'correspondence' },
      go: { size: 19, rules: 'japanese', komi: 6.5 },
    });
    const read = page.waitForResponse(r => new URL(r.url()).pathname === '/lobby/seeks');
    await tile(page, '19x19-3d').click();
    await read;
    await expect.poll(() => hooks.length).toBe(1);
    await tile(page, '19x19-3d').getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => server.sent('cancelSeek')).toEqual(['seek1']);
    await expect(tile(page, '19x19-3d')).not.toHaveClass(/active/);
  });

  test('the waiting tile is no button itself, so its Cancel is the one to press', async ({ page }) => {
    await openLobby(page, { member: true });
    await expect(tile(page, '9x9-3m-2s')).toHaveAttribute('role', 'button');
    await tile(page, '9x9-3m-2s').click();
    await expect(tile(page, '9x9-3m-2s')).toHaveClass(/active/);
    await expect(tile(page, '9x9-3m-2s')).not.toHaveAttribute('role', 'button');
    await expect(tile(page, '9x9-3m-2s')).not.toHaveAttribute('tabindex', '0');
    await expect(tile(page, '9x9-3m-2s').getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});

test.describe('as a guest', () => {
  test('the sign-up link takes the place of the Rated chip', async ({ page }) => {
    await openLobby(page);
    await expect(page.getByRole('link', { name: 'Sign up to play rated games' })).toHaveAttribute(
      'href',
      '/signup',
    );
    await expect(chip(page, 'Rated')).toHaveCount(0);
    await expect(chip(page, 'Casual')).toHaveCount(0);
    await expect(chip(page, 'Handicap OK')).toBeDisabled();
    await expect(chip(page, 'Even only')).toBeDisabled();
  });

  test('a click on a tile posts a casual open game, never a pool entry', async ({ page }) => {
    const { server, hooks } = await openLobby(page);
    await tile(page, '9x9-3m-2s').click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({ mode: '0', size: '9', timeMode: '1', time: '3', increment: '2' });
    expect(server.sent('poolIn')).toEqual([]);
  });

  test('a correspondence tile asks a guest to sign up, and posts nothing', async ({ page }) => {
    const { hooks } = await openLobby(page);
    await tile(page, '19x19-1d').click();
    const dialog = page.locator('dialog');
    await expect(dialog).toContainText('Correspondence games need an account');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(hooks).toEqual([]);
    await tile(page, '19x19-1d').click();
    const signup = page.waitForRequest(r => new URL(r.url()).pathname === '/signup');
    await page.locator('dialog').getByRole('button', { name: 'Register' }).click();
    await signup;
    expect(hooks).toEqual([]);
  });
});
