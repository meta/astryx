// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A run, from the bin or from the host entry, makes a piped stdout and
 * stderr block on write, so an error answer longer than a pipe holds (64 KiB)
 * reaches a slow reader whole, in --json and in text, though the run ends in
 * `process.exit`.
 */

import {execFile} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, 'bin/astryx.mjs');
const host = pathToFileURL(path.join(here, '../../host/index.mjs')).href;

/**
 * Run node with `args` and pipe one of its streams to a reader that starts
 * a second late, as `node … | (sleep 1; cat)` does in a shell.
 * @param {string[]} args the arguments to node
 * @param {'stdout' | 'stderr'} which the stream the slow reader reads
 * @returns {Promise<{status: number, out: string}>}
 */
function throughSlowReader(args, which) {
  const redirect = which === 'stderr' ? '2>&1 >/dev/null' : '2>/dev/null';
  const script =
    `"$@" ${redirect} | (sleep 1; cat); ` + 'echo "${PIPESTATUS[0]}" >&2';
  return new Promise((resolve, reject) => {
    execFile(
      'bash',
      ['-c', script, 'bash', process.execPath, ...args],
      {cwd: REPO_ROOT, env: {...process.env, NO_COLOR: '1'}, maxBuffer: 1e8},
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({status: Number(stderr.trim()), out: stdout});
      },
    );
  });
}

const BIG = 300_000;

describe.skipIf(process.platform === 'win32')(
  'output through a slow reader',
  () => {
    it('the reader is slow: a plain Node exit loses output past the pipe buffer', async () => {
      const {status, out} = await throughSlowReader(
        [
          '--input-type=module',
          '-e',
          `process.stdout.write('o'.repeat(${BIG}) + '\\n'); process.exit(3);`,
        ],
        'stdout',
      );
      expect(status).toBe(3);
      expect(out.length).toBeLessThan(BIG);
    }, 60_000);

    // The bin and the host entry each start a run through run.mjs.
    const entries = [
      {entry: 'the bin', args: [bin]},
      {
        entry: 'the host entry',
        args: [
          '--input-type=module',
          '-e',
          `import {runHostedCli} from ${JSON.stringify(host)};
           await runHostedCli({argv: process.argv.slice(1)});`,
        ],
      },
    ];

    for (const {entry, args} of entries) {
      it(`${entry}: a --json error answer reaches a slow reader whole`, async () => {
        const name = 'q'.repeat(100_000);
        const {status, out} = await throughSlowReader(
          [...args, 'component', name, '--json'],
          'stdout',
        );
        expect(status).toBe(1);
        const answer = JSON.parse(out);
        expect(answer.code).toBe('ERR_UNKNOWN_COMPONENT');
        expect(answer.error).toContain(name);
      }, 60_000);

      it(`${entry}: a text error reaches a slow reader whole on stderr`, async () => {
        const name = 'q'.repeat(100_000);
        const {status, out} = await throughSlowReader(
          [...args, 'component', name],
          'stderr',
        );
        expect(status).toBe(1);
        expect(out).toContain(name);
        expect(out.endsWith('\n')).toBe(true);
      }, 60_000);
    }
  },
);
