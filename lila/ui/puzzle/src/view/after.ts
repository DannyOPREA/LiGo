import { licon } from 'lib/licon';
import { type VNode, bind, icon, div, button, type MaybeVNode } from 'lib/view';

import type PuzzleCtrl from '../ctrl';

const renderVote = (ctrl: PuzzleCtrl): MaybeVNode => {
  if (!ctrl.data.user) return null;
  if (ctrl.autoNexting()) return div('.puzzle__vote');

  return div('.puzzle__vote', [
    ctrl.session.isNew() && ctrl.data.user?.provisional
      ? div('.puzzle__vote__help', i18n.puzzle.didYouLikeThisPuzzle)
      : null,
    div('.puzzle__vote__buttons', [
      button('.button.button-empty.vote-up', {
        class: { active: ctrl.voted === true },
        title: i18n.puzzle.upVote,
        hook: bind('click', () => ctrl.vote(true)),
      }),
      button('.button.button-empty.vote-down', {
        class: { active: ctrl.voted === false },
        title: i18n.puzzle.downVote,
        hook: bind('click', () => ctrl.vote(false)),
      }),
    ]),
  ]);
};

export default function (ctrl: PuzzleCtrl): VNode {
  const win = ctrl.lastFeedback === 'win';
  return div('.puzzle__feedback.after', [
    div('.complete', i18n.puzzle[win ? 'puzzleSuccess' : 'puzzleComplete']),
    button('.continue', { hook: bind('click', ctrl.nextPuzzle) }, [
      icon(licon.PlayTriangle)(),
      i18n.puzzle.continueTraining,
    ]),
    div('.puzzle__more', [renderVote(ctrl)]),
  ]);
}
