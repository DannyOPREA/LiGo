import type { Chart } from 'chart.js';

import type { TreeNodeBase } from 'lib/tree/types';

import type { RankTable } from './goRank';

export interface PlyChart extends Chart<'line' | 'bar'> {
  selectPly(ply: number, isMainline: boolean): void;
}

export interface AcplChart extends Chart<'line'> {
  selectPly(ply: number, isMainline: boolean): void;
  updateData(d: AnalyseData, mainline: TreeNodeBase[]): void;
}

export interface Division {
  middle?: number;
  end?: number;
}

export interface Player {
  color: 'white' | 'black';
  blurs?: {
    bits?: string;
  };
}

export interface AnalyseData {
  player: Player;
  opponent: Player;
  treeParts: TreeNodeBase[];
  game: {
    division?: Division;
    moveCentis?: number[];
    status: {
      name: string;
    };
    startedAtTurn?: number;
  };
  analysis?: {
    partial?: boolean;
  };
  clock?: {
    running: boolean;
    initial: number;
    increment: number;
  };
}

export interface ChartGame {
  acpl(el: HTMLCanvasElement, data: AnalyseData, mainline: TreeNodeBase[]): Promise<AcplChart>;
  movetime(el: HTMLCanvasElement, data: AnalyseData, hunter: boolean): Promise<PlyChart | undefined>;
}

export interface DistributionData {
  freq: number[];
  myRating: number | null;
  otherPlayer: string | null;
  otherRating: number | null;
  rankTable?: RankTable; // LiGo: draw a kyu/dan axis (unit 5.5)
}

export interface PerfRatingHistory {
  name: string;
  points: [number, number, number, number][];
}
