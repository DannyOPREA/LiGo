// The credits page (unit 9.8, ADR 0026 §6) at desktop and phone sizes: a screenshot, no serious or
// critical WCAG 2.2 AA problem, and every entry of docs/credits.json on it. The page body is the
// generated lila/public/credits.html inside a trimmed copy of lila's SitePage markup (the menu
// left out), with the CSS lila sends for it, served without a lila server like the playground.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../../../public');
const list = JSON.parse(readFileSync(join(here, '../../../../docs/credits.json'), 'utf8')) as {
  sections: { title: string; entries: { name: string; url: string }[] }[];
};

function html(): string {
  const m = JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Credits • LiGo</title>
${css('lib.theme.all')}${css('site')}${css('bits.credits')}</head>
<body data-theme="dark"><div id="main-wrap"><main class="page-menu"><div class="page-menu__content page">
<section class="box"><h1 class="box__top">Credits</h1>${readFileSync(join(publicDir, 'credits.html'), 'utf8')}</section>
</div></main></div></body></html>`;
}

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('the credits page', async ({ page }) => {
      const missing: string[] = [];
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/credits') return route.fulfill({ contentType: 'text/html', body: html() });
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
      await page.goto('http://ligo.test/credits');
      await page.evaluate(() => document.fonts.ready);

      for (const s of list.sections) {
        await expect(page.getByRole('heading', { name: s.title, level: 2 })).toBeVisible();
        for (const e of s.entries)
          await expect(page.getByRole('link', { name: e.name, exact: true })).toHaveAttribute('href', e.url);
      }
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        violations
          .filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => `${v.id}: ${v.help} ${JSON.stringify(v.nodes.map(n => [n.target, n.any[0]?.data]))}`),
      ).toEqual([]);
      expect(missing).toEqual([]);
      await expect(page).toHaveScreenshot(`${phone ? 'phone' : 'desktop'}-credits.png`, { fullPage: true });
    });
  });
