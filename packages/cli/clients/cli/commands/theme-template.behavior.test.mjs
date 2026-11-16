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
import {logger} from '../../../api/logger.mjs';

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

    const {status} = await runCli(['theme', 'template', '--overwrite'], {
      cwd: tmpDir,
    });

    expect(status).toBe(0);
    expect(read('theme.template.ts')).toMatch(/defineTheme/);
  });

  it('returns a theme.template envelope under --json', async () => {
    const {status, stdout} = await runCli(['--json', 'theme', 'template'], {
      cwd: tmpDir,
    });

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
    const {status, stderr} = await runCli(
      ['theme', 'template', '../escaped.ts'],
      {
        cwd: tmpDir,
      },
    );

    expect(status).toBe(1);
    expect(stderr).toMatch(/outside the project root/);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escaped.ts'))).toBe(
      false,
    );
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

describe('theme subcommands refuse a stray word', () => {
  it.each([
    [['theme', 'template', 'a.ts', 'b.ts']],
    [['theme', 'use', 'neutral', 'dark']],
    [['theme', 'remove', 'neutral', 'extra']],
    [['theme', 'list', 'neutral']],
    [['theme', 'targets', 'Switch', 'Button']],
    [['theme', 'eject', 'neutral', 'a', 'b']],
  ])('%j exits 1 with ERR_INVALID_ARGUMENT and writes nothing', async args => {
    const before = fs.readdirSync(tmpDir).sort();
    const {status, stdout} = await runCli(['--json', ...args], {cwd: tmpDir});
    expect(status).toBe(1);
    expect(JSON.parse(stdout).code).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(tmpDir).sort()).toEqual(before);
  });
});

describe('theme template and eject next steps', () => {
  it('quotes a path with a space in the build command', async () => {
    const {stdout} = await runCli(['theme', 'template', 'x y.ts'], {
      cwd: tmpDir,
    });
    expect(stdout).toMatch(/ theme build 'x y\.ts'/);
  });

  it('names a free path, not --overwrite, for a file overwrite would refuse', async () => {
    fs.writeFileSync(path.join(tmpDir, 'util.ts'), 'export const x = 1;\n');
    const {status, stdout} = await runCli(['theme', 'template', 'util.ts'], {
      cwd: tmpDir,
    });
    expect(status).toBe(0);
    expect(stdout).not.toContain('--overwrite to replace');
    expect(stdout).toMatch(/ theme template theme\.template\.ts/);
  });

  it('quotes the fork path in the eject build command', async () => {
    const {stdout} = await runCli(['theme', 'eject', 'neutral', "it's"], {
      cwd: tmpDir,
    });
    expect(stdout).toContain(` theme build 'it'\\''s/neutralTheme.ts'.`);
  });
});

describe('astryx theme template outside a project', () => {
  it('writes in the current folder, as released CLIs did, and warns how to write it at a project root', async () => {
    const bare = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-template-bare-'),
    );
    try {
      const text = await runCli(['theme', 'template'], {cwd: bare});
      expect(text.status).toBe(0);
      expect(text.stdout).toMatch(/Wrote theme\.template\.ts/);
      expect(text.stderr).toMatch(
        /no package\.json is in this folder or above it, so the template is written here/,
      );
      expect(text.stderr).not.toMatch(/DEP-|deprecated|next minor|refuse/);
      expect(fs.existsSync(path.join(bare, 'theme.template.ts'))).toBe(true);

      const json = await runCli(['--json', 'theme', 'template', 'x.ts'], {
        cwd: bare,
      });
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout).data).toEqual({
        path: 'x.ts',
        written: true,
        reason: null,
      });
      // A text-only warning: silent under --json, with nothing added to meta.
      expect(json.stderr).not.toMatch(/no package\.json/);
      expect(JSON.parse(json.stdout).meta?.deprecations).toBeUndefined();
      expect(text.stderr).toMatch(
        /run `npm init -y` here first, to write it at a project root/,
      );
      // A file left as it is gets no warning.
      const again = await runCli(['theme', 'template'], {cwd: bare});
      expect(again.stderr).not.toMatch(/no package\.json/);
    } finally {
      fs.rmSync(bare, {recursive: true, force: true});
    }
  });

  it('warns nothing inside a project', async () => {
    const {stderr} = await runCli(['theme', 'template'], {cwd: tmpDir});
    expect(stderr).not.toMatch(/no package\.json/);
  });
});

describe('theme eject into a subfolder of a folder the theme editor made', () => {
  // The logger is shared across in-process runs; start it silent, as a fresh
  // CLI process does, so only eject's own setup can make the warning print.
  beforeEach(() => {
    logger.setSilent(true);
  });

  it('writes there as released CLIs did, warning once in text and silent under --json', async () => {
    const editor = path.join(tmpDir, 'themes', 'g');
    fs.mkdirSync(editor, {recursive: true});
    fs.writeFileSync(path.join(editor, 'g.settings.json'), '{}\n');

    const text = await runCli(['theme', 'eject', 'neutral', 'themes/g/sub'], {
      cwd: tmpDir,
    });
    expect(text.status).toBe(0);
    expect(
      fs.existsSync(path.join(editor, 'sub', 'neutralTheme.doc.mjs')),
    ).toBe(true);
    expect(text.stderr.match(/theme editor made/g)).toHaveLength(1);
    expect(text.stderr).toMatch(
      /pick a path outside themes\/g, to keep the editor's folder to its own theme/,
    );

    const json = await runCli(
      ['--json', 'theme', 'eject', 'neutral', 'themes/g/other'],
      {cwd: tmpDir},
    );
    expect(json.status).toBe(0);
    expect(
      fs.existsSync(path.join(editor, 'other', 'neutralTheme.doc.mjs')),
    ).toBe(true);
    expect(json.stderr).not.toMatch(/theme editor made/);
    expect(JSON.parse(json.stdout).data.outputDir).toBe(
      path.join('themes', 'g', 'other'),
    );
  });
});
