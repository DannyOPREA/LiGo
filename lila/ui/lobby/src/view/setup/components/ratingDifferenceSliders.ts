import { hl } from 'lib/view';

import type LobbyController from '@/ctrl';

import { maxRankSteps } from '../../../rankRange';

// The range of opponents a lobby game is open to, in whole ranks below and above the player's own
// (ADR 0021 §3, unit 5.7); the form sends it as ratings (SetupController.ratingRange).
export const ratingDifferenceSliders = ({ setupCtrl, me, data }: LobbyController) => {
  const myRating = setupCtrl.myRating();
  const range = setupCtrl.rankRange();

  if (!me || !data.ratingMap || !myRating || !range) return null;

  const isProvisional = setupCtrl.isProvisional();

  const ratingInput = (type: 'min' | 'max') => {
    const isMin = type === 'min';
    return hl(`input.range.rating-range__${type}`, {
      attrs: {
        type: 'range',
        'aria-label': isMin ? i18n.site.minRatingX(range.from) : i18n.site.maxRatingX(range.to),
        min: isMin ? -maxRankSteps : '0',
        max: isMin ? '0' : maxRankSteps,
        step: '1',
        disabled: isProvisional,
      },
      props: {
        value: isMin ? setupCtrl.ratingMin() : setupCtrl.ratingMax(),
      },
      on: {
        input: (e: Event) => {
          const newVal = parseInt((e.target as HTMLInputElement).value);
          // Both values should not be 0. Modify the other slider so there is always a range
          if (newVal === 0 && (isMin ? setupCtrl.ratingMax() : setupCtrl.ratingMin()) === 0)
            isMin ? setupCtrl.ratingMax(1) : setupCtrl.ratingMin(-1);
          isMin ? setupCtrl.ratingMin(newVal) : setupCtrl.ratingMax(newVal);
        },
      },
    });
  };

  return hl(
    'div',
    {
      class: { disabled: isProvisional },
    },
    isProvisional
      ? hl('span', i18n.site.cannotFilterByUnstableRating)
      : [
          i18n.site.ratingFilter,
          hl('div.rating-range', [
            ratingInput('min'),
            !site.blindMode && [hl('span.rating-min', range.from), '–', hl('span.rating-max', range.to)],
            ratingInput('max'),
          ]),
          hl(
            'p.setup-rank-range',
            { attrs: { title: `${range.min}–${range.max}` } },
            i18n.site.goRankRangeXToY(range.from, range.to),
          ),
        ],
  );
};
