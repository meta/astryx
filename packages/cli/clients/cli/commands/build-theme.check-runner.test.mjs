// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build --check` does not read a theme or a theme family as out
 * of date when only the command named in its built-by lines differs.
 *
 * A built module's doc comment names the command that built it, once per
 * theme: a family module has one line per member. Outputs that an earlier
 * release built with another command (`pnpm dlx … theme build`, for example)
 * have the same content in every other line.
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
  tokens: {'--color-background-body': '#ffffff'},
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
const FAMILY = [
  'theme',
  'build',
  '--family',
  'ocean.mjs',
  'ocean-calm.mjs',
  '--family-key',
  'ocean-family',
];
const BUILT_BY = / theme — built by `[^`]+ theme build`/g;

/** @type {string} */
let dir;

/** Rewrites every built-by line of `file` to name another command. */
function nameAnotherCommand(file) {
  const target = path.join(dir, file);
  const content = fs.readFileSync(target, 'utf8');
  const lines = content.match(BUILT_BY) ?? [];
  fs.writeFileSync(
    target,
    content.replace(
      BUILT_BY,
      ' theme — built by `pnpm dlx @astryxdesign/cli theme build`',
    ),
  );
  return lines.length;
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

beforeEach(() => {
  dir = makeLinkedFixture('astryx-theme-check-runner-', ['@astryxdesign']);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(dir, 'ocean.mjs'), OCEAN);
  fs.writeFileSync(path.join(dir, 'ocean-calm.mjs'), CALM);
});

afterEach(() => {
  removeLinkedFixture(dir);
});

describe('theme build --check and the command in the built-by lines', () => {
  it('reads a theme as up to date when its built-by line names another command', async () => {
    const built = await runCli(['theme', 'build', 'ocean.mjs'], dir);
    expect(built.code, built.stderr).toBe(0);
    expect(nameAnotherCommand('ocean.js')).toBe(1);

    const checked = await runCli(
      ['--json', 'theme', 'build', 'ocean.mjs', '--check'],
      dir,
    );
    expect(checked.code, checked.stdout + checked.stderr).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({
      type: 'theme.build.check',
      data: {name: 'ocean', upToDate: true, stale: []},
    });
  }, 120_000);

  it('reads a family as up to date when every member line names another command', async () => {
    const built = await runCli(FAMILY, dir);
    expect(built.code, built.stderr).toBe(0);
    expect(nameAnotherCommand('ocean-family.js')).toBe(2);

    const checked = await runCli(['--json', ...FAMILY, '--check'], dir);
    expect(checked.code, checked.stdout + checked.stderr).toBe(0);
  }, 120_000);

  it('still reads a family whose member content changed as out of date', async () => {
    await runCli(FAMILY, dir);
    nameAnotherCommand('ocean-family.js');
    fs.writeFileSync(
      path.join(dir, 'ocean-calm.mjs'),
      CALM.replace('#eeeeee', '#dddddd'),
    );
    const checked = await runCli(['--json', ...FAMILY, '--check'], dir);
    expect(checked.code).toBe(1);
  }, 120_000);

  it('still reads a second built-by line for one theme as out of date', async () => {
    await runCli(['theme', 'build', 'ocean.mjs'], dir);
    const target = path.join(dir, 'ocean.js');
    const content = fs.readFileSync(target, 'utf8');
    const line =
      content.match(/^ \* \S.* theme — built by `[^`]+ theme build`$/mu)?.[0] ??
      '';
    expect(line).not.toBe('');
    fs.writeFileSync(target, content.replace(line, `${line}\n${line}`));
    const checked = await runCli(
      ['--json', 'theme', 'build', 'ocean.mjs', '--check'],
      dir,
    );
    expect(checked.code).toBe(1);
  }, 120_000);
});
