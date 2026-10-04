import { pubsub } from 'lib/pubsub';

import type PuzzleCtrl from './ctrl';

/** lila's keys that still mean something here: N for the next puzzle, Z for zen, and the arrow keys through the solution. */
export const bind = (ctrl: PuzzleCtrl): void => {
  const step = (by: number | 'first' | 'last') => () => {
    if (!ctrl.solution) return;
    const to = by === 'first' ? 0 : by === 'last' ? ctrl.solution.length - 1 : ctrl.solutionStep + by;
    ctrl.jumpSolution(to);
  };
  site.mousetrap
    .bind(['left', 'k'], step(-1))
    .bind(['right', 'j'], step(1))
    .bind(['up', '0', 'home'], step('first'))
    .bind(['down', '$', 'end'], step('last'))
    .bind('z', () => pubsub.emit('zen'))
    .bind('n', ctrl.nextPuzzle);
};
