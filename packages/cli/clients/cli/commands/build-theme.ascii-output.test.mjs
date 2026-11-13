// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Human output of the `theme` command group stays plain ASCII.
 *
 * Covers every theme-build line family that carried a glyph or typographic
 * punctuation: success, warning, error, notice, and font-help lines of a
 * standalone build; `--check` in both states; a batch build and check; a
 * family build and check; the quoted-glob suggestion; and a palette preview.
 * Each case also asserts its ASCII marker, so a line that stops printing
 * cannot pass the ASCII check vacuously.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';

const OCEAN = `import {defineTheme} from '@astryxdesign/core/theme';
export const oceanTheme = defineTheme({
  name: 'ocean',
  typography: {body: {family: 'Inter'}},
  tokens: {'--color-background-body': '#ffffff'},
  components: {
    progressbar: {base: {color: 'red'}},
  },
});
`;
// A theme the build refuses: it sets a private var.
const PRIVATE = `import {defineTheme} from '@astryxdesign/core/theme';
export const pvTheme = defineTheme({
  name: 'pv',
  components: {button: {base: {'--_button-radius': '2px'}}},
});
`;
const CALM = `import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from './ocean.mjs';
export const oceanCalmTheme = defineTheme({
  name: 'ocean-calm',
  extends: oceanTheme,
  tokens: {'--color-background-body': '#eeeeee'},
});
`;

/** @type {string} */
let dir;

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

beforeEach(() => {
  dir = makeLinkedFixture('astryx-theme-ascii-', ['@astryxdesign']);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(dir, 'ocean.mjs'), OCEAN);
  fs.writeFileSync(path.join(dir, 'ocean-calm.mjs'), CALM);
  fs.writeFileSync(path.join(dir, 'pv.mjs'), PRIVATE);
});

afterEach(() => {
  removeLinkedFixture(dir);
});

/** @param {{stdout: string, stderr: string}} result */
function nonAscii(result) {
  return [
    ...new Set(`${result.stdout}${result.stderr}`.match(/[\u0080-\uffff]/g)),
  ];
}

/** @param {string[]} args */
function run(args) {
  return runCli(['theme', ...args], dir);
}

describe('theme command human output is plain ASCII', () => {
  it('a private-variable build is refused, writes nothing, and exits 1', async () => {
    const refused = await run(['build', 'pv.mjs']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('--_button-radius');
    expect(refused.stdout).not.toContain('[ok]');
    expect(fs.existsSync(path.join(dir, 'pv.css'))).toBe(false);
    expect(nonAscii(refused)).toEqual([]);

    const short = await run(['build', 'ocean.mjs']);
    expect(short.code).toBe(0);
    expect(short.stdout).toContain(
      '[note] Fonts named but not loaded: "Inter"',
    );
    expect(nonAscii(short)).toEqual([]);

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', 'ocean.mjs'],
      dir,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('[ok] ocean.css');
    expect(result.stderr).toContain('[warn] Unknown component "progressbar"');
    expect(result.stdout).toContain('note: Font "Inter"');
    expect(result.stdout).toContain('[note] Theme "ocean" names fonts');
    expect(nonAscii(result)).toEqual([]);
  });

  it('JSON build and check give their receipts; a private var gives an error envelope', async () => {
    const refused = await runCli(['--json', 'theme', 'build', 'pv.mjs'], dir);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      code: 'ERR_THEME_INVALID',
    });

    const built = await runCli(['--json', 'theme', 'build', 'ocean.mjs'], dir);
    expect(built.code).toBe(0);
    expect(built.stderr).toBe('');
    const receipt = JSON.parse(built.stdout);
    expect(receipt.type).toBe('theme.build');
    expect(receipt.data.name).toBe('ocean');

    const checked = await runCli(
      ['--json', 'theme', 'build', 'ocean.mjs', '--check'],
      dir,
    );
    expect(checked.code).toBe(0);
    expect(checked.stderr).toBe('');
    expect(JSON.parse(checked.stdout)).toMatchObject({
      type: 'theme.build.check',
      data: {name: 'ocean', upToDate: true, stale: []},
    });

    for (const extension of ['css', 'css.d.ts', 'js', 'd.ts']) {
      expect(fs.existsSync(path.join(dir, `ocean.${extension}`))).toBe(true);
    }
  });

  it('--check, up to date and stale', async () => {
    await run(['build', 'ocean.mjs']);
    const upToDate = await run(['build', 'ocean.mjs', '--check']);
    expect(upToDate.code).toBe(0);
    expect(upToDate.stdout).toContain('[ok] Theme outputs are up to date');
    expect(nonAscii(upToDate)).toEqual([]);

    fs.appendFileSync(path.join(dir, 'ocean.css'), '/* drift */\n');
    const stale = await run(['build', 'ocean.mjs', '--check']);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('[fail] 1 theme output(s) are out of date');
    expect(nonAscii(stale)).toEqual([]);
  });

  it('a batch build and check', async () => {
    const built = await run(['build', 'ocean.mjs', 'ocean-calm.mjs']);
    expect(built.code).toBe(0);
    expect(built.stdout).toContain('[ok] Built 2 themes.');
    expect(nonAscii(built)).toEqual([]);

    const checked = await run([
      'build',
      'ocean.mjs',
      'ocean-calm.mjs',
      '--check',
    ]);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain('[ok] Checked 2 themes.');
    expect(nonAscii(checked)).toEqual([]);
  });

  it('a family refusal names the member that sets a private var', async () => {
    const r = await run([
      'build',
      '--family',
      'ocean.mjs',
      'pv.mjs',
      '--family-key',
      'f',
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('pv.mjs: ');
    expect(r.stderr).toContain('--_button-radius');
    expect(fs.existsSync(path.join(dir, 'f.css'))).toBe(false);
    expect(nonAscii(r)).toEqual([]);
  });

  it('a family build and a stale family check', async () => {
    const familyArgs = [
      'build',
      '--family',
      'ocean.mjs',
      'ocean-calm.mjs',
      '--family-key',
      'ocean-family',
    ];
    const built = await run(familyArgs);
    expect(built.code).toBe(0);
    expect(built.stdout).toContain('[ok] ocean-family.css');
    expect(nonAscii(built)).toEqual([]);

    fs.rmSync(path.join(dir, 'ocean-family.js'));
    const stale = await run([...familyArgs, '--check']);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('[fail] 1 theme family output(s)');
    expect(nonAscii(stale)).toEqual([]);
  });

  it('the suggestion for a quoted glob', async () => {
    const result = await run(['build', 'themes/*.mjs']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('globs are expanded by your shell');
    expect(nonAscii(result)).toEqual([]);
  });

  it('a palette candidate preview', async () => {
    fs.writeFileSync(
      path.join(dir, 'palette.config.json'),
      JSON.stringify({
        modeStrategy: 'dark-only',
        stops: [10, 50, 90],
        families: [{id: 'blue', seed: '#0074e2'}],
      }),
    );
    const result = await run(['palette', 'generate', 'palette.config.json']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('1 families, 3 stops, dark');
    expect(nonAscii(result)).toEqual([]);
  });
});
