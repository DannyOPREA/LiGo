// no side effects allowed due to re-export by index.ts

// LiGo (unit 3.19, mini-board slice): a Go game's mini board in game lists, on TV and in the lobby,
// drawn as a small SVG from the compact board string lila and lila-ws send (ADR 0019 §6): rows top to
// bottom separated by `/`, `b` and `w` for stones, a number for a run of empty points. The full goban
// board (libs/board) is far too heavy for a page of twenty thumbnails that only ever show a position.

/** The board's rows, each a string of `.`, `b` and `w`, or undefined if the string isn't a board. */
export function goMiniRows(board: string): string[] | undefined {
  const rows = board.split('/').map(row => row.replace(/\d+/g, n => '.'.repeat(parseInt(n))));
  const size = rows.length;
  return size >= 2 && rows.every(r => r.length === size && /^[.bw]+$/.test(r)) ? rows : undefined;
}

/** Star points (hoshi) as [col, row], zero-based from the top left, for the sizes LiGo plays. */
export function goMiniStars(size: number): [number, number][] {
  const edge = size >= 13 ? 3 : 2;
  const far = size - 1 - edge;
  const mid = (size - 1) / 2;
  if (size < 9) return [];
  const corners: [number, number][] = [
    [edge, edge],
    [far, edge],
    [edge, far],
    [far, far],
  ];
  if (size % 2 === 0) return corners;
  const sides: [number, number][] =
    size >= 19
      ? [
          [mid, edge],
          [edge, mid],
          [far, mid],
          [mid, far],
        ]
      : [];
  return [...corners, ...sides, [mid, mid]];
}

/** An SGF point ("dd": column then row, `a` = the top left) as [col, row], if it is on the board. */
function sgfPoint(lm: string | undefined, size: number): [number, number] | undefined {
  if (!lm || !/^[a-z]{2}$/.test(lm)) return undefined;
  const col = lm.charCodeAt(0) - 97,
    row = lm.charCodeAt(1) - 97;
  return col < size && row < size ? [col, row] : undefined;
}

export interface GoMiniCircle {
  cls: 'star' | 'black' | 'white' | 'last on-black' | 'last on-white';
  cx: number;
  cy: number;
  r: number;
}

/** What a mini board draws: its size, the grid as one SVG path, then star points, stones, and a ring on
 * the last stone played. Undefined if the string isn't a board. */
export function goMiniShapes(
  board: string,
  lastMove?: string,
): { size: number; grid: string; circles: GoMiniCircle[] } | undefined {
  const rows = goMiniRows(board);
  if (!rows) return undefined;
  const size = rows.length,
    end = size - 0.5,
    lines: string[] = [];
  for (let i = 0; i < size; i++) {
    const at = i + 0.5;
    lines.push(`M0.5 ${at}H${end}M${at} 0.5V${end}`);
  }
  const circles: GoMiniCircle[] = goMiniStars(size).map(([c, r]) => ({
    cls: 'star',
    cx: c + 0.5,
    cy: r + 0.5,
    r: 0.12,
  }));
  rows.forEach((row, r) =>
    [...row].forEach((p, c) => {
      if (p !== '.') circles.push({ cls: p === 'b' ? 'black' : 'white', cx: c + 0.5, cy: r + 0.5, r: 0.47 });
    }),
  );
  const last = sgfPoint(lastMove, size);
  const lastStone = last && rows[last[1]][last[0]];
  if (last && lastStone !== '.')
    circles.push({
      cls: lastStone === 'b' ? 'last on-black' : 'last on-white',
      cx: last[0] + 0.5,
      cy: last[1] + 0.5,
      r: 0.25,
    });
  return { size, grid: lines.join(''), circles };
}

const svgNs = 'http://www.w3.org/2000/svg';

/** Draws (or redraws) the mini board into `el`, a `.go-mini` element. */
export function renderGoMini(el: Element, board: string, lastMove?: string): void {
  const shapes = goMiniShapes(board, lastMove);
  if (!shapes) return;
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'go-mini__board');
  svg.setAttribute('viewBox', `0 0 ${shapes.size} ${shapes.size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${shapes.size}×${shapes.size} Go board`);
  const grid = document.createElementNS(svgNs, 'path');
  grid.setAttribute('class', 'grid');
  grid.setAttribute('d', shapes.grid);
  svg.appendChild(grid);
  for (const c of shapes.circles) {
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('class', c.cls);
    circle.setAttribute('cx', String(c.cx));
    circle.setAttribute('cy', String(c.cy));
    circle.setAttribute('r', String(c.r));
    svg.appendChild(circle);
  }
  el.replaceChildren(svg);
}
