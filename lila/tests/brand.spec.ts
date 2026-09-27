import { test, expect } from '@playwright/test';

// LiGo unit 0.7: the site carries LiGo's name, and its AGPL §13 source links point at LiGo's repo.
// Needs no seeded database.

const repo = 'https://github.com/DannyOPREA/LiGo';

test('header and page titles say LiGo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('site-title')).toContainText('LiGo');
  await expect(page).toHaveTitle(/^LiGo • /);
  await page.goto('/player');
  await expect(page).toHaveTitle(/ • LiGo$/);
});

test('page source points at the LiGo repository', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).toContain(`<!-- LiGo is open source! See ${repo} -->`);
});

test('source page works without a CMS page and links to the LiGo repository', async ({ page }) => {
  const response = await page.goto('/source');
  expect(response?.status()).toBe(200);
  await expect(page.locator(`main a[href="${repo}"]`).first()).toBeVisible();
  await expect(page.locator('#asset-version-commit')).toHaveAttribute(
    'href',
    new RegExp(`^${repo}/commits/`),
  );
  await expect(page.locator('#asset-version-upcoming')).toHaveAttribute('href', /\.\.\.main$/);
});

test('source page as markdown links to the LiGo repository', async ({ request }) => {
  const response = await request.get('/source?output_format=md');
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(repo);
});
