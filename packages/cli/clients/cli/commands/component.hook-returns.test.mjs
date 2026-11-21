// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-hook-'));

/** @param {string} out */
const returnsSection = out => out.slice(out.indexOf('## Returns'));

// A component read that resolves to a hook prints what the hook returns, at
// each level where `hook <name>` prints it, the same way.
describe('a component read of a hook prints its returns', () => {
  it.each(['compact', 'full'])('--detail %s', async detail => {
    const json = await runCli(['component', 'useToast', '--json'], {cwd});
    const [first] = JSON.parse(json.stdout).data.returns;
    const run = await runCli(['component', 'useToast', '--detail', detail], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('## Returns');
    expect(run.stdout).toContain(`| \`${first.name}\` | `);
    const hook = await runCli(['hook', 'useToast', '--detail', detail], {cwd});
    const table = returnsSection(hook.stdout).split('\n\n').slice(0, 2);
    expect(returnsSection(run.stdout).split('\n\n').slice(0, 2)).toEqual(table);
  });

  it('prints the hook signature in the brief line', async () => {
    const run = await runCli(['component', 'useToast', '--detail', 'brief'], {
      cwd,
    });
    const hook = await runCli(['hook', 'useToast', '--detail', 'brief'], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    const signature = hook.stdout
      .split('\n')
      .find(l => l.startsWith('useToast('));
    expect(signature).toBeTruthy();
    expect(run.stdout.split('\n')).toContain(signature);
  });

  it('prints the same JSON bytes at every detail level', async () => {
    const base = await runCli(['component', 'useToast', '--json'], {cwd});
    expect(base.status, base.stderr).toBe(0);
    expect(JSON.parse(base.stdout).data.returns.length).toBeGreaterThan(0);
    for (const level of ['full', 'compact', 'brief']) {
      const run = await runCli(
        ['component', 'useToast', '--detail', level, '--json'],
        {cwd},
      );
      expect(run.stdout).toBe(base.stdout);
    }
  });
});
