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

  it('credits a property set on the part at rest to the part in every variant row that shows it, beside a whole-theme dial', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('brand', {cwd, on: 'card'})
    );
    // `brand` has the whole-theme dial `corners pill` and `padding 24px`
    // on the card with no --when: each variant row that shows that rest
    // padding comes from the part's own setting, not from the dial.
    const rows = r.data.values.filter(
      (/** @type {any} */ v) =>
        v.when != null &&
        v.property === 'padding-inline-start' &&
        v.value === '24px',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const v of rows)
      expect(v).toMatchObject({source: 'theme', via: 'part'});
  }, 120_000);

  it('writes each variant row’s condition the way set takes it, and marks a condition set cannot name', async () => {
    await themeEditNew('feedback', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditShow('feedback', {cwd, on: 'button'})
    );
    const rows = r.data.values.filter(
      (/** @type {any} */ v) => v.when != null || v.state != null,
    );
    // A CSS-selector condition Core writes (a grouped button's first
    // child) is kept as Core's words and says why set cannot name it.
    const css = rows.find((/** @type {any} */ v) => v.notSettable);
    expect(css).toBeDefined();
    expect(css.state).toBeNull();
    expect(css.notSettable).toMatch(/cannot name|no .* prop or state/);
    // Every other condition goes back to set as it is.
    const settable = rows.find(
      (/** @type {any} */ v) =>
        !v.notSettable &&
        v.when != null &&
        v.state != null &&
        v.property === 'background-color',
    );
    expect(settable).toBeDefined();
    const back = /** @type {any} */ (
      await themeEditSet('feedback', settable.property, '#123456', {
        cwd,
        on: 'button',
        when: settable.when,
        state: settable.state,
      })
    );
    expect(back.type).not.toBe('error');
    const again = /** @type {any} */ (
      await themeEditShow('feedback', {cwd, on: 'button'})
    );
    expect(
      again.data.values.find(
        (/** @type {any} */ v) =>
          v.property === settable.property &&
          v.when === settable.when &&
          v.state === settable.state,
      ),
    ).toMatchObject({value: '#123456', source: 'theme', via: 'part'});
    // One condition reads as one row, whatever order Core writes it in.
    const ids = rows.map((/** @type {any} */ v) =>
      JSON.stringify([v.property, v.when, v.state, v.value, v.expression]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  }, 120_000);

  it('reads a state setting beside a dial as the part’s, once per condition, and a one-mode color into that mode’s value', async () => {
    await themeEditNew('held', {cwd, like: 'neutral'});
    await themeEditSet('held', 'corners', 'pill', {cwd});
    await themeEditSet('held', 'background-color', '#123456', {
      cwd,
      on: 'button',
      state: 'disabled',
    });
    await themeEditSet('held', 'background-color', '#654321', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
      state: 'expanded',
    });
    await themeEditSet('held', 'background-color', '#abcdef', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    const button = /** @type {any} */ (
      await themeEditShow('held', {cwd, on: 'button'})
    );
    /** @param {string | null} when @param {string} state */
    const rowsAt = (when, state) =>
      button.data.values.filter(
        (/** @type {any} */ v) =>
          v.property === 'background-color' &&
          v.when === when &&
          v.state === state,
      );
    // The setting's own --when and --state, beside the corners dial.
    expect(rowsAt(null, 'disabled')).toEqual([
      expect.objectContaining({value: '#123456', source: 'theme', via: 'part'}),
    ]);
    expect(rowsAt('variant:secondary', 'expanded')).toEqual([
      expect.objectContaining({value: '#654321', source: 'theme', via: 'part'}),
    ]);
    const card = /** @type {any} */ (
      await themeEditShow('held', {cwd, on: 'card'})
    );
    // A color for one mode is that mode's value, not a condition. (A card
    // always draws a variant, and the build writes a card fill there.)
    expect(valueOf(card, 'background-color', 'variant:default')).toMatchObject({
      value: {light: '#abcdef', dark: expect.any(String)},
      source: 'theme',
      via: 'part',
    });
    expect(
      card.data.values.some((/** @type {any} */ v) =>
        /@light|@dark/.test(`${v.when} ${v.state}`),
      ),
    ).toBe(false);
  }, 120_000);

  it('shows a one-mode state color as its own row, and a bundled theme’s bare state rule as the state set takes', async () => {
    await themeEditNew('dusk', {cwd, like: 'neutral'});
    await themeEditSet('dusk', 'background-color', '#123456', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'light',
    });
    const r = /** @type {any} */ (
      await themeEditShow('dusk', {cwd, on: 'button'})
    );
    const hover = r.data.values.filter(
      (/** @type {any} */ v) =>
        v.property === 'background-color' && v.state === 'hover',
    );
    // The build writes the hover color under each variant the button
    // draws: one row each, with the light value from the setting.
    expect(hover.length).toBeGreaterThan(0);
    expect(new Set(hover.map((/** @type {any} */ v) => v.when)).size).toBe(
      hover.length,
    );
    for (const v of hover) {
      expect(v).toMatchObject({source: 'theme', via: 'part'});
      expect(v.notSettable).toBeUndefined();
      expect(v.value.light).toBe('#123456');
      expect(v.expression.light).toBe('#123456');
    }
    // The dark half is what that variant shows there without the block:
    // a destructive button's own fill, not the main button's.
    const destructive = hover.find(
      (/** @type {any} */ v) => v.when === 'variant:destructive',
    );
    const destructiveRest = valueOf(
      r,
      'background-color',
      'variant:destructive',
    );
    const main = valueOf(r, 'background-color');
    expect(destructive).toBeDefined();
    expect(destructiveRest).toBeDefined();
    const dark = (/** @type {any} */ x) =>
      x && typeof x === 'object' ? x.dark : x;
    expect(destructive.value.dark).toBe(dark(destructiveRest.value));
    expect(destructive.value.dark).not.toBe(dark(main.value));
    // neutral's own `segmented-control-item: {selected: …}` rule is the
    // part's selected state, which set takes as --state selected.
    const seg = /** @type {any} */ (
      await themeEditShow('neutral', {cwd, on: 'segmented-control-item'})
    );
    const selected = seg.data.values.filter(
      (/** @type {any} */ v) =>
        v.property === 'box-shadow' && v.source !== 'core',
    );
    expect(selected.length).toBeGreaterThan(0);
    for (const v of selected) expect(v.notSettable).toBeUndefined();
    expect(
      selected.some((/** @type {any} */ v) => v.state === 'selected'),
    ).toBe(true);
  }, 120_000);

  it('reads a token set on the part for one mode into what the part draws in that mode', async () => {
    await themeEditNew('lamp', {cwd, like: 'neutral'});
    await themeEditSet('lamp', '--color-background-card', '#abcdef', {
      cwd,
      on: 'card',
      mode: 'light',
    });
    const r = /** @type {any} */ (
      await themeEditShow('lamp', {cwd, on: 'card'})
    );
    const fill = valueOf(r, 'background-color');
    expect(fill).toMatchObject({source: 'theme', via: 'token'});
    expect(fill.value.light).toBe('#abcdef');
    expect(fill.value.dark).not.toBe('#abcdef');
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
