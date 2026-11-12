// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Compatibility coverage for the cleanup stage of the theme-add lifecycle. */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-add-cli-'));
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}\n');
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'app',
      private: true,
      dependencies: {'@acme/themes': '^1.0.0', '@astryxdesign/core': '*'},
    }),
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'themes');
  const themeDir = path.join(packageDir, 'themes', 'ocean');
  fs.mkdirSync(themeDir, {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/themes',
      version: '1.0.0',
      type: 'module',
      exports: {
        './themes/ocean': './dist/ocean.js',
        './themes/ocean.css': './dist/ocean.css',
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  fs.writeFileSync(
    path.join(themeDir, 'oceanTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n",
  );
  fs.writeFileSync(
    path.join(themeDir, 'oceanTheme.ts'),
    'export const oceanTheme = {};\n',
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/ocean.js'),
    "export const oceanTheme = {name: 'ocean', __built: true};\n",
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/ocean.css'),
    '[data-astryx-theme="ocean"] {}\n',
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme add cleanup lifecycle', () => {
  it('plain theme add imports built output and prints no deprecation warning', async () => {
    const result = await runCli(
      ['theme', 'add', 'ocean', '--package', '@acme/themes'],
      tmpDir,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^owner:\s+@acme\/themes$/m);
    expect(result.stdout).toMatch(/^module:\s+@acme\/themes\/themes\/ocean$/m);
    expect(result.stdout).toMatch(/^action:\s+add$/m);
    expect(result.stderr).not.toContain('DEP-0005');
    expect(result.stderr).not.toContain('deprecated');
    expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/ocean'))).toBe(false);
  });

  it('plain theme add returns theme.app with no deprecation metadata', async () => {
    const result = await runCli(
      ['theme', 'add', 'ocean', '--package', '@acme/themes', '--json'],
      tmpDir,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      type: 'theme.app',
      data: {
        default: 'ocean',
        modulePath: 'src/astryx-themes.ts',
        change: {action: 'add', slug: 'ocean', changed: true},
      },
    });
    expect(Object.keys(payload.meta)).toEqual(['answeredBy']);
  });

  it('keeps --import as an accepted no-op with the same response', async () => {
    const result = await runCli(
      [
        'theme',
        'add',
        'ocean',
        '--import',
        '--package',
        '@acme/themes',
        '--json',
      ],
      tmpDir,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: 'theme.app',
      data: {default: 'ocean', change: {action: 'add', slug: 'ocean'}},
    });
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/ocean'))).toBe(false);
  });

  it('keeps list JSON byte-compatible and names cleanup commands in text', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src/themes/broken'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'src/themes/broken/brokenTheme.ts'),
      'export const brokenTheme = {};\n',
    );

    const textResult = await runCli(['theme', 'add', '--list'], tmpDir);
    expect(textResult.status, textResult.stderr).toBe(0);
    const run = getCliInvocation(tmpDir);
    expect(textResult.stdout).toContain(
      `Import one: ${run} theme add <slug> [--package <package>]`,
    );
    expect(textResult.stdout).toContain(
      `Fork source: ${run} theme eject <slug> [target-path]`,
    );
    expect(textResult.stdout).toMatch(
      /More themes in packages you could add: .*discover theme$/m,
    );
    expect(textResult.stdout).not.toContain('theme add <slug> [target-path]');
    expect(textResult.stdout).not.toContain('theme add <slug> --import');
    expect(textResult.stderr).not.toContain('deprecated');

    const result = await runCli(['theme', 'add', '--list', '--json'], tmpDir);
    expect(result.status, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({type: 'theme.list'});
    expect(Object.keys(payload.meta)).toEqual(['answeredBy']);
    expect(payload.data.some(theme => theme.slug === 'broken')).toBe(false);
    expect(Object.keys(payload.data[0]).sort()).toEqual([
      'description',
      'displayName',
      'maintained',
      'package',
      'slug',
    ]);
    expect(result.stderr).not.toContain('deprecated');
  });

  it.each([
    ['target path', ['src/brand'], 'ERR_INVALID_ARGUMENT'],
    ['overwrite', ['--overwrite'], 'ERR_INVALID_OPTION'],
    [
      'target path with --import',
      ['--import', 'src/brand'],
      'ERR_INVALID_ARGUMENT',
    ],
    [
      'overwrite with --import',
      ['--import', '--overwrite'],
      'ERR_INVALID_OPTION',
    ],
  ])(
    'rejects removed %s before writing with the standard parser code',
    async (_label, extra, code) => {
      const result = await runCli(
        [
          'theme',
          'add',
          'ocean',
          ...extra,
          '--package',
          '@acme/themes',
          '--json',
        ],
        tmpDir,
      );

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({code});
      expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tmpDir, 'src/brand'))).toBe(false);
    },
  );

  it('rejects --overwrite without a slug as an invalid option', async () => {
    const result = await runCli(
      ['theme', 'add', '--overwrite', '--json'],
      tmpDir,
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: 'ERR_INVALID_OPTION',
    });
    expect(fs.existsSync(path.join(tmpDir, 'src/astryx-themes.ts'))).toBe(
      false,
    );
  });

  it('shows --import and the visible eject replacement without a hidden option', async () => {
    const result = await runCli(['theme', 'add', '--help'], tmpDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('--import');
    expect(result.stdout).toMatch(/compatibility no-op/i);
    expect(result.stdout).toContain('theme eject <slug> [path] [--overwrite]');
    expect(result.stdout).not.toMatch(/^\s+-f, --overwrite/m);
  });
});
