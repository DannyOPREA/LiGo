import { storage } from 'lib/storage';

import type { Tab, Mode } from './interfaces';
import { parseChips, type Chips } from './openChallenges';

interface Store<A> {
  set(v: string): A;
  get(): A;
}

export interface Stores {
  tab: Store<Tab>;
  mode: Store<Mode>;
}

interface Config<A> {
  key: string;
  fix(v: string | null): A;
}

function isTab(value: string | null): value is Tab {
  return value === 'pools' || value === 'open' || value === 'now_playing';
}

function isMode(value: string | null): value is Mode {
  return value === 'live' || value === 'correspondence';
}

// lila's "Lobby" and "Correspondence" tabs became one tab (unit 6.7): a tab remembered under the old
// names opens Open challenges on the same kind of game. (The mode store held 'list' or 'chart' before;
// those read as 'live'.)
export const migrateTab = (stored: string | null): { tab: Tab; mode?: Mode } | undefined => {
  if (stored === 'real_time') return { tab: 'open', mode: 'live' };
  if (stored === 'seeks') return { tab: 'open', mode: 'correspondence' };
  return undefined;
};

const tab: Config<Tab> = {
  key: 'lobby.tab',
  fix(t: string | null): Tab {
    if (isTab(t)) return t;
    return 'pools';
  },
};
const mode: Config<Mode> = {
  key: 'lobby.mode',
  fix(m: string | null): Mode {
    if (isMode(m)) return m;
    return 'live';
  },
};

function makeStore<A>(conf: Config<A>, userId?: string): Store<A> {
  const fullKey = conf.key + ':' + (userId || '-');
  return {
    set(v: string): A {
      const t: A = conf.fix(v);
      storage.set(fullKey, String(t));
      return t;
    },
    get(): A {
      return conf.fix(storage.get(fullKey));
    },
  };
}

export function make(userId?: string): Stores {
  const stores = { tab: makeStore<Tab>(tab, userId), mode: makeStore<Mode>(mode, userId) };
  const old = migrateTab(storage.get(tab.key + ':' + (userId || '-')));
  if (old) {
    stores.tab.set(old.tab);
    if (old.mode) stores.mode.set(old.mode);
  }
  return stores;
}

// The filter chips are remembered for the browser, not per user, as lila's filter form was.
const chipsKey = 'lobby.chips';

export const readChips = (): Chips => parseChips(storage.get(chipsKey));

export const writeChips = (chips: Chips): void => {
  storage.set(chipsKey, JSON.stringify(chips));
};
