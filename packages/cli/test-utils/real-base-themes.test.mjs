// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for installing the bundled themes in a linked fixture.
 * @input Fixtures that makeLinkedFixture makes, and theme folders the tests
 *   make in the OS temp directory.
 * @output What the fixture gets, and that the repository's theme packages,
 *   their builds and the CLI's own links stay as they were.
 * @position Test support for the theme editor suites, which install real
 *   base themes in parallel workers.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {FIXTURE_PACKAGES} from './base-theme-fixture.mjs';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';
import {installRealBaseThemes} from './real-base-themes.mjs';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const THEMES = path.resolve(CLI_ROOT, '../themes');
const CLI_SCOPE = path.join(CLI_ROOT, 'node_modules/@astryxdesign');

/**
 * Every file under each theme package's `dist`, with its modification time:
 * the build outputs a test must never write.
 */
function themeBuilds() {
  /** @type {string[]} */
  const out = [];
  for (const theme of fs.readdirSync(THEMES).sort()) {
    const dist = path.join(THEMES, theme, 'dist');
    if (!fs.existsSync(dist)) continue;
    for (const file of fs
      .readdirSync(dist, {recursive: true})
      .map(String)
      .sort()) {
      const stat = fs.statSync(path.join(dist, file));
      out.push(`${theme}/dist/${file} ${stat.mtimeMs}`);
    }
  }
  return out;
}

/** The CLI's own scope: each entry and what it links to. */
function cliScope() {
  return fs
    .readdirSync(CLI_SCOPE)
    .sort()
    .map(entry => {
      const file = path.join(CLI_SCOPE, entry);
      return fs.lstatSync(file).isSymbolicLink()
        ? `${entry} -> ${fs.readlinkSync(file)}`
        : `${entry} (folder)`;
    });
}

/** @type {string[]} */
const fixtures = [];
/** @type {string[]} */
const temps = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) removeLinkedFixture(dir);
  for (const dir of temps.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string[]} packages */
function fixture(packages) {
  const dir = makeLinkedFixture('astryx-real-base-themes-', packages);
  fixtures.push(dir);
  return dir;
}

/** The installed theme in a fixture, resolved past links. */
function installed(cwd, like) {
  return path.join(
    path.dirname(cwd),
    'node_modules/@astryxdesign',
    `theme-${like}`,
  );
}

describe('installRealBaseThemes', () => {
  it("leaves theme builds and the CLI's links unchanged, with two fixtures installing at once", async () => {
    const builds = themeBuilds();
    const scope = cliScope();
    const [a, b] = [fixture(FIXTURE_PACKAGES), fixture(FIXTURE_PACKAGES)];
    expect(
      await Promise.all([
        installRealBaseThemes(a, ['neutral']),
        installRealBaseThemes(b, ['neutral']),
      ]),
    ).toEqual(['', '']);
    for (const cwd of [a, b]) {
      const dist = path.join(installed(cwd, 'neutral'), 'dist');
      expect(fs.existsSync(path.join(dist, 'neutral.js'))).toBe(true);
      expect(fs.existsSync(path.join(dist, 'icons.mjs'))).toBe(true);
    }
    expect(themeBuilds()).toEqual(builds);
    expect(cliScope()).toEqual(scope);
  }, 600_000);

  it("leaves the CLI's own scope as it was when the fixture links the whole scope", async () => {
    const builds = themeBuilds();
    const scope = cliScope();
    const cwd = fixture(['@astryxdesign', 'react', 'react-dom']);
    expect(await installRealBaseThemes(cwd, ['neutral'])).toBe('');
    const theme = installed(cwd, 'neutral');
    expect(fs.existsSync(path.join(theme, 'dist', 'icons.mjs'))).toBe(true);
    // The fixture's scope is its own: the theme it installed is not in the
    // CLI's folder, and Core still resolves to the CLI's Core.
    expect(fs.realpathSync(path.dirname(theme))).not.toBe(
      fs.realpathSync(CLI_SCOPE),
    );
    expect(
      fs.realpathSync(
        path.join(path.dirname(cwd), 'node_modules/@astryxdesign/core'),
      ),
    ).toBe(fs.realpathSync(path.join(CLI_SCOPE, 'core')));
    expect(cliScope()).toEqual(scope);
    expect(themeBuilds()).toEqual(builds);
  }, 600_000);

  it('links a theme package only when its build is complete', async () => {
    const themes = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-themes-'));
    temps.push(themes);
    // A build that stopped after the theme step: the module is there, the
    // icon registry it imports is not.
    const half = path.join(themes, 'half');
    fs.mkdirSync(path.join(half, 'dist'), {recursive: true});
    fs.writeFileSync(path.join(half, 'package.json'), '{"name":"half"}\n');
    fs.writeFileSync(
      path.join(half, 'dist', 'half.js'),
      'import {halfIconRegistry} from "./icons.mjs";\n',
    );
    const whole = path.join(themes, 'whole');
    fs.mkdirSync(path.join(whole, 'dist'), {recursive: true});
    fs.writeFileSync(path.join(whole, 'package.json'), '{"name":"whole"}\n');
    fs.writeFileSync(path.join(whole, 'dist', 'whole.js'), 'export {};\n');
    fs.writeFileSync(path.join(whole, 'dist', 'icons.mjs'), 'export {};\n');

    const cwd = fixture(FIXTURE_PACKAGES);
    // The half-built theme has no source to build from, so it is refused
    // rather than linked.
    expect(await installRealBaseThemes(cwd, ['half'], {themes})).toMatch(
      /the half theme could not be built here/,
    );
    expect(fs.existsSync(installed(cwd, 'half'))).toBe(false);
    // A name with no package is refused without writing anything.
    expect(await installRealBaseThemes(cwd, ['none'], {themes})).toMatch(
      /the none theme could not be built here: no package/,
    );
    expect(fs.existsSync(path.join(themes, 'none'))).toBe(false);
    // A failed build leaves no build folder behind.
    expect(
      fs.readdirSync(path.join(half, 'node_modules/.astryx-test-built')),
    ).toEqual([]);
    expect(await installRealBaseThemes(cwd, ['whole'], {themes})).toBe('');
    expect(fs.realpathSync(installed(cwd, 'whole'))).toBe(
      fs.realpathSync(whole),
    );
  });

  it('builds a theme again when its build is older than its source', async () => {
    const themes = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-themes-'));
    temps.push(themes);
    // A copy of the neutral package whose build predates its source.
    const own = path.join(themes, 'neutral');
    fs.cpSync(path.join(THEMES, 'neutral', 'src'), path.join(own, 'src'), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(THEMES, 'neutral', 'package.json'),
      path.join(own, 'package.json'),
    );
    // (A folder of its own, whose entries link to the package's: the build
    // writes its scratch output there.)
    const deps = fs.realpathSync(path.join(THEMES, 'neutral', 'node_modules'));
    fs.mkdirSync(path.join(own, 'node_modules'));
    for (const entry of fs.readdirSync(deps)) {
      if (entry.startsWith('.')) continue;
      fs.symlinkSync(
        fs.realpathSync(path.join(deps, entry)),
        path.join(own, 'node_modules', entry),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    fs.mkdirSync(path.join(own, 'dist'));
    fs.writeFileSync(path.join(own, 'dist', 'neutral.js'), '// stale\n');
    const long = new Date(Date.now() - 86_400_000);
    fs.utimesSync(path.join(own, 'dist', 'neutral.js'), long, long);

    const stale = fixture(FIXTURE_PACKAGES);
    expect(await installRealBaseThemes(stale, ['neutral'], {themes})).toBe('');
    // The fixture gets a build made from the source, never the stale one.
    expect(fs.realpathSync(installed(stale, 'neutral'))).not.toBe(
      fs.realpathSync(own),
    );
    expect(
      fs.readFileSync(
        path.join(installed(stale, 'neutral'), 'dist', 'neutral.js'),
        'utf8',
      ),
    ).not.toBe('// stale\n');

    // A build newer than every source file is linked as it is.
    const now = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(own, 'dist', 'neutral.js'), now, now);
    const fresh = fixture(FIXTURE_PACKAGES);
    expect(await installRealBaseThemes(fresh, ['neutral'], {themes})).toBe('');
    expect(fs.realpathSync(installed(fresh, 'neutral'))).toBe(
      fs.realpathSync(own),
    );
  }, 600_000);
});
