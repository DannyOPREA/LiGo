// LiGo's "Install LiGo" entry (unit 9.6, ADR 0026 §1): no pop-up. The site keeps the browser's
// install offer (`beforeinstallprompt`) for later; the account menu shows the entry only when there
// is an offer, or on iOS Safari, which has no such event and installs from its Share menu. Once
// installed or dismissed, the entry stays hidden (local storage).
// No side effects on import: the site calls `watchInstall` once, the menu calls `installOffer`.

import { isIos } from './device';

/** What the account menu offers: the browser's own install dialog, the iOS instructions, or nothing. */
export type InstallOffer = 'prompt' | 'ios' | undefined;

export interface InstallState {
  /** The page runs as an installed app. */
  standalone: boolean;
  /** iPhone or iPad Safari, where there is no install event. */
  ios: boolean;
  /** 'installed' or 'dismissed' once one happened. */
  stored: string | null;
  /** The browser has offered to install. */
  prompt: boolean;
}

export const offerFor = (s: InstallState): InstallOffer =>
  s.standalone || s.stored ? undefined : s.prompt ? 'prompt' : s.ios ? 'ios' : undefined;

/** Chromium's install event; not in TypeScript's DOM types. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const storeKey = 'ligo.install';
let pending: InstallPromptEvent | undefined;

const stored = (): string | null => {
  try {
    return localStorage.getItem(storeKey);
  } catch {
    return null;
  }
};
const store = (v: string) => {
  try {
    localStorage.setItem(storeKey, v);
  } catch {
    /* private mode: the entry just comes back next time */
  }
};

/** Called once when the site boots, before the browser's install event can fire. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // no mini-infobar: the account menu offers it
    pending = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    pending = undefined;
    store('installed');
  });
}

export const installOffer = (): InstallOffer =>
  offerFor({
    standalone:
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    ios: isIos(),
    stored: stored(),
    prompt: !!pending,
  });

/** Opens the browser's install dialog; afterwards the entry is gone whatever the answer. */
export async function install(): Promise<void> {
  const e = pending;
  if (!e) return;
  pending = undefined;
  await e.prompt();
  const { outcome } = await e.userChoice;
  store(outcome === 'accepted' ? 'installed' : 'dismissed');
}
