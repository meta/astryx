// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Data safety and value checks of `astryx experimental theme editor`,
 * from the chaos runs and the per-command hunts: a refused change puts the
 * theme back exactly and never removes a folder it did not make; every
 * accepted name builds; links are never written through; concurrent
 * commands on one theme run one after the other; settings edited by hand
 * are checked on load; token values are checked by their type.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {projectRoot} from './_adapter.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(cwd, rel));

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(
    ['--json', 'experimental', 'theme', 'editor', ...args],
    {cwd},
  );
  return {status: r.status, body: JSON.parse(r.stdout || '{}')};
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('h', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a refused change writes nothing', () => {
  it('a failed build puts every file back and keeps the folder', async () => {
    await themeEditNew('kd', {cwd, settings: {accent: '#7c3aed'}});
    await themeEditSet('kd', 'corners', 'pill', {cwd});
    fs.appendFileSync(path.join(cwd, 'themes/kd/kd.theme.ts'), 'oops(\n');
    fs.writeFileSync(path.join(cwd, 'themes/kd/kd.settings.json'), '');
    const before = fs.readdirSync(path.join(cwd, 'themes/kd')).sort();
    const r = await refusal(() => themeEditUndo('kd', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).not.toContain(cwd);
    expect(r.message).toContain('is your own file');
    expect(fs.readdirSync(path.join(cwd, 'themes/kd')).sort()).toEqual(before);
    expect(read('themes/kd/kd.settings.json')).toBe('');
    fs.rmSync(path.join(cwd, 'themes/kd'), {recursive: true, force: true});
  }, 240_000);

  it('a refused new removes only what it made, never a link it found', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-out-'));
    fs.symlinkSync(outside, path.join(cwd, 'themes/sym'), 'dir');
    try {
      const r = await refusal(() => themeEditNew('sym', {cwd}));
      expect(r.code).toBe('ERR_FILE_EXISTS');
      expect(fs.lstatSync(path.join(cwd, 'themes/sym')).isSymbolicLink()).toBe(
        true,
      );
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(path.join(cwd, 'themes/sym'), {force: true});
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('names', () => {
  it('every name the check accepts builds, and the suggested name does too', async () => {
    for (const name of ['b-2', 'x--y', 'brand-']) {
      await themeEditNew(name, {cwd});
      expect(exists(`themes/${name}/${name}.js`), name).toBe(true);
      fs.rmSync(path.join(cwd, 'themes', name), {recursive: true, force: true});
    }
    fs.mkdirSync(path.join(cwd, 'themes/zz'));
    fs.writeFileSync(path.join(cwd, 'themes/zz/.DS_Store'), '');
    const r = await refusal(() => themeEditNew('zz', {cwd}));
    expect(r.run[0]).toMatch(/new zz-copy$/);
    fs.rmSync(path.join(cwd, 'themes/zz'), {recursive: true, force: true});
  }, 240_000);

  it('refuses a long name and a file in the way with a code, and fixes a bad name', async () => {
    expect(
      (await refusal(() => themeEditNew('a'.repeat(300), {cwd}))).code,
    ).toBe('ERR_INVALID_ARGUMENT');
    fs.writeFileSync(path.join(cwd, 'themes/ff'), '');
    expect((await refusal(() => themeEditNew('ff', {cwd}))).code).toBe(
      'ERR_FILE_EXISTS',
    );
    fs.rmSync(path.join(cwd, 'themes/ff'));
    expect(
      (await refusal(() => themeEditNew('My Theme', {cwd}))).run[0],
    ).toMatch(/new my-theme$/);
    expect((await refusal(() => themeEditNew('q', {cwd, like: ''}))).code).toBe(
      'ERR_THEME_BAD_VALUE',
    );
  });
});

describe('new takes its flags as set does', () => {
  it('refuses a stray word, a flag given two values, and keeps both headings axes', async () => {
    const extra = await cli(['new', 'x1', 'neutral']);
    expect(extra.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(extra.body.suggestions[0].name).toMatch(/new x1 --like neutral$/);
    const twice = await cli([
      'new',
      'q4',
      '--corners',
      'pill',
      '--corners',
      'square',
    ]);
    expect(twice.body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(exists('themes/q4')).toBe(false);
    const both = await cli([
      'new',
      'hd2',
      '--headings',
      'heavy',
      '--headings',
      'tight',
    ]);
    expect(both.status).toBe(0);
    expect(
      JSON.parse(read('themes/hd2/hd2.settings.json')).settings.map(
        (/** @type {any} */ s) => s.value,
      ),
    ).toEqual(['heavy', 'tight']);
    fs.rmSync(path.join(cwd, 'themes/hd2'), {recursive: true, force: true});
  }, 240_000);

  it('suggests new, not set, when a flag is refused', async () => {
    const r = await refusal(() =>
      themeEditNew('v1', {cwd, settings: {vibrancy: '60'}}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/new v1 --vibrancy 60 --accent "#7c3aed"$/);
  });

  it('refuses a font or text size that would not build', async () => {
    for (const font of ['x"; color: red; "', '   ', '</style><script>']) {
      const r = await refusal(() =>
        themeEditNew('f1', {cwd, settings: {font}}),
      );
      expect(['ERR_THEME_BAD_VALUE', 'ERR_MISSING_ARGUMENT'], font).toContain(
        r.code,
      );
    }
    for (const size of ['0', '-1', ' ', '0x10', '1e3'])
      expect(
        (
          await refusal(() =>
            themeEditNew('t0', {cwd, settings: {'text-size': size}}),
          )
        ).code,
        size,
      ).toMatch(/ERR_THEME_BAD_VALUE|ERR_MISSING_ARGUMENT/);
  });
});

describe('two commands at once', () => {
  it('on one theme, both changes land', async () => {
    await themeEditNew('cc', {cwd});
    await Promise.all([
      themeEditSet('cc', 'corners', 'pill', {cwd}),
      themeEditSet('cc', 'spacing', 'roomy', {cwd}),
    ]);
    const things = JSON.parse(read('themes/cc/cc.settings.json')).settings.map(
      (/** @type {any} */ s) => s.thing,
    );
    expect(things.sort()).toEqual(['corners', 'spacing']);
    fs.rmSync(path.join(cwd, 'themes/cc'), {recursive: true, force: true});
  }, 240_000);
});

describe('settings edited by hand', () => {
  it('a bad value or shape is refused on load, naming the key and undo', async () => {
    await themeEditNew('bv', {cwd});
    await themeEditSet('bv', 'text-size', 'large', {cwd});
    const file = path.join(cwd, 'themes/bv/bv.settings.json');
    const good = fs.readFileSync(file, 'utf8');
    for (const bad of [
      good.replace('"large"', '"huge"'),
      JSON.stringify({name: 'bv', mode: 'both', settings: 5}),
    ]) {
      fs.writeFileSync(file, bad);
      const r = await refusal(() =>
        themeEditSet('bv', 'corners', 'small', {cwd}),
      );
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.run[0]).toMatch(/undo bv$/);
      expect(fs.readFileSync(file, 'utf8')).toBe(bad);
    }
    fs.rmSync(path.join(cwd, 'themes/bv'), {recursive: true, force: true});
  }, 240_000);
});

describe('exact tokens', () => {
  it('checks every type, and refuses what would break a mode or the CSS', async () => {
    for (const [token, value] of [
      ['--duration-fast', 'red'],
      ['--ease-standard', '10px'],
      ['--shadow-low', 'banana'],
      ['--text-heading-1-weight', 'banana'],
      ['--font-weight-bold', '1200'],
      ['--color-background-body', 'initial'],
      ['--color-background-body', 'rgb(banana)'],
      ['--color-background-body', 'var(--spacing-4)'],
      ['--radius-element', '-8px'],
      ['--font-family-body', 'Inter; } body { display: none } x {'],
      ['--spacing-4', 'calc(var(--spacing-4) * 2)'],
      ['--color-accent', '<color>'],
    ])
      expect(
        (await refusal(() => themeEditSet('h', token, value, {cwd}))).code,
        `${token} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    expect(
      (
        await refusal(() =>
          themeEditSet('h', '--shadow-low', '0 0 0 red', {cwd, mode: 'light'}),
        )
      ).code,
    ).toBe('ERR_THEME_NO_MODE');
    for (const [token, value] of [
      ['--radius-element', '2ch'],
      ['--radius-element', 'clamp(4px, 1vw, 12px)'],
      ['--text-body-leading', 'normal'],
      ['--color-syntax-keyword', 'red'],
      ['--text-display-1-size', '80px'],
      ['--color-icon-pink', 'red'],
    ]) {
      await themeEditSet('h', token, value, {cwd});
      await themeEditUndo('h', {cwd, thing: token});
    }
  }, 300_000);

  it('suggests a list command that works for an unknown token', async () => {
    const r = await refusal(() =>
      themeEditSet('h', '--color-accnt', 'red', {cwd}),
    );
    expect(r.run[0]).toMatch(/how --list tokens accnt$/);
  });

  it('accepts Core own shadows and a negative offset, and undo removes a shadow saved for one mode', async () => {
    const shadow =
      '0px 1px 1px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 8px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))';
    await themeEditSet('h', '--shadow-low', shadow, {cwd});
    await themeEditUndo('h', {cwd, thing: '--shadow-low'});
    await themeEditSet('h', '--focus-outline-offset', '-2px', {cwd});
    await themeEditUndo('h', {cwd, thing: '--focus-outline-offset'});
    const file = path.join(cwd, 'themes/h/h.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({
      thing: '--shadow-low',
      value: '0 0 0 red',
      source: 'token',
      mode: 'light',
    });
    fs.writeFileSync(file, JSON.stringify(data));
    await themeEditUndo('h', {cwd, thing: '--shadow-low', mode: 'light'});
    expect(
      JSON.parse(fs.readFileSync(file, 'utf8')).settings.some(
        (/** @type {any} */ s) => s.thing === '--shadow-low',
      ),
    ).toBe(false);
  }, 240_000);

  it('takes over a lock left by a command that stopped', async () => {
    const dir = path.join(cwd, 'node_modules/.cache/astryx-theme/locks');
    const {createHash} = await import('node:crypto');
    const key = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, `${key}-theme-h.lock`),
      JSON.stringify({
        pid: 2 ** 22 + 7,
        host: os.hostname(),
        started: Date.now(),
        token: 'x',
      }),
    );
    const started = Date.now();
    await themeEditShow('h', {cwd});
    expect(Date.now() - started).toBeLessThan(25_000);
    expect(fs.existsSync(path.join(dir, `${key}-theme-h.lock`))).toBe(false);
  }, 120_000);

  it('an exact font family reaches phones too, and sizes do not', async () => {
    await themeEditSet('h', '--font-family-body', 'Georgia, serif', {cwd});
    const css = read('themes/h/h.css');
    const phone = css.slice(css.lastIndexOf('(pointer: coarse)'));
    expect(phone).toContain('--font-family-body: Georgia, serif');
    await themeEditUndo('h', {cwd, thing: '--font-family-body'});
    await themeEditSet('h', '--font-size-base', '1.25rem', {cwd});
    expect(read('themes/h/h.settings.ts')).not.toMatch(
      /adaptations[\s\S]*--font-size-base/,
    );
    await themeEditUndo('h', {cwd, thing: '--font-size-base'});
  }, 120_000);

  it('undo names the dial still writing the token', async () => {
    await themeEditSet('h', 'accent', '#7c3aed', {cwd});
    await themeEditSet('h', '--color-accent', '#ff0000', {cwd});
    const r = await themeEditUndo('h', {cwd, thing: '--color-accent'});
    expect(r.data.now).toContain('the generated accent color');
    await themeEditUndo('h', {cwd, thing: 'accent'});
  }, 240_000);
});

describe('type dials', () => {
  it('a text size keeps the base theme heading weights', async () => {
    const r = await themeEditSet('h', 'text-size', 'large', {cwd});
    expect(r.data.changedTokens.filter(x => /weight/.test(x))).toEqual([]);
    // The weights are written with the new scale, so Core never falls back
    // to its own.
    expect(read('themes/h/h.settings.ts')).toMatch(
      /"--text-heading-3-weight":/,
    );
    await themeEditUndo('h', {cwd, thing: 'text-size'});
  }, 120_000);
});

describe('where commands act', () => {
  it('from a subfolder of an app that declares Core, on the app', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-root-'));
    try {
      fs.writeFileSync(
        path.join(app, 'package.json'),
        JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.mkdirSync(path.join(app, 'src/app'), {recursive: true});
      expect(projectRoot(path.join(app, 'src/app'))).toBe(app);
      // A folder with no Core above it stays where it is.
      expect(projectRoot(cwd)).toBe(cwd);
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('reading a built theme leaves no copy in the theme folder', async () => {
    await themeEditShow('h', {cwd});
    expect(
      fs
        .readdirSync(path.join(cwd, 'themes/h'))
        .filter(f => /\.load[-.]/.test(f)),
    ).toEqual([]);
  }, 120_000);
});
