// Test page script for board.browser.test.mjs: mounts boards and records what they report.
// Licence: MIT (LiGo's own code, ADR 0006).

import { BOARD_THEMES, STONE_THEMES, gobanThemes, mountBoard, type Board, type BoardConfig } from '../../src/board.ts';

interface Harness {
  board?: Board;
  events: string[];
  /** What `onPlayed` reported: "<colour> <move> <captured>". */
  played: string[];
  /** How many times the board said something the page may show changed. */
  changes: number;
  mount(config: BoardConfig & { autoPlay?: boolean }): void;
  themes: { boards: readonly string[]; stones: readonly string[] };
  gobanThemes: typeof gobanThemes;
}

const harness: Harness = {
  events: [],
  played: [],
  changes: 0,
  themes: { boards: BOARD_THEMES, stones: STONE_THEMES },
  gobanThemes,
  mount(config) {
    harness.board?.destroy();
    harness.events = [];
    harness.played = [];
    harness.changes = 0;
    const el = document.getElementById('board')!;
    harness.board = mountBoard(el, {
      ...config,
      onMove: move => {
        harness.events.push(`move ${move}`);
        if (config.autoPlay) harness.board!.play(move);
      },
      onRefused: reason => harness.events.push(`refused ${reason}`),
      onPlayed: ({ move, color, captured }) => harness.played.push(`${color} ${move} ${captured}`),
      onChange: () => harness.changes++,
    });
  },
};

(window as unknown as { harness: Harness }).harness = harness;
