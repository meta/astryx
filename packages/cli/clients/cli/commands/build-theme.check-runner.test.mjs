// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build --check` does not read a theme as out of date when only
 * the package manager that ran the build differs.
 *
 * The built module's doc comment names the command that built it ("built by
 * `pnpm dlx … theme build`"), and that command follows the package manager
 * and host of the run. A theme built with pnpm and checked with npm (a
 * project's CI, for example) has the same outputs in every other line.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
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
const PNPM = 'pnpm/11.10.0 npm/? node/v24.0.0 linux x64';
const NPM = 'npm/10.9.0 node/v24.0.0 linux x64 workspaces/false';

/** @type {string} */
let dir;

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

beforeEach(() => {
  dir = makeLinkedFixture('astryx-theme-check-runner-', ['@astryxdesign']);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(dir, 'ocean.mjs'), OCEAN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeLinkedFixture(dir);
});

describe('theme build --check and the package manager that built the theme', () => {
  it('reads a theme built with pnpm as up to date when npm checks it', async () => {
    vi.stubEnv('npm_config_user_agent', PNPM);
    const built = await runCli(['theme', 'build', 'ocean.mjs'], dir);
    expect(built.code, built.stderr).toBe(0);
    // The module names the command that built it, so this case is not
    // vacuous: the build under npm would write another command here.
    expect(fs.readFileSync(path.join(dir, 'ocean.js'), 'utf8')).toMatch(
      /ocean theme — built by `pnpm .* theme build`/,
    );

    vi.stubEnv('npm_config_user_agent', NPM);
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

  it('still reads any other change to the module as out of date', async () => {
    vi.stubEnv('npm_config_user_agent', PNPM);
    await runCli(['theme', 'build', 'ocean.mjs'], dir);
    fs.appendFileSync(path.join(dir, 'ocean.js'), '// drift\n');
    vi.stubEnv('npm_config_user_agent', NPM);
    const checked = await runCli(
      ['--json', 'theme', 'build', 'ocean.mjs', '--check'],
      dir,
    );
    expect(checked.code).toBe(1);
    expect(JSON.parse(checked.stdout).data.stale).toEqual([
      {path: 'ocean.js', reason: 'outdated'},
    ]);
  }, 120_000);
});
