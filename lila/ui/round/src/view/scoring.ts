// The scoring phase beside the board (unit 4.10, ADR 0020 §3, §6): "Counting…" while the scoring
// service proposes the dead stones, then the count, who accepted it, the Accept and Resume buttons
// and the time left to agree. The board itself shows the marks (libs/board); a tap there asks the
// server to toggle a chain. After a game ends by counting, the count stays on show.
// Licence: MIT (LiGo's own code, ADR 0006).

import { type LooseVNode, type VNode, hl, bind } from 'lib/view';

import type RoundController from '../ctrl';
import type { ScoreSide, ScoringData } from '../interfaces';

/** Seconds as "2:41". */
export const minutesSeconds = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A number of points as Go writes it: "6.5", "41". */
const points = (n: number | undefined): string => String(n ?? 0);

/**
 * The count in a small table, Black's column and White's: territory, then stones under Chinese
 * rules (area) or prisoners under Japanese rules, komi and handicap compensation where they apply,
 * and the totals the result comes from. The scoring service makes every number; lila never counts.
 */
export function renderCount(ctrl: RoundController, score: { b: ScoreSide; w: ScoreSide }): VNode {
  const chinese = ctrl.data.game.go.rules === 'chinese';
  const row = (label: string, value: (s: ScoreSide) => number | undefined, show = true) =>
    show &&
    hl('tr', [
      hl('th', { attrs: { scope: 'row' } }, label),
      hl('td', points(value(score.b))),
      hl('td', points(value(score.w))),
    ]);
  return hl('table.go-scoring__count', [
    hl(
      'thead',
      hl('tr', [
        hl('td'),
        hl('th', { attrs: { scope: 'col' } }, i18n.site.black),
        hl('th', { attrs: { scope: 'col' } }, i18n.site.white),
      ]),
    ),
    hl('tbody', [
      row(i18n.site.goTerritory, s => s.territory),
      row(i18n.site.goStones, s => s.stones, chinese || !!score.b.stones || !!score.w.stones),
      row(i18n.site.goPrisoners, s => s.prisoners, !chinese || !!score.b.prisoners || !!score.w.prisoners),
      row(i18n.site.goKomi, s => s.komi, !!score.w.komi),
      row(i18n.site.goHandicapCompensation, s => s.compensation, !!score.w.compensation),
    ]),
    hl(
      'tfoot',
      row(i18n.site.goTotal, s => s.total),
    ),
  ]);
}

/** Who has accepted the count on show, in words for the player or a spectator. */
function acceptance(ctrl: RoundController, s: ScoringData): LooseVNode {
  const acc = s.accepted;
  if (!acc || s.pending) return null;
  const d = ctrl.data;
  if (!d.player.spectator) {
    const mine = acc[d.player.color === 'black' ? 'b' : 'w'];
    const theirs = acc[d.player.color === 'black' ? 'w' : 'b'];
    if (mine) return hl('p.go-scoring__accepted', i18n.site.goYouAcceptedWaiting);
    if (theirs)
      return hl('p.go-scoring__accepted.go-scoring__accepted--them', i18n.site.goOpponentAcceptedScore);
    return null;
  }
  const who = (['black', 'white'] as const).filter(c => acc[c === 'black' ? 'b' : 'w']);
  return who.length
    ? hl('p.go-scoring__accepted', who.map(c => i18n.site.goXAcceptedScore(i18n.site[c])).join(' '))
    : null;
}

/** The player's buttons: Accept the count on show, or Resume play. */
function buttons(ctrl: RoundController, s: ScoringData | undefined): LooseVNode {
  if (!ctrl.isPlaying()) return null;
  const accepted = ctrl.hasAccepted();
  return hl('div.go-scoring__buttons', [
    s &&
      hl(
        'button.button.go-scoring__accept',
        {
          class: { 'button-green': !accepted },
          attrs: { disabled: !ctrl.mayMarkDead() || accepted, 'aria-pressed': accepted ? 'true' : 'false' },
          hook: bind('click', ctrl.acceptScore),
        },
        i18n.site.goAcceptScore,
      ),
    ctrl.mayResume() &&
      hl(
        'button.button.button-metal.go-scoring__resume',
        { attrs: { disabled: ctrl.loading }, hook: bind('click', ctrl.resumePlay) },
        i18n.site.goResumePlay,
      ),
  ]);
}

/** The scoring phase under way: what the players do now. */
export function renderScoring(ctrl: RoundController): LooseVNode {
  if (!ctrl.inScoring()) return null;
  const s = ctrl.data.game.scoring;
  const count = ctrl.scoringCount();
  if (!count)
    return hl('div.go-scoring', [
      hl('p.go-scoring__status', { attrs: { role: 'status' } }, [
        hl('span.ddloader'),
        i18n.site.goCountingTheScore,
      ]),
      buttons(ctrl, undefined),
    ]);
  const recounting = !!count.pending || ctrl.scoringSent;
  return hl('div.go-scoring', [
    hl(
      'p.go-scoring__status',
      { attrs: { role: 'status' } },
      recounting
        ? [hl('span.ddloader'), i18n.site.goRecounting]
        : ctrl.isPlaying()
          ? i18n.site.goScoringTapHint
          : null,
    ),
    count.src === 'none' && hl('p.go-scoring__note', i18n.site.goScoringNoProposal),
    !!count.seal?.length && hl('p.go-scoring__note.go-scoring__seal', i18n.site.goScoringSealHint),
    count.score && renderCount(ctrl, count.score),
    acceptance(ctrl, count),
    buttons(ctrl, s),
    hl(
      'p.go-scoring__countdown',
      { class: { emerg: ctrl.scoringSecondsLeft() <= 30 } },
      i18n.site.goTimeLeftToAgree(minutesSeconds(ctrl.scoringSecondsLeft())),
    ),
  ]);
}

/** A game that ended by counting: the count it ended with. */
export function renderFinalCount(ctrl: RoundController): LooseVNode {
  const count = ctrl.scoringCount();
  return ctrl.data.game.status.name === 'variantEnd' && count?.score
    ? hl('div.go-scoring.go-scoring--final', renderCount(ctrl, count.score))
    : null;
}
