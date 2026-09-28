// Test page script for board.browser.test.mjs: mounts boards and records what they report.
// Licence: MIT (LiGo's own code, ADR 0006).

import { mountBoard, type Board, type BoardConfig } from '../../src/board.ts';

interface Harness {
  board?: Board;
  events: string[];
  /** How many times the board said something the page may show changed. */
  changes: number;
  mount(config: BoardConfig & { autoPlay?: boolean }): void;
}

const harness: Harness = {
  events: [],
  changes: 0,
  mount(config) {
    harness.board?.destroy();
    harness.events = [];
    harness.changes = 0;
    const el = document.getElementById('board')!;
    harness.board = mountBoard(el, {
      ...config,
      onMove: move => {
        harness.events.push(`move ${move}`);
        if (config.autoPlay) harness.board!.play(move);
      },
      onRefused: reason => harness.events.push(`refused ${reason}`),
      onChange: () => harness.changes++,
    });
  },
};

(window as unknown as { harness: Harness }).harness = harness;
