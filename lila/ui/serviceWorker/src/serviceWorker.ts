const sw = self as unknown as ServiceWorkerGlobalScope;
const searchParams = new URL(sw.location.href).searchParams;
const assetBase = new URL(searchParams.get('asset-url')!, sw.location.href).href;

function assetUrl(path: string): string {
  return `${assetBase}assets/${path}`;
}

// LiGo: the offline page (unit 9.6, ADR 0026 §1). The worker caches /offline when it installs and shows
// it when a page navigation fails. Nothing else is cached and there is no offline play.
const offlineCache = 'ligo-offline-v1';
const offlineUrl = '/offline';

// Never fails: push must keep working even when the page can't be fetched (say, assets deployed
// before the server), and a miss is retried after the next page that loads.
const cacheOffline = (): Promise<void> =>
  caches
    .open(offlineCache)
    .then(cache => cache.add(offlineUrl))
    .catch(() => undefined);

const ensureOffline = async (): Promise<void> => {
  if (!(await caches.match(offlineUrl, { cacheName: offlineCache }))) await cacheOffline();
};

sw.addEventListener('install', (e: ExtendableEvent) =>
  e.waitUntil(cacheOffline().then(() => sw.skipWaiting())),
);

sw.addEventListener('activate', (e: ExtendableEvent) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('ligo-offline-') && key !== offlineCache) await caches.delete(key);
      // The browser starts the page's request while the worker starts, so the worker adds no delay.
      await sw.registration.navigationPreload?.enable();
      await sw.clients.claim();
    })(),
  );
});

async function navigate(e: FetchEvent): Promise<Response> {
  try {
    const res = (await e.preloadResponse) ?? (await fetch(e.request));
    e.waitUntil(ensureOffline());
    return res;
  } catch {
    return (await caches.match(offlineUrl, { cacheName: offlineCache })) ?? Response.error();
  }
}

sw.addEventListener('fetch', (e: FetchEvent) => {
  if (e.request.mode === 'navigate') e.respondWith(navigate(e));
});

sw.addEventListener('push', (event: PushEvent) => {
  const data = event.data!.json();
  return event.waitUntil(
    sw.registration.showNotification(data.title, {
      badge: assetUrl('logo/ligo-mono-128.png'),
      icon: assetUrl('logo/ligo-favicon-192.png'),
      body: data.body,
      tag: data.tag,
      data: data.payload,
      requireInteraction: true,
    }),
  );
});

async function handleNotificationClick(e: NotificationEvent) {
  const notifications = await sw.registration.getNotifications();
  notifications.forEach(notification => notification.close());

  const windowClients = await sw.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  // determine url
  const data = e.notification.data.userData;
  let url = data.path || '/';
  if (data.fullId) url = '/' + data.fullId;
  else if (data.challengeId) url = '/' + data.challengeId;
  else if (data.invitedBy) url = `/study/${data.studyId}`;

  // focus open window with same url
  for (const client of windowClients) {
    const clientUrl = new URL(client.url, sw.location.href);
    if (clientUrl.pathname === url && 'focus' in client) return await client.focus();
  }

  // navigate from open homepage to url
  for (const client of windowClients) {
    const clientUrl = new URL(client.url, sw.location.href);
    if (clientUrl.pathname === '/') return await client.navigate(url);
  }

  // open new window
  return await sw.clients.openWindow(url);
}

sw.addEventListener('notificationclick', (e: NotificationEvent) => e.waitUntil(handleNotificationClick(e)));
