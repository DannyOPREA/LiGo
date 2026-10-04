import assert from 'node:assert/strict';
// Unit 4.12, the Phase 4 demo as a script: the requests lila sent in its two demo games (written by
// lila's Phase4DemoTest into libs/conformance/demo/phase-4/) are answered here, without KataGo, and
// each answer must equal the reply file lila read. So lila's messages are ones this service accepts,
// and the counts lila showed are this service's.
//
// LIGO_DEMO_WRITE=1 writes the replies that are missing instead of failing.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { handle, type Request } from '../src/handle.ts';

const dir = fileURLToPath(new URL('../../../libs/conformance/demo/phase-4/', import.meta.url));
const writing = process.env.LIGO_DEMO_WRITE === '1';

const requests = readdirSync(dir)
  .filter(f => f.endsWith('.request.json'))
  .sort();

test('the demo has lila requests to answer', () => {
  assert.ok(requests.length >= 4, `only ${requests.length} requests in ${dir}`);
});

for (const name of requests) {
  test(`demo: ${name} gets the reply lila read`, async () => {
    const req = JSON.parse(readFileSync(dir + name, 'utf8')) as Request;
    const reply = await handle(req, { katago: null });
    assert.notEqual(reply.t, 'error', JSON.stringify(reply));
    const file = dir + name.replace('.request.json', '.reply.json');
    if (existsSync(file)) assert.deepEqual(reply, JSON.parse(readFileSync(file, 'utf8')));
    else if (writing) writeFileSync(file, JSON.stringify(reply, null, 2) + '\n');
    else assert.fail(`${file} is missing (LIGO_DEMO_WRITE=1 writes it)`);
  });
}
