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

// A component read that resolves to a hook prints what the hook takes: at
// --detail full the table `hook <name>` prints; in the short answer one line
// per parameter, as props print, with the description's first sentence.
describe('a component read of a hook prints its parameters', () => {
  it("--detail full prints the hook read's table, before Returns", async () => {
    const run = await runCli(['component', HOOK, '--detail', 'full'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    const hook = await runCli(['hook', HOOK, '--detail', 'full'], {cwd});
    expect(paramsSection(run.stdout)).toEqual(paramsSection(hook.stdout));
    expect(run.stdout.indexOf('## Parameters')).toBeLessThan(
      run.stdout.indexOf('## Returns'),
    );
  });

  it('the short answer prints one line per parameter, before Returns', async () => {
    const json = await runCli(['component', HOOK, '--json'], {cwd});
    const {params} = JSON.parse(json.stdout).data;
    expect(params.length).toBeGreaterThan(0);
    const run = await runCli(['component', HOOK], {cwd});
    expect(run.status, run.stderr).toBe(0);
    const section = run.stdout.slice(
      run.stdout.indexOf('## Parameters'),
      run.stdout.indexOf('## Returns'),
    );
    for (const p of params) {
      expect(section).toContain(`- \`${p.name}\`: \`${p.type}\``);
    }
    expect(section.split('\n').filter(l => l.startsWith('- `'))).toHaveLength(
      params.length,
    );
    // No table in the short answer; the whole descriptions are one read away.
    expect(section).not.toContain('| Param |');
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
