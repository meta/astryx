// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-params-'));

const HOOK = 'useTableSortableState';

/** The `## Parameters` heading and its table. @param {string} out */
const paramsSection = out =>
  out.slice(out.indexOf('## Parameters')).split('\n\n').slice(0, 2);

// A component read that resolves to a hook prints what the hook takes, at
// each level where `hook <name>` prints it, the same way.
describe('a component read of a hook prints its parameters', () => {
  it.each(['compact', 'full'])('--detail %s', async detail => {
    const json = await runCli(['component', HOOK, '--json'], {cwd});
    const {params} = JSON.parse(json.stdout).data;
    expect(params.length).toBeGreaterThan(0);
    const run = await runCli(['component', HOOK, '--detail', detail], {cwd});
    expect(run.status, run.stderr).toBe(0);
    for (const p of params) {
      expect(run.stdout).toContain(`| \`${p.name}\` | `);
    }
    const hook = await runCli(['hook', HOOK, '--detail', detail], {cwd});
    expect(paramsSection(run.stdout)).toEqual(paramsSection(hook.stdout));
    // Parameters come before Returns, as in the hook read.
    expect(run.stdout.indexOf('## Parameters')).toBeLessThan(
      run.stdout.indexOf('## Returns'),
    );
  });

  it('prints the same JSON bytes at every detail level', async () => {
    const base = await runCli(['component', HOOK, '--json'], {cwd});
    expect(base.status, base.stderr).toBe(0);
    for (const level of ['full', 'compact', 'brief']) {
      const run = await runCli(
        ['component', HOOK, '--detail', level, '--json'],
        {cwd},
      );
      expect(run.stdout).toBe(base.stdout);
    }
  });
});
