// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme build that stops because a package the CLI loads is broken
 *   in node_modules (it needs a package it declares, and that package is
 *   missing) is refused as the broken install it is: the missing package,
 *   the package that needs it and the app's install command, with
 *   ERR_DEP_MISSING. It is never "the theme did not build".
 *
 * The broken package is real: a resolve hook in a real subprocess hands the
 * build's transform package a package in node_modules whose declared
 * dependency is not installed, so Node words the failure as it would for a
 * user's broken install.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installDependenciesCommand} from '../../foundation/env/package-manager.mjs';

const BIN = fileURLToPath(
  new URL('../../clients/cli/bin/astryx.mjs', import.meta.url),
);
const T = 240_000;

/** @type {string} */
let cwd;
/** @type {string} */
let register;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-build-broken-install-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  // An installed package that declares a dependency nobody installed.
  const broken = path.join(cwd, 'node_modules', 'broken-transform');
  fs.mkdirSync(broken, {recursive: true});
  fs.writeFileSync(
    path.join(broken, 'package.json'),
    JSON.stringify({
      name: 'broken-transform',
      main: 'main.js',
      dependencies: {'absent-helper': '1.0.0'},
    }),
  );
  fs.writeFileSync(
    path.join(broken, 'main.js'),
    "module.exports = require('absent-helper');\n",
  );
  const hooks = path.join(cwd, 'hooks.mjs');
  fs.writeFileSync(
    hooks,
    [
      `const broken = ${JSON.stringify(pathToFileURL(path.join(broken, 'main.js')).href)};`,
      'export async function resolve(specifier, context, nextResolve) {',
      "  if (specifier === 'jscodeshift' && context.parentURL?.includes('/api/theme/'))",
      "    return {url: broken, format: 'commonjs', shortCircuit: true};",
      '  return nextResolve(specifier, context);',
      '}',
      '',
    ].join('\n'),
  );
  register = path.join(cwd, 'register.mjs');
  fs.writeFileSync(
    register,
    `import {register} from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`,
  );
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
function run(args) {
  const res = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(register).href, BIN, ...args],
    {cwd, encoding: 'utf-8', timeout: T, env: {...process.env, CI: '1'}},
  );
  return {status: res.status, stdout: res.stdout, stderr: res.stderr};
}

describe('a theme build on a broken install', () => {
  it(
    'names the missing package, the package that needs it and the install, in --json and text',
    () => {
      const install = installDependenciesCommand(cwd);
      const json = run([
        'experimental',
        'theme',
        'editor',
        'new',
        'brand',
        '--like',
        'neutral',
        '--json',
      ]);
      expect(json.status, json.stdout + json.stderr).toBe(1);
      const envelope = JSON.parse(json.stdout);
      expect(envelope.code).toBe('ERR_DEP_MISSING');
      expect(envelope.error).toContain(
        'broken-transform needs absent-helper, which is missing or incomplete in node_modules',
      );
      expect(envelope.error).toContain(`Run ${install}`);
      expect(envelope.error).toContain('Nothing was changed.');
      expect(envelope.error).not.toMatch(/did not build|Require stack/);
      expect(envelope.suggestions).toEqual([
        {
          name: install,
          reason:
            "install the app's packages again: broken-transform needs absent-helper",
        },
      ]);
      expect(fs.existsSync(path.join(cwd, 'themes', 'brand'))).toBe(false);

      const text = run([
        'experimental',
        'theme',
        'editor',
        'new',
        'brand',
        '--like',
        'neutral',
      ]);
      expect(text.status).toBe(1);
      expect(text.stderr).toContain('broken-transform needs absent-helper');
      expect(text.stderr).not.toMatch(/did not build|editor show/);
    },
    T,
  );
});
