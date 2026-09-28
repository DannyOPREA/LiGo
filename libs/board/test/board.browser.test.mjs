// The board (src/board.ts) in a real browser: goban's SVG board, bundled by esbuild as lila bundles
// it, clicked and tapped in Chromium by Playwright. What LiGo adds is checked here: moves reported
// and played back, previews, taking a move back, who may move, handicap and replayed moves, sizing,
// and that the board loads nothing from OGS's servers.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium, devices } from "@playwright/test";
import { build } from "esbuild";

const harness = fileURLToPath(new URL("./browser/harness.ts", import.meta.url));
const cloudChromium = "/opt/pw-browsers/chromium";

let browser;
let script;

before(async () => {
  const out = await build({ entryPoints: [harness], bundle: true, format: "iife", write: false, logLevel: "warning" });
  script = out.outputFiles[0].text;
  const executablePath = process.env.LIGO_CHROMIUM || (existsSync(cloudChromium) ? cloudChromium : undefined);
  browser = await chromium.launch({ executablePath });
});

after(() => browser?.close());

/** A page with the board in a `width`-pixel box; `requests` and `errors` collect what went wrong. */
async function open({ width = 570, context = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, ...context });
  const page = await ctx.newPage();
  const problems = { requests: [], errors: [] };
  page.on("request", (r) => problems.requests.push(r.url()));
  page.on("pageerror", (e) => problems.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && problems.errors.push(m.text()));
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="board" style="width:${width}px"></div></body>`);
  problems.requests.length = 0; // the page itself
  await page.addScriptTag({ content: script });
  return { page, problems, close: () => ctx.close() };
}

const mount = (page, config) => page.evaluate((c) => window.harness.mount(c), config);
const events = (page) => page.evaluate(() => window.harness.events);
const state = (page) => page.evaluate(() => window.harness.board.state());
const call = (page, method, ...args) => page.evaluate(([m, a]) => window.harness.board[m](...a), [method, args]);

/** Where an SGF point is on screen: goban leaves a square-wide coordinate band on each side. */
async function pointOf(page, move, size, coordinates = true) {
  const svg = await page.locator("#board svg").first().boundingBox();
  const square = svg.width / (size + (coordinates ? 2 : 0));
  const band = coordinates ? 1 : 0;
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  return { x: svg.x + (x + band + 0.5) * square, y: svg.y + (y + band + 0.5) * square };
}

async function click(page, move, size = 9) {
  const p = await pointOf(page, move, size);
  await page.mouse.click(p.x, p.y);
}

const game9 = { size: 9, ruleset: "japanese", komi: 6.5 };

describe("board in Chromium", () => {
  let t;
  beforeEach(async () => {
    await t?.close();
    t = await open();
  });
  // goban reports a lost sync (and reloads the page) or a move it couldn't place on the console only.
  afterEach(() => assert.deepEqual(t.problems.errors, [], "no errors on the page"));
  after(() => t?.close());

  test("a local game: each click is reported, played back, and the turn passes", async () => {
    await mount(t.page, { ...game9, movable: "both", autoPlay: true });
    await click(t.page, "ee");
    await click(t.page, "de");
    assert.deepEqual(await events(t.page), ["move ee", "move de"]);
    const s = await state(t.page);
    assert.equal(s.board[4], "...OX....");
    assert.equal(s.toMove, "black");
    assert.ok((await t.page.evaluate(() => window.harness.changes)) >= 2, "onChange fired");
  });

  test("captures come off the board and are counted", async () => {
    // White's lone stone at A1 (aa is the top-left corner in SGF: column a, row a).
    await mount(t.page, { ...game9, movable: "both", autoPlay: true, moves: ["ba", "aa"] });
    await click(t.page, "ab");
    const s = await state(t.page);
    assert.equal(s.board[0], ".X.......");
    assert.deepEqual(s.captures, { black: 1, white: 0 });
  });

  test("a move the rules forbid is refused with its reason and not reported", async () => {
    // Black to play at A1 would have no liberties: suicide (R-MOVE-5).
    await mount(t.page, { ...game9, movable: "both", autoPlay: true, moves: ["ee", "ba", "ff", "ab"] });
    await click(t.page, "aa");
    await click(t.page, "ee"); // occupied: goban ignores it without an error
    assert.deepEqual(await events(t.page), ["refused suicide"]);
    assert.equal((await state(t.page)).board[0], ".O.......");
  });

  test("ko: the recapture is refused and the ko point is reported", async () => {
    // White's stone at ed is in atari; Black takes it at dd, and White may not take back at ed at once.
    const moves = ["ec", "dc", "fd", "cd", "ee", "de", "ii", "ed"];
    await mount(t.page, { ...game9, movable: "both", autoPlay: true, moves });
    await click(t.page, "dd");
    assert.equal((await state(t.page)).koPoint, "ed");
    await click(t.page, "ed");
    assert.deepEqual(await events(t.page), ["move dd", "refused superko"]);
  });

  test("the owner decides: a reported move stays a preview until played, and cancel takes it back", async () => {
    await mount(t.page, { ...game9, movable: "both" });
    await click(t.page, "cc");
    assert.deepEqual(await events(t.page), ["move cc"]);
    assert.equal((await state(t.page)).board[2], ".........", "not played yet");
    await call(t.page, "cancel");
    assert.equal((await state(t.page)).toMove, "black");
    await click(t.page, "dd");
    await call(t.page, "play", "dd");
    const s = await state(t.page);
    assert.equal(s.board[3], "...X.....");
    assert.equal(s.toMove, "white");
  });

  test("one colour: the board takes clicks only on that colour's turn; the opponent's moves come by play", async () => {
    await mount(t.page, { ...game9, movable: "black", autoPlay: true });
    await click(t.page, "ee");
    await click(t.page, "dd"); // White's turn: ignored
    assert.deepEqual(await events(t.page), ["move ee"]);
    await call(t.page, "play", "cc"); // the opponent's move
    await click(t.page, "dd");
    assert.deepEqual(await events(t.page), ["move ee", "move dd"]);
    await call(t.page, "set", { movable: "none" });
    await call(t.page, "play", "gg");
    await click(t.page, "hh");
    await call(t.page, "pass");
    assert.equal((await events(t.page)).length, 2, "nobody may move");
  });

  test("confirm: a tap previews, confirm() reports it", async () => {
    // goban ignores a confirm within 50 ms of the tap as a double click; the page clock is moved on.
    await t.page.clock.install();
    await mount(t.page, { ...game9, movable: "both", autoPlay: true, confirm: true });
    await click(t.page, "ee");
    assert.equal(await call(t.page, "pending"), true);
    assert.deepEqual(await events(t.page), []);
    await t.page.clock.runFor(100);
    await call(t.page, "confirm");
    assert.deepEqual(await events(t.page), ["move ee"]);
    assert.equal(await call(t.page, "pending"), false);
    await call(t.page, "set", { confirm: false });
    await click(t.page, "dd");
    assert.deepEqual(await events(t.page), ["move ee", "move dd"]);
  });

  test("after a pass is reported the board takes nothing else until it is answered", async () => {
    await mount(t.page, { ...game9, movable: "black" });
    await call(t.page, "pass");
    await click(t.page, "ee");
    await call(t.page, "pass");
    assert.deepEqual(await events(t.page), ["move pass"]);
    await call(t.page, "cancel");
    await click(t.page, "ee");
    assert.deepEqual(await events(t.page), ["move pass", "move ee"]);
    await call(t.page, "play", "ee");
    await call(t.page, "play", "pass"); // White passes
    await call(t.page, "pass");
    assert.deepEqual(await events(t.page), ["move pass", "move ee", "move pass"]);
  });

  test("white only: clicks count on White's turn, after Black's move comes by play", async () => {
    await mount(t.page, { ...game9, movable: "white", autoPlay: true });
    await click(t.page, "ee");
    assert.deepEqual(await events(t.page), []);
    await call(t.page, "play", "ee");
    await click(t.page, "dd");
    assert.deepEqual(await events(t.page), ["move dd"]);
    assert.equal((await state(t.page)).board[3], "...O.....");
  });

  test("a move play can't place changes nothing, and the turn stays", async () => {
    await mount(t.page, { ...game9, movable: "white", moves: ["ee"] });
    await call(t.page, "play", "ee"); // occupied: goban logs it
    t.problems.errors.length = 0;
    await assert.rejects(call(t.page, "play", "zz"), /bad move zz/);
    assert.equal((await state(t.page)).toMove, "white");
    await click(t.page, "cc"); // still White's turn on this board
    assert.deepEqual(await events(t.page), ["move cc"]);
  });

  test("with a preview waiting, set keeps the turn and pass replaces the preview", async () => {
    await t.page.clock.install();
    await mount(t.page, { ...game9, movable: "both", autoPlay: true, confirm: true });
    await click(t.page, "ee");
    await call(t.page, "set", { movable: "both" }); // a page's redraw
    assert.equal(await call(t.page, "pending"), true, "the preview stays");
    await t.page.clock.runFor(100);
    await click(t.page, "dd");
    await t.page.clock.runFor(100);
    await call(t.page, "confirm");
    assert.deepEqual(await events(t.page), ["move dd"]);
    assert.equal((await state(t.page)).board[3], "...X.....");
    await click(t.page, "ee");
    assert.equal(await call(t.page, "pending"), true);
    await call(t.page, "pass");
    assert.deepEqual(await events(t.page), ["move dd", "move pass"]);
    assert.equal((await state(t.page)).board[4], ".........");
  });

  test("pass is reported like a move and hands the turn over", async () => {
    await mount(t.page, { ...game9, movable: "both", autoPlay: true });
    await call(t.page, "pass");
    assert.deepEqual(await events(t.page), ["move pass"]);
    assert.equal((await state(t.page)).toMove, "white");
  });

  test("handicap: the server's stones, White first, then the moves replayed", async () => {
    const stones = { black: ["gc", "cg"], white: [] };
    await mount(t.page, { ...game9, komi: 0.5, handicap: 2, stones, toMove: "white", movable: "both", autoPlay: true, moves: ["ee"] });
    let s = await state(t.page);
    const empty = ".........";
    assert.deepEqual(s.board, [empty, empty, "......X..", empty, "....O....", empty, "..X......", empty, empty]);
    assert.equal(s.toMove, "black");
    await click(t.page, "dd");
    s = await state(t.page);
    assert.equal(s.board[3], "...X.....");
    assert.equal(s.toMove, "white");
  });

  test("the board fills its box, 19×19 too, and follows it when it changes size", async () => {
    await mount(t.page, { size: 19, ruleset: "chinese", komi: 7.5, movable: "both", autoPlay: true });
    let svg = await t.page.locator("#board svg").first().boundingBox();
    assert.ok(svg.width <= 570 && svg.width > 570 - 21, `19×19 in 570 px: ${svg.width}`);
    await click(t.page, "pd", 19);
    assert.equal((await state(t.page)).board[3][15], "X");
    await t.page.evaluate(() => (document.getElementById("board").style.width = "300px"));
    // goban draws in a shadow root, which Playwright's locators see into and the page's querySelector doesn't.
    await t.page.waitForFunction(() => document.querySelector("#board > div").shadowRoot.querySelector("svg").getBoundingClientRect().width <= 300);
    svg = await t.page.locator("#board svg").first().boundingBox();
    assert.ok(svg.width <= 300 && svg.width > 300 - 21, `after resizing to 300 px: ${svg.width}`);
    await click(t.page, "dp", 19);
    assert.equal((await state(t.page)).board[15][3], "O");
  });

  test("destroy removes the board", async () => {
    await mount(t.page, { ...game9 });
    await call(t.page, "destroy");
    assert.equal(await t.page.locator("#board svg").count(), 0);
  });

  test("plain board and stones: no picture, nothing loaded from OGS or anywhere else", async () => {
    await mount(t.page, { ...game9, movable: "both", autoPlay: true });
    await click(t.page, "ee");
    const images = await t.page.evaluate(() =>
      [...document.querySelectorAll("#board *")].map((e) => getComputedStyle(e).backgroundImage).filter((b) => b !== "none"),
    );
    assert.deepEqual(images, []);
    assert.equal(await t.page.locator("#board image").count(), 0, "no image stones");
    assert.deepEqual(t.problems.requests, []);
  });
});

test("phone: taps play stones on a board as wide as the screen", async () => {
  const t = await open({ width: 390, context: devices["iPhone 13"] });
  try {
    await t.page.evaluate(() => harness.mount({ size: 9, ruleset: "japanese", komi: 6.5, movable: "both", autoPlay: true }));
    const svg = await t.page.locator("#board svg").first().boundingBox();
    assert.ok(svg.width <= 390 && svg.width > 390 - 11, `9×9 on a 390 px phone: ${svg.width}`);
    for (const move of ["ee", "de"]) {
      const p = await pointOf(t.page, move, 9);
      await t.page.touchscreen.tap(p.x, p.y);
    }
    assert.deepEqual(await events(t.page), ["move ee", "move de"]);
    assert.deepEqual(t.problems.errors, []);
  } finally {
    await t.close();
  }
});

test("phone, confirm on: a second tap on the preview takes it back (goban's way); confirm() plays", async () => {
  const t = await open({ width: 390, context: devices["iPhone 13"] });
  try {
    await t.page.clock.install();
    await t.page.evaluate(() => harness.mount({ size: 9, ruleset: "japanese", komi: 6.5, movable: "both", autoPlay: true, confirm: true }));
    const p = await pointOf(t.page, "ee", 9);
    await t.page.touchscreen.tap(p.x, p.y);
    assert.equal(await call(t.page, "pending"), true);
    await t.page.clock.runFor(300);
    await t.page.touchscreen.tap(p.x, p.y);
    assert.equal(await call(t.page, "pending"), false, "the second tap removed the preview");
    assert.deepEqual(await events(t.page), []);
    await t.page.touchscreen.tap(p.x, p.y);
    await t.page.clock.runFor(300);
    await call(t.page, "confirm");
    assert.deepEqual(await events(t.page), ["move ee"]);
  } finally {
    await t.close();
  }
});
