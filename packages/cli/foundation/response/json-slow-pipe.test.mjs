// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A refusal longer than a pipe holds (64 KiB) reaches a slow reader
 * whole, text and --json alike: the process writes it out before it exits.
 */

import {spawn} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsonModule = pathToFileURL(path.join(here, 'json.mjs')).href;
const cliErrorModule = pathToFileURL(
  path.join(here, '../../clients/cli/lib/cli-error.mjs'),
).href;

/**
 * Run `code`, reading the named stream 1 KiB at a time with a pause between
 * reads, as `$(…)` or a slow consumer does.
 * @param {string} code
 * @param {'stdout' | 'stderr'} which
 * @returns {Promise<{status: number | null, out: string}>}
 */
function readSlowly(code, which) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stream = child[which];
    stream.pause();
    /** @type {Buffer[]} */
    const chunks = [];
    const pull = () => {
      const chunk = stream.read(1024);
      if (chunk) chunks.push(chunk);
      setTimeout(pull, 2);
    };
    stream.on('readable', () => {});
    let done = false;
    const timer = setTimeout(pull, 200);
    child.on('close', status => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let rest;
      while ((rest = stream.read()) !== null) chunks.push(rest);
      resolve({status, out: Buffer.concat(chunks).toString('utf8')});
    });
  });
}

describe('a long refusal through a slow pipe', () => {
  it('--json: the whole envelope, valid JSON with its code', async () => {
    const {status, out} = await readSlowly(
      `import {jsonError} from ${JSON.stringify(jsonModule)};
       jsonError('x'.repeat(200000), [], 'ERR_INVALID_ARGUMENT');`,
      'stdout',
    );
    expect(status).toBe(1);
    expect(out.length).toBeGreaterThan(200000);
    expect(JSON.parse(out).code).toBe('ERR_INVALID_ARGUMENT');
  }, 60_000);

  it('text: the whole message on stderr, its last line too', async () => {
    const {status, out} = await readSlowly(
      `import {cliError} from ${JSON.stringify(cliErrorModule)};
       cliError('y'.repeat(200000), {code: 'ERR_INVALID_ARGUMENT', suggestions: [{name: 'ls -la', reason: 'last line'}]});`,
      'stderr',
    );
    expect(status).toBe(1);
    expect(out).toMatch(/^Error: y{200000}\n/);
    expect(out).toMatch(/ {2}ls -la {2}\(last line\)\n$/);
  }, 60_000);
});
