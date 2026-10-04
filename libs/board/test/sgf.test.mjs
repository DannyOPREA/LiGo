// The analysis tree's SGF (unit 7.2, ADR 0023): the root table shared with the server's reader
// (libs/conformance/sgf/root.json), the `sgf` skill's quirks, variations, comments and glyphs,
// refusals, and read → write → read round trips. The server's own SGF games are read back in
// parity.test.mjs.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createEngine, play, stateOf } from "../src/engine.mjs";
import { MAX_SGF_DEPTH, MAX_SGF_LENGTH, SgfError, decodeSgf, playFrom, readTree, rootSettings, writeTree } from "../src/sgf.mjs";

const table = JSON.parse(readFileSync(new URL("../../conformance/sgf/root.json", import.meta.url), "utf8"));

for (const c of table.cases) {
  test(`root table: ${c.id}`, () => {
    const props = Object.fromEntries(Object.entries(c.root).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
    if (c.refused) {
      assert.throws(() => rootSettings(props, c.firstMove), SgfError);
      return;
    }
    // `importRefused` is the server's alone: the analysis board opens those records.
    const { rulesetUnknown, ...expect } = c.expect;
    assert.deepEqual(rootSettings(props, c.firstMove), { ...expect, ...(rulesetUnknown ? { rulesetUnknown } : {}) });
  });
}

/** The main line's nodes, root first. */
const mainLine = (root) => {
  const line = [root];
  while (line.at(-1).children.length) line.push(line.at(-1).children[0]);
  return line;
};

// Records both readers replay (unit 7.3): the server's import reads the same main line or refuses the
// same file. `importRefused` is the server's alone.
const records = JSON.parse(readFileSync(new URL("../../conformance/sgf/records.json", import.meta.url), "utf8"));

for (const c of records.cases) {
  test(`records: ${c.id}`, () => {
    if (c.refused) {
      assert.throws(() => readTree(c.sgf), (e) => e instanceof SgfError && e.move === c.refused.move);
      return;
    }
    const line = mainLine(readTree(c.sgf));
    assert.deepEqual({ moves: line.slice(1).map((n) => n.move), toMove: line.at(-1).toMove }, c.expect);
  });
}


// The Phase 4 demo (unit 4.12): the SGFs lila wrote at the end of its two scripted games
// (lila's Phase4DemoTest) read back through goban-engine to the position lila ended on, with
// lila's counted result.
for (const game of ["game1", "game2"]) {
  test(`the Phase 4 demo's ${game} reads back to lila's final position`, () => {
    const demo = (ext) => new URL(`../../conformance/demo/phase-4/${game}.${ext}`, import.meta.url);
    const sgf = readFileSync(demo("sgf"), "utf8");
    const expect = JSON.parse(readFileSync(demo("expect.json"), "utf8"));
    const root = readTree(sgf);
    assert.equal(root.settings.size, 19);
    assert.equal(root.settings.komi, 6.5);
    const last = mainLine(root).at(-1);
    assert.deepEqual(last.stones, expect.stones);
    assert.deepEqual(last.captures, expect.captures);
    assert.equal(/RE\[([^\]]*)\]/.exec(sgf)?.[1], expect.result);
  });
}

const moves = (root) => mainLine(root).slice(1).map((n) => n.move);

test("a game's moves, passes, captures and the position after each", () => {
  // Black captures White's stone at bb (9×9), then both pass.
  const root = readTree("(;GM[1]FF[4]SZ[9]KM[6.5];B[ab];W[bb];B[ba];W[ee];B[cb];W[ff];B[bc];W[];B[])");
  assert.deepEqual(moves(root), ["ab", "bb", "ba", "ee", "cb", "ff", "bc", "..", ".."]);
  const capture = mainLine(root)[7];
  assert.equal(capture.id, "bc");
  assert.equal(capture.color, "black");
  assert.deepEqual(capture.captures, { black: 1, white: 0 });
  assert.ok(!capture.stones.white.includes("bb"), "the captured stone is gone");
  assert.equal(mainLine(root)[8].id, "..", "a pass's id is goban's '..'");
  assert.equal(mainLine(root).at(-1).toMove, "white");
});

test("the ply and the id of every node, and the root's settings", () => {
  const root = readTree("(;SZ[19]RU[Chinese]KM[7.5];B[pd];W[dp])");
  assert.deepEqual(
    mainLine(root).map((n) => [n.id, n.ply]),
    [
      ["", 0],
      ["pd", 1],
      ["dp", 2],
    ],
  );
  assert.deepEqual(root.settings, {
    size: 19,
    ruleset: "chinese",
    komi: 7.5,
    handicap: 0,
    black: [],
    white: [],
    toMove: "black",
  });
});

test("variations, comments, glyphs and other properties are kept", () => {
  const root = readTree(
    "(;SZ[9]PB[Shusaku]C[Root note];B[ee]C[Centre]TE[1];W[cc](;B[gg]BM[2]TR[ff])(;B[gc]IT[];W[gg]DO[]))",
  );
  assert.deepEqual(root.comments, [{ id: "sgf", by: "sgf", text: "Root note" }]);
  assert.deepEqual(root.sgf, { PB: ["Shusaku"] });
  const [centre] = root.children;
  assert.deepEqual(centre.comments.map((c) => c.text), ["Centre"]);
  assert.deepEqual(centre.glyphs.map((g) => g.symbol), ["!"]);
  const [gg, gc] = centre.children[0].children;
  assert.deepEqual([gg.id, gc.id], ["gg", "gc"], "variations keep their order");
  assert.deepEqual(gg.glyphs.map((g) => g.symbol), ["??"]);
  assert.deepEqual(gg.sgf, { TR: ["ff"] });
  assert.deepEqual(gc.glyphs.map((g) => g.symbol), ["!?"]);
  assert.deepEqual(gc.children[0].glyphs.map((g) => g.symbol), ["?!"]);
});

test("setup stones, handicap and the player to move", () => {
  const root = readTree("(;SZ[19]HA[2]KM[0.5]AB[dp][pd];W[qp];B[dd])");
  assert.deepEqual(root.stones.black.sort(), ["dp", "pd"]);
  assert.equal(root.toMove, "white");
  assert.equal(root.settings.handicap, 2);
  const nine = readTree("(;SZ[9]AB[aa:bb]AW[ee]PL[W];W[cc])");
  assert.deepEqual(nine.stones.black.sort(), ["aa", "ab", "ba", "bb"], "a rectangle of points");
  assert.deepEqual(nine.stones.white, ["ee"]);
});

test("the sgf skill's quirks", () => {
  // Old long property names and a missing SZ (19×19).
  const old = readTree("(;AddBlack[dd]GaMe[1];W[pp])");
  assert.equal(old.settings.size, 19);
  assert.deepEqual(old.stones.black, ["dd"]);
  // `tt` is a pass on 19×19 only; `[]` is the current pass.
  assert.deepEqual(moves(readTree("(;SZ[19];B[tt];W[])")), ["..", ".."]);
  assert.throws(() => readTree("(;SZ[9];B[tt])"), /off the board/);
  // A name with no capital (pre-FF[3]) is refused, not silently dropped as @sabaki/sgf would.
  assert.throws(() => readTree("(;sz[9];b[ee])"), /sz has no capital letters/);
  // Escaped brackets and backslashes in comments.
  const escaped = readTree("(;SZ[9]C[a \\] b \\\\ c];B[ee])");
  assert.equal(escaped.comments[0].text, "a ] b \\ c");
  // Empty variations are ignored; a collection gives its first game.
  assert.deepEqual(moves(readTree("(;SZ[9]()(;B[ee]))")), ["ee"]);
  assert.equal(readTree("(;SZ[9];B[ee])(;SZ[19];B[pd])").settings.size, 9);
  // A node without a move gives its notes to the move before it.
  const noted = readTree("(;SZ[9];B[ee];C[a note]TR[aa];W[cc])");
  assert.deepEqual(moves(noted), ["ee", "cc"]);
  assert.deepEqual(noted.children[0].comments.map((c) => c.text), ["a note"]);
  assert.deepEqual(noted.children[0].sgf, { TR: ["aa"] });
  // The same move twice from one position is one node.
  const twins = readTree("(;SZ[9](;B[ee]C[one];W[cc])(;B[ee]C[two];W[gg]))");
  assert.equal(twins.children.length, 1);
  assert.deepEqual(twins.children[0].comments.map((c) => c.text), ["one\n\ntwo"], "one comment per node");
  assert.deepEqual(twins.children[0].children.map((c) => c.id), ["cc", "gg"]);
});

test("records that can't be read are refused with a reason", () => {
  const refused = (text, pattern) => assert.throws(() => readTree(text), (e) => e instanceof SgfError && pattern.test(e.message));
  refused("hello", /not an SGF record/);
  // A truncated file (goban's reader hangs on it).
  refused("(;SZ[9];B[ee];W[dd", /not a readable SGF record/);
  refused("(;SZ[9];B[ee];B[dd])", /^move 2: B\[dd\] is not a move by white/);
  refused("(;SZ[9];B[ee];W[ee])", /^move 2: W\[ee\] is not a legal move \(occupied\)/);
  refused("(;SZ[9];B[jj])", /^move 1: B\[jj\] is off the board/);
  refused("(;SZ[9];B[ee];AB[aa])", /^move 2: setup stones after the first move/);
  refused("(;SZ[9];B[ee]W[dd])", /plays both colours/);
  refused("(;SZ[7];B[aa])", /board size/);
  refused("(;GM[3];B[aa])", /not a game of Go/);
  refused("(;SZ[9]" + "(;B[aa]".repeat(20000) + ")".repeat(20000) + ")", /nested too deeply/);
  // Both readers stop at the same depth (the server's SgfReader.maxDepth).
  const nested = (depth) => "(;SZ[19]" + "(;C[x]".repeat(depth - 1) + ")".repeat(depth);
  assert.equal(readTree(nested(MAX_SGF_DEPTH)).ply, 0);
  refused(nested(MAX_SGF_DEPTH + 1), /nested too deeply/);
  refused("(;SZ[9]C[" + "x".repeat(MAX_SGF_LENGTH) + "])", /longer than 200 KB/);
  // Ko: Black takes at fe (move 9), White may not take back at ee at once (move 10).
  refused("(;SZ[9];B[de];W[ge];B[ed];W[fd];B[ef];W[ff];B[aa];W[ee];B[fe];W[ee])", /^move 10: W\[ee\] is not a legal move/);
});

test("moves or erasures in the first node are refused, not dropped", () => {
  assert.throws(() => readTree("(;SZ[9]B[ee];W[cc])"), /first node plays a move/);
  assert.throws(() => readTree("(;SZ[9]AB[ee]AE[ee];W[cc])"), /AE \(erase\) in the first node/);
});

test("merged notes are written so they read back the same", () => {
  const texts = [
    "(;SZ[9];B[ee];C[a];C[b];W[cc])",
    "(;SZ[9];B[ee]N[first];N[second];W[cc])",
    "(;SZ[9](;B[ee]TR[aa])(;B[ee]TR[aa][bb]))",
    "(;SZ[19]HA[1]KM[0.5];B[pd])",
  ];
  for (const text of texts) {
    const tree = readTree(text);
    const written = writeTree(tree);
    assert.deepEqual(readTree(written), tree, written);
  }
  assert.match(writeTree(readTree(texts[1])), /N\[first\]/);
  assert.doesNotMatch(writeTree(readTree(texts[1])), /N\[first\]\[/, "one value for a one-value property");
  assert.match(writeTree(readTree(texts[2])), /TR\[aa\]\[bb\]/);
  assert.match(writeTree(readTree(texts[3])), /HA\[1\]/);
});

test("the limits hold on the largest records, quickly", () => {
  const within = (text, pattern) => {
    const started = performance.now();
    assert.throws(() => readTree(text), pattern);
    assert.ok(performance.now() - started < 3000, `took ${Math.round(performance.now() - started)} ms`);
  };
  const fill = (unit) => unit.repeat(Math.floor((MAX_SGF_LENGTH - 20) / unit.length));
  within("(;SZ[9]" + fill(";N[x]") + ")", /more than 10000 nodes/);
  within("(;SZ[19]" + fill("(;B[aa])") + ")", /more than 10000 nodes/);
  // Setup rectangles: a Set, not a list search (a full board has no liberties, so it's refused).
  within("(;SZ[19]AB" + "[aa:ss]".repeat(20000) + ")", /has no liberties/);
  // The limit counts bytes: 70,000 three-byte characters are over 200 KB.
  within("(;SZ[9]C[" + "囲".repeat(70000) + "])", /longer than 200 KB/);
});

test("reading what was written gives the same tree (round trip)", () => {
  const records = [
    "(;GM[1]FF[4]SZ[9]KM[7]PB[Honinbo]C[start];B[ee]C[center]TE[1];W[cc](;B[gg]BM[2])(;B[gc];W[]IT[]))",
    "(;SZ[19]HA[4]KM[0.5]AB[dd][dp][pd][pp];W[qf];B[nc](;W[rd];B[qc])(;W[pj]DO[]))",
    "(;SZ[13]RU[Chinese]KM[7.5]AB[cc]AW[kk]PL[W]C[A note with \\] and \\\\.];W[gg];B[];W[])",
  ];
  for (const text of records) {
    const tree = readTree(text);
    const written = writeTree(tree);
    assert.deepEqual(readTree(written), tree, written);
    assert.equal(writeTree(readTree(written)), written, "writing is stable");
  }
});

test("a written record keeps the game's settings", () => {
  const written = writeTree(readTree("(;SZ[9]RU[AGA]KM[7.5];B[ee])"));
  assert.match(written, /GM\[1\]FF\[4\]CA\[UTF-8\]SZ\[9\]RU\[Chinese\]KM\[7.5\]/);
  assert.doesNotMatch(written, /\[tt\]/);
});

test("playFrom adds a move to a line, or says why it can't", () => {
  const root = readTree("(;SZ[9];B[ee];W[cc])");
  const line = mainLine(root);
  const { node } = playFrom(line, "gg");
  assert.equal(node.id, "gg");
  assert.equal(node.color, "black");
  assert.equal(node.ply, 3);
  assert.deepEqual(playFrom(line, "ee"), { refused: "occupied" });
  assert.equal(playFrom(line, "pass").node.id, "..");
  // The same position as goban playing the moves itself.
  const engine = createEngine({ size: 9, ruleset: "japanese", komi: 0 });
  for (const m of ["ee", "cc", "gg"]) play(engine, m);
  assert.equal(stateOf(engine).toMove, node.toMove);
});

test("decodeSgf reads UTF-8, Latin-1 by CA, and drops a byte-order mark", () => {
  const utf8 = new TextEncoder().encode("﻿(;SZ[9]PB[Go Seigen 呉清源])");
  assert.equal(decodeSgf(utf8), "(;SZ[9]PB[Go Seigen 呉清源])");
  const bytes = (s) => [...s].map((c) => c.charCodeAt(0));
  const latin1 = Uint8Array.from([...bytes("(;CA[ISO-8859-1]PB[Jos"), 0xe9, ...bytes("])")]);
  assert.equal(decodeSgf(latin1), "(;CA[ISO-8859-1]PB[José])");
  const unknown = new TextEncoder().encode("(;CA[no-such-charset]PB[x])");
  assert.equal(decodeSgf(unknown), "(;CA[no-such-charset]PB[x])");
});

test("the reader bundles for the browser without Node's modules (the @sabaki/sgf patch)", async () => {
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [new URL("../src/sgf.mjs", import.meta.url).pathname],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  // The patch's `browser` field turns Node's file system and the charset detectors into empty modules.
  for (const module of ["fs", "iconv-lite", "jschardet"])
    assert.match(code, new RegExp(`// \\(disabled\\):[^\\n]*${module}`), `${module} left out`);
});
