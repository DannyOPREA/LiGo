import type { DrawModifiers, DrawShape } from '@lichess-org/chessground/draw';
import { opposite } from '@lichess-org/chessground/util';
import { parseFen } from 'chessops/fen';
import { isDrop } from 'chessops/types';
import { parseUci, makeSquare } from 'chessops/util';

import { fenColor } from 'lib/game';
import { isUci } from 'lib/game/chess';
import { endgameShapesForNode } from 'lib/game/endgame';
import { annotationShapes, analysisGlyphs } from 'lib/game/glyphs';
import { last } from 'lib/tree/ops';
import type { ServerEval } from 'lib/tree/types';

import type AnalyseCtrl from './ctrl';

const pieceDrop = (key: Key, role: Role, color: Color): DrawShape => ({
  orig: key,
  piece: {
    color,
    role,
    scale: 0.8,
  },
  brush: 'green',
});

export function makeShapesFromUci(
  color: Color,
  uci: Uci | undefined,
  brush: string,
  modifiers?: DrawModifiers,
): DrawShape[] {
  if (!uci || uci === 'Current Position') return [];
  const move = parseUci(uci)!;
  const to = makeSquare(move.to);
  if (isDrop(move)) return [{ orig: to, brush, modifiers }, pieceDrop(to, move.role, color)];

  const shapes: DrawShape[] = [{ orig: makeSquare(move.from), dest: to, brush, modifiers }];
  if (move.promotion) shapes.push(pieceDrop(to, move.promotion, color));
  return shapes;
}

export function compute(ctrl: AnalyseCtrl): DrawShape[] {
  const color = fenColor(ctrl.node.fen);
  const rcolor = opposite(color);
  const { eval: nEval = {} as Partial<ServerEval>, fen: nFen } = ctrl.node;
  // (unit 3.5) no local engine: best move arrows come from a stored server analysis only
  let shapes: DrawShape[] = endgameShapesForNode(
    ctrl.node,
    ctrl.node === last(ctrl.mainline),
    ctrl.data.game.winner,
    ctrl.data.game.status.name,
  );
  if (ctrl.isEvalAllowed() && ctrl.showBestMoveArrows() && ctrl.showEvaluation()) {
    if (isUci(nEval.best)) shapes = shapes.concat(makeShapesFromUci(rcolor, nEval.best, 'paleGreen'));
    const nextBest = ctrl.nextNodeBest();
    if (nextBest) shapes = shapes.concat(makeShapesFromUci(color, nextBest, 'paleBlue'));
  }
  if (ctrl.showMoveAnnotations()) shapes = shapes.concat(annotationShapes(ctrl.node));
  if (ctrl.showVariationArrows()) hiliteVariations(ctrl, shapes);

  if (ctrl.isEvalAllowed()) {
    const parsed = parseFen(nFen);
    if ('error' in parsed) return shapes;
    const { board, epSquare, castlingRights } = parsed.value;

    const addAnalysis = (orig: Key, type: keyof typeof analysisGlyphs) => {
      const idx = shapes.filter(s => s.orig === orig && s.customSvg).length;
      shapes.push({
        orig,
        customSvg: { html: analysisGlyphs[type](idx) },
      });
    };

    if (ctrl.motifEnabled()) {
      ctrl.motif.detectPins(board).forEach(p => addAnalysis(makeSquare(p.pinned), 'pin'));
      ctrl.motif
        .detectUndefended(board, epSquare)
        .forEach(u => addAnalysis(makeSquare(u.square), 'undefended'));
      ctrl.motif
        .detectCheckable(board, epSquare, castlingRights)
        .forEach(s => addAnalysis(makeSquare(s.king), 'checkable'));
    }
  }

  return shapes;
}

function hiliteVariations(ctrl: AnalyseCtrl, autoShapes: DrawShape[]) {
  const visible = ctrl.visibleChildren();
  if (visible.length < 2) return;

  const isGamebookEditor = false;
  for (const [i, node] of visible.entries()) {
    const existing = autoShapes.find(s => s.orig + s.dest === node.uci);
    if (existing) existing.modifiers = { hilite: i === ctrl.fork.selectedIndex ? 'white' : undefined };
    else {
      const move = parseUci(node.uci ?? '');
      const hilite = i === ctrl.fork.selectedIndex ? '#3291ff' : move && isDrop(move) ? undefined : '#aaa';
      const shapes = makeShapesFromUci(
        ctrl.turnColor(),
        node.uci,
        !isGamebookEditor ? 'variation' : i === 0 ? 'paleGreen' : 'paleRed',
        { hilite },
      ).map(s => ({ ...s, below: true }));
      autoShapes.push(...shapes);
    }
  }
}
