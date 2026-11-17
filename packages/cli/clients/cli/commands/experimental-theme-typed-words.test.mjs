// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The experimental theme copies reword the commands the CLI names into
 * their own group, and leave text a person typed as typed.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

describe('experimental theme copies echo typed text as typed', () => {
  it('keeps a targets filter that holds `astryx theme list`', async () => {
    const r = await runCli(
      ['--json', 'experimental', 'theme', 'targets', 'astryx theme list'],
      REPO_ROOT,
    );
    expect(r.status).toBe(1);
    const {error} = JSON.parse(r.stdout);
    expect(error).toContain('No theming target matches "astryx theme list".');
    expect(error).toContain(' experimental theme targets` with no filter');
  });

  it('keeps a slug that holds `theme add`, and still rewords the command it names', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-typed-words-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
    const r = await runCli(
      ['--json', 'experimental', 'theme', 'use', '`theme add`'],
      dir,
    );
    expect(r.status).toBe(1);
    const {error} = JSON.parse(r.stdout);
    expect(error).toContain('Theme "`theme add`" is not added');
    expect(error).toContain(
      ' experimental theme list` for the themes you can add.',
    );
  });
});
