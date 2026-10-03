import { h } from 'snabbdom';

import type { MaybeVNode } from 'lib/view';

import type LobbyController from '@/ctrl';

// Go has one rating (ADR 0021 §1), shown as the server's kyu/dan label (unit 5.5).
export const ratingView = ({ opts, data, setupCtrl }: LobbyController): MaybeVNode => {
  if (site.blindMode || !data.ratingMap) return null;
  const rating = setupCtrl.myRating();
  if (rating === undefined) return undefined;

  return h(
    'div.ratings',
    !opts.showRatings
      ? ['Go']
      : [
          ...i18n.site.yourRatingIsX.asArray(h('strong', { attrs: { title: String(rating) } }, data.goRank ?? rating + (setupCtrl.isProvisional() ? '?' : ''))),
          'Go',
        ],
  );
};
