// The puzzle board (src/puzzle.ts, unit 8.5) in a real browser: goban's puzzle mode, bundled by
// esbuild as lila bundles it, clicked in Chromium by Playwright. Every puzzle LiGo ships
// (tools/puzzles/data/, unit 8.4) is played twice: a right line to the end, answering whichever
// reply goban picks, and a wrong line, which must be reported wrong. Then what LiGo adds: one
// result per attempt, retry, touch-confirm, the bounds, and nothing loaded from OGS's servers.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { build } from "esbuild";

const harness = fileURLToPath(new URL("./browser/harness.ts", import.meta.url));
const cloudChromium = "/opt/pw-browsers/chromium";
const dataDir = fileURLToPath(new URL("../../../tools/puzzles/data/", import.meta.url));

/** Every committed puzzle, with the file it came from. */
const shipped = existsSync(dataDir)
  ? readdirSync(dataDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .flatMap((f) => JSON.parse(readFileSync(dataDir + f, "utf8")).map((p) => ({ file: f, puzzle: p })))
  : [];

let browser;
let script;

before(async () => {
  const out = await build({ entryPoints: [harness], bundle: true, format: "iife", write: false, logLevel: "warning" });
  script = out.outputFiles[0].text;
  const executablePath = process.env.LIGO_CHROMIUM || (existsSync(cloudChromium) ? cloudChromium : undefined);
  browser = await chromium.launch({ executablePath });
});

after(() => browser?.close());

async function open(width = 400, context = {}) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, ...context });
  const page = await ctx.newPage();
  const problems = { requests: [], errors: [] };
  page.on("request", (r) => problems.requests.push(r.url()));
  page.on("pageerror", (e) => problems.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && problems.errors.push(m.text()));
  await page.setContent(`<!doctype html><body style="margin:0"><div id="board" style="width:${width}px"></div></body>`);
  problems.requests.length = 0;
  await page.addScriptTag({ content: script });
  return { page, problems, close: () => ctx.close() };
}

// A reply delay of 1 ms (goban reads 0 as its default, 300).
const mount = (page, puzzle, options = {}) =>
  page.evaluate(([p, o]) => window.harness.mountPuzzle({ puzzle: p, replyDelay: 1, ...o }), [puzzle, options]);
const events = (page) => page.evaluate(() => window.harness.events);
const call = (page, method, ...args) => page.evaluate(([m, a]) => window.harness.puzzle[m](...a), [method, args]);

const sgf = (n) => String.fromCharCode(97 + n.x) + String.fromCharCode(97 + n.y);
const bounds = (p) => p.bounds ?? { top: 0, left: 0, bottom: p.height - 1, right: p.width - 1 };

/** Where a point is on screen: goban shows only the bounds, with a label band on the board's own edges. */
async function click(page, puzzle, move, tap = false) {
  const svg = await page.locator("#board svg").first().boundingBox();
  const b = bounds(puzzle);
  const across = b.right - b.left + 1 + (b.left === 0 ? 1 : 0) + (b.right === puzzle.width - 1 ? 1 : 0);
  const square = svg.width / across;
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  const col = x - b.left + (b.left === 0 ? 1 : 0);
  const row = y - b.top + (b.top === 0 ? 1 : 0);
  const [px, py] = [svg.x + (col + 0.5) * square, svg.y + (row + 0.5) * square];
  if (tap) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

/** A player move that wins: not marked wrong, and no reply to it is a refutation. */
const isRight = (n) => !n.wrong_answer && !(n.branches ?? []).some((r) => r.wrong_answer);
const isWrong = (n) => !isRight(n);

/** Waits until the line is `length` moves long or the attempt has ended; returns the line. */
async function settle(page, length) {
  await page.waitForFunction(
    (n) => window.harness.puzzle.result() !== undefined || window.harness.puzzle.line().length >= n,
    length,
  );
  return call(page, "line");
}

/** Plays a right line to the end, answering goban's replies from the tree. */
async function playRight(page, puzzle) {
  let node = puzzle.move_tree;
  const played = [];
  for (;;) {
    const move = (node.branches ?? []).find(isRight);
    assert.ok(move, `a right move after ${played.join(" ") || "the start"}`);
    await click(page, puzzle, sgf(move));
    played.push(sgf(move));
    if (move.correct_answer) break;
    const line = await settle(page, played.length + 1);
    assert.equal(line.length, played.length + 1, `a reply after ${played.join(" ")}`);
    const reply = line.at(-1);
    node = (move.branches ?? []).find((r) => sgf(r) === reply);
    assert.ok(node, `goban's reply ${reply} after ${played.join(" ")} is in the tree`);
    played.push(reply);
  }
  await settle(page, Infinity);
  return played;
}

/** A wrong first move: one in the tree, else an empty point shown that isn't a right first move. */
function wrongMove(puzzle) {
  const inTree = (puzzle.move_tree.branches ?? []).find(isWrong);
  if (inTree) return sgf(inTree);
  const b = bounds(puzzle);
  const taken = new Set([
    ...(puzzle.initial_state.black.match(/../g) ?? []),
    ...(puzzle.initial_state.white.match(/../g) ?? []),
    ...(puzzle.move_tree.branches ?? []).map(sgf),
  ]);
  for (let y = b.top; y <= b.bottom; y++)
    for (let x = b.left; x <= b.right; x++) if (!taken.has(sgf({ x, y }))) return sgf({ x, y });
  throw new Error(`${puzzle.id}: no empty point`);
}

describe("puzzle board in Chromium", () => {
  let t;
  before(async () => {
    t = await open();
  });
  afterEach(() => {
    assert.deepEqual(t.problems.errors, [], "no errors on the page");
    assert.deepEqual(t.problems.requests, [], "nothing loaded");
  });
  after(() => t?.close());

  test(`the puzzle set is there (${shipped.length} puzzles)`, () => {
    assert.ok(shipped.length >= 200, `at least 200 puzzles in tools/puzzles/data (found ${shipped.length})`);
  });

  test("every puzzle: a right line ends right, a wrong first move ends wrong", async () => {
    const failures = [];
    for (const { file, puzzle } of shipped) {
      try {
        await mount(t.page, puzzle);
        const played = await playRight(t.page, puzzle);
        assert.equal(await call(t.page, "result"), "right");
        const ev = await events(t.page);
        assert.deepEqual(ev.filter((e) => e === "right" || e === "wrong"), ["right"], "one result");
        assert.deepEqual(await call(t.page, "line"), played);

        await call(t.page, "retry");
        assert.deepEqual(await call(t.page, "line"), []);
        const wrong = wrongMove(puzzle);
        await click(t.page, puzzle, wrong);
        assert.equal((await call(t.page, "line"))[0], wrong, "the wrong move landed where it was aimed");
        await settle(t.page, Infinity);
        assert.equal(await call(t.page, "result"), "wrong", `after ${wrong}`);
      } catch (e) {
        failures.push(`${file} ${puzzle.id}: ${e.message}`);
      }
    }
    assert.deepEqual(failures, []);
  });
});

/** A puzzle of its own for the tests below: the straight three in the corner, Black to live at b1. */
const straightThree = {
  id: "test1",
  width: 19,
  height: 19,
  bounds: { top: 0, left: 0, bottom: 4, right: 6 },
  // Black: a2 b2 c2 d2 d1 (the eye space a1 b1 c1); White: a3 b3 c3 d3 e3 e2 e1.
  initial_state: { black: "abbbcbdbda", white: "acbcccdcecebea" },
  initial_player: "black",
  move_tree: {
    x: -1,
    y: -1,
    branches: [
      { x: 1, y: 0, correct_answer: true },
      { x: 0, y: 0, branches: [{ x: 1, y: 0, wrong_answer: true }] },
      { x: 2, y: 0, branches: [{ x: 1, y: 0, wrong_answer: true }] },
    ],
  },
  puzzle_player_move_mode: "free",
  puzzle_opponent_move_mode: "automatic",
};

describe("puzzle board: what LiGo adds", () => {
  let t;
  beforeEach(async () => {
    await t?.close();
    t = await open();
  });
  afterEach(() => {
    assert.deepEqual(t.problems.errors, [], "no errors on the page");
    assert.deepEqual(t.problems.requests, [], "nothing loaded");
  });
  after(() => t?.close());

  test("the vital point is right, reported once", async () => {
    await mount(t.page, straightThree);
    await click(t.page, straightThree, "ba");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ba", "right"]);
  });

  test("a wrong move gets the refutation, and the attempt ends there", async () => {
    await mount(t.page, straightThree);
    await click(t.page, straightThree, "aa");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player aa", "opponent ba", "wrong"]);
    // No more moves until a retry.
    await click(t.page, straightThree, "ca");
    assert.deepEqual(await call(t.page, "line"), ["aa", "ba"]);
  });

  test("a move off the tree is wrong", async () => {
    await mount(t.page, straightThree);
    await click(t.page, straightThree, "fb");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player fb", "wrong"]);
  });

  test("retry starts again, even while goban's reply is on its way", async () => {
    await mount(t.page, straightThree, { replyDelay: 1000 });
    await click(t.page, straightThree, "ca");
    assert.deepEqual(await call(t.page, "line"), ["ca"], "the reply is still on its way");
    await call(t.page, "retry");
    // The abandoned attempt's reply and its "wrong" never reach the page.
    await t.page.waitForFunction(() => window.harness.puzzle.line().length === 0, null, { timeout: 5000 });
    await t.page.waitForTimeout(1100);
    assert.deepEqual(await call(t.page, "line"), []);
    assert.deepEqual(await events(t.page), ["player ca"]);
    assert.equal(await call(t.page, "result"), undefined);
    await click(t.page, straightThree, "ba");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ca", "player ba", "right"]);
    const board = (await call(t.page, "state")).board;
    assert.equal(board[0].slice(0, 3), ".X.", "the reset board has only the right move");
  });

  test("touch-confirm: a tap previews, a second tap plays", async () => {
    await mount(t.page, straightThree, { confirm: true });
    await click(t.page, straightThree, "aa");
    assert.equal(await call(t.page, "pending"), true);
    assert.deepEqual(await call(t.page, "line"), []);
    // A tap elsewhere moves the preview.
    await click(t.page, straightThree, "ba");
    assert.deepEqual(await events(t.page), []);
    await click(t.page, straightThree, "ba");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ba", "right"]);
    assert.equal(await call(t.page, "pending"), false);
  });

  test("touch-confirm on a phone: a tap previews, a second tap plays", async () => {
    await t.close();
    t = await open(360, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    await mount(t.page, straightThree, { confirm: true });
    await click(t.page, straightThree, "ba", true);
    assert.equal(await call(t.page, "pending"), true);
    assert.deepEqual(await events(t.page), []);
    await click(t.page, straightThree, "ba", true);
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ba", "right"]);
  });

  test("without touch-confirm a phone tap plays at once", async () => {
    await t.close();
    t = await open(360, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    await mount(t.page, straightThree);
    await click(t.page, straightThree, "ba", true);
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ba", "right"]);
  });

  test("touch-confirm: confirm() plays the preview, and replies still come", async () => {
    await mount(t.page, straightThree, { confirm: true });
    await click(t.page, straightThree, "ca");
    await call(t.page, "confirm");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ca", "opponent ba", "wrong"]);
  });

  test("touch-confirm can be turned off and on", async () => {
    await mount(t.page, straightThree, { confirm: true });
    await call(t.page, "set", { confirm: false });
    await click(t.page, straightThree, "ba");
    await settle(t.page, Infinity);
    assert.deepEqual(await events(t.page), ["player ba", "right"]);
  });

  test("a click on a stone plays nothing", async () => {
    await mount(t.page, straightThree);
    await click(t.page, straightThree, "ab");
    assert.deepEqual(await call(t.page, "line"), []);
    assert.equal(await call(t.page, "result"), undefined);
    assert.deepEqual(await events(t.page), []);
  });

  test("only the bounds are shown, as wide as the box", async () => {
    await mount(t.page, straightThree);
    const svg = await t.page.locator("#board svg").first().boundingBox();
    // 7 columns and 5 rows shown, plus the label band on the board's left and top edges.
    const square = svg.width / 8;
    assert.ok(svg.width <= 400 && svg.width > 400 - 8, `width ${svg.width}`);
    assert.ok(Math.abs(svg.height - 6 * square) < 1, `height ${svg.height} for square ${square}`);
  });
});
