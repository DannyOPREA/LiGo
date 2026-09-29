import { ops as treeOps } from 'lib/tree/tree';

import type AnalyseCtrl from './ctrl';
import type { Opening, ServerEvalData } from './interfaces';

interface GameUpdate {
  id: string;
  fen: FEN;
  lm: Uci;
  wc?: number;
  bc?: number;
}

export interface AnalyseSocketSendParams {
  startWatching: (gameId: string) => void;
}

export type AnalyseSocketSend = <K extends keyof AnalyseSocketSendParams>(
  event: K,
  ...args: Parameters<AnalyseSocketSendParams[K]>
) => void;

export interface Socket {
  send: AnalyseSocketSend;
  receive(type: string, data: any): boolean;
}

export function make(send: AnalyseSocketSend, ctrl: AnalyseCtrl): Socket {
  // forecast mode: reload when opponent moves
  if (!ctrl.synthetic)
    setTimeout(function () {
      send('startWatching', ctrl.data.game.id);
    }, 1000);

  const handlers = {
    opening({ fen, opening }: { fen: FEN; opening: Opening }) {
      console.log(fen, opening);
      // ctrl.setOpening(fen, opening);
    },
    fen(e: GameUpdate) {
      if (ctrl.forecast && e.id === ctrl.data.game.id && !treeOps.last(ctrl.mainline)!.fen.startsWith(e.fen))
        ctrl.forecast.reloadToLastPly();
    },
    analysisProgress(data: ServerEvalData) {
      ctrl.mergeAnalysisData(data);
    },
  };

  return {
    receive(type, data) {
      const handler = (handlers as SocketHandlers)[type];
      if (handler) {
        handler(data);
        return true;
      }
      return false;
    },
    send,
  };
}
