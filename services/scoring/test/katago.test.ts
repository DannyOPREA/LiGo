import assert from 'node:assert/strict';
import process from 'node:process';
// KataGoClient: missing/crashed/slow KataGo, and restarting after a crash (ADR 0020 §4). Uses a
// fake `katago analysis` process (test/fixtures/fake-katago.mjs) rather than the real binary, so
// these run without KataGo installed; test/integration.test.ts covers the real one.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseBoard } from '../src/board.ts';
import { KataGoClient, KataGoUnavailable } from '../src/katago.ts';

const fakeBin = fileURLToPath(new URL('./fixtures/fake-katago.mjs', import.meta.url));
const board = parseBoard(Array(9).fill('9').join('/'), 9);

// KataGoOptions.bin is a single executable with fixed args (`analysis -config ... -model ...`),
// which the fake script ignores; give it as `bin` directly (it has a shebang and is executable).
function fakeClient(env: Record<string, string> = {}, timeoutMs = 30_000): KataGoClient {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return new KataGoClient({ bin: fakeBin, configPath: 'x', modelPath: 'x', timeoutMs });
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete process.env[k];
}

test('KataGoClient: a working process answers both ownership maps', async () => {
  const c = fakeClient();
  try {
    const maps = await c.ownershipMaps(board, 'chinese', 7.5);
    assert.equal(maps.blackToMove.length, 9);
    assert.equal(maps.blackToMove[0].length, 9);
    assert.deepEqual(maps.whiteToMove[0], Array(9).fill(0));
  } finally {
    c.close();
    clearEnv('EXIT_AFTER', 'DELAY_MS');
  }
});

test('KataGoClient: a missing binary rejects with KataGoUnavailable', async () => {
  const c = new KataGoClient({ bin: '/no/such/katago-binary', configPath: 'x', modelPath: 'x' });
  try {
    await assert.rejects(() => c.ownershipMaps(board, 'chinese', 7.5), KataGoUnavailable);
  } finally {
    c.close();
  }
});

test('KataGoClient: a binary that exits immediately (/bin/true) rejects, not crashes (EPIPE)', async () => {
  // Review finding B3 (logs/scoring.md "4.4 review fixes"): /bin/true exits at once, closing its
  // stdin; without an error handler on proc.stdin, the write below used to raise an uncaught
  // EPIPE that killed this whole process rather than rejecting the request. A big board (19x19)
  // makes the query line large enough that the write is still in flight when the process exits.
  const board19 = parseBoard(Array(19).fill('19').join('/'), 19);
  const c = new KataGoClient({ bin: '/bin/true', configPath: 'x', modelPath: 'x' });
  try {
    await assert.rejects(() => c.ownershipMaps(board19, 'chinese', 7.5), KataGoUnavailable);
  } finally {
    c.close();
  }
});

test('KataGoClient: a process that exits before answering rejects with KataGoUnavailable', async () => {
  const c = fakeClient({ EXIT_AFTER: '0' });
  try {
    await assert.rejects(() => c.ownershipMaps(board, 'chinese', 7.5), KataGoUnavailable);
  } finally {
    c.close();
    clearEnv('EXIT_AFTER', 'DELAY_MS');
  }
});

test('KataGoClient: a request slower than the timeout rejects with KataGoUnavailable', async () => {
  const c = fakeClient({ DELAY_MS: '300' }, 30);
  try {
    await assert.rejects(() => c.ownershipMaps(board, 'chinese', 7.5), KataGoUnavailable);
  } finally {
    c.close();
    clearEnv('EXIT_AFTER', 'DELAY_MS');
  }
});

test('KataGoClient: a hung process is killed on timeout, so the next request gets a fresh one', async () => {
  // Review finding (non-blocking, logs/scoring.md "4.4 review fixes"): a timeout used to just
  // reject the one pending request and leave the hung process running, so every later request
  // reused it and timed out too. The fake process here never answers at all (NEVER_ANSWER, as
  // opposed to DELAY_MS's merely-slow answer), so a second call only succeeds if the client
  // killed it and spawned a fresh one after the first timeout.
  const c = fakeClient({ NEVER_ANSWER: '1' }, 500);
  try {
    await assert.rejects(() => c.ownershipMaps(board, 'chinese', 7.5), KataGoUnavailable);
    clearEnv('NEVER_ANSWER');
    const maps = await c.ownershipMaps(board, 'chinese', 7.5);
    assert.equal(maps.blackToMove.length, 9);
  } finally {
    c.close();
    clearEnv('EXIT_AFTER', 'DELAY_MS', 'NEVER_ANSWER');
  }
});

test('KataGoClient: restarts after a crash and serves the next request', async () => {
  // Answers exactly one ownershipMaps() call's two queries, then exits (simulating a crash);
  // the client must spawn a fresh process for the next call rather than staying dead.
  const c = fakeClient({ EXIT_AFTER: '2' });
  try {
    const first = await c.ownershipMaps(board, 'chinese', 7.5);
    assert.equal(first.blackToMove.length, 9);
    const second = await c.ownershipMaps(board, 'chinese', 7.5);
    assert.equal(second.blackToMove.length, 9);
  } finally {
    c.close();
    clearEnv('EXIT_AFTER', 'DELAY_MS');
  }
});
