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
import {themeAdd} from '../theme/add/add.mjs';
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
  await themeEditNew('roomy', {cwd, like: 'neutral'});
  await themeEditSet('roomy', 'spacing', 'roomy', {cwd, on: 'card'});
  await themeEditSet('roomy', 'corners', 'pill', {cwd, on: 'card'});
  await themeEditNew('outlined', {cwd, like: 'neutral'});
  await themeEditSet('outlined', 'surfaces', 'outlined', {cwd});
  await themeEditSet('outlined', 'border-color', '#ff0000', {
    cwd,
    on: 'card',
    when: 'variant:muted',
  });
}, 240_000);

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
    const lines = text.stdout
      .trim()
      .split('\n')
      .filter(line => line !== '');
    expect(lines[0]).toMatch(
      /^card in brand \(editor theme\), at rest: \d+ values$/,
    );
    expect(lines.length).toBeLessThanOrEqual(16);
    expect(text.stdout).toMatch(
      /^border-radius +\S+ - --radius-container - theme - dial$/m,
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

  it('credits a value a part-scoped dial sets to the theme’s dial, not to Core', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('roomy', {cwd, on: 'card'})
    );
    const pad = valueOf(r, 'padding-top');
    expect(pad).toMatchObject({source: 'theme', via: 'dial'});
    expect(pad.tokens).toContain('--spacing-4');
    // The spacing token the dial sets on the card, also named as the dial's.
    expect(valueOf(r, '--spacing-4')).toMatchObject({
      source: 'theme',
      via: 'dial',
    });
    // Inside the card the dial's value shows, not the whole-theme value.
    const base = /** @type {any} */ (
      await themeEditShow('neutral', {cwd, on: 'card'})
    );
    const plain = valueOf(base, 'padding-top') ?? valueOf(base, 'padding');
    expect(plain).toBeDefined();
    expect(pad.value).not.toBe(plain.value);
    // A dial that writes a property on the part (corners writes the card's
    // border-radius) is named as the dial too.
    expect(valueOf(r, 'border-radius')).toMatchObject({
      source: 'theme',
      via: 'dial',
    });
    // A token the dials leave alone stays the base's.
    expect(valueOf(r, 'background-color')).toMatchObject({
      source: 'base',
      via: 'token',
    });
  }, 120_000);

  it('credits the card rules a whole-theme dial writes to that dial, and a variant’s own property setting to the part', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('outlined', {cwd, on: 'card'})
    );
    // `surfaces outlined` writes the card's own border and shadow rules.
    const ruled = r.data.values.filter(
      (/** @type {any} */ v) =>
        v.when == null &&
        v.state == null &&
        v.source === 'theme' &&
        /^(border-style|border-width|border-color|box-shadow)$/.test(
          v.property,
        ),
    );
    expect(ruled.length).toBeGreaterThan(0);
    for (const v of ruled) expect(v.via).toBe('dial');
    // A border color set on the card for one variant is that variant's
    // rule on the part; the card at rest still shows the dial's.
    expect(valueOf(r, 'border-color')).toMatchObject({
      source: 'theme',
      via: 'dial',
    });
    expect(valueOf(r, 'border-color', 'variant:muted')).toMatchObject({
      value: '#ff0000',
      source: 'theme',
      via: 'part',
    });
  }, 120_000);

  it('gives a button’s corner radius once, not once per corner', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('neutral', {cwd, on: 'button'})
    );
    expect(r.data.kind).toBe('bundled');
    const corners = r.data.values.filter(
      (/** @type {any} */ v) =>
        v.when == null && v.state == null && /radius$/.test(v.property),
    );
    expect(corners.map((/** @type {any} */ v) => v.property)).toEqual([
      'border-radius',
    ]);
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

describe('show --on: a theme slug two installed packages provide', () => {
  /** @type {string} */
  let dir;

  /**
   * An installed integration package that provides one theme, `ocean`.
   * @param {string} name
   * @param {string} radius the theme's container corners
   */
  function installOcean(name, radius) {
    const pkg = path.join(
      path.dirname(dir),
      'node_modules',
      ...name.split('/'),
    );
    const themeDir = path.join(pkg, 'themes', 'ocean');
    fs.mkdirSync(themeDir, {recursive: true});
    fs.mkdirSync(path.join(pkg, 'dist'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        type: 'module',
        exports: {
          './themes/ocean': './dist/ocean.js',
          './themes/ocean.css': './dist/ocean.css',
        },
      }),
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {themes: './themes'};\n",
    );
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.doc.mjs'),
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'An installed theme.', maintained: true};\n",
    );
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.ts'),
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({name: 'ocean', tokens: {'--radius-container': '${radius}'}});\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'dist', 'ocean.js'),
      `export const oceanTheme = {name: 'ocean', tokens: {'--radius-container': '${radius}'}};\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'dist', 'ocean.css'),
      '[data-astryx-theme="ocean"] {}\n',
    );
  }

  beforeAll(() => {
    dir = makeLinkedFixture('astryx-theme-show-part-shared-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(dir, 'neutral');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    manifest.dependencies = {
      ...manifest.dependencies,
      '@acme/sea': '1.0.0',
      '@acme/lake': '1.0.0',
    };
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    installOcean('@acme/sea', '3px');
    installOcean('@acme/lake', '5px');
  });

  afterAll(() => {
    removeLinkedFixture(dir);
  });

  it('is refused while the app records neither, with a theme add for each package', async () => {
    const r = await refusal(() =>
      themeEditShow('ocean', {cwd: dir, on: 'card'}),
    );
    expect(r.code).toBe('ERR_AMBIGUOUS_THEME');
    expect(r.message).toMatch(/more than one package/);
    expect(r.run).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/theme add ocean --package @acme\/sea$/),
        expect.stringMatching(/theme add ocean --package @acme\/lake$/),
      ]),
    );
  }, 120_000);

  it('reads the package the app records', async () => {
    await themeAdd('ocean', {cwd: dir, import: true, package: '@acme/lake'});
    const r = /** @type {any} */ (
      await themeEditShow('ocean', {cwd: dir, on: 'card'})
    );
    expect(r.data.kind).toBe('package');
    expect(valueOf(r, 'border-radius')).toMatchObject({
      value: '5px',
      source: 'theme',
    });
  }, 120_000);
});
