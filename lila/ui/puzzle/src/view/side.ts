import { numberFormat } from 'lib/i18n';
import { type VNode, onInsert, type MaybeVNode, hl } from 'lib/view';
import { cmnToggleWrap } from 'lib/view/cmn-toggle';

import type PuzzleCtrl from '@/ctrl';
import type { PuzzleDifficulty } from '@/interfaces';

export function puzzleBox(ctrl: PuzzleCtrl): VNode {
  return hl('div.puzzle__side__metas', [puzzleInfos(ctrl)]);
}

const puzzleInfos = (ctrl: PuzzleCtrl): VNode => {
  const { puzzle } = ctrl.data;
  return hl('div.infos.puzzle', [
    hl('div', [
      hl(
        'p',
        i18n.puzzle.puzzleId.asArray(
          hl('a', { attrs: { href: ctrl.routerWithLang(`/training/${puzzle.id}`) } }, '#' + puzzle.id),
        ),
      ),
      ctrl.opts.showRatings &&
        hl(
          'p',
          i18n.puzzle.ratingX.asArray(
            ctrl.mode === 'play' ? hl('span.hidden', i18n.puzzle.hidden) : hl('strong', puzzle.rating),
          ),
        ),
      hl('p', i18n.puzzle.playedXTimes.asArray(puzzle.plays, hl('strong', numberFormat(puzzle.plays)))),
    ]),
  ]);
};

export const userBox = (ctrl: PuzzleCtrl): VNode => {
  const { data } = ctrl;
  if (!data.user)
    return hl('div.puzzle__side__user', [
      hl('p', i18n.puzzle.toGetPersonalizedPuzzles),
      hl('a.button', { attrs: { href: ctrl.routerWithLang('/signup') } }, i18n.site.signUp),
    ]);
  const diff = ctrl.round?.ratingDiff;
  const ratedId = 'puzzle-toggle-rated';
  return hl('div.puzzle__side__user', [
    !data.replay &&
      data.user &&
      cmnToggleWrap({
        id: ratedId,
        name: i18n.site.rated,
        checked: ctrl.rated(),
        change: ctrl.toggleRated,
        disabled: ctrl.lastFeedback !== 'init' || ctrl.resultSent,
        redraw: ctrl.redraw,
      }),
    hl(
      'div.puzzle__side__user__rating',
      ctrl.rated()
        ? ctrl.opts.showRatings &&
            hl('strong', [
              data.user.rating - (diff || 0),
              !!diff && diff > 0 && [' ', hl('good.rp', '+' + diff)],
              !!diff && diff < 0 && [' ', hl('bad.rp', '−' + -diff)],
            ])
        : hl('p.puzzle__side__user__rating__casual', i18n.puzzle.yourPuzzleRatingWillNotChange),
    ),
  ]);
};

const difficulties: [PuzzleDifficulty, number][] = [
  ['easiest', -600],
  ['easier', -300],
  ['normal', 0],
  ['harder', 300],
  ['hardest', 600],
];

export function replay(ctrl: PuzzleCtrl): MaybeVNode {
  const { replay, angle } = ctrl.data;
  if (!replay) return undefined;
  const i = replay.i + (ctrl.mode === 'play' ? 0 : 1);
  const text = ctrl.themeName(angle.key);
  return hl('div.puzzle__side__replay', [
    hl('a', { attrs: { href: `/training/dashboard/${replay.days}` } }, ['« ', `Replaying ${text} puzzles`]),
    hl('div.puzzle__side__replay__bar', {
      attrs: {
        style: `---p:${replay.of ? Math.round((100 * i) / replay.of) : 1}%`,
        'data-text': `${i} / ${replay.of}`,
      },
    }),
  ]);
}

export function config(ctrl: PuzzleCtrl): MaybeVNode {
  const { data } = ctrl;
  return hl('div.puzzle__side__config', [
    cmnToggleWrap({
      id: 'puzzle-toggle-autonext',
      name: i18n.puzzle.jumpToNextPuzzleImmediately,
      checked: ctrl.autoNext(),
      change(v) {
        ctrl.autoNext(v);
        if (ctrl.autoNext() && ctrl.resultSent) ctrl.nextPuzzle();
      },
      redraw: ctrl.redraw,
    }),
    !data.user || data.replay ? null : renderDifficultyForm(ctrl),
  ]);
}

export const renderDifficultyForm = (ctrl: PuzzleCtrl): VNode =>
  hl(
    'form.puzzle__side__config__difficulty',
    { attrs: { action: `/training/difficulty/${ctrl.data.angle.key}`, method: 'post' } },
    [
      hl('label', { attrs: { for: 'puzzle-difficulty' } }, i18n.puzzle.difficultyLevel),
      hl(
        'select#puzzle-difficulty.puzzle__difficulty__selector',
        {
          attrs: { name: 'difficulty' },
          hook: onInsert(elm =>
            elm.addEventListener('change', () => (elm.parentNode as HTMLFormElement).submit()),
          ),
        },
        difficulties.map(([key, delta]) =>
          hl(
            'option',
            {
              attrs: {
                value: key,
                selected: key === ctrl.opts.settings.difficulty,
                title:
                  !!delta && delta < 0
                    ? i18n.puzzle.nbPointsBelowYourPuzzleRating(Math.abs(delta))
                    : i18n.puzzle.nbPointsAboveYourPuzzleRating(Math.abs(delta)),
              },
            },
            [i18n.puzzle[key], delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''],
          ),
        ),
      ),
    ],
  );
