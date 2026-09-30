// The installable app (unit 9.6, ADR 0026 §1), in Chromium at phone size: LiGo's manifest makes the
// site installable per the DevTools protocol, the service worker shows the offline page when the
// server can't be reached and still shows push notifications, and the board takes a phone's full
// width without double-tap zoom. Served by a small local server (service workers need a real
// origin, not Playwright's request routing) with lila's headers and the built worker from
// lila/public; e2e/manifest.json is lila's manifest (StaticContentTest keeps them equal).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfirmMoves, openPlayground } from './page';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../../../public');
const types: Record<string, string> = {
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Registered as lila's site/src/serviceWorker.ts does, with body data-asset-url "/".
function home(): string {
  const m = JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  const worker = `/assets/compiled/serviceWorker.${m.js.serviceWorker.hash}.js?asset-url=/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#161512"><link rel="manifest" href="/manifest.json">
<title>LiGo</title></head><body><main><h1>LiGo</h1></main><script type="module">
await navigator.serviceWorker.register(${JSON.stringify(worker)}, { scope: '/', updateViaCache: 'all' });
</script></body></html>`;
}

/** A stand-in for lila on localhost that can be switched off and on again at the same address. */
class Site {
  /** Answer /offline with a 404, as when assets are deployed before the server that serves it. */
  offlineMissing = false;
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  port = 0;
  get origin() {
    return `http://localhost:${this.port}`;
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      const path = new URL(req.url!, 'http://x').pathname;
      const send = (type: string, body: string | Buffer, headers = {}) =>
        res.writeHead(200, { 'Content-Type': type, ...headers }).end(body);
      if (path === '/manifest.json')
        return send(
          'application/json',
          readFileSync(join(here, 'manifest.json'), 'utf8').replaceAll(
            'localhost:8080',
            `localhost:${this.port}`,
          ),
        );
      if (path === '/offline')
        return this.offlineMissing
          ? res.writeHead(404).end()
          : send('text/html', readFileSync(join(publicDir, 'offline.html')));
      if (path.startsWith('/assets/')) {
        try {
          const file = join(publicDir, decodeURIComponent(path.slice('/assets/'.length)));
          if (!file.startsWith(publicDir + '/')) throw new Error('outside');
          // lila sends this on its assets so the worker can control the whole site (ResponseHeaders).
          return send(
            types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream',
            readFileSync(file),
            {
              'Service-Worker-Allowed': '/',
            },
          );
        } catch {
          return res.writeHead(404).end();
        }
      }
      if (path === '/') return send('text/html', home());
      return send(
        'text/html',
        `<!doctype html><html lang="en"><title>LiGo</title><h1>Page ${path}</h1></html>`,
      );
    });
    server.on('connection', s => {
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
    });
    await new Promise<void>(ok => server.listen(this.port, 'localhost', ok));
    this.port = (server.address() as AddressInfo).port;
    this.server = server;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise(ok => this.server?.close(ok));
  }
}

// Playwright's default headless browser (chromium-headless-shell, which CI gets) shows no
// notifications; the full Chromium in its new headless mode does. (LIGO_CHROMIUM or the cloud's
// Chromium, when set, still wins through launchOptions.)
test.use({ channel: 'chromium' });

async function openHome(page: Page, site: Site): Promise<void> {
  await page.goto(`${site.origin}/`);
  // Controlled once the worker has installed (with the offline page cached) and claimed the page.
  // The claim comes inside the activate step, before the worker is 'activated', and Chromium can drop
  // a push delivered to a worker still activating (CI lost one on PR #71), so wait for that too.
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated',
  );
}

test.describe('installable app on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let site: Site;
  test.beforeEach(async () => {
    site = new Site();
    await site.start();
  });
  test.afterEach(async () => site.stop());

  // Playwright's usual contexts are incognito, where Chromium never installs: a real profile here.
  test('installable per the DevTools protocol', async ({ playwright, browserName }, info) => {
    const context = await playwright[browserName].launchPersistentContext(info.outputPath('profile'), {
      ...info.project.use.launchOptions,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await openHome(page, site);
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
    const { url, data } = await cdp.send('Page.getAppManifest');
    expect(url).toBe(`${site.origin}/manifest.json`);
    expect(JSON.parse(data!)).toMatchObject({ name: 'LiGo', display: 'standalone' });
    await context.close();
  });

  test('the offline page when the server is unreachable, and back when it returns', async ({ page }) => {
    await openHome(page, site);
    await site.stop();
    await page.goto(`${site.origin}/lobby?rated=1`);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    expect(page.url()).toBe(`${site.origin}/lobby?rated=1`);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.map(v => v.id)).toEqual([]);

    await site.start();
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Page /lobby' })).toBeVisible();
  });

  test('push notifications still show', async ({ page }) => {
    await expectPush(page, site);
  });

  test('a missing offline page never stops push, and is cached by the next page that loads', async ({
    page,
  }) => {
    site.offlineMissing = true;
    await expectPush(page, site);
    expect(await page.evaluate(async () => !!(await caches.match('/offline')))).toBe(false);
    site.offlineMissing = false;
    await page.goto(`${site.origin}/lobby`);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match('/offline')))).toBe(true);
    await site.stop();
    await page.goto(`${site.origin}/lobby`);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  });
});

async function expectPush(page: Page, site: Site): Promise<void> {
  const context = page.context();
  await context.grantPermissions(['notifications'], { origin: site.origin });
  const cdp = await context.newCDPSession(page);
  // What the browser reports about the worker, printed if the notification never shows (CI lost a
  // push on PR #71 that no local run reproduced).
  const seen: string[] = [];
  cdp.on('ServiceWorker.workerVersionUpdated', e =>
    e.versions.forEach(v => seen.push(`version ${v.versionId}: ${v.status}/${v.runningStatus}`)),
  );
  cdp.on('ServiceWorker.workerErrorReported', e => seen.push(`error: ${e.errorMessage.errorMessage}`));
  // The id of this site's registration once its worker is activated: a push sent any earlier can be
  // dropped.
  const registration = new Promise<string>(ok =>
    cdp.on('ServiceWorker.workerVersionUpdated', e => {
      const v = e.versions.find(v => v.scriptURL.startsWith(`${site.origin}/`) && v.status === 'activated');
      if (v) ok(v.registrationId);
    }),
  );
  await cdp.send('ServiceWorker.enable');
  await openHome(page, site);
  const registrationId = await registration;
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: site.origin,
    registrationId,
    data: JSON.stringify({
      title: 'Your turn',
      body: 'against Danny',
      tag: 'move',
      payload: { userData: {} },
    }),
  });
  const notifications = () =>
    page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications()).map(n => `${n.title}: ${n.body}`),
    );
  try {
    await expect.poll(notifications).toEqual(['Your turn: against Danny']);
  } catch (err) {
    const permission = await page.evaluate(() => Notification.permission);
    throw new Error(
      `no notification (permission ${permission}, registration ${registrationId}; ${seen.join('; ')})\n${err}`,
    );
  }
}

test.describe('the board on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('takes the full width, and a double tap never zooms', async ({ page }) => {
    await openPlayground(page, ConfirmMoves.TOUCH);
    const board = page.getByRole('application', { name: /^\d+ by \d+$/ });
    const wrap = (await page.locator('.playground__board-wrap').boundingBox())!;
    expect([wrap.x, wrap.width]).toEqual([0, 390]);
    // goban draws in whole squares (9×9 plus a coordinate band: 11 squares), so up to one short.
    const box = (await board.boundingBox())!;
    expect(box.width).toBeGreaterThan(390 - 390 / 11);
    expect(await board.evaluate(e => getComputedStyle(e).touchAction)).toBe('manipulation');
  });
});
