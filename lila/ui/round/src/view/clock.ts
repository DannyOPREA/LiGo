import {
  aborted,
  berserkableBy,
  bothPlayersHavePlayed,
  finished,
  playable,
  type TopOrBottom,
  type TournamentRanks,
} from 'lib/game';
import { renderClock } from 'lib/game/clock/clockView';
import { licon } from 'lib/licon';
import { type LooseVNode, hl, bind, dataIcon } from 'lib/view';

import renderCorresClock from '../corresClock/corresClockView';
import type RoundController from '../ctrl';
import { moretime } from './button';

export const anyClockView = (ctrl: RoundController, position: TopOrBottom): LooseVNode => {
  const player = ctrl.playerAt(position);
  if (ctrl.clock) return renderClock(ctrl.clock, player.color, position, onTheSide(ctrl));
  else if (ctrl.data.correspondence && ctrl.data.game.turns > 1)
    return renderCorresClock(ctrl.corresClock!, player.color, position, ctrl.data.game.player);
  else return whosTurn(ctrl, player.color, position);
};

const onTheSide = (round: RoundController) => (color: Color, position: TopOrBottom) => {
  const isPlayer = !round.data.player.spectator && round.data.player.color === color;
  const ranks = round.data.tournament?.ranks || round.data.swiss?.ranks;
  return [
    renderBerserk(round, color, position) || (isPlayer ? goBerserk(round, color) : moretime(round)),
    byoyomiPeriods(round, color),
    clockSide(round, color, position, ranks),
  ];
};

/** A byo-yomi clock's periods beside its time (unit 4.10): "+5×30s" in main time, "3×30s" after. */
const byoyomiPeriods = (round: RoundController, color: Color): LooseVNode => {
  const b = round.byoyomi;
  if (!b) return null;
  const n = b.periods[color];
  return hl(
    'div.byoyomi',
    {
      class: { 'byoyomi--in': b.inByoyomi[color], 'byoyomi--last': b.inByoyomi[color] && n <= 1 },
      attrs: { title: `${i18n.site.goByoyomiPeriods}: ${n} × ${b.byo}s` },
    },
    b.label(color),
  );
};

function whosTurn(ctrl: RoundController, color: Color, position: TopOrBottom) {
  const d = ctrl.data;
  // nobody's turn while the dead stones are agreed (ADR 0020 §3)
  if (finished(d) || aborted(d) || ctrl.inScoring()) return undefined;
  return hl(
    'div.rclock.rclock-turn.rclock-' + position,
    d.game.player === color &&
      hl(
        'div.rclock-turn__text',
        d.player.spectator
          ? i18n.site[`${d.game.player}Plays`]
          : i18n.site[d.game.player === d.player.color ? 'yourTurn' : 'waitingForOpponent'],
      ),
  );
}

const showBerserk = (ctrl: RoundController, color: Color): boolean =>
  ctrl.hasGoneBerserk(color) && !bothPlayersHavePlayed(ctrl.data) && playable(ctrl.data);

const renderBerserk = (ctrl: RoundController, color: Color, position: TopOrBottom) =>
  showBerserk(ctrl, color) ? hl('div.berserked.' + position, { attrs: dataIcon(licon.Berserk) }) : null;

const goBerserk = (ctrl: RoundController, color: Color) =>
  berserkableBy(ctrl.data) &&
  !ctrl.hasGoneBerserk(color) &&
  hl('button.fbt.go-berserk', {
    attrs: { title: i18n.site.goBerserkTitle, ...dataIcon(licon.Berserk) },
    hook: bind('click', ctrl.goBerserk),
  });

const clockSide = (
  ctrl: RoundController,
  color: Color,
  position: TopOrBottom,
  ranks: TournamentRanks | undefined,
) =>
  ranks &&
  !showBerserk(ctrl, color) &&
  hl(
    'div.tour-rank.' + position,
    { attrs: { title: i18n.site.goCurrentTournamentRank } },
    '#' + ranks[color],
  );
