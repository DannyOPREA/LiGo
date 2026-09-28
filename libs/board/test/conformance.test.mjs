// Replays every conformance fixture that applies to the client (libs/conformance/README.md,
// "Engine harnesses") in goban-engine, set up by src/engine.mjs: plays the moves (each must be
// accepted), then checks each `expect` field except `phase` (goban-engine has no scoring phase).
// A case without a ruleset runs under both. A case with a `knownGaps.client` entry must fail:
// when it starts passing, this test says so, so the entry can go.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { test } from "node:test";

import { stateOf, tryMove } from "../src/engine.mjs";
import { dir, engineFor, forClient, playMoves, rulesetsOf } from "./fixtures.mjs";

const cases = forClient();

test("finds the client's fixtures", () => {
  assert.ok(cases.length >= 95, `only ${cases.length} client cases in ${dir}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});

for (const c of cases) {
  for (const ruleset of rulesetsOf(c)) {
    test(`${c.id} (${ruleset}): ${c.title}`, () => {
      const gap = c.knownGaps?.client;
      if (!gap) return check(c, ruleset);
      assert.throws(
        () => check(c, ruleset),
        assert.AssertionError,
        `known gap no longer reproduces, remove knownGaps.client from ${c.id}: ${gap}`,
      );
    });
  }
}

/** Plays the case and checks its expectations; throws an AssertionError on the first difference. */
export function check(c, ruleset) {
  const engine = engineFor(c, ruleset);
  try {
    playMoves(engine, c);
  } catch (e) {
    assert.fail(e.message);
  }
  const e = c.expect ?? {};
  const s = stateOf(engine);
  if (e.board) assert.equal(s.board.join("\n"), e.board.join("\n"), "board");
  if (e.toMove) assert.equal(s.toMove, e.toMove, "toMove");
  if (e.captures) assert.deepEqual(s.captures, e.captures, "captures");
  if ("koPoint" in e) assert.equal(s.koPoint, e.koPoint, "koPoint");
  for (const m of e.legal ?? []) assert.equal(tryMove(engine, m), null, `${m} should be legal`);
  for (const { move, reason } of e.illegal ?? []) assert.equal(tryMove(engine, move), reason, `${move} should be refused`);
  // Probing moves must leave the position as it was.
  assert.deepEqual(stateOf(engine), s, "the position after trying the expect moves");
}
