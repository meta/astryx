// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor names the real problem and the real place: another
 * export the build reads, a path only Core's own derived rules have, an
 * editor theme that lost its settings (compile refuses it too), a part
 * block imported from a file beside the theme or a theme re-exported from
 * one, and a local token Core refuses by name.
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
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt149-', FIXTURE_PACKAGES);
  // Core derives an adaptation rule from the typography over a base with
  // a rule for phones, as the real neutral theme has.
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} name */
const file = (slug, name) => path.join(cwd, 'themes', slug, name);

/**
 * A new theme whose own source gives these lines after its name.
 * @param {string} slug @param {string} lines @param {string} [like] its base
 */
const withOwn = async (slug, lines, like) => {
  await themeEditNew(slug, {cwd, ...(like ? {like} : {})});
  const ts = file(slug, `${slug}.theme.ts`);
  fs.writeFileSync(
    ts,
    fs
      .readFileSync(ts, 'utf8')
      .replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`),
  );
};

/** @param {string} slug @param {string[]} [more] */
const compile = (slug, more = []) =>
  runCli(
    [
      'experimental',
      'theme',
      'compile',
      `themes/${slug}/${slug}.theme.ts`,
      ...more,
    ],
    {cwd},
  );

/** @param {string} slug @param {RegExp} what */
const refused = async (slug, what) => {
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  expect(c.stdout + c.stderr, `compile ${slug}`).toMatch(what);
  expect(c.stdout + c.stderr).not.toMatch(/ERR_UNKNOWN"|TypeError/);
  const s = await refusal(() => themeEditShow(slug, {cwd}));
  expect(s.message, `show ${slug}`).toMatch(what);
  return s;
};

describe('the problem named', () => {
  it('names the other export a build reads when it is named for the theme but does not extend the settings', async () => {
    await themeEditNew('da', {cwd});
    fs.appendFileSync(
      file('da', 'da.theme.ts'),
      "\nexport default defineTheme({name: 'da', tokens: {'--spacing-4': '1rem'}});\n",
    );
    const why =
      /a build of da\.theme\.ts reads its export default \(the theme 'da'\), not daTheme, the theme that extends daSettings/;
    const c = await compile('da');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toMatch(why);
    expect(c.stdout + c.stderr).not.toMatch(/Put back/);
    const s = await refusal(() => themeEditSet('da', 'corners', 'pill', {cwd}));
    expect(s.message).toMatch(why);
  }, 240_000);

  it('refuses only the value the file gives, never a path in a rule Core derives from the typography', async () => {
    await withOwn(
      'wn',
      '  typography: {scale: {base: 14, ratio: 1.2}, heading: {weight: 800 as any}},',
      'neutral',
    );
    const s = await refused(
      'wn',
      /gives a value the editor refuses.*typography\.heading\.weight \(line \d+\)/,
    );
    expect(s.message).not.toMatch(/adaptations/);
  }, 240_000);

  it('refuses a local token Core refuses by name, at its line, with no import hint', async () => {
    await withOwn('lt', "  localTokens: {brand: 'red'} as any,");
    const s = await refused(
      'lt',
      /localTokens\.brand \(line \d+\): Core refuses the theme: localTokens\.brand \(a local token\) must be a valid CSS custom-property name/,
    );
    expect(s.message).not.toMatch(/resolvable/);
  }, 240_000);
});

describe('an editor theme that lost its settings', () => {
  it('is refused by compile and --check as the editor commands refuse it', async () => {
    await themeEditNew('ls', {cwd});
    fs.rmSync(file('ls', 'ls.settings.json'));
    const c = await compile('ls');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toMatch(
      /themes\/ls has lost its settings \(ls\.settings\.json is gone\), but the editor made it/,
    );
    expect(c.stdout + c.stderr).toMatch(/editor new ls/);
    const k = await compile('ls', ['--check', '--json']);
    expect(k.status).toBe(1);
    expect(k.stdout).toMatch(/ERR_UNKNOWN_THEME/);
    expect(k.stdout).not.toMatch(/"upToDate": true/);
  }, 240_000);
});

describe('the place named', () => {
  it('names the file and line of a part block imported from a file beside the theme', async () => {
    for (const [slug, given] of /** @type {const} */ ([
      ['ia', 'parts'],
      ['ib', '{button: parts.button}'],
    ])) {
      await withOwn(slug, `  components: ${given},`);
      fs.writeFileSync(
        file(slug, 'shared.ts'),
        "export const parts = {\n  button: {base: {backgroundColour: 'red'}},\n};\n",
      );
      const ts = file(slug, `${slug}.theme.ts`);
      fs.writeFileSync(
        ts,
        `import {parts} from './shared';\n${fs.readFileSync(ts, 'utf8')}`,
      );
      const s = await refused(
        slug,
        new RegExp(
          `backgroundColour \\(in themes/${slug}/shared\\.ts, line 2\\)`,
        ),
      );
      expect(s.message).toMatch(
        new RegExp(`Change it in themes/${slug}/shared\\.ts`),
      );
    }
  }, 240_000);

  it('names the file a theme is re-exported from', async () => {
    await themeEditNew('rx', {cwd});
    fs.writeFileSync(
      file('rx', 'impl.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {rxSettings} from './rx.settings';\nexport const rxTheme = defineTheme({extends: rxSettings, name: 'rx',\n  tokens: {'--color-accent': 'nope'}});\n",
    );
    fs.writeFileSync(file('rx', 'rx.theme.ts'), "export * from './impl';\n");
    const s = await refused(
      'rx',
      /--color-accent: "nope" \(in themes\/rx\/impl\.ts, line 4\)/,
    );
    expect(s.message).toMatch(/Change it in themes\/rx\/impl\.ts/);
  }, 240_000);
});
