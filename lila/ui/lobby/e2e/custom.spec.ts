// The custom-game window (unit 6.8): one pre-filled modal for an open game and a challenge, opened from
// the grid's Custom tile, from the open-challenges tab and from a player's profile link, against the
// same stand-in lobby page as lobby.spec.ts. Run `ui/build` first.
import { expect, test, type Page } from '@playwright/test';

import { openLobby } from './page';

const modal = (page: Page) => page.locator('.dialog-content.game-setup');
const submit = (page: Page) => modal(page).locator('.lobby__start__button');
const openCustom = async (page: Page) => {
  await page.locator('.lpool--custom').click();
  await expect(modal(page)).toBeVisible();
};
// the window is not modal for the keyboard (dialog.show), so Escape doesn't close it: its X does
const closeModal = async (page: Page) => {
  await page.locator('dialog .close-button').click();
  await expect(modal(page)).toHaveCount(0);
};
const segment = (page: Page, name: string) => modal(page).getByRole('radio', { name, exact: true });
// the radios are drawn as buttons by their labels
const choose = (page: Page, name: string) =>
  modal(page)
    .locator('.setup-opponent label', { hasText: new RegExp(`^${name}$`) })
    .click();
const preset = (page: Page, name: string) => modal(page).locator('.setup-preset', { hasText: name });
const advanced = (page: Page) => modal(page).locator('details.setup-advanced');
const digest = (page: Page) => advanced(page).locator('.setup-advanced__digest');

test.describe('as a member', () => {
  test('the Custom tile opens the window on Anyone, with the presets and the options folded', async ({
    page,
  }) => {
    const { problems } = await openLobby(page, { member: true });
    await openCustom(page);
    await expect(modal(page).locator('h2')).toHaveText('Create a game');
    await expect(segment(page, 'Anyone')).toBeChecked();
    await expect(segment(page, 'Link for a friend')).not.toBeChecked();
    await expect(modal(page).locator('.setup-presets .setup-preset')).toHaveText([
      'Last settings',
      '19×19 Rapid10+5×30s',
      '9×9 Blitz3+3×20s',
      'Correspondence1 day',
    ]);
    await expect(preset(page, 'Last settings')).toHaveAttribute('aria-pressed', 'true');
    await expect(advanced(page)).not.toHaveAttribute('open', '');
    await expect(digest(page)).toHaveText(/^Japanese · Komi 6\.5 · Even · \S+–\S+$/);
    await expect(submit(page)).toHaveText('Create lobby game');
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('the first window starts from the quick-pairing chips, and then from its own last settings', async ({
    page,
  }) => {
    await openLobby(page, { member: true });
    await page.getByRole('button', { name: 'Casual', exact: true }).click();
    await openCustom(page);
    await expect(modal(page).locator('#sf_mode_casual')).toBeChecked();
    await modal(page).locator('label[for=sf_mode_rated]').click();
    await expect(modal(page).locator('#sf_mode_rated')).toBeChecked();
    await closeModal(page);
    // the chips now say Casual again, but the window has settings of its own
    await openCustom(page);
    await expect(modal(page).locator('#sf_mode_rated')).toBeChecked();
  });

  test('the last settings come back after a reload, and a casual game posts them', async ({ page }) => {
    const { hooks } = await openLobby(page, { member: true });
    await openCustom(page);
    await modal(page).locator('label[for=sf_size_9]').click();
    await modal(page).locator('label[for=sf_mode_casual]').click();
    await closeModal(page);
    await page.reload();
    await page.locator('.lpool').first().waitFor();
    await openCustom(page);
    await expect(modal(page).locator('#sf_size_9')).toBeChecked();
    await expect(modal(page).locator('#sf_mode_casual')).toBeChecked();
    await submit(page).click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({
      size: '9',
      mode: '0',
      ruleset: 'japanese',
      komi: '6.5',
      color: 'random',
    });
    expect(hooks[0].handicap).toBeUndefined();
  });

  test('a preset posts its board and clock', async ({ page }) => {
    const { hooks } = await openLobby(page, { member: true });
    await openCustom(page);
    await preset(page, '9×9 Blitz').click();
    await expect(preset(page, '9×9 Blitz')).toHaveAttribute('aria-pressed', 'true');
    await expect(preset(page, 'Last settings')).toHaveAttribute('aria-pressed', 'false');
    await expect(modal(page).locator('#sf_size_9')).toBeChecked();
    await modal(page).locator('label[for=sf_mode_casual]').click();
    await submit(page).click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({ size: '9', timeMode: '3', time: '3', periods: '3', periodTime: '20' });
  });

  test('Last settings undoes a preset', async ({ page }) => {
    await openLobby(page, { member: true });
    await openCustom(page);
    await preset(page, '9×9 Blitz').click();
    await expect(modal(page).locator('#sf_size_9')).toBeChecked();
    await preset(page, 'Last settings').click();
    await expect(modal(page).locator('#sf_size_19')).toBeChecked();
    await expect(preset(page, 'Last settings')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the correspondence preset posts days', async ({ page }) => {
    const { hooks } = await openLobby(page, { member: true });
    await openCustom(page);
    await preset(page, 'Correspondence').click();
    await modal(page).locator('label[for=sf_mode_casual]').click();
    await submit(page).click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({ size: '19', timeMode: '2', days: '1' });
  });

  test('switching the opponent keeps the settings, and a link sends a challenge with no player', async ({
    page,
  }) => {
    const { hooks, friends } = await openLobby(page, { member: true });
    await openCustom(page);
    await preset(page, '9×9 Blitz').click();
    await modal(page).locator('label[for=sf_mode_casual]').click();
    await choose(page, 'Link for a friend');
    await expect(modal(page).locator('h2')).toHaveText('Challenge a friend');
    await expect(submit(page)).toHaveText('Create challenge link');
    await expect(modal(page).locator('#sf_size_9')).toBeChecked();
    await expect(preset(page, '9×9 Blitz')).toHaveAttribute('aria-pressed', 'true');
    await modal(page).getByText('Advanced settings').click();
    await modal(page).locator('#sf_handicap').selectOption('3');
    await expect(digest(page)).toContainText('Komi 0.5');
    await choose(page, 'Anyone');
    await expect(digest(page)).toContainText('Even');
    await choose(page, 'Link for a friend');
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('3');
    await submit(page).click();
    await expect.poll(() => friends.length).toBe(1);
    expect(friends[0].user).toBeNull();
    expect(friends[0].form).toMatchObject({ size: '9', handicap: '3', komi: '0.5', timeMode: '3' });
    expect(hooks).toHaveLength(0);
  });

  test('the advanced options open and close by hand', async ({ page }) => {
    await openLobby(page, { member: true });
    await openCustom(page);
    await expect(modal(page).locator('#sf_komi')).toBeHidden();
    await advanced(page).locator('summary').click();
    await expect(modal(page).locator('#sf_komi')).toBeVisible();
    await expect(modal(page).locator('#sf_ruleset')).toBeVisible();
    await expect(modal(page).locator('.rating-range')).toBeVisible();
    await modal(page).locator('#sf_ruleset').selectOption('chinese');
    await expect(digest(page)).toContainText('Chinese · Komi 7.5');
    await advanced(page).locator('summary').click();
    await expect(modal(page).locator('#sf_komi')).toBeHidden();
  });

  test('a touch target is at least 44 px high', async ({ page }) => {
    await openLobby(page, { member: true });
    await openCustom(page);
    for (const el of [
      modal(page).locator('.setup-opponent label', { hasText: 'Anyone' }),
      preset(page, 'Last settings'),
      preset(page, '9×9 Blitz'),
      advanced(page).locator('summary'),
      submit(page),
    ]) {
      const box = await el.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe('from the open challenges', () => {
  test('the live list opens the window on a real-time clock, for a guest too', async ({ page }) => {
    const { hooks } = await openLobby(page);
    await page.getByRole('tab', { name: 'Open challenges' }).click();
    await page.getByRole('button', { name: 'Create a game', exact: true }).click();
    await expect(modal(page)).toBeVisible();
    await expect(segment(page, 'Anyone')).toBeChecked();
    await expect(modal(page).locator('.setup-rated-signup')).toContainText('Sign up to play rated games');
    await expect(modal(page).locator('#sf_mode_rated')).toHaveCount(0);
    await submit(page).click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({ timeMode: '1', mode: '0' });
  });

  test('the live list opens a member’s window on a real-time clock', async ({ page }) => {
    await openLobby(page, { member: true });
    await page.getByRole('tab', { name: 'Open challenges' }).click();
    await page.getByRole('button', { name: 'Create a game', exact: true }).click();
    await expect(modal(page).locator('.time-control-tabs button.active')).toHaveText('Real time');
  });

  test('a guest has no correspondence preset and posts a casual game', async ({ page }) => {
    const { hooks } = await openLobby(page);
    await openCustom(page);
    await expect(modal(page).locator('.setup-presets .setup-preset')).toHaveText([
      'Last settings',
      '19×19 Rapid10+10',
      '9×9 Blitz3+2',
    ]);
    // a guest's presets are Fischer clocks, the one clock their open game has, and the preset lights up
    await preset(page, '9×9 Blitz').click();
    await expect(preset(page, '9×9 Blitz')).toHaveAttribute('aria-pressed', 'true');
    await submit(page).click();
    await expect.poll(() => hooks.length).toBe(1);
    expect(hooks[0]).toMatchObject({ mode: '0', size: '9', timeMode: '1', time: '3', increment: '2' });
  });

  test('the correspondence list opens it on a correspondence clock', async ({ page }) => {
    await openLobby(page, { member: true });
    await page.getByRole('tab', { name: 'Open challenges' }).click();
    await page.getByRole('button', { name: 'Correspondence', exact: true }).click();
    await page.getByRole('button', { name: 'Create a game', exact: true }).click();
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('.time-control-tabs button.active')).toHaveText('Correspondence');
  });
});

test.describe('from a profile', () => {
  test('the window names the player and fills the suggested stones', async ({ page }) => {
    const { friends, adviceAsked, problems } = await openLobby(page, {
      member: true,
      path: '/?user=Shiro#friend',
    });
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('h2')).toHaveText('Challenge Shiro');
    await expect(segment(page, 'Shiro')).toBeChecked();
    await expect(submit(page)).toHaveText('Send challenge');
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('5');
    await expect(advanced(page)).toHaveAttribute('open', '');
    await expect(modal(page).locator('.setup-suggested-stones')).toBeVisible();
    expect(adviceAsked).toEqual(['Shiro']);
    // a rated handicap game's colours come from the ranks
    await modal(page).locator('label[for=sf_mode_rated]').click();
    await expect(modal(page).locator('.setup-locked-color')).toHaveText('You play Black.');
    await modal(page).locator('label[for=sf_mode_casual]').click();
    await submit(page).click();
    await expect.poll(() => friends.length).toBe(1);
    expect(friends[0].user).toBe('Shiro');
    expect(friends[0].form).toMatchObject({ handicap: '5', komi: '0.5', size: '19' });
    expect(problems.errors).toEqual([]);
  });

  test('the suggestion follows the board until the player picks the stones', async ({ page }) => {
    await openLobby(page, { member: true, path: '/?user=Shiro#friend' });
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('5');
    await modal(page).locator('label[for=sf_size_9]').click();
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('1');
    await modal(page).locator('#sf_handicap').selectOption('0');
    await modal(page).locator('label[for=sf_size_19]').click();
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('0');
  });

  test('stones a link fixed are not replaced, and the options open', async ({ page }) => {
    await openLobby(page, { member: true, path: '/?user=Shiro&handicap=2&komi=0.5#friend' });
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('2');
    await expect(advanced(page)).toHaveAttribute('open', '');
    await modal(page).locator('label[for=sf_size_9]').click();
    await expect(modal(page).locator('#sf_handicap')).toHaveValue('2');
  });

  test('another opponent can be chosen without losing the named player', async ({ page }) => {
    await openLobby(page, { member: true, path: '/?user=Shiro#friend' });
    await choose(page, 'Anyone');
    await expect(modal(page).locator('h2')).toHaveText('Create a game');
    await expect(modal(page).locator('#sf_handicap')).toHaveCount(0);
    await choose(page, 'Shiro');
    await expect(modal(page).locator('h2')).toHaveText('Challenge Shiro');
  });

  test('a plain #friend link opens on the challenge link', async ({ page }) => {
    await openLobby(page, { member: true, path: '/#friend' });
    await expect(segment(page, 'Link for a friend')).toBeChecked();
    await expect(modal(page).locator('h2')).toHaveText('Challenge a friend');
    await expect(modal(page).locator('.setup-opponent input')).toHaveCount(2);
  });

  test('a #hook link opens on Anyone', async ({ page }) => {
    await openLobby(page, { member: true, path: '/#hook' });
    await expect(segment(page, 'Anyone')).toBeChecked();
  });
});

test('the opponent choice is a radio group the arrow keys move through', async ({ page }) => {
  await openLobby(page, { member: true, path: '/?user=Shiro#friend' });
  await expect(segment(page, 'Shiro')).toBeChecked();
  await segment(page, 'Shiro').focus();
  await page.keyboard.press('ArrowRight');
  await expect(segment(page, 'Link for a friend')).toBeChecked();
  await expect(modal(page).locator('h2')).toHaveText('Challenge a friend');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(segment(page, 'Anyone')).toBeChecked();
  await expect(modal(page).locator('h2')).toHaveText('Create a game');
});

test('closing a named player’s window leaves the suggested stones out of the next one', async ({ page }) => {
  await openLobby(page, { member: true, path: '/?user=Shiro#friend' });
  await expect(modal(page).locator('#sf_handicap')).toHaveValue('5');
  await closeModal(page);
  await openCustom(page);
  await choose(page, 'Link for a friend');
  await expect(modal(page).locator('#sf_handicap')).toHaveValue('0');
  await expect(digest(page)).toContainText('Komi 6.5');
});
