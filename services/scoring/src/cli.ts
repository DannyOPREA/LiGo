#!/usr/bin/env node
// Dev CLI: reads one JSON request from stdin, prints the reply to stdout. No Redis (unit 4.5);
// useful for trying a request by hand or from a shell script.
//
// KataGo, for `propose`: set KATAGO_BIN, KATAGO_MODEL and KATAGO_CONFIG (as `dev/ligo katago env`
// prints them, though its KATAGO_GTP_CONFIG is for GTP, not analysis — pass the analysis config,
// e.g. `$(dirname "$(readlink -f "$KATAGO_BIN")")/analysis_example.cfg`). Unset: every `propose`
// answers `src: "none"`, same as a real KataGo that can't be reached.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { handle, type Request } from './handle.ts';
import { KataGoClient } from './katago.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  const text = await readStdin();
  const req = JSON.parse(text) as Request;
  const katago =
    process.env.KATAGO_BIN && process.env.KATAGO_MODEL && process.env.KATAGO_CONFIG
      ? new KataGoClient({
          bin: process.env.KATAGO_BIN,
          modelPath: process.env.KATAGO_MODEL,
          configPath: process.env.KATAGO_CONFIG,
        })
      : null;
  try {
    const reply = await handle(req, { katago });
    process.stdout.write(JSON.stringify(reply) + '\n');
  } finally {
    katago?.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
