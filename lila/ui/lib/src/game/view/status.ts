import { opposite, plyColor, type GameData, type Source, type StatusName } from '@/game';

export interface StatusData {
  winner?: Color;
  status: StatusName;
  abortedBy?: Color;
  ply: Ply;
  fen: FEN;
  fiftyMoves?: boolean;
  threefold?: boolean;
  drawOffers?: number[];
  source?: Source;
}

export default function status(d: GameData): string {
  return statusOf({
    winner: d.game.winner,
    status: d.game.status.name,
    abortedBy: d.game.abortedBy,
    ply: d.game.turns,
    fen: d.game.fen,
    fiftyMoves: d.game.fiftyMoves,
    threefold: d.game.threefold,
    drawOffers: d.game.drawOffers,
    source: d.game.source,
  });
}
export function statusOf(d: StatusData): string {
  const winnerSuffix = d.winner ? ` • ${i18n.site[`${d.winner}IsVictorious`]}` : '';
  switch (d.status) {
    case 'started':
      return i18n.site.playingRightNow;
    case 'aborted':
      const abortReasonText = d.abortedBy
        ? i18n.site[`${d.abortedBy}Aborted`]
        : i18n.site[`${plyColor(d.ply)}DidntMove`];
      return `${abortReasonText}${winnerSuffix}`;
    case 'mate':
      return i18n.site.checkmate + winnerSuffix;
    case 'resign':
      return i18n.site[`${opposite(d.winner ?? 'black')}Resigned`] + winnerSuffix;
    case 'stalemate':
      return i18n.site.stalemate + winnerSuffix;
    case 'timeout':
      return d.winner
        ? i18n.site[`${opposite(d.winner)}LeftTheGame`] + winnerSuffix
        : `${i18n.site[`${plyColor(d.ply)}LeftTheGame`]} • ${i18n.site.draw}`;
    case 'draw': {
      if (d.fiftyMoves || d.fen.split(' ')[4] === '100')
        return `${i18n.site.fiftyMovesWithoutProgress} • ${i18n.site.draw}`;
      if (d.threefold) return `${i18n.site.threefoldRepetition} • ${i18n.site.draw}`;
      if (d.drawOffers?.some(turn => turn >= d.ply)) return i18n.site.drawByMutualAgreement;
      return i18n.site.draw;
    }
    case 'insufficientMaterialClaim':
      return `${i18n.site.drawClaimed} • ${i18n.site.insufficientMaterial}`;
    case 'outoftime':
      return `${i18n.site[`${plyColor(d.ply)}RanOutOfTime`]}${winnerSuffix || ` • ${i18n.site.draw}`}`;
    case 'noStart':
      return i18n.site[`${opposite(d.winner ?? 'black')}DidntMove`] + winnerSuffix;
    case 'cheat':
      return i18n.site.cheatDetected + winnerSuffix;
    case 'variantEnd':
      return i18n.site.variantEnding + winnerSuffix;
    case 'unknownFinish':
      return d.winner ? i18n.site[`${d.winner}IsVictorious`] : i18n.site.finished;
    default:
      return d.status + winnerSuffix;
  }
}
