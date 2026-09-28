// Test page script for board.browser.test.mjs: mounts boards and records what they report.
// Licence: MIT (LiGo's own code, ADR 0006).

import { mountBoard, type Board, type BoardConfig } from '../../src/board.ts';

interface Harness {
  board?: Board;
  events: string[];
  mount(config: BoardConfig & { autoPlay?: boolean }): void;
}

const harness: Harness = {
  events: [],
  mount(config) {
    harness.board?.destroy();
    harness.events = [];
    const el = document.getElementById('board')!;
    harness.board = mountBoard(el, {
      ...config,
      onMove: move => {
        harness.events.push(`move ${move}`);
        if (config.autoPlay) harness.board!.play(move);
      },
      onRefused: reason => harness.events.push(`refused ${reason}`),
    });
  },
};

(window as unknown as { harness: Harness }).harness = harness;
