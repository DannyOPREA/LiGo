import { log } from 'lib/permalog';
import { storage } from 'lib/storage';

import { url as assetUrl, jsModule } from './asset';

export default async function () {
  // LiGo: the worker also serves the offline page (unit 9.6), so it registers wherever service workers
  // exist (iOS Safari before 16.4 has them but not push); only the push part needs push.
  if (!('serviceWorker' in navigator)) return;
  const workerUrl = new URL(assetUrl(jsModule('serviceWorker'), { pathOnly: true }), self.location.href);
  workerUrl.searchParams.set('asset-url', document.body.getAttribute('data-asset-url')!);
  let newSub: PushSubscription | undefined = undefined;
  try {
    const reg = await navigator.serviceWorker.register(workerUrl.href, { scope: '/', updateViaCache: 'all' });
    if (!('Notification' in window && 'PushManager' in window)) return;

    const store = storage.make('push-subscribed');
    const resub = parseInt(store.get() || '0', 10) + 43200000 < Date.now(); // 12 hours
    const vapid = document.body.getAttribute('data-vapid');
    const sub = await reg.pushManager.getSubscription();

    if (!vapid || Notification.permission !== 'granted') return store.remove();
    else if (sub && !resub) return;

    newSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapid });

    if (!newSub) throw new Error(JSON.stringify(await reg.pushManager.permissionState()));

    const res = await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSub),
    });

    if (res.ok && !res.redirected) store.set(String(Date.now()));
    else throw new Error(res.statusText);
  } catch (err: any) {
    log('serviceWorker.ts:', err.message, newSub);
    if (newSub?.endpoint) await newSub?.unsubscribe();
  }
}
