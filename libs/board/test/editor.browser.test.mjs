// The position editor (src/editor.ts, unit 7.4) in a real browser: goban's setup placement,
// bundled by esbuild as lila bundles it, clicked in Chromium by Playwright. A tap places the chosen
// colour, replaces the other colour's stone and takes away its own; nothing is captured; the board
// starts from the stones it is given; nothing is loaded from OGS's servers.
// Chromium: $LIGO_CHROMIUM, else the cloud sessions' /opt/pw-browsers/chromium, else Playwright's own.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, afterEach, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
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

async function open(context = {}) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, ...context });
  const page = await ctx.newPage();
  const problems = { requests: [], errors: [] };
  page.on("request", (r) => problems.requests.push(r.url()));
  page.on("pageerror", (e) => problems.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && problems.errors.push(m.text()));
  await page.setContent(`<!doctype html><body style="margin:0"><div id="board" style="width:400px"></div></body>`);
  problems.requests.length = 0;
  await page.addScriptTag({ content: script });
  return { page, problems, close: () => ctx.close() };
}

const mount = (page, config) => page.evaluate((c) => window.harness.mountEditor(c), config);
const stones = (page) => page.evaluate(() => window.harness.editor.stones());
const edits = (page) => page.evaluate(() => window.harness.edits);
const setColor = (page, color) => page.evaluate((c) => window.harness.editor.setColor(c), color);

/** Clicks (or taps) an SGF point; goban leaves a square-wide coordinate band on each side. */
async function click(page, move, size, { tap = false, coordinates = true } = {}) {
  const svg = await page.locator("#board svg").first().boundingBox();
  const band = coordinates ? 1 : 0;
  const square = svg.width / (size + 2 * band);
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  const [px, py] = [svg.x + (x + band + 0.5) * square, svg.y + (y + band + 0.5) * square];
  if (tap) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

describe("position editor in Chromium", () => {
  let t;
  before(async () => {
    t = await open();
  });
  afterEach(() => {
    assert.deepEqual(t.problems.errors, [], "no errors on the page");
    assert.deepEqual(t.problems.requests, [], "nothing loaded");
  });
  after(() => t?.close());

  test("a tap places the chosen colour and reports the stones", async () => {
    await mount(t.page, { size: 9 });
    assert.deepEqual(await stones(t.page), { black: [], white: [] });
    await click(t.page, "cc", 9);
    await setColor(t.page, "white");
    await click(t.page, "gg", 9);
    assert.deepEqual(await stones(t.page), { black: ["cc"], white: ["gg"] });
    assert.equal((await edits(t.page)).at(-1), "black:cc white:gg");
  });

  test("a tap on a stone of the chosen colour takes it away; on the other colour's, replaces it", async () => {
    await mount(t.page, { size: 9, stones: { black: ["cc", "dd"], white: ["ee"] } });
    await click(t.page, "cc", 9); // black on black: taken away
    await click(t.page, "ee", 9); // black on white: replaced
    assert.deepEqual(await stones(t.page), { black: ["dd", "ee"], white: [] });
  });

  test("nothing is captured: a stone without liberties stays", async () => {
    await mount(t.page, { size: 9, stones: { black: ["ba", "ab"], white: [] } });
    await setColor(t.page, "white");
    await click(t.page, "aa", 9);
    assert.deepEqual(await stones(t.page), { black: ["ba", "ab"], white: ["aa"] });
  });

  test("19×19 without coordinates, tapped on a touch screen", async () => {
    const touch = await open({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    try {
      await mount(touch.page, { size: 19, coordinates: false, color: "white" });
      await click(touch.page, "pd", 19, { tap: true, coordinates: false });
      await click(touch.page, "dp", 19, { tap: true, coordinates: false });
      assert.deepEqual(await stones(touch.page), { black: [], white: ["pd", "dp"] });
      assert.deepEqual(touch.problems.errors, []);
      assert.deepEqual(touch.problems.requests, []);
    } finally {
      await touch.close();
    }
  });

  test("13×13 starts from the stones given, in board order", async () => {
    await mount(t.page, { size: 13, stones: { black: ["jj", "dd"], white: ["dj"] } });
    assert.deepEqual(await stones(t.page), { black: ["dd", "jj"], white: ["dj"] });
  });

  test("a destroyed editor leaves nothing behind and reports nothing", async () => {
    await mount(t.page, { size: 9 });
    await t.page.evaluate(() => window.harness.editor.destroy());
    assert.equal(await t.page.locator("#board").innerHTML(), "");
  });
});
