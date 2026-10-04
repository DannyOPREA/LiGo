// LiGo's position editor (unit 7.4, ADR 0023 §1): the analysis board's "setup" mode, where a new
// position starts with black and white stones. goban already has one: its puzzle mode's "setup"
// placement, which OGS's puzzle editor uses. A tap puts a stone of the chosen colour on an empty
// point or on the other colour's stone, and takes away a stone of the chosen colour. goban places
// the stones as they are, with no captures, so a stone without liberties can be placed; the
// analysis board refuses such a position when it is used (`rootSettings`, the SGF root table).
// Same small API style as `mountBoard`. Licence: MIT (LiGo's own code, ADR 0006).
// goban: Apache-2.0 (COPYING.md, NOTICE.md).

import { SVGRenderer, type GobanConfig, type GobanSelectedThemes } from 'goban';

import { gobanThemes, labels, type Color, type Theme } from './board';
import { gameConfig, stateOf } from './rules.mjs';

export interface Stones {
  /** SGF points, in board order (top row first, left to right). */
  black: string[];
  white: string[];
}

export interface EditorConfig {
  size: 9 | 13 | 19;
  /** The stones to start from. Default none. */
  stones?: Stones;
  /** The colour a tap places (or takes away). Default black. */
  color?: Color;
  /** Letters and numbers round the board. Default on. */
  coordinates?: boolean;
  /** Board and stones, as `mountBoard`'s (`DEFAULT_THEME` if left out). */
  theme?: Theme;
  /** The stones changed. */
  onChange?: (stones: Stones) => void;
}

export interface Editor {
  /** The colour a tap places from now on. */
  setColor(color: Color): void;
  /** The stones on the board now. */
  stones(): Stones;
  destroy(): void;
}

const POINTS = 'abcdefghijklmnopqrstuvwxyz';

/** Mounts an editor in `el`, as wide as `el` and resized with it (as `mountBoard`). */
export function mountEditor(el: HTMLElement, config: EditorConfig): Editor {
  const size = config.size;
  const coordinates = config.coordinates ?? true;
  const squares = size + (coordinates ? 2 : 0);
  const squareSize = () => Math.max(8, Math.floor(el.clientWidth / squares));
  const boardDiv = el.appendChild(document.createElement('div'));
  let color: Color = config.color ?? 'black';
  let destroyed = false;

  const goban = new EditorGoban(
    {
      // The rules don't matter to placing stones: LiGo's settings, for a position with no moves.
      ...gameConfig({
        size,
        ruleset: 'japanese',
        komi: 0,
        stones: config.stones ?? { black: [], white: [] },
        toMove: 'black',
      }),
      board_div: boardDiv,
      interactive: true,
      mode: 'puzzle',
      move_tree: { x: -1, y: -1 },
      getPuzzlePlacementSetting: () => ({ mode: 'setup', color: color === 'black' ? 1 : 2 }),
      square_size: squareSize(),
      ...labels(coordinates),
      dont_show_messages: true,
      onError: e => console.error(e),
    },
    gobanThemes(config.theme),
  );

  const stones = (): Stones => {
    const found: Stones = { black: [], white: [] };
    stateOf(goban.engine).board.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === 'X') found.black.push(POINTS[x] + POINTS[y]);
        else if (c === 'O') found.white.push(POINTS[x] + POINTS[y]);
      }),
    );
    return found;
  };

  goban.on('update', () => destroyed || config.onChange?.(stones()));

  const resize = new ResizeObserver(() => {
    const s = squareSize();
    if (s !== goban.square_size) goban.setSquareSize(s);
  });
  resize.observe(el);

  return {
    setColor: c => {
      color = c;
    },
    stones,
    destroy: () => {
      destroyed = true;
      resize.disconnect();
      goban.destroy();
      boardDiv.remove();
    },
  };
}

/** goban's SVG board in puzzle mode's setup placement, with LiGo's theme. */
class EditorGoban extends SVGRenderer {
  constructor(
    config: GobanConfig,
    private selected: GobanSelectedThemes,
  ) {
    EditorGoban.constructing = selected;
    super(config);
    this.enableStonePlacement();
  }

  /** goban asks for the themes inside its constructor, before `selected` is set. */
  private static constructing: GobanSelectedThemes;

  protected override getSelectedThemes(): GobanSelectedThemes {
    return this.selected ?? EditorGoban.constructing;
  }
}
