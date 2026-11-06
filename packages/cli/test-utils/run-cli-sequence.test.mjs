// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {PassThrough} from 'node:stream';
import {runCli} from './run-cli.mjs';
import {resultsFromLines, startCliSequence} from './run-cli-sequence.mjs';

const ENV = {...process.env, NO_COLOR: '1', FORCE_COLOR: '0'};

describe('startCliSequence', () => {
  it('gives each invocation the result runCli gives in this process', async () => {
    const cwd = os.tmpdir();
    const invocations = [['--version'], ['no-such-command']];
    const {results} = startCliSequence(cwd, invocations, ENV);
    for (const [index, args] of invocations.entries()) {
      const expected = await runCli(args, cwd);
      const actual = await results[index];
      expect({status: actual.status, stdout: actual.stdout}).toEqual({
        status: expected.status,
        stdout: expected.stdout,
      });
    }
  });

  it('rejects the runs the process did not finish, with its error output', async () => {
    const missing = path.join(os.tmpdir(), 'astryx-no-such-folder');
    fs.rmSync(missing, {recursive: true, force: true});
    const {results} = startCliSequence(missing, [['--version']], ENV);
    await expect(results[0]).rejects.toThrow(/after 0 of 1 runs[\s\S]*ENOENT/u);
  });
});

describe('resultsFromLines', () => {
  it('rejects only the result whose line is not JSON', async () => {
    const lines = new PassThrough();
    const {results} = resultsFromLines(lines, 3);
    lines.write('{"status":0,"code":0,"stdout":"first","stderr":""}\nnot');
    lines.write(' JSON\n{"status":1,"code":1,"stdout":"","stderr":"third"}\n');
    await expect(results[0]).resolves.toMatchObject({stdout: 'first'});
    await expect(results[1]).rejects.toThrow(
      'Run 2 wrote a line that is not JSON: not JSON',
    );
    await expect(results[2]).resolves.toMatchObject({stderr: 'third'});
  });
});
