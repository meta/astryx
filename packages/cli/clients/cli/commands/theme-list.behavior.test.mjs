// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CLI behavior for `astryx theme list`.
 *
 * `theme list` shows the themes this project can add now. Themes in packages
 * it has not installed are `discover`'s, so the list ends by pointing there:
 * an agent that never learns `discover` exists searches the registry instead.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-theme-list-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('astryx theme list', () => {
  it('lists bundled themes and points at import, eject, and discover', async () => {
    // Inside a project; outside one there is no app to import into
    // (outside-project.test.mjs).
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      '{"name":"app","dependencies":{"@astryxdesign/core":"*"}}',
    );
    const {status, stdout} = await runCli(['theme', 'list'], {cwd: tmpDir});

    expect(status).toBe(0);
    expect(stdout).toMatch(/^slug:\s+neutral$/m);
    expect(stdout).toMatch(/^package:\s+@astryxdesign\/cli$/m);
    expect(stdout).toMatch(/Import one: .*theme add <slug>/m);
    expect(stdout).not.toContain('theme add <slug> --import');
    expect(stdout).toMatch(/Fork source: .*theme eject <slug>/m);
    expect(stdout).toMatch(/More themes in packages you could add: .*discover theme$/m);
  });

  it('keeps the JSON envelope free of the hint', async () => {
    const {status, stdout} = await runCli(['--json', 'theme', 'list'], {cwd: tmpDir});

    expect(status).toBe(0);
    expect(stdout).not.toContain('discover');
    expect(JSON.parse(stdout).type).toBe('theme.list');
  });
});
