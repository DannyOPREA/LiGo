import type { DrawModifiers, DrawShape } from '@lichess-org/chessground/draw';
import type { NormalMove } from 'chessops/types';
import { parseUci, makeSquare } from 'chessops/util';

import { fenColor } from 'lib/game';
import { annotationShapes } from 'lib/game/glyphs';
import type { Glyph, TreeNode } from 'lib/tree/types';

// import { makeGooglyShapes } from '../../bits/src/bits.googlyHorsey';
import type PuzzleCtrl from './ctrl';

function makeAutoShapesFromUci(
  color: Color,
  uci: Uci,
  brush: string,
  modifiers?: DrawModifiers,
): DrawShape[] {
  const move = parseUci(uci)! as NormalMove; // no crazyhouse
  const to = makeSquare(move.to);
  return [
    { orig: makeSquare(move.from), dest: to, brush, modifiers },
    ...(move.promotion
      ? [{ orig: to, piece: { color, role: move.promotion, scale: 0.8 }, brush: 'green' }]
      : []),
  ];
}

export default function (ctrl: PuzzleCtrl): DrawShape[] {
  const n = ctrl.node;
  const color = fenColor(n.fen);
  let shapes: DrawShape[] = [];
  // (unit 3.5) no local engine: only the server's stored best move is drawn
  if (ctrl.showEvaluation()) {
    if (n.eval) shapes = shapes.concat(makeAutoShapesFromUci(color, n.eval.best!, 'paleGreen'));
    const nextBest: Uci | undefined = ctrl.nextNodeBest();
    if (nextBest) shapes = shapes.concat(makeAutoShapesFromUci(color, nextBest, 'paleBlue'));
  }
  const feedback = feedbackAnnotation(n);
  const hint =
    ctrl.hintSquare() !== undefined ? { orig: makeSquare(ctrl.hintSquare()!), brush: 'green' } : undefined;
  return [
    ...shapes,
    ...annotationShapes(n),
    ...(feedback ? annotationShapes(feedback) : []),
    ...(hint ? [hint] : []),
    ...(ctrl.googlyEyes ? ctrl.googlyEyes() : []),
  ];
}

function feedbackAnnotation(n: TreeNode): TreeNode | undefined {
  let glyph: Glyph | undefined;
  switch (n.puzzle) {
    case 'good':
    case 'win':
      glyph = { id: 7, name: 'good', symbol: '✓' };
      break;
    case 'fail':
      glyph = { id: 4, name: 'fail', symbol: '✗' };
  }
  return glyph && { ...n, glyphs: [glyph] };
}
