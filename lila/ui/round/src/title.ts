import { aborted, finished } from 'lib/game';

import type RoundController from './ctrl';

const initialTitle = document.title;

let curFaviconIdx = 0;

const F = ['/assets/logo/ligo-favicon.svg', '/assets/logo/ligo-favicon-invert.svg'].map((path, i) => () => {
  if (curFaviconIdx !== i) {
    (document.getElementById('favicon') as HTMLAnchorElement).href = path;
    curFaviconIdx = i;
  }
});

let tickerTimer: Timeout | undefined;
function resetTicker() {
  if (tickerTimer) clearTimeout(tickerTimer);
  tickerTimer = undefined;
  F[0]();
}

function startTicker() {
  function tick() {
    if (!document.hasFocus()) {
      F[1 - curFaviconIdx]();
      tickerTimer = setTimeout(tick, 1000);
    }
  }
  if (!tickerTimer) tickerTimer = setTimeout(tick, 200);
}

export const init = (): void => window.addEventListener('focus', resetTicker);

export function set(ctrl: RoundController): void {
  if (ctrl.data.player.spectator) return;
  let text = '';
  if (aborted(ctrl.data) || finished(ctrl.data)) {
    text = i18n.site.gameOver;
  } else if (ctrl.isMyTurn()) {
    // in the scoring phase the player is asked to count, not to move (unit 7.7)
    text = ctrl.inScoring() ? i18n.site.scoringPhaseStarted : i18n.site.yourTurn;
    if (!document.hasFocus()) startTicker();
  } else {
    text = i18n.site.waitingForOpponent;
    resetTicker();
  }
  document.title = `${text} - ${initialTitle}`;
}
