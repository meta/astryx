// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CLI behavior for `astryx theme template`.
 *
 * The API leaf is covered by api/theme/template/template.test.mjs; what is only
 * reachable here is the terminal binding — which message the user sees, and the
 * JSON envelope. The first version of this command read `result.written`
 * instead of `result.data.written`, so it wrote the file and then told the user
 * it had skipped: a receipt read at the wrong depth is invisible to a unit test
 * of the leaf.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-theme-template-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'tmp', private: true}),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

const read = f => fs.readFileSync(path.join(tmpDir, f), 'utf-8');

describe('astryx theme template', () => {
  it('writes the template and says it wrote it', async () => {
    const {status, stdout} = await runCli(['theme', 'template'], {cwd: tmpDir});

    expect(status).toBe(0);
    expect(stdout).toMatch(/Wrote theme\.template\.ts/);
    expect(stdout).not.toMatch(/already exists/);
    expect(read('theme.template.ts')).toMatch(/defineTheme/);
  });

  it('leaves an existing file alone, and says that instead', async () => {
    fs.writeFileSync(path.join(tmpDir, 'theme.template.ts'), '// mine\n');

    const {status, stdout} = await runCli(['theme', 'template'], {cwd: tmpDir});

    expect(status).toBe(0);
    expect(stdout).toMatch(/already exists/);
    expect(read('theme.template.ts')).toBe('// mine\n');
  });

  it('replaces it with --overwrite', async () => {
    fs.writeFileSync(path.join(tmpDir, 'theme.template.ts'), '// mine\n');

    const {status} = await runCli(['theme', 'template', '--overwrite'], {cwd: tmpDir});

    expect(status).toBe(0);
    expect(read('theme.template.ts')).toMatch(/defineTheme/);
  });

  it('returns a theme.template envelope under --json', async () => {
    const {status, stdout} = await runCli(['--json', 'theme', 'template'], {cwd: tmpDir});

    expect(status).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.type).toBe('theme.template');
    expect(payload.data).toEqual({
      path: 'theme.template.ts',
      written: true,
      reason: null,
    });
  });

  it('refuses a path that escapes the project', async () => {
    const {status, stderr} = await runCli(['theme', 'template', '../escaped.ts'], {
      cwd: tmpDir,
    });

    expect(status).toBe(1);
    expect(stderr).toMatch(/outside the project root/);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escaped.ts'))).toBe(false);
  });

  it('fails a write with ERR_WRITE_FAILED under --json', async () => {
    fs.writeFileSync(path.join(tmpDir, 'blocker'), '');

    const {status, stdout} = await runCli(
      ['--json', 'theme', 'template', 'blocker/theme.ts'],
      {cwd: tmpDir},
    );

    expect(status).toBe(1);
    expect(JSON.parse(stdout).code).toBe('ERR_WRITE_FAILED');
  });
});
