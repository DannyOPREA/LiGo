// The solution in lila's move list (the `tview2` inline view, as ui/analyse shows a tree's main
// line), with lila's jump buttons: the right line the puzzle's tree starts with, move by move.

import { licon, type LiconValue } from 'lib/licon';
import { type VNode, bind, hl, type MaybeVNode } from 'lib/view';

import type PuzzleCtrl from '@/ctrl';
import { pointName } from '@/solution';

/** The numbered moves; clicking one puts the board at the position after it. */
export function moveList(ctrl: PuzzleCtrl): MaybeVNode {
  const line = ctrl.solution;
  if (!ctrl.solutionOpen || !line) return undefined;
  const size = line[0].settings.size;
  return hl(
    'div.puzzle__moves.areplay',
    {
      hook: bind('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('move');
        const step = Number(el?.dataset.step);
        if (el && !Number.isNaN(step)) ctrl.jumpSolution(step);
      }),
    },
    hl(
      'div.tview2.tview2-inline',
      line.slice(1).map((node, i) =>
        hl(
          'move',
          {
            key: node.ply,
            class: { active: ctrl.solutionStep === i + 1, mainline: true, [node.color ?? 'black']: true },
            attrs: { 'data-step': i + 1 },
          },
          [hl('index', String(node.ply)), hl('san', pointName(size, node.move!))],
        ),
      ),
    ),
  );
}

const jumpButton = (icon: LiconValue, step: number, label: string, disabled: boolean): VNode =>
  hl('button.fbt', { attrs: { disabled, 'data-icon': icon, 'data-step': step, 'aria-label': label } });

/** lila's jump buttons: to the start, back, forward, to the end of the line. */
export function controls(ctrl: PuzzleCtrl): MaybeVNode {
  const line = ctrl.solution;
  if (!ctrl.solutionOpen || !line) return undefined;
  const at = ctrl.solutionStep;
  const last = line.length - 1;
  return hl('div.puzzle__controls', [
    hl(
      'div.jumps',
      {
        // one handler on the row: the buttons' steps change as the cursor moves
        hook: bind('click', e => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('button');
          const step = Number(el?.dataset.step);
          if (el && !Number.isNaN(step)) ctrl.jumpSolution(step);
        }),
      },
      [
        jumpButton(licon.JumpFirst, 0, 'First position', at === 0),
        jumpButton(licon.JumpPrev, at - 1, 'Previous move', at === 0),
        jumpButton(licon.JumpNext, at + 1, 'Next move', at === last),
        jumpButton(licon.JumpLast, last, 'Last move', at === last),
      ],
    ),
  ]);
}
