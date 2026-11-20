// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build` through a CLI installed for the computer, which has no
 * Core beside it, writes the same outputs as a CLI that has one: it reads the
 * component docs and types of the project's Core, which it builds with, and
 * the module it writes names the build command without the command that ran
 * it.
 */

import {afterAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  globalCli,
  recyclePlacedCopies,
} from '../../../test-utils/global-local-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '../../..');
const REPO_ROOT = path.resolve(CLI_ROOT, '../..');
const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

/** @type {string[]} */
const dirs = [];

afterAll(() => {
  recyclePlacedCopies();
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} prefix */
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe('theme build through a CLI installed for the computer', () => {
  it("declares the theme's custom variants from the project's Core, and names the build command alone", () => {
    const home = tempDir('astryx-build-home-');
    const g = globalCli('npm', CLI_VERSION, {root: home, withoutCore: true});
    const app = tempDir('astryx-build-app-');
    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        type: 'module',
        dependencies: {'@astryxdesign/core': CLI_VERSION},
      }),
    );
    fs.mkdirSync(path.join(app, 'node_modules', '@astryxdesign'), {
      recursive: true,
    });
    fs.symlinkSync(
      path.join(REPO_ROOT, 'packages/core'),
      path.join(app, 'node_modules', '@astryxdesign', 'core'),
      'dir',
    );
    fs.writeFileSync(
      path.join(app, 'ocean.mjs'),
      "export default {name: 'ocean', tokens: {}, components: {badge: {'variant:gilded': {backgroundColor: 'goldenrod'}}}};\n",
    );

    const result = spawnSync(
      process.execPath,
      [g.bin, 'theme', 'build', 'ocean.mjs'],
      {
        cwd: app,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          PATH: path.dirname(process.execPath),
          HOME: home,
          USERPROFILE: home,
          XDG_CACHE_HOME: path.join(home, '.cache'),
          XDG_CONFIG_HOME: path.join(home, '.config'),
          npm_config_registry: 'http://127.0.0.1:9/',
          npm_config_update_notifier: 'false',
          NO_COLOR: '1',
        },
      },
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
    const variants = path.join(app, 'ocean.variants.d.ts');
    expect(fs.existsSync(variants)).toBe(true);
    expect(fs.readFileSync(variants, 'utf8')).toMatch(
      /declare module '@astryxdesign\/core\/Badge' \{\s+interface BadgeVariantMap \{\s+'gilded': true;/u,
    );
    expect(fs.readFileSync(path.join(app, 'ocean.d.ts'), 'utf8')).toContain(
      '/// <reference path="./ocean.variants.d.ts" />',
    );
    expect(fs.readFileSync(path.join(app, 'ocean.js'), 'utf8')).toContain(
      ' * ocean theme — built by `astryx theme build`\n',
    );
  }, 180_000);
});
