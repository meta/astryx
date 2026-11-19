// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `show <theme> --on <part>`: what one part of a theme shows, as a
 * lookup that writes nothing. Each property's final value per mode, the
 * declaration that gives it, the tokens it reads, and who decides it, for an
 * editor theme and for a local theme alike.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-show-part-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('brand', {cwd, like: 'neutral'});
  await themeEditSet('brand', 'corners', 'pill', {cwd});
  await themeEditSet('brand', 'padding', '24px', {cwd, on: 'card'});
}, 180_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * Every file under a folder, with its bytes, as one text.
 * @param {string} dir
 */
function snapshot(dir) {
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir, {recursive: true})
    .map(String)
    .sort()
    .map(rel => {
      const at = path.join(dir, rel);
      return fs.statSync(at).isFile()
        ? `${rel}:${fs.readFileSync(at).toString('base64')}`
        : rel;
    })
    .join('\n');
}

/**
 * @param {any} r
 * @param {string} property
 * @param {string | null} [when]
 */
const valueOf = (r, property, when = null) =>
  r.data.values.find(
    (/** @type {any} */ v) =>
      v.property === property && v.when === when && v.state == null,
  );

describe('show --on: what one part of a theme shows', () => {
  it('gives each property of an editor theme’s part with its value, tokens and who decides it, and writes nothing', async () => {
    const before = [
      snapshot(path.join(cwd, 'themes')),
      snapshot(path.join(cwd, 'src')),
    ];
    const r = /** @type {any} */ (
      await themeEditShow('brand', {cwd, on: 'card'})
    );
    expect(r.type).toBe('themeEdit.showPart');
    expect(r.data).toMatchObject({
      theme: 'brand',
      kind: 'editor',
      part: 'card',
    });
    // The padding setting on the part: what shows on every side.
    expect(valueOf(r, 'padding-block-start')).toMatchObject({
      value: '24px',
      source: 'theme',
      via: 'part',
    });
    // The base's padding shorthand, which the theme's sides overwrite,
    // shows nothing of its own.
    expect(valueOf(r, 'padding')).toBeUndefined();
    // The corners dial writes the radius token the part reads.
    expect(valueOf(r, 'border-radius')).toMatchObject({
      expression: 'var(--radius-container)',
      tokens: ['--radius-container'],
      source: 'theme',
      via: 'dial',
    });
    // A token the base sets, with a value per mode.
    const fill = valueOf(r, 'background-color');
    expect(fill.source).toBe('base');
    expect(fill.via).toBe('token');
    expect(fill.value).toEqual({
      light: expect.any(String),
      dark: expect.any(String),
    });
    // No value keeps a var() in it.
    for (const v of r.data.values)
      expect(JSON.stringify(v.value)).not.toMatch(/var\(/);
    expect([
      snapshot(path.join(cwd, 'themes')),
      snapshot(path.join(cwd, 'src')),
    ]).toEqual(before);
  }, 120_000);

  it('reads a local theme the way theme build loads it, with no editor theme of that name', async () => {
    // The editor's app copy is a standard local theme: with the editor's
    // folder gone, the name is the local theme's.
    const editorDir = path.join(cwd, 'themes', 'brand');
    const aside = path.join(cwd, 'brand-aside');
    fs.renameSync(editorDir, aside);
    try {
      const r = /** @type {any} */ (
        await themeEditShow('brand', {cwd, on: 'card'})
      );
      expect(r.data.kind).toBe('local');
      expect(valueOf(r, 'padding-block-start')).toMatchObject({
        value: '24px',
        source: 'theme',
        via: 'part',
      });
      expect(valueOf(r, 'border-radius')).toMatchObject({
        source: 'theme',
        via: 'token',
      });
    } finally {
      fs.renameSync(aside, editorDir);
    }
  }, 120_000);

  it('prints the part at rest in a few lines, and --json carries every value', async () => {
    const text = await runCli(
      ['experimental', 'theme', 'editor', 'show', 'brand', '--on', 'card'],
      {cwd},
    );
    expect(text.code).toBe(0);
    const lines = text.stdout.trim().split('\n');
    expect(lines[0]).toMatch(
      /^card in brand \(editor theme\): \d+ values at rest/,
    );
    expect(lines.length).toBeLessThanOrEqual(16);
    expect(text.stdout).toMatch(
      /border-radius: \S+ \(var\(--radius-container\), theme dial\)/,
    );
    const json = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'show',
        'brand',
        '--on',
        'card',
      ],
      {cwd},
    );
    const r = JSON.parse(json.stdout);
    expect(r.type).toBe('themeEdit.showPart');
    expect(r.data.values.length).toBeGreaterThan(lines.length);
  }, 120_000);

  it('refuses a group, a name that is no part, and the page options beside --on', async () => {
    expect(
      await refusal(() => themeEditShow('brand', {cwd, on: 'nope'})),
    ).toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
    const group = await refusal(() =>
      themeEditShow('brand', {cwd, on: 'containers'}),
    );
    expect(group.code).toBe('ERR_INVALID_ARGUMENT');
    expect(group.message).toMatch(/is a group/);
    expect(
      await refusal(() => themeEditShow('brand', {cwd, on: 'card', png: true})),
    ).toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      run: [expect.stringMatching(/show brand --on card$/)],
    });
    expect(
      await refusal(() => themeEditShow('nothing-here', {cwd, on: 'card'})),
    ).toMatchObject({code: 'ERR_UNKNOWN_THEME'});
  }, 120_000);
});
