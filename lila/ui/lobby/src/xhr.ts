import debounce from 'debounce-promise';

import { json as xhrJson, form } from 'lib/xhr';

import type { NowPlaying, Seek } from './interfaces';

export const seeks: () => Promise<Seek[]> = debounce(() => xhrJson('/lobby/seeks'), 3000, { leading: true });

type NowPlayingRes = {
  nowPlaying: NowPlaying[];
  nbMyTurn: number;
};

export const nowPlaying = () => xhrJson<NowPlayingRes>('/account/now-playing');

// A real-time open game or a correspondence seek, as the create-game window sends it (unit 6.6's tiles)
export const createHook = (fields: Record<string, string | number>) =>
  xhrJson('/setup/hook/' + site.sri, { method: 'POST', body: form(fields) });
