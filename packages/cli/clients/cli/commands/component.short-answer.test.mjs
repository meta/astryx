// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-short-'));

describe('component read default', () => {
  it('prints the short answer and names the commands that print the rest', async () => {
    const run = await runCli(['component', 'Dialog'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('# Dialog');
    expect(run.stdout).toContain(
      "import { Dialog } from '@astryxdesign/core/Dialog';",
    );
    expect(run.stdout).toContain('## Usage');
    expect(run.stdout).toMatch(
      /^- `isOpen`: `boolean` \*\*\(required\)\*\* - Whether the dialog is open\.$/m,
    );
    expect(run.stdout).toMatch(
      /component DialogHeader useImperativeDialog`\.$/m,
    );
    expect(run.stdout).toMatch(/component Dialog --props`$/m);
    // The answer ends with one line that says how to get the full output.
    expect(run.stdout.trimEnd().split('\n').at(-1)).toMatch(
      /^Full output, .*component Dialog --detail full`$/,
    );
    expect(run.stdout).not.toContain('## Anatomy');
    expect(run.stdout).not.toContain('## Theming');
  });

  it('prints the whole doc at --detail full', async () => {
    const run = await runCli(['component', 'Dialog', '--detail', 'full'], {
      cwd,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('## Anatomy');
    expect(run.stdout).toContain('## Theming');
    expect(run.stdout).not.toMatch(/^Full output, /m);
  });

  it('gives each component in a batch its own short answer', async () => {
    const run = await runCli(['component', 'Dialog', 'Button'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/component Dialog --detail full`$/m);
    expect(run.stdout).toMatch(/component Button --detail full`$/m);
  });

  // The short default changes only the text projection: the JSON a read
  // prints is the same bytes at every detail level.
  it.each([[['Dialog']], [['Dialog', 'Button']]])(
    'prints the same JSON bytes at every detail level for %j',
    async names => {
      const base = await runCli(['component', ...names, '--json'], {cwd});
      expect(base.status, base.stderr).toBe(0);
      for (const level of ['full', 'compact', 'brief']) {
        const run = await runCli(
          ['component', ...names, '--json', '--detail', level],
          {cwd},
        );
        expect(run.status, run.stderr).toBe(0);
        expect(run.stdout).toBe(base.stdout);
      }
    },
  );

  it('keeps every field in the JSON answer', async () => {
    const run = await runCli(['component', 'Dialog', '--json'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    const body = JSON.parse(run.stdout);
    expect(body.data.usage.anatomy.length).toBeGreaterThan(0);
    expect(body.data.theming).toBeDefined();
  });
});
