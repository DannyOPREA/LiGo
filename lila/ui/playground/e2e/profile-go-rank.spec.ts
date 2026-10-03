// The profile in Go ranks (unit 5.6, ADR 0021 §3) at desktop and phone sizes: the rank beside the
// name, the one Go rating in the side panel as its rank, and the rating graph with a kyu/dan axis.
// As in account-go-rank.spec.ts, the page is a trimmed copy of what lila renders (UserShowSide,
// views.user.show.header and the rating-history container) with the CSS lila sends for it, served
// without a lila server; the graph is lila's own built `chart.ratingHistory` module, fed the JSON
// RatingChartApi and GoRating.rankTableJson send. The test-only `profile-shot` class lets
// screenshot.css hide the glyphs in the pictures; the graph is a canvas, so it gets a picture of its
// own with a tolerance for the axis labels' rasterising.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');

// GoRating.rankTable (lila/modules/rating), the rating at the lower edge of each rank, 25k to 9d
const rankTable: [string, number][] = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rank-table.json'), 'utf8'),
);

// a player who declared 5k, then climbed to 3k over four months: [year, month0, day, rating]
const points: [number, number, number, number][] = [
  [2026, 5, 1, 1580],
  [2026, 5, 20, 1612],
  [2026, 6, 10, 1655],
  [2026, 6, 28, 1640],
  [2026, 7, 15, 1702],
  [2026, 8, 5, 1745],
  [2026, 8, 30, 1790],
];

function html(): string {
  const m = JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const chart = `/assets/compiled/chart.ratingHistory.${m.js['chart.ratingHistory'].hash}.js`;
  const data = { data: [{ name: 'Go', points }], rankTable };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Kaya : Activity • LiGo</title>
${css('lib.theme.all')}${css('site')}${css('user.show')}</head>
<body data-theme="dark"><div id="main-wrap"><main class="page-menu profile-shot">
<aside class="page-menu__menu"><div class="side sub-ratings">
<a data-icon="&#xe028;" title="One rating for every Go game, on any board size and at any speed." href="/@/Kaya/perf/go">
<span><h3>Go</h3><rating><strong><span class="go-rank" title="1790">3k</span></strong> <good class="rp">45</good> <span>24 games</span></rating></span></a>
<hr><a data-icon="&#xe02a;" title="Puzzles" class="empty" href="/training/dashboard/30"><span><h3>Puzzles</h3><rating><strong>1500?</strong> <span>0 puzzles</span></rating></span></a>
</div></aside>
<div class="page-menu__content box user-show">
<div class="box__top user-show__header"><h1><span class="user-link offline">Kaya</span><span class="user-show__rank"><span class="go-rank" title="1790">3k</span></span></h1></div>
<div id="us_profile"><div class="rating-history-container"><div class="rating-history-container">
<div class="time-selector-buttons"></div><div class="chart-container"><canvas class="rating-history"></canvas></div>
<div id="time-range-slider"></div></div></div></div>
</div></main></div>
<script src="/assets/javascripts/vendor/cash.min.js"></script>
<script type="module">
window.site ||= { displayLocale: 'en' };
// lila's i18n catalog isn't on this trimmed page: the two site keys the graph uses
window.i18n = { site: { ratingGraphStart: 'Start of the period the rating graph shows', ratingGraphEnd: 'End of the period the rating graph shows' } };
const m = await import(${JSON.stringify(chart)});
m.initModule(${JSON.stringify(data)});
document.body.dataset.chart = 'ready';
</script>
</body></html>`;
}

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('the profile shows the Go rank and a kyu/dan rating graph', async ({ page }) => {
      const missing: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/@/Kaya') return route.fulfill({ contentType: 'text/html', body: html() });
        if (url.pathname.startsWith('/assets/')) {
          const file = join(publicDir, decodeURIComponent(url.pathname.slice('/assets/'.length)));
          if (file.startsWith(publicDir + '/'))
            try {
              const ext = file.slice(file.lastIndexOf('.'));
              return route.fulfill({ contentType: contentTypes[ext], body: readFileSync(file) });
            } catch {
              /* reported below */
            }
        }
        missing.push(url.href);
        return route.fulfill({ status: 404 });
      });
      await page.goto('http://ligo.test/@/Kaya');
      await expect(page.locator('body[data-chart="ready"]')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);

      await expect(page.locator('.user-show__rank')).toHaveText('3k');
      await expect(page.locator('.sub-ratings .go-rank')).toHaveText('3k');
      // lila's phone layout hides the games count under the rating; the rank must stay
      await expect(page.locator('.sub-ratings .go-rank')).toBeVisible();
      await expect(page.locator('.sub-ratings .go-rank')).toHaveAttribute('title', '1790');
      const canvas = page.locator('canvas.rating-history');
      await expect(canvas).toBeVisible();
      await expect(
        page.getByRole('slider', { name: 'Start of the period the rating graph shows' }),
      ).toHaveCount(1);

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        violations
          .filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => `${v.id}: ${v.help} ${JSON.stringify(v.nodes.map(n => n.target))}`),
      ).toEqual([]);
      expect(missing).toEqual([]);
      expect(errors).toEqual([]);
      const name = phone ? 'phone' : 'desktop';
      await expect(page).toHaveScreenshot(`${name}-profile-go-rank.png`, { fullPage: true, mask: [canvas] });
      // the graph: its kyu/dan labels are canvas text, which Chromium builds rasterise a little
      // differently, so a small share of its pixels may move
      await expect(canvas).toHaveScreenshot(`${name}-profile-go-rank-graph.png`, { maxDiffPixelRatio: 0.03 });
    });
  });
