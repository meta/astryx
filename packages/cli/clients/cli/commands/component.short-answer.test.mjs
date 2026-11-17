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
    expect(run.stdout).toMatch(/^- `isOpen`: `boolean` \*\*\(required\)\*\*$/m);
    expect(run.stdout).toMatch(
      /component DialogHeader useImperativeDialog`\.$/m,
    );
    expect(run.stdout).toMatch(/component Dialog --props`$/m);
    expect(run.stdout).toMatch(/component Dialog --detail full`$/m);
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
    expect(run.stdout).not.toContain('## More');
  });

  it('gives each component in a batch its own short answer', async () => {
    const run = await runCli(['component', 'Dialog', 'Button'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/component Dialog --detail full`$/m);
    expect(run.stdout).toMatch(/component Button --detail full`$/m);
  });

  it('keeps the JSON answer whole', async () => {
    const run = await runCli(['component', 'Dialog', '--json'], {cwd});
    expect(run.status, run.stderr).toBe(0);
    const body = JSON.parse(run.stdout);
    expect(body.data.usage.anatomy.length).toBeGreaterThan(0);
    expect(body.data.theming).toBeDefined();
  });
});
