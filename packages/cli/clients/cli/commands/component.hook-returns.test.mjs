// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-hook-'));

const RETURNS_ROW =
  /^\| `showToast` \| `\(options: ToastOptions\) => \(\) => void` \| /m;

// A component read that resolves to a hook prints what the hook returns, at
// each level where `hook <name>` prints it.
describe('a component read of a hook prints its returns', () => {
  it.each(['compact', 'full'])('--detail %s', async detail => {
    const run = await runCli(['component', 'useToast', '--detail', detail], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('## Returns');
    expect(run.stdout).toMatch(RETURNS_ROW);
    const hook = await runCli(['hook', 'useToast', '--detail', detail], {cwd});
    expect(hook.stdout).toMatch(RETURNS_ROW);
  });

  it('names the returns in the brief signature', async () => {
    const run = await runCli(['component', 'useToast', '--detail', 'brief'], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/^useToast\(\): \{ showToast \} {2}<- from /m);
  });

  it('prints the same JSON bytes at every detail level', async () => {
    const base = await runCli(['component', 'useToast', '--json'], {cwd});
    expect(base.status, base.stderr).toBe(0);
    expect(JSON.parse(base.stdout).data.returns[0].name).toBe('showToast');
    for (const level of ['full', 'compact', 'brief']) {
      const run = await runCli(
        ['component', 'useToast', '--detail', level, '--json'],
        {cwd},
      );
      expect(run.stdout).toBe(base.stdout);
    }
  });
});
