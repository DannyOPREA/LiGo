// Tests for check.mjs: a valid case passes, and each kind of mistake is caught.
// Run: node --test libs/conformance/check.test.mjs
// Licence: MIT (LiGo's own code, ADR 0006).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFile, checkDir } from "./check.mjs";

const empty = Array(9).fill(".........");
const withRow = (rows, i, row) => rows.map((r, j) => (j === i ? row : r));

const validCase = () => ({
  id: "t-capture-corner",
  title: "Black captures a white stone in the corner",
  rules: ["R-MOVE-4"],
  from: "new",
  appliesTo: ["server", "client"],
  size: 9,
  setup: { board: withRow(withRow(empty, 0, "OX......."), 1, "........."), toMove: "black" },
  moves: ["ab"],
  expect: {
    board: withRow(withRow(empty, 0, ".X......."), 1, "X........"),
    toMove: "white",
    captures: { black: 1, white: 0 },
    koPoint: null,
    illegal: [{ move: "ba", reason: "occupied" }],
    legal: ["aa", "pass"],
  },
});
const file = (...cases) => ({
  format: 1,
  idPrefix: "t-",
  source: { name: "test", url: "https://example.org", commit: "abc", license: "MIT" },
  cases,
});
const problems = (c) => checkFile(file(c), "t.json");
const expectProblem = (c, pattern) => {
  const errs = problems(c);
  assert.ok(errs.some((e) => pattern.test(e)), `expected a problem matching ${pattern}, got: ${JSON.stringify(errs)}`);
};

test("accepts a well-formed case", () => {
  assert.deepEqual(problems(validCase()), []);
});

test("accepts a scoring case", () => {
  const c = { ...validCase(), appliesTo: ["scoring"], ruleset: "japanese", komi: 6.5,
    score: { dead: [], black: 10, white: 6.5, result: "B+3.5" } };
  assert.deepEqual(problems(c), []);
});

test("rejects unknown fields, so typos don't pass silently", () => {
  expectProblem({ ...validCase(), expcet: {} }, /unknown field "expcet"/);
  expectProblem({ ...validCase(), expect: { ...validCase().expect, kopoint: null } }, /unknown field "kopoint"/);
});

test("rejects missing required fields", () => {
  const c = validCase();
  delete c.rules;
  expectProblem(c, /missing "rules"/);
});

test("rejects an id without the file's prefix", () => {
  expectProblem({ ...validCase(), id: "capture" }, /start with "t-"/);
});

test("rejects board sizes the engines don't share", () => {
  expectProblem({ ...validCase(), size: 7 }, /size must be one of 9, 13, 19/);
});

test("rejects points off the board", () => {
  expectProblem({ ...validCase(), moves: ["jj"] }, /moves\[0\] "jj"/);
  expectProblem({ ...validCase(), moves: ["D4"] }, /moves\[0\] "D4"/);
});

test("rejects a diagram of the wrong shape", () => {
  expectProblem({ ...validCase(), setup: { board: empty.slice(1), toMove: "black" } }, /setup.board: must be 9 rows/);
  expectProblem({ ...validCase(), setup: { board: withRow(empty, 2, "....x...."), toMove: "black" } }, /row 3/);
});

test("rejects a chain with no liberties in a diagram", () => {
  const board = withRow(withRow(empty, 0, "OX......."), 1, "X........");
  expectProblem({ ...validCase(), setup: { board, toMove: "black" } }, /white chain at aa has no liberties/);
});

test("rejects an unknown illegal-move reason", () => {
  const c = validCase();
  c.expect.illegal = [{ move: "ba", reason: "ko" }];
  expectProblem(c, /reason for "ba" must be one of/);
});

test("rejects a move listed as both legal and illegal", () => {
  const c = validCase();
  c.expect.legal = ["ba"];
  expectProblem(c, /more than once/);
});

test("rejects resume and undo outside server-only cases", () => {
  expectProblem({ ...validCase(), moves: ["pass", "pass", "resume"] }, /server-only/);
  assert.deepEqual(problems({ ...validCase(), appliesTo: ["server"], moves: ["ab", "undo"], expect: { toMove: "black" } }), []);
});

test("rejects server-only expectations in client cases", () => {
  expectProblem({ ...validCase(), expect: { illegal: [{ move: "ee", reason: "in-scoring" }] } }, /reason in-scoring/);
  assert.deepEqual(problems({ ...validCase(), appliesTo: ["server"], expect: { illegal: [{ move: "ee", reason: "in-scoring" }] } }), []);
});

test("rejects a pass refused for a stone-only reason", () => {
  expectProblem({ ...validCase(), expect: { illegal: [{ move: "pass", reason: "superko" }] } }, /R-KO-3/);
});

test("rejects a from that is neither path:line nor new", () => {
  expectProblem({ ...validCase(), from: "somewhere" }, /from must be/);
  assert.deepEqual(problems({ ...validCase(), from: "src/test/A.scala:12" }), []);
});

test("rejects a known gap for the server", () => {
  expectProblem({ ...validCase(), knownGaps: { server: "no" } }, /referee/);
  expectProblem({ ...validCase(), knownGaps: { scoring: "no" } }, /only the client/);
  expectProblem({ ...validCase(), appliesTo: ["server"], knownGaps: { client: "no" } }, /does not apply to/);
});

test("rejects a score whose result doesn't match its totals", () => {
  const c = { ...validCase(), appliesTo: ["scoring"], ruleset: "chinese", komi: 7,
    score: { dead: [], black: 40, white: 41, result: "B+1" } };
  expectProblem(c, /totals give W\+1/);
});

test("accepts jigo written as 0", () => {
  const c = { ...validCase(), appliesTo: ["scoring"], ruleset: "chinese", komi: 7,
    score: { dead: [], black: 41, white: 41, result: "0" } };
  assert.deepEqual(problems(c), []);
});

test("rejects a score without ruleset or komi", () => {
  const c = { ...validCase(), appliesTo: ["scoring"], score: { dead: [], black: 1, white: 0, result: "B+1" } };
  expectProblem(c, /needs a ruleset/);
  expectProblem(c, /needs komi/);
});

test("rejects open points outside spec §12", () => {
  expectProblem({ ...validCase(), openPoints: [12] }, /openPoints/);
});

test("the command line checks the folder it is given, and fails on an empty one", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "conformance-"));
  const run = (...a) => { try { execFileSync("node", [new URL("./check.mjs", import.meta.url).pathname, ...a], { stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
  assert.equal(run(dir), 1, "an empty folder must fail");
  writeFileSync(join(dir, "x.json"), "{ broken");
  assert.equal(run(dir), 1, "a broken file in the given folder must fail");
  writeFileSync(join(dir, "x.json"), JSON.stringify(file(validCase())));
  assert.equal(run("--spec", "/nonexistent", dir), 0);
});

test("checkDir catches duplicate ids across files and rule IDs missing from the spec", () => {
  const dir = mkdtempSync(join(tmpdir(), "conformance-"));
  writeFileSync(join(dir, "a.json"), JSON.stringify(file(validCase())));
  writeFileSync(join(dir, "b.json"), JSON.stringify({ ...file(validCase()), idPrefix: "t-" }));
  writeFileSync(join(dir, "c.json"), "{ not json");
  const { errors, files, cases } = checkDir(dir, new Set(["R-KO-1"]));
  assert.equal(files, 3);
  assert.equal(cases.length, 2);
  assert.ok(errors.some((e) => /id also used in a.json/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /idPrefix "t-" is also used/.test(e)));
  assert.ok(errors.some((e) => /c.json: not valid JSON/.test(e)));
  assert.ok(errors.some((e) => /rule R-MOVE-4 is not in docs\/rules\/spec.md/.test(e)));
});
