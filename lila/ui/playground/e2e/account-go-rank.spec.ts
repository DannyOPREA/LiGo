// The "Your Go rank" account page (unit 5.4, ADR 0021 §2) at desktop and phone sizes, open (a rank
// can still be chosen) and locked (after the first rated game): a screenshot, no serious or critical
// WCAG 2.2 AA problem, and the choices it offers. As in credits.spec.ts, the page is a trimmed copy of
// what lila renders (AccountUi.AccountPage around AccountPages.goRank, with the account menu), with
// the CSS lila sends for it, served without a lila server. The test-only `account-shot` class lets
// screenshot.css hide the glyphs in the pictures.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');

// GoRating.Rank.all, weakest first
const ranks = [
  ...Array.from({ length: 25 }, (_, i) => `${25 - i}k`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}d`),
];

const menu = [
  ['editProfile', 'Edit profile'],
  ['notification', 'Notifications'],
  ['kid', 'Kid mode'],
  ['username', 'Change username'],
  ['goRank', 'Your Go rank'],
  ['password', 'Change password'],
  ['email', 'Change email'],
  ['security', 'Security'],
  ['close', 'Close account'],
];

function html(open: boolean): string {
  const m = JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const options = [['', "I don't know"], ...ranks.map(r => [r, r])]
    .map(([v, n]) => `<option value="${v}"${v === '5k' ? ' selected' : ''}>${n}</option>`)
    .join('');
  const body = open
    ? `<form class="form3" method="post" action="/account/go-rank">
<div class="form-group form-full"><label class="form-label" for="form3-goRank">Your Go rank</label>
<select name="goRank" class="form-control" id="form3-goRank">${options}</select>
<small class="form-help">Your Go rating starts there. You can change it until your first rated game starts.</small></div>
<div class="form-actions single"><button type="submit" data-icon="" class="submit button text">Apply</button></div>
</form>`
    : '<p>Your Go rank now changes only through rated games.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Go rank • LiGo</title>
${css('lib.theme.all')}${css('site')}${css('user.account')}</head>
<body data-theme="dark"><div id="main-wrap"><main class="account page-menu account-shot">
<aside class="subnav"><nav class="subnav__inner page-menu__menu">${menu
    .map(([k, n]) => `<a${k === 'goRank' ? ' class="active"' : ''} href="/account/${k}">${n}</a>`)
    .join('')}</nav></aside>
<div class="page-menu__content"><div class="box box-pad"><h1 class="box__top">Your Go rank</h1>${body}</div></div>
</main></div></body></html>`;
}

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    for (const open of [true, false])
      test(`the Go rank page, ${open ? 'open' : 'locked'}`, async ({ page }) => {
        const missing: string[] = [];
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/account/go-rank')
            return route.fulfill({ contentType: 'text/html', body: html(open) });
          if (url.pathname.startsWith('/assets/')) {
            const file = join(publicDir, decodeURIComponent(url.pathname.slice('/assets/'.length)));
            if (file.startsWith(publicDir + '/'))
              try {
                const type = file.endsWith('.css')
                  ? 'text/css'
                  : file.endsWith('.woff2')
                    ? 'font/woff2'
                    : undefined;
                return route.fulfill({ contentType: type, body: readFileSync(file) });
              } catch {
                /* reported below */
              }
          }
          missing.push(url.href);
          return route.fulfill({ status: 404 });
        });
        await page.goto('http://ligo.test/account/go-rank');
        await page.evaluate(() => document.fonts.ready);

        await expect(page.getByRole('heading', { name: 'Your Go rank', level: 1 })).toBeVisible();
        if (open) {
          const select = page.getByLabel('Your Go rank');
          await expect(select).toHaveValue('5k');
          await expect(select.locator('option')).toHaveCount(1 + 34);
          await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
        } else {
          await expect(page.getByText('Your Go rank now changes only through rated games.')).toBeVisible();
          await expect(page.getByRole('combobox')).toHaveCount(0);
        }
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        // lila's own colours fail contrast on every page, and unit 9.7 fixes them site-wide (ADR 0026
        // §4): its buttons (white on its primary blue) and, below 24px, its orange box headings.
        // Only those pairs are let off, as in a11y.spec.ts.
        const lilaOwn = (n: { any: { data?: unknown }[] }) =>
          n.any.some(c => {
            const d = c.data as { fgColor?: string; bgColor?: string } | undefined;
            return (
              (d?.fgColor === '#ffffff' && d?.bgColor === '#3692e7') ||
              (d?.fgColor === '#d64f00' && d?.bgColor === '#262421')
            );
          });
        expect(
          violations
            .filter(v => v.impact === 'serious' || v.impact === 'critical')
            .map(v => (v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter(n => !lilaOwn(n)) } : v))
            .filter(v => v.nodes.length > 0)
            .map(v => `${v.id}: ${v.help} ${JSON.stringify(v.nodes.map(n => [n.target, n.any[0]?.data]))}`),
        ).toEqual([]);
        expect(missing).toEqual([]);
        await expect(page).toHaveScreenshot(
          `${phone ? 'phone' : 'desktop'}-account-go-rank-${open ? 'open' : 'locked'}.png`,
          { fullPage: true },
        );
      });
  });
