// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt62: the app copy is written around a file of yours at another
 * name, and only a file at one of its names (or a link on the way) stops it,
 * said in every result; its font stylesheet is always there; compile writes
 * the whole copy; eject and a path get true answers; `new` takes only names
 * the theme commands take.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt62-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args */
const cli = args =>
  spawnSync(process.execPath, [BIN, ...args], {cwd, encoding: 'utf8'});

describe('hunt62: what stops the app copy', () => {
  it('a file of yours at another name stays, and the copy is written around it', async () => {
    await themeEditNew('a', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/a/notes.md'), 'mine');
    const before = read('src/themes/a/a.css');
    const r = await themeEditSet('a', 'corners', 'pill', {cwd});
    expect(read('src/themes/a/a.css')).not.toBe(before);
    expect(read('src/themes/a/notes.md')).toBe('mine');
    expect(/** @type {any} */ (r.data).appCopyStale).toBeUndefined();
  }, 240_000);

  it('a file of yours at a copy name stops it, and every result says so', async () => {
    await themeEditNew('b', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/b/bTheme.ts'), '// mine\n');
    const before = read('src/themes/b/b.css');
    const r = await themeEditSet('b', 'corners', 'pill', {cwd});
    expect(read('src/themes/b/b.css')).toBe(before);
    expect(read('src/themes/b/bTheme.ts')).toBe('// mine\n');
    expect(/** @type {any} */ (r.data).appCopyStale).toContain(
      'src/themes/b/bTheme.ts is yours',
    );
    const shown = await themeEditShow('b', {cwd});
    expect(/** @type {any} */ (shown.data).appCopyStale).toContain(
      'was not updated',
    );
    expect(/** @type {any} */ (shown.data).wiring.join('\n')).toContain(
      'the app copy in src/themes/b/ was not updated: src/themes/b/bTheme.ts is yours',
    );
  }, 240_000);

  it('a link on the way to the copy stops it', async () => {
    await themeEditNew('c', {cwd});
    const outside = fs.mkdtempSync(path.join(path.dirname(cwd), 'out-'));
    fs.rmSync(path.join(cwd, 'src/themes'), {recursive: true, force: true});
    fs.symlinkSync(outside, path.join(cwd, 'src/themes'), 'dir');
    try {
      const r = await themeEditSet('c', 'corners', 'pill', {cwd});
      expect(/** @type {any} */ (r.data).appCopyStale).toContain(
        'src/themes is a link',
      );
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(path.join(cwd, 'src/themes'), {force: true});
      fs.mkdirSync(path.join(cwd, 'src/themes'));
    }
  }, 240_000);
});

describe('hunt62: the font stylesheet is always there', () => {
  it('stays when the theme stops loading fonts, and after base none', async () => {
    await themeEditNew('f', {cwd, like: 'neutral'});
    const fonts = 'src/themes/f/f.fonts.css';
    expect(fs.existsSync(path.join(cwd, fonts))).toBe(true);
    await themeEditSet('f', 'font', 'system', {cwd});
    expect(fs.existsSync(path.join(cwd, fonts))).toBe(true);
    await themeEditSet('f', 'base', 'none', {cwd});
    expect(read(fonts)).toContain('No font stylesheets');
  }, 240_000);

  it('compile writes the whole copy back, the font stylesheet too', async () => {
    await themeEditNew('g', {cwd, like: 'neutral'});
    fs.rmSync(path.join(cwd, 'src/themes/g'), {recursive: true});
    const r = cli(['experimental', 'theme', 'compile', 'themes/g/g.theme.ts']);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(cwd, 'src/themes/g/g.fonts.css'))).toBe(
      true,
    );
  }, 240_000);
});

describe('hunt62: true answers from the package commands and new', () => {
  it('eject says an editor theme has nothing to eject', async () => {
    const r = cli(['experimental', 'theme', 'eject', 'a']);
    expect(r.stderr + r.stdout).toContain('its source is yours already');
  }, 120_000);

  it('a path names the theme', async () => {
    await themeEditShow('a', {cwd});
    const r = cli(['experimental', 'theme', 'use', 'themes/a']);
    expect(r.stderr + r.stdout).toContain(
      "the theme commands take the theme's name: a",
    );
  }, 120_000);

  it.each([
    ['a--b', 'a-b'],
    ['b-', 'b'],
  ])(
    'new %s is refused, suggesting %s',
    async (bad, good) => {
      const err = await refusal(() => themeEditNew(bad, {cwd}));
      expect(err.message).toContain('not a theme name the theme commands take');
      expect(err.run.join('\n')).toContain(` new ${good}`);
    },
    120_000,
  );
});
