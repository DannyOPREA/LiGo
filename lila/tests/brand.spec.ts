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

// LiGo unit 3.8: lichess's name, social links and chess-only FAQ questions are gone from the kept pages.

const pagesWithoutLichessName = ['/', '/faq', '/contact', '/lag', '/developers', '/source'];

for (const path of pagesWithoutLichessName) {
  test(`${path} does not call the site Lichess`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // open every collapsed FAQ answer so its text counts too
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('Lichess');
    expect(text).not.toContain('lichess.org');
  });
}

test('home footer links to LiGo, not to lichess social accounts', async ({ page }) => {
  await page.goto('/');
  const about = page.locator('.lobby__about');
  await expect(about.locator(`a[href="${repo}"]`)).toHaveText('GitHub');
  await expect(about.locator('a[href="/faq#what"]')).toHaveText('About LiGo');
  for (const gone of ['discord', 'twitch', 'youtube', 'mastodon', 'bsky', 'lichess-org', '/app', '/ads'])
    await expect(about.locator(`a[href*="${gone}"]`)).toHaveCount(0);
});

test('FAQ starts with LiGo questions and drops the chess-only ones', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.locator('#what summary')).toHaveText('What is LiGo?');
  await expect(page.locator('#rules summary')).toHaveText('Which rules does LiGo use?');
  await expect(page.locator('#rules a')).toHaveAttribute('href', `${repo}/blob/main/docs/rules/spec.md`);
  for (const gone of ['variants', 'en-passant', 'threefold', 'titles', 'lm', 'trophies', 'make-a-bot'])
    await expect(page.locator(`#${gone}`)).toHaveCount(0);
});

test('contact page sends bug reports to the LiGo repository', async ({ page }) => {
  await page.goto('/contact');
  const links = page.locator('.nav-tree a[href*="github.com"]');
  const hrefs = await links.evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(href.startsWith(repo)).toBe(true);
  await expect(page.locator('.nav-tree a[href*="discord"]')).toHaveCount(0);
});

test('web manifest names LiGo', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.name).toBe('LiGo');
  expect(manifest.short_name).toBe('LiGo');
  expect(manifest.description).toContain('Go server');
});
