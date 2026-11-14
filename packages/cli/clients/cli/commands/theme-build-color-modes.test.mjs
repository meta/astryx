// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme source that exports one color mode (`colorModes`) builds a
 * module that exports it beside the theme, which every loader of a built
 * module still accepts; a source without one builds the module as before; an
 * ejected fork keeps the export, so its build carries the same mode.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {moduleExportsName} from '../../../foundation/discovery/module-exports.mjs';
import {builtColorMode} from '../../../foundation/discovery/theme-imports.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, {recursive: true, force: true});
});

const tmpApp = () => {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-color-modes-')),
  );
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
  return dir;
};

describe('theme build of a one-mode theme', () => {
  it('writes the colorModes export beside the theme, and the module still loads as a theme module', async () => {
    const dir = tmpApp();
    fs.writeFileSync(
      path.join(dir, 'ownTheme.ts'),
      "export const colorModes = ['light'];\nexport const ownTheme = {name: 'own', tokens: {}};\nexport default ownTheme;\n",
    );
    const r = await runCli(['--json', 'theme', 'build', 'ownTheme.ts'], {
      cwd: dir,
    });
    expect(r.status, r.stdout).toBe(0);
    const js = fs.readFileSync(path.join(dir, 'own.js'), 'utf8');
    expect(js).toContain('export const colorModes = ["light"];');
    expect(fs.readFileSync(path.join(dir, 'own.d.ts'), 'utf8')).toContain(
      'export declare const colorModes: readonly ["light"];',
    );
    // The loaders a built module meets read it as before: its theme export
    // is proved, and the extra export reads as the mode.
    const name = /export const (\w+) = \{/.exec(js)?.[1] ?? '';
    expect(name).not.toBe('colorModes');
    expect(moduleExportsName(path.join(dir, 'own.js'), name)).toBe(true);
    expect(builtColorMode(path.join(dir, 'own.js'))).toEqual({mode: 'light'});
    // And it is current to a check.
    const check = await runCli(
      ['--json', 'theme', 'build', 'ownTheme.ts', '--check'],
      {cwd: dir},
    );
    expect(JSON.parse(check.stdout).data.upToDate).toBe(true);
  });

  it('a source with both modes builds the module exactly as before', async () => {
    const dir = tmpApp();
    fs.writeFileSync(
      path.join(dir, 'ownTheme.ts'),
      "export const ownTheme = {name: 'own', tokens: {}};\nexport default ownTheme;\n",
    );
    const r = await runCli(['--json', 'theme', 'build', 'ownTheme.ts'], {
      cwd: dir,
    });
    expect(r.status, r.stdout).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'own.js'), 'utf8')).not.toContain(
      'colorModes',
    );
    expect(fs.readFileSync(path.join(dir, 'own.d.ts'), 'utf8')).not.toContain(
      'colorModes',
    );
  });

  it('an ejected fork keeps the export, so its build carries the same mode', async () => {
    const dir = tmpApp();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@acme/themes': '1.0.0'}}),
    );
    const pkg = path.join(dir, 'node_modules/@acme/themes');
    const themeDir = path.join(pkg, 'themes/ocean');
    fs.mkdirSync(themeDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/themes', version: '1.0.0', type: 'module'}),
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {themes: './themes'};\n",
    );
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.doc.mjs'),
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n",
    );
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.ts'),
      "export const colorModes = ['dark'];\nexport const oceanTheme = {name: 'ocean', tokens: {}};\nexport default oceanTheme;\n",
    );
    const ej = await runCli(
      ['--json', 'theme', 'eject', 'ocean', '--package', '@acme/themes'],
      {cwd: dir},
    );
    expect(ej.status, ej.stdout).toBe(0);
    const fork = path.join(dir, 'src/themes/ocean');
    expect(fs.readFileSync(path.join(fork, 'oceanTheme.ts'), 'utf8')).toContain(
      "export const colorModes = ['dark'];",
    );
    const b = await runCli(
      ['--json', 'theme', 'build', 'src/themes/ocean/oceanTheme.ts'],
      {cwd: dir},
    );
    expect(b.status, b.stdout).toBe(0);
    expect(builtColorMode(path.join(fork, 'ocean.js'))).toEqual({mode: 'dark'});
  });
});
