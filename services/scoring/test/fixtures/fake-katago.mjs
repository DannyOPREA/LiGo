#!/usr/bin/env node
// A fake `katago analysis` process for tests (test/katago.test.ts): reads JSON-lines queries on
// stdin, answers each with a synthetic all-empty ownership map. Env vars: EXIT_AFTER (exit once
// this many queries have been answered, default: never — used to test a crash and the client's
// restart afterwards), DELAY_MS (wait this long before each answer — used to test the per-request
// timeout), NEVER_ANSWER (read and drop every query, answering nothing, ever — used to test a
// hung KataGo, as opposed to DELAY_MS's merely slow one).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { createInterface } from 'node:readline';

const exitAfter = process.env.EXIT_AFTER ? Number(process.env.EXIT_AFTER) : Infinity;
const delayMs = process.env.DELAY_MS ? Number(process.env.DELAY_MS) : 0;
const neverAnswer = process.env.NEVER_ANSWER === '1';
let answered = 0;

// EXIT_AFTER=0: crash on startup, before answering anything.
if (exitAfter === 0) process.exit(1);

const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
  if (neverAnswer) return; // read the query, but never reply: simulates a hung analysis engine
  const req = JSON.parse(line);
  const size = req.boardXSize * req.boardYSize;
  const respond = () => {
    process.stdout.write(JSON.stringify({ id: req.id, ownership: Array(size).fill(0) }) + '\n');
    answered += 1;
    // A short delay before exiting so the parent has read this line first (process.exit() can
    // otherwise race the pipe read; a real katago crash has no such answer to lose).
    if (answered >= exitAfter) setTimeout(() => process.exit(1), 50);
  };
  if (delayMs > 0) setTimeout(respond, delayMs);
  else respond();
});
