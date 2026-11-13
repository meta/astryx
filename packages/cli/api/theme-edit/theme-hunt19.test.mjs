// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The nineteenth pass over `astryx experimental theme editor`: show's
 * source stamp follows every helper the build reads, token values that are
 * not text are named, and the experimental template guards only the
 * editor's own files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {themeTemplate} from '../theme/template/template.mjs';
import {editorThemeTemplate} from './_adapter.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt19-', FIXTURE_PACKAGES);
  await themeEditNew('g', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const dir = () => path.join(cwd, 'themes/g');
const source = () => path.join(dir(), 'g.theme.ts');

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

/**
 * The theme source with an import and a token added after the settings.
 * @param {string} importLine
 * @param {string} token
 */
function withToken(importLine, token) {
  const text = fs.readFileSync(source(), 'utf8');
  return text
    .replace(/(import \{defineTheme\}[^\n]*\n)/, `$1${importLine}\n`)
    .replace(/defineTheme\(\{/, `defineTheme({\n  tokens: {${token}},`);
}

describe('show follows every helper the build reads', () => {
  it.each([
    ['./tokens/brand', 'tokens/brand.ts'],
    ['./tok', 'tok/index.tsx'],
    ['./c.cjs', 'c.cts'],
    ['./j.jsx', 'j.tsx'],
    ['./m.mjs', 'm.mts'],
  ])(
    'rebuilds after %s (%s) changes',
    async (spec, file) => {
      const original = fs.readFileSync(source(), 'utf8');
      const helper = path.join(dir(), file);
      fs.mkdirSync(path.dirname(helper), {recursive: true});
      try {
        fs.writeFileSync(helper, "export const c = '#0000ff';\n");
        fs.writeFileSync(
          source(),
          withToken(`import {c} from '${spec}';`, "'--color-accent': c"),
        );
        await themeEditShow('g', {cwd});
        const css = () => fs.readFileSync(path.join(dir(), 'g.css'), 'utf8');
        expect(css()).toContain('#0000ff');
        fs.writeFileSync(helper, "export const c = '#ff0000';\n");
        await themeEditShow('g', {cwd});
        expect(css()).toContain('#ff0000');
      } finally {
        fs.writeFileSync(source(), original);
        fs.rmSync(helper, {force: true});
        await themeEditShow('g', {cwd});
      }
    },
    240_000,
  );
});

describe('token values that are not text', () => {
  it('refuses a pair of weights: only colors differ by mode (F20-N1)', async () => {
    const original = fs.readFileSync(source(), 'utf8');
    try {
      fs.writeFileSync(
        source(),
        withToken('', "'--font-weight-bold': ['600', '700']"),
      );
      await expect(themeEditShow('g', {cwd})).rejects.toThrow(
        /--font-weight-bold a \[light, dark\] pair, but only colors differ by mode/,
      );
    } finally {
      fs.writeFileSync(source(), original);
      await themeEditShow('g', {cwd});
    }
  }, 240_000);

  it('names a size without a unit, with an example that passes', async () => {
    const original = fs.readFileSync(source(), 'utf8');
    try {
      fs.writeFileSync(
        source(),
        withToken('', "'--radius-container': ['8', '8']"),
      );
      const err = await refusal(() => themeEditShow('g', {cwd}));
      expect(err.code).toBe('ERR_THEME_INVALID');
      expect(err.message).toContain(
        "--radius-container, a size, a [light, dark] pair with a number without a unit (8, 8); a size needs one, and is the same in light and dark, so give one value, such as '8px'",
      );
      fs.writeFileSync(source(), original);
      fs.writeFileSync(source(), withToken('', "'--radius-container': '8px'"));
      await expect(themeEditShow('g', {cwd})).resolves.toBeTruthy();
    } finally {
      fs.writeFileSync(source(), original);
      await themeEditShow('g', {cwd});
    }
  }, 240_000);

  it('names an object pair, never a raw error', async () => {
    const original = fs.readFileSync(source(), 'utf8');
    try {
      fs.writeFileSync(
        source(),
        withToken(
          '',
          "'--radius-container': {light: '6px', dark: '8px'} as any",
        ),
      );
      const err = await refusal(() => themeEditShow('g', {cwd}));
      expect(err.code).toBe('ERR_THEME_INVALID');
      expect(err.message).toContain(
        'g.theme.ts gives --radius-container an object',
      );
      expect(err.message).not.toContain('trim is not a function');
    } finally {
      fs.writeFileSync(source(), original);
      await themeEditShow('g', {cwd});
    }
  }, 240_000);
});

describe('the experimental template in an editor theme folder', () => {
  it('names a free path for an editor file, and refreshes its own template', () => {
    const skip = editorThemeTemplate({
      cwd,
      targetPath: 'themes/g/g.theme.ts',
    });
    expect(skip.data).toMatchObject({
      written: false,
      alternative: 'themes/g/theme.template.ts',
    });
    expect(() =>
      editorThemeTemplate({
        cwd,
        targetPath: 'themes/g/g.theme.ts',
        overwrite: true,
      }),
    ).toThrow(/belongs to a theme the theme editor made/);

    // Another spelling of the same file (a case-insensitive disk, here a
    // link) is the editor's file too.
    fs.symlinkSync('g.theme.ts', path.join(dir(), 'G.theme.ts'));
    fs.symlinkSync('g', path.join(path.dirname(dir()), 'G'));
    try {
      for (const targetPath of ['themes/g/G.theme.ts', 'themes/G/g.theme.ts'])
        expect(
          () =>
            editorThemeTemplate({
              cwd,
              targetPath,
              overwrite: true,
            }),
          targetPath,
        ).toThrow(/belongs to a theme the theme editor made/);
    } finally {
      fs.unlinkSync(path.join(dir(), 'G.theme.ts'));
      fs.unlinkSync(path.join(path.dirname(dir()), 'G'));
    }

    themeTemplate({cwd, targetPath: 'themes/g/theme.template.ts'});
    fs.appendFileSync(path.join(dir(), 'theme.template.ts'), '// mine\n');
    expect(
      editorThemeTemplate({
        cwd,
        targetPath: 'themes/g/theme.template.ts',
        overwrite: true,
      }).data.written,
    ).toBe(true);
    // The stable command keeps its guard for every file there.
    expect(() =>
      themeTemplate({
        cwd,
        targetPath: 'themes/g/theme.template.ts',
        overwrite: true,
      }),
    ).toThrow(/belongs to a theme the theme editor made/);
    fs.rmSync(path.join(dir(), 'theme.template.ts'));
  });
});

describe('undo reports what it did', () => {
  it('refuses an --only the setting was not made with', async () => {
    const {themeEditSet, themeEditUndo} = await import('./theme-edit.mjs');
    await themeEditSet('g', 'corners', 'pill', {cwd});
    const err = await refusal(() =>
      themeEditUndo('g', {cwd, thing: 'corners', only: true}),
    );
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    const settings = JSON.parse(
      fs.readFileSync(path.join(dir(), 'g.settings.json'), 'utf8'),
    ).settings;
    expect(settings.some((/** @type {any} */ x) => x.thing === 'corners')).toBe(
      true,
    );
  }, 240_000);

  it('matches a value whatever its comma spacing', async () => {
    const {themeEditSet, themeEditUndo} = await import('./theme-edit.mjs');
    await themeEditSet('g', 'background', 'rgb(255, 0, 0)', {cwd, on: 'card'});
    await themeEditUndo('g', {
      cwd,
      thing: 'background',
      value: 'rgb(255,0,0)',
      on: 'card',
    });
    const settings = JSON.parse(
      fs.readFileSync(path.join(dir(), 'g.settings.json'), 'utf8'),
    ).settings;
    expect(
      settings.some((/** @type {any} */ x) => x.thing === 'background'),
    ).toBe(false);
  }, 240_000);

  it('says the history does not reach back, without a history', async () => {
    const {themeEditUndo} = await import('./theme-edit.mjs');
    fs.rmSync(path.join(dir(), 'g.history.json'), {force: true});
    const err = await refusal(() => themeEditUndo('g', {cwd, thing: 'mode'}));
    expect(err.message).toContain('has no saved change');
    expect(err.message).not.toContain('was never changed');
  }, 240_000);
});
