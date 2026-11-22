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
    });
    // The base's padding shorthand, which the theme's sides overwrite,
    // shows nothing of its own.
    expect(valueOf(r, 'padding')).toBeUndefined();
    // The corners dial writes the radius token the part reads.
    expect(valueOf(r, 'border-radius')).toMatchObject({
      expression: 'var(--radius-container)',
      tokens: ['--radius-container'],
      source: 'theme',
    });
    // A token the base sets, with a value per mode.
    const fill = valueOf(r, 'background-color');
    expect(fill.source).toBe('base');
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
      });
      expect(valueOf(r, 'border-radius')).toMatchObject({
        source: 'theme',
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
      /^border-radius +\S+ - --radius-container - theme$/m,
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

  it('reads a value a part-scoped dial sets as the theme’s, not Core’s', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('roomy', {cwd, on: 'card'})
    );
    const pad = valueOf(r, 'padding-top');
    expect(pad).toMatchObject({source: 'theme'});
    expect(pad.tokens).toContain('--spacing-4');
    // The spacing token the dial sets on the card, also named as the dial's.
    expect(valueOf(r, '--spacing-4')).toMatchObject({
      source: 'theme',
    });
    // Inside the card the dial's value shows, not the whole-theme value.
    const base = /** @type {any} */ (
      await themeEditShow('neutral', {cwd, on: 'card'})
    );
    const plain = valueOf(base, 'padding-top') ?? valueOf(base, 'padding');
    expect(plain).toBeDefined();
    expect(pad.value).not.toBe(plain.value);
    // A rule a dial on the part writes (corners writes the card's
    // border-radius) reads as the part's: which dial is not shown yet.
    expect(valueOf(r, 'border-radius')).toMatchObject({
      source: 'theme',
    });
    // A token the dials leave alone stays the base's.
    expect(valueOf(r, 'background-color')).toMatchObject({
      source: 'base',
    });
  }, 120_000);

  it('reads the card rules a whole-theme dial writes as the theme’s, and a variant’s own property setting under its own condition', async () => {
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
    // (A whole-theme dial is not credited with a part rule yet.)
    // A border color set on the card for one variant is that variant's
    // rule on the part; the card at rest still shows the dial's rule.
    expect(valueOf(r, 'border-color')).toMatchObject({
      source: 'theme',
    });
    expect(valueOf(r, 'border-color', 'variant:muted')).toMatchObject({
      value: '#ff0000',
      source: 'theme',
    });
  }, 120_000);

  it('reads a property set on the part at rest as the theme’s in every variant row that shows it, beside a whole-theme dial', async () => {
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
    for (const v of rows) expect(v).toMatchObject({source: 'theme'});
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
    ).toMatchObject({value: '#123456', source: 'theme'});
    // One condition reads as one row, whatever order Core writes it in.
    const ids = rows.map((/** @type {any} */ v) =>
      JSON.stringify([v.property, v.when, v.state, v.value, v.expression]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  }, 120_000);

  it('reads a state setting beside a dial as the theme’s, once per condition, and a one-mode color into that mode’s value', async () => {
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
      expect.objectContaining({value: '#123456', source: 'theme'}),
    ]);
    expect(rowsAt('variant:secondary', 'expanded')).toEqual([
      expect.objectContaining({value: '#654321', source: 'theme'}),
    ]);
    const card = /** @type {any} */ (
      await themeEditShow('held', {cwd, on: 'card'})
    );
    // A color for one mode is that mode's value, not a condition. (A card
    // always draws a variant, and the build writes a card fill there.)
    expect(valueOf(card, 'background-color', 'variant:default')).toMatchObject({
      value: {light: '#abcdef', dark: expect.any(String)},
      source: 'theme',
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
      expect(v).toMatchObject({source: 'theme'});
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
    expect(fill).toMatchObject({source: 'theme'});
    expect(fill.value.light).toBe('#abcdef');
    expect(fill.value.dark).not.toBe('#abcdef');
    // The token's own row gives the light value and leaves the dark one
    // out (not shown yet), never a null it does not mean.
    const own = valueOf(r, '--color-background-card');
    expect(own.value).toEqual({light: '#abcdef'});
  }, 120_000);

  it('leaves a mode out of the text where the JSON leaves it out', async () => {
    await themeEditNew('linky', {cwd, like: 'neutral'});
    await themeEditSet('linky', 'outline-color', '#ff0000', {
      cwd,
      on: 'link',
      mode: 'light',
    });
    await themeEditSet('linky', 'outline-color', '#00ff00', {
      cwd,
      on: 'link',
      state: 'hover',
      mode: 'light',
    });
    const r = /** @type {any} */ (
      await themeEditShow('linky', {cwd, on: 'link'})
    );
    const hover = r.data.values.find(
      (/** @type {any} */ v) =>
        v.property === 'outline-color' && v.state === 'hover',
    );
    expect(hover).toBeDefined();
    expect(hover.value).toEqual({light: '#00ff00'});
    const text = await runCli(
      ['experimental', 'theme', 'editor', 'show', 'linky', '--on', 'link'],
      {cwd},
    );
    expect(text.stdout).not.toMatch(/no value/);
  }, 120_000);

  it('reads a variant-scoped token block as the theme’s only where it shows', async () => {
    await themeEditNew('scoped', {cwd, like: 'neutral'});
    await themeEditSet('scoped', '--color-background-muted', '#ff0000', {
      cwd,
      on: 'card',
      when: 'variant:muted',
      mode: 'light',
    });
    const r = /** @type {any} */ (
      await themeEditShow('scoped', {cwd, on: 'card'})
    );
    // At rest the card's own fill shows, not the theme's block.
    const rest = valueOf(r, 'background-color');
    expect(rest.source).not.toBe('theme');
    expect(JSON.stringify(rest.value)).not.toMatch(/#ff0000/);
    const muted = valueOf(r, 'background-color', 'variant:muted');
    expect(muted).toMatchObject({source: 'theme'});
    expect(muted.value.light).toBe('#ff0000');
  }, 120_000);

  it('refuses a stray option beside --on without offering a show that drops --on', async () => {
    for (const args of [
      ['show', '--theme', 'neutral', '--on', 'card'],
      ['show', 'neutral', '--on', 'card', '--zz'],
      [
        'show',
        'neutral',
        '--on',
        'card',
        '--section',
        'pages',
        '--section',
        'inputs',
      ],
    ]) {
      const out = await runCli(
        ['--json', 'experimental', 'theme', 'editor', ...args],
        {cwd},
      );
      expect(out.code).not.toBe(0);
      const err = JSON.parse(out.stdout || out.stderr);
      const lines = JSON.stringify(err);
      expect(lines).not.toMatch(/editor show neutral(?! --on)["\s]/);
    }
  }, 120_000);

  it('gives no setting a value comes through (not shown yet), in the JSON or the text', async () => {
    const r = /** @type {any} */ (
      await themeEditShow('brand', {cwd, on: 'card'})
    );
    for (const v of r.data.values) expect(v).not.toHaveProperty('via');
    const text = await runCli(
      ['experimental', 'theme', 'editor', 'show', 'brand', '--on', 'card'],
      {cwd},
    );
    expect(text.stdout).not.toMatch(/ - (?:dial|part|token|value)$/m);
  }, 120_000);

  it('reads what an editor theme’s file adds by hand below its settings', async () => {
    await themeEditNew('handy', {cwd, like: 'neutral'});
    await themeEditSet('handy', 'corners', 'pill', {cwd});
    const file = path.join(cwd, 'themes', 'handy', 'handy.theme.ts');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace(
          "name: 'handy',",
          "name: 'handy',\n  tokens: {'--color-background-card': '#0a0b0c'},\n  components: {card: {base: {borderColor: '#0d0e0f'}}},",
        ),
    );
    const r = /** @type {any} */ (
      await themeEditShow('handy', {cwd, on: 'card'})
    );
    expect(valueOf(r, 'background-color')).toMatchObject({
      value: '#0a0b0c',
      source: 'theme',
    });
    expect(valueOf(r, 'border-color')).toMatchObject({
      value: '#0d0e0f',
      source: 'theme',
    });
    // A build that no longer matches the saved settings is refused, with
    // show (which builds it again) as the next step.
    const generated = path.join(cwd, 'themes', 'handy', 'handy.settings.ts');
    const kept = fs.readFileSync(generated, 'utf8');
    fs.rmSync(generated);
    const stale = await refusal(() =>
      themeEditShow('handy', {cwd, on: 'card'}),
    );
    expect(stale.code).toBe('ERR_THEME_INVALID');
    expect(stale.run.join(' ')).toMatch(/editor show handy$/);
    fs.writeFileSync(generated, kept);
    // A build another CLI release made answers as before: what the saved
    // settings make, without the hand additions, and is not refused.
    fs.writeFileSync(
      generated,
      kept.replace(/\(CLI [^)]+\)\./, '(CLI 0.0.1).'),
    );
    const older = /** @type {any} */ (
      await themeEditShow('handy', {cwd, on: 'card'})
    );
    expect(valueOf(older, 'background-color').value).not.toBe('#0a0b0c');
    expect(valueOf(older, 'border-radius').value).toBe(
      valueOf(r, 'border-radius').value,
    );
    fs.writeFileSync(generated, kept);
    // A theme file that no longer extends its settings is refused, as set
    // refuses it.
    const source = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, source.replace(/extends: \w+,/, ''));
    expect(
      (await refusal(() => themeEditShow('handy', {cwd, on: 'card'}))).code,
    ).toBe('ERR_THEME_INVALID');
    fs.writeFileSync(file, source);
    // A token value a build refuses is refused here too, not read.
    for (const bad of ["'banana'", '12']) {
      fs.writeFileSync(
        file,
        source.replace(
          "'--color-background-card': '#0a0b0c'",
          `'--color-background-card': ${bad}`,
        ),
      );
      expect(
        (await refusal(() => themeEditShow('handy', {cwd, on: 'card'}))).code,
      ).toBe('ERR_THEME_INVALID');
    }
    fs.writeFileSync(file, source);
    // A theme file that no longer loads is refused, as show refuses it.
    fs.writeFileSync(
      file,
      `${fs.readFileSync(file, 'utf8')}\nexport const = ;\n`,
    );
    expect(
      await refusal(() => themeEditShow('handy', {cwd, on: 'card'})),
    ).toMatchObject({code: 'ERR_THEME_INVALID'});
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
