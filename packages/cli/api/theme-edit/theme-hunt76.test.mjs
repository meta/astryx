// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventy-sixth pass over `astryx experimental theme editor`: a
 * dial typed as a flag is offered as the dial, and a token value the
 * theme's own source gives is checked by the rules `set` uses before
 * anything is built.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt76-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} tokens */
const ownTokens = (slug, tokens) => {
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  const own = src.includes('tokens:')
    ? src.replace('tokens: {', `tokens: {\n    ${tokens}`)
    : src.replace(/defineTheme\(\{/, `defineTheme({\n  tokens: {${tokens}},`);
  expect(own).not.toBe(src);
  fs.writeFileSync(ts, own);
};

describe('the editor checks what it is given', () => {
  it('offers a dial typed as a flag as the dial, keeping the value', async () => {
    await themeEditNew('d', {cwd});
    for (const [flag, value, run] of [
      ['--corners', 'round', / set d corners round$/],
      ['--base', 'none', / set d base none$/],
      ['--headings', 'bold', / set d headings bold$/],
    ]) {
      const r = await refusal(() =>
        themeEditSet('d', /** @type {string} */ (flag), value, {cwd}),
      );
      expect(r.run[0], flag).toMatch(/** @type {RegExp} */ (run));
      expect(r.run.join(' '), flag).not.toMatch(/how --list tokens/);
    }
    // vibrancy is named as the dial too; with no color yet its set would be
    // refused, so the run is its help, never the empty token list.
    const vib = await refusal(() =>
      themeEditSet('d', '--vibrancy', '50', {cwd}),
    );
    expect(vib.message).toContain('vibrancy is a dial');
    expect(vib.run.join(' ')).not.toMatch(/how --list tokens/);
  }, 240_000);

  it('refuses a token value in the theme file that set refuses, naming the line, in show, set and compile', async () => {
    await themeEditNew('own', {cwd});
    ownTokens('own', "'--radius-page': 'banana',");
    const show = await refusal(() => themeEditShow('own', {cwd}));
    expect(show.message).toMatch(/--radius-page: "banana" \(line \d+\)/);
    expect(show.run[0]).toMatch(/sed -n \d+p .*own\.theme\.ts/);
    const set = await refusal(() =>
      themeEditSet('own', 'corners', 'pill', {cwd}),
    );
    expect(set.message).toContain('--radius-page');
    const compile = await runCli(
      ['experimental', 'theme', 'compile', 'themes/own/own.theme.ts'],
      {cwd},
    );
    expect(compile.status).toBe(1);
    expect(compile.stdout + compile.stderr).toContain('--radius-page');
    expect(
      fs.readFileSync(path.join(cwd, 'themes/own/own.css'), 'utf8'),
    ).not.toContain('banana');
  }, 240_000);

  it('keeps a valid token value in the theme file', async () => {
    await themeEditNew('ok', {cwd});
    ownTokens('ok', "'--radius-page': '20px',");
    await themeEditShow('ok', {cwd});
    expect(fs.readFileSync(path.join(cwd, 'themes/ok/ok.css'), 'utf8')).toMatch(
      /--radius-page:\s*20px/,
    );
  }, 240_000);

  it('reads a theme typed as its module name as the theme', async () => {
    await themeEditNew('brand', {cwd});
    const r = await refusal(() =>
      themeEditSet('brandTheme', 'corners', 'pill', {cwd}),
    );
    expect(r.run.join(' ')).not.toMatch(/ new brandtheme/);
    expect(r.run[0]).toMatch(/ set brand corners pill$/);
  }, 240_000);

  it('takes a light and a dark color on a part color as its light-dark() pair', async () => {
    await themeEditNew('pair', {cwd});
    await themeEditSet('pair', 'background', 'light: #ffffff; dark: #000000', {
      cwd,
      on: 'card',
    });
    expect(
      fs.readFileSync(path.join(cwd, 'themes/pair/pair.css'), 'utf8'),
    ).toMatch(/background(-color)?:\s*light-dark\(#ffffff, #000000\)/);
  }, 240_000);

  it('gives one set line per entry for a pasted JSON object of settings', async () => {
    await themeEditNew('js', {cwd});
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'set',
        'js',
        '{"corners":"pill","spacing":"roomy"}',
      ],
      {cwd},
    );
    expect(r.status).toBe(1);
    const names = JSON.stringify(JSON.parse(r.stdout));
    expect(names).toMatch(/set js corners pill/);
    expect(names).toMatch(/set js spacing roomy/);
  }, 240_000);

  it('reads a font stack with escaped quotes as the stack', async () => {
    await themeEditNew('fs', {cwd});
    const r = await themeEditSet('fs', 'font', '\\"Inter\\", sans-serif', {
      cwd,
    });
    expect(JSON.stringify(r.data.setting)).toContain('Inter');
    expect(JSON.stringify(r.data.setting)).not.toContain('\\\\');
  }, 240_000);

  it('takes a camelCase state a part lists, in any spelling', async () => {
    await themeEditNew('tb', {cwd});
    await themeEditSet('tb', 'background', '#ff0000', {
      cwd,
      on: 'toggle-button',
      state: 'is-pressed',
    });
    const r = await refusal(() =>
      themeEditSet('tb', 'background', '#00ff00', {
        cwd,
        on: 'toggle-button',
        state: 'pressed',
      }),
    );
    expect(r.run[0]).toMatch(/--state isPressed$/);
  }, 240_000);

  it('names a mode or base entry in the settings list as doing nothing, with its undo', async () => {
    await themeEditNew('ms', {cwd});
    const file = path.join(cwd, 'themes/ms/ms.settings.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    j.settings = [{thing: 'mode', value: 'dark-only', source: 'dial'}];
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
    const r = await themeEditShow('ms', {cwd});
    expect(r.data.notes.join(' ')).toMatch(
      /misplaced: the settings list holds mode = dark-only, which does nothing there.*undo ms mode/,
    );
  }, 240_000);

  it('says a second pasted declaration was not set, with its own set line', async () => {
    await themeEditNew('two', {cwd});
    const r = await themeEditSet(
      'two',
      'accent',
      'accent: red; text-size: 18',
      {
        cwd,
      },
    );
    expect(r.data.notes.join(' ')).toMatch(
      /also held "text-size: 18", which this did not set: .* set two text-size 18 sets it/,
    );
  }, 240_000);
});
