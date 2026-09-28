// The parity check (PLAN §6): replays in goban-engine what the server's engine did, from the file
// libs/go-rules writes (ParityExportTest: `dev/ligo test rules`), and fails on any difference.
// - Fixtures: every server fixture's game, as the SGF the server writes, read back by goban-engine
//   (src/engine.mjs readSgf) ends in the server's position (the SGF round trip); a client case also
//   ends there when the client plays its moves itself.
// - Random games: after every action the same stones, player to move, captures and ko point; at the
//   probed plies the same refusal, with the same reason, for every empty point.
// No difference is allowed. Spec §9's known client gaps (goban's superko looks back only 30 moves
// and never at the starting position) are the fixtures' `knownGaps`; the seeded random games here
// don't reach them. If a change of seeds or engines ever does, the failing action shows it.
// Licence: MIT (LiGo's own code, ADR 0006).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createEngine, play, readSgf, stateOf, tryMove } from "../src/engine.mjs";
import { all, dir, engineFor, playMoves, stonesOf } from "./fixtures.mjs";

const file =
  process.env.LIGO_PARITY_FILE ?? fileURLToPath(new URL("../../go-rules/target/parity/server.json", import.meta.url));

if (!existsSync(file)) {
  test("parity data from the server", () => assert.fail(`${file} not found: run \`dev/ligo test rules\` first`));
} else {
  const server = JSON.parse(readFileSync(file, "utf8"));
  const fixtures = new Map(all().map((c) => [c.id, c]));

  test("the server wrote the data this check expects", () => {
    assert.equal(server.format, 1);
    // Data written before a fixture change would compare against old cases: rerun the server side.
    const sha = createHash("sha256");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) sha.update(readFileSync(dir + f));
    assert.equal(server.fixtures, sha.digest("hex"), `${file} is stale: run \`dev/ligo test rules\``);
    assert.ok(server.sgf.length >= 227, `only ${server.sgf.length} SGF cases`);
    assert.ok(server.games.length >= 80, `only ${server.games.length} random games`);
  });

  for (const { id, ruleset, komi, sgf, end } of server.sgf) {
    test(`SGF read-back: ${id} (${ruleset})`, () => {
      const engine = readSgf(sgf);
      assert.equal(engine.rules, ruleset, "ruleset");
      assert.equal(engine.komi, komi, "komi");
      const s = stateOf(engine);
      assert.equal(s.board.join("\n"), end.board.join("\n"), "board");
      assert.equal(s.toMove, end.toMove, "toMove");
      assert.deepEqual(s.captures, end.captures, "captures");
      assert.equal(s.koPoint, end.koPoint ?? null, "koPoint");
      // For the cases the client plays, the history read from the SGF must give the same legal and
      // illegal moves as playing the game did (the superko history survives the round trip).
      const c = fixtures.get(id);
      if (c.appliesTo.includes("client")) {
        // The same case played move by move on the client ends where the server's did too, whether
        // or not the case's own expectations cover every field.
        assert.deepEqual(stateOf(playMoves(engineFor(c, ruleset), c)), { ...s }, "client replay vs SGF read-back");
      }
      if (c.appliesTo.includes("client") && !c.knownGaps?.client) {
        for (const m of c.expect?.legal ?? []) assert.equal(tryMove(engine, m), null, `${m} should be legal`);
        for (const { move, reason } of c.expect?.illegal ?? [])
          assert.equal(tryMove(engine, move), reason, `${move} should be refused`);
      }
    });
  }

  for (const g of server.games) {
    test(`random game: ${g.size}x${g.size} ${g.ruleset}, handicap ${g.handicap}, seed ${g.seed}`, () => {
      // Set up as a real game would be: the server's starting stones, komi and first player.
      const engine = createEngine({
        size: g.size,
        ruleset: g.ruleset,
        komi: g.komi,
        handicap: g.handicap,
        stones: stonesOf(g.start.board),
        toMove: g.start.toMove,
      });
      assert.deepEqual(stateOf(engine).board, g.start.board, "starting stones");
      assert.equal(engine.colorToMove(), g.start.toMove, "first to move");
      g.steps.forEach((step, i) => {
        const at = `seed ${g.seed}, action ${i + 1} (${step.move})`;
        // goban-engine has no scoring phase: after two passes play simply goes on, which is what the
        // server's resume does (the opponent of the second passer moves, R-SP-6).
        if (step.move === "resume") return;
        assert.equal(play(engine, step.move), null, `${at}: refused by the client`);
        const s = stateOf(engine);
        assert.equal(s.board.join("\n"), step.board.join("\n"), `${at}: board`);
        assert.equal(s.toMove, step.toMove, `${at}: toMove`);
        assert.deepEqual(s.captures, step.captures, `${at}: captures`);
        assert.equal(s.koPoint, step.koPoint ?? null, `${at}: koPoint`);
        if (!step.refused) return;
        for (let y = 0; y < g.size; y++)
          for (let x = 0; x < g.size; x++) {
            const p = String.fromCharCode(97 + x, 97 + y);
            if (step.board[y][x] !== ".") continue;
            assert.equal(tryMove(engine, p), step.refused[p] ?? null, `${at}: ${p}`);
          }
      });
    });
  }
}
