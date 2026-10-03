// The account menu's board and stone panes (unit 9.7, ADR 0026 §3): they list goban's themes, save
// the choice as the `theme` / `pieceSet` preference, put it on <body> and tell the page. The three
// copies of the theme names (lila's preference lists, libs/board's lists and the menu's swatch
// styles) are checked to stay the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';

import { pubsub } from 'lib/pubsub';

import { BOARD_THEMES, STONE_THEMES } from '../../../../libs/board/src/themes.ts';
import { BoardCtrl } from '../src/board';
import { PieceCtrl } from '../src/piece';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** The names in a Scala list of `Theme("…", …)` or `PieceSet("…", …)` after `object <name> extends`. */
const scalaNames = (file: string, object: string) => {
  const src = read(`../../../modules/pref/src/main/${file}`);
  const body = src.slice(src.indexOf(`object ${object} extends`)).split('\nobject ')[0];
  return [...body.matchAll(/\w+\("([^"]+)"/g)].map(m => m[1]);
};

describe('the theme names agree everywhere', () => {
  test("lila's preference lists are libs/board's", () => {
    assert.deepEqual(scalaNames('Theme.scala', 'Theme'), [...BOARD_THEMES]);
    assert.deepEqual(scalaNames('PieceSet.scala', 'PieceSet'), [...STONE_THEMES]);
  });

  test('every board theme has a swatch colour, and every special stone swatch names a stone theme', () => {
    const css = read('../css/_board.scss');
    for (const t of BOARD_THEMES) assert.ok(css.includes(`[data-board-theme='${t}']`), t);
    for (const [, t] of css.matchAll(/\[data-stone-theme='([^']+)'\]/g))
      assert.ok((STONE_THEMES as readonly string[]).includes(t), t);
  });
});

describe('the board and stone panes', () => {
  const posts: Array<{ url: string; body: FormData }> = [];
  const changes: boolean[] = [];
  const realFetch = globalThis.fetch;
  const fakeFetch = async (url: string, init: RequestInit) => {
    posts.push({ url, body: init.body as FormData });
    return new Response('ok');
  };
  globalThis.fetch = fakeFetch;
  pubsub.on('board.change', is3d => changes.push(is3d));
  after(() => {
    globalThis.fetch = realFetch;
    delete document.body.dataset.board;
    delete document.body.dataset.pieceSet;
  });
  beforeEach(() => {
    posts.length = 0;
    changes.length = 0;
  });

  const root = () =>
    ({
      data: {
        board: { current: 'Plain', list: BOARD_THEMES.map(name => ({ name, featured: true })) },
        piece: { current: 'Plain', list: STONE_THEMES.map(name => ({ name, featured: true })) },
      },
      redraw: () => {},
      close: () => {},
    }) as any;

  /** The pane's theme buttons: their text and whether each says it is chosen. */
  const buttons = (vnode: any) =>
    vnode.children
      .find((c: any) => c?.sel === 'div.list')
      .children.map((b: any) => [b.children.at(-1).text, b.data.attrs['aria-pressed']]);

  test('the board pane lists the board themes and saves a choice as `theme`', () => {
    const r = root();
    const pane = new BoardCtrl(r);
    assert.deepEqual(
      buttons(pane.render()),
      BOARD_THEMES.map(t => [t, `${t === 'Plain'}`]),
    );
    (pane as any).setBoard('Night Play');
    assert.equal(r.data.board.current, 'Night Play');
    assert.equal(document.body.dataset.board, 'Night Play');
    assert.deepEqual(changes, [false]);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/pref/theme');
    assert.equal(posts[0].body.get('theme'), 'Night Play');
  });

  test('the stone pane lists the stone themes and saves a choice as `pieceSet`', () => {
    const r = root();
    const pane = new PieceCtrl(r);
    assert.deepEqual(
      buttons(pane.render()),
      STONE_THEMES.map(t => [t, `${t === 'Plain'}`]),
    );
    (pane as any).set('Slate & Shell');
    assert.equal(r.data.piece.current, 'Slate & Shell');
    assert.equal(document.body.dataset.pieceSet, 'Slate & Shell');
    assert.deepEqual(changes, [false]);
    assert.equal(posts[0].url, '/pref/pieceSet');
    assert.equal(posts[0].body.get('pieceSet'), 'Slate & Shell');
  });
});
