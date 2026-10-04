import { timeago } from 'lib/i18n';
import { onInsert, renderGoMini, div, time, a, span } from 'lib/view';

import type LobbyController from '@/ctrl';
import type { NowPlaying } from '@/interfaces';

function timer(pov: NowPlaying) {
  const date = Date.now() + pov.secondsLeft! * 1000;
  return time('.timeago', { hook: onInsert(el => el.setAttribute('datetime', String(date))) }, timeago(date));
}

/**
 * What the game's row says when it waits for you (unit 7.7): the count in the scoring phase (lila's
 * `Pov.isMyTurn` is true for a player who has not accepted it, and the turn clock does not run), the
 * time left on your clock, or "Your turn".
 */
export const waitingFor = (pov: NowPlaying): 'count' | 'time' | 'move' | undefined =>
  !pov.isMyTurn
    ? undefined
    : pov.go?.phase === 'scoring'
      ? 'count'
      : !!pov.secondsLeft && pov.hasMoved
        ? 'time'
        : 'move';

const indicator = (pov: NowPlaying) => {
  switch (waitingFor(pov)) {
    case 'count':
      return i18n.site.scoringPhaseStarted;
    case 'time':
      return timer(pov);
    case 'move':
      return i18n.site.yourTurn;
    default:
      return span('\xa0');
  }
};

export default function ({ data }: LobbyController) {
  return div(
    '.now-playing',
    data.nowPlaying.map(pov =>
      a('/' + pov.fullId)(`.${pov.variant.key}`, { key: `${pov.gameId}${pov.lastMove}` }, [
        pov.board !== undefined
          ? span('.go-mini', { hook: onInsert(el => renderGoMini(el, pov.board!, pov.lastMove)) })
          : null,
        span('.meta', [
          pov.opponent.ai
            ? i18n.site.aiNameLevelAiLevel('Stockfish', pov.opponent.ai)
            : pov.opponent.username,
          span('.indicator', indicator(pov)),
        ]),
      ]),
    ),
  );
}
