// Tests for LiGo's goban-engine settings (src/engine.mjs) that the fixtures don't reach.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { test } from "node:test";

import gobanEngine from "goban-engine";

import { createEngine, play, readSgf, stateOf, tryMove } from "../src/engine.mjs";
import { handicapStones, stonesOf } from "./fixtures.mjs";

const { GobanEngine } = gobanEngine;

const nine = (extra = {}) => createEngine({ size: 9, ruleset: "japanese", komi: 6.5, ...extra });

test("refuses board sizes LiGo doesn't play and a missing komi", () => {
  assert.throws(() => createEngine({ size: 7, ruleset: "japanese", komi: 6.5 }), /board size 7/);
  assert.throws(() => createEngine({ size: 9, ruleset: "aga", komi: 6.5 }), /ruleset aga/);
  assert.throws(() => createEngine({ size: 9, ruleset: "chinese" }), /komi must be given/);
});

test("keeps the komi it is given, even where goban's preset would change it", () => {
  // goban cuts komi to 0.5 by itself in a handicap game when none is given (spec §9, "Komi").
  const e = createEngine({ size: 19, ruleset: "chinese", komi: 3, handicap: 2, stones: { black: ["pd", "dp"], white: [] }, toMove: "white" });
  assert.equal(e.komi, 3);
  assert.equal(e.handicap, 2);
});

test("a handicap game starts with exactly the server's stones and White to move", () => {
  // Points off goban's own table, so its fixed placement (or its Chinese preset's free placement)
  // would show up as extra stones or a Black move.
  for (const ruleset of ["japanese", "chinese"]) {
    const e = createEngine({ size: 9, ruleset, komi: 0.5, handicap: 2, stones: { black: ["aa", "bb"], white: [] }, toMove: "white" });
    assert.deepEqual(stonesOf(stateOf(e).board), { black: ["aa", "bb"], white: [] }, ruleset);
    assert.equal(e.colorToMove(), "white");
    assert.equal(play(e, "ee"), null);
    assert.equal(e.colorToMove(), "black");
  }
});

test("goban's own fixed handicap placement agrees with R-HCP-4", () => {
  // Not used in games (the server's stones are passed in), but a check that the table the tests
  // stand in with is the one both engines use (spec §9).
  for (const size of [9, 19])
    for (let n = 2; n <= 9; n++) {
      const e = new GobanEngine({ width: size, height: size, rules: "japanese", handicap: n });
      const placed = stonesOf(stateOf(e).board).black.sort();
      assert.deepEqual(placed, [...handicapStones(size, n)].sort(), `${size}x${size}, ${n} stones`);
    }
});

test("names the reason a move is refused and leaves the position as it was", () => {
  const e = nine();
  for (const m of ["ba", "ee", "ab", "ff"]) assert.equal(play(e, m), null); // B ba, W ee, B ab, W ff
  const before = stateOf(e);
  assert.equal(tryMove(e, "ee"), "occupied");
  assert.equal(play(e, "pass"), null); // B passes
  assert.equal(tryMove(e, "aa"), "suicide"); // W into the corner Black surrounds
  assert.notDeepEqual(stateOf(e), before);
  assert.throws(() => play(e, "zz"), /bad move zz/);
  assert.throws(() => play(e, "jj"), /off the board/);
});

test("a retake at once is refused as superko and the ko point is shown", () => {
  // White's stone at bb is taken by Black at cb, a lone stone with one liberty (R-KO-4).
  const e = nine();
  for (const m of ["ba", "ca", "ab", "db", "bc", "cc", "ii", "bb", "cb"]) assert.equal(play(e, m), null, m);
  assert.deepEqual(stateOf(e).captures, { black: 1, white: 0 });
  assert.equal(stateOf(e).koPoint, "bb");
  assert.equal(tryMove(e, "bb"), "superko");
  // After a stone elsewhere the ko point is gone and, once Black has moved too, the retake is legal.
  assert.equal(play(e, "hh"), null);
  assert.equal(stateOf(e).koPoint, null);
  assert.equal(play(e, "gg"), null);
  assert.equal(tryMove(e, "bb"), null);
});

test("reads an SGF record's size, komi, ruleset, handicap and player to move", () => {
  const e = readSgf("(;GM[1]FF[4]SZ[9]RU[Chinese]KM[0.5]HA[2]AB[gc][cg]PL[W])");
  assert.equal(e.width, 9);
  assert.equal(e.komi, 0.5);
  assert.equal(e.rules, "chinese");
  assert.equal(e.handicap, 2);
  assert.equal(e.colorToMove(), "white");
  assert.deepEqual(stonesOf(stateOf(e).board), { black: ["gc", "cg"], white: [] });

  const played = readSgf("(;GM[1]FF[4]SZ[13]RU[Japanese]KM[6.5]\n;B[gg]\n;W[]\n;B[dd])");
  assert.equal(played.width, 13);
  assert.equal(played.colorToMove(), "white");
  assert.deepEqual(stonesOf(stateOf(played).board), { black: ["dd", "gg"], white: [] });
  // Play goes on from the end of the record, with the moves' history.
  assert.equal(play(played, "dd"), "occupied");
  assert.equal(play(played, "jj"), null);
});

test("refuses an SGF record with a move out of turn or a size or ruleset LiGo doesn't play", () => {
  assert.throws(() => readSgf("(;GM[1]FF[4]SZ[9]KM[6.5];B[ee];B[cc])"), /not a move by the player to move/);
  assert.throws(() => readSgf("(;GM[1]FF[4]SZ[7]KM[6.5])"), /board size 7/);
  assert.throws(() => readSgf("(;GM[1]FF[4]SZ[19]KM[7.5]RU[AGA];B[dd])"), /ruleset AGA/);
  assert.throws(() => readSgf("no record"), /not an SGF record/);
});

test("refuses a broken SGF record instead of keeping what goban could read", () => {
  // goban's reader only logs these and returns a partial game.
  assert.throws(() => readSgf("(;SZ[9]KM[6.5];B[ee];W[cc];B["), /not a readable SGF record/);
  assert.throws(() => readSgf("(;SZ[9]KM[6.5]C[a]b];B[ee])"), /not a readable SGF record/);
  assert.equal(console.log.name, "log", "console.log is restored");
});

test("trying moves leaves no trace in the game record", () => {
  const e = nine();
  assert.equal(play(e, "ee"), null);
  for (const m of ["aa", "bb", "ee"]) tryMove(e, m);
  assert.equal(play(e, "cc"), null);
  assert.equal(tryMove(e, "dd"), null);
  assert.equal(e.move_tree.toSGF().replace(/\s/g, ""), ";B[ee];W[cc]");
});
