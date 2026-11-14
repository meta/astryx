// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The settings a theme extends are the settings module's own export,
 * by identity; a source that stops loading is refused, never recorded as
 * built; an `extends` the build cannot follow is named as that; fonts in a
 * `font` shorthand and fonts the app copy loads are judged family by
 * family; an unwritable theme folder is named; and an editor theme is not
 * compiled with --icons-specifier, which its next build would drop.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The renders are stood in for: these tests are about settings, files and
// messages, not the rendered pages.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt119-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args */
const cli = async args => await runCli([...args], cwd);
const compile = async (/** @type {string[]} */ ...args) =>
  await cli(['experimental', 'theme', 'compile', ...args]);
/** @param {string} slug @param {string} body @param {string} [imports] */
const writeSource = (slug, body, imports = '') =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\n${body}\n`,
  );

/** A stand-in installed @fontsource package; returns its remover. */
const installFont = (
  /** @type {string} */ name,
  /** @type {string} */ family,
) => {
  const pkg = path.join(path.dirname(cwd), `node_modules/@fontsource/${name}`);
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: `@fontsource/${name}`,
      version: '5.0.0',
      exports: {
        '.': './index.css',
        './index.css': './index.css',
        './package.json': './package.json',
      },
    }),
  );
  fs.writeFileSync(
    path.join(pkg, 'index.css'),
    `@font-face {\n  font-family: '${family}';\n  src: url(./f.woff2);\n}\n`,
  );
  return () => fs.rmSync(pkg, {recursive: true, force: true});
};

describe('the settings a theme extends', () => {
  it('a theme merely named like the settings is refused, and the settings reached through another theme are accepted', async () => {
    await themeEditNew('y1', {cwd});
    const before = read('themes/y1/y1.css');
    writeSource(
      'y1',
      "const fake = defineTheme({name: 'y1-settings', tokens: {'--radius-element': '2px'}});\nvoid y1Settings;\nexport const y1Theme = defineTheme({extends: fake, name: 'y1'});",
    );
    const r = await compile('themes/y1/y1.theme.ts');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('no longer extends y1Settings');
    await expect(themeEditSet('y1', 'corners', 'pill', {cwd})).rejects.toThrow(
      'no longer extends y1Settings',
    );
    expect(read('themes/y1/y1.css')).toBe(before);
    writeSource(
      'y1',
      "const mid = defineTheme({extends: y1Settings, name: 'mid'});\nexport const y1Theme = defineTheme({extends: mid, name: 'y1'});",
    );
    expect((await compile('themes/y1/y1.theme.ts')).status).toBe(0);
  }, 240_000);
});

describe('a source that stops loading', () => {
  it('show refuses it and records nothing as built', async () => {
    await themeEditNew('y10', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/y10/vals.ts'),
      "throw new Error('boom');\nexport const v = 1;\n",
    );
    const settings = read('themes/y10/y10.settings.ts');
    writeSource(
      'y10',
      'export const y10Theme = defineTheme({extends: y10Settings, name: "y10", tokens: {"--radius-element": `${v}px`}});',
      "import {v} from './vals';",
    );
    await expect(themeEditShow('y10', {cwd})).rejects.toThrow('boom');
    expect(read('themes/y10/y10.settings.ts')).toBe(settings);
  }, 240_000);
});

describe('an extends the build cannot follow', () => {
  it('is named as that, not as a registry the theme sets', async () => {
    const dir = path.join(cwd, 'plain');
    fs.mkdirSync(dir, {recursive: true});
    // A base with an icon registry: the build follows `extends` to carry it.
    fs.writeFileSync(
      path.join(dir, 'icons.mjs'),
      "export default {check: 'check'};\n",
    );
    fs.writeFileSync(
      path.join(dir, 'base.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport myIcons from './icons.mjs';\nexport const baseTheme = defineTheme({name: 'b', tokens: {}, icons: myIcons});\n",
    );
    fs.writeFileSync(
      path.join(dir, 'p.theme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTheme} from './base';\nconst pick = (a: any) => a;\nexport const pTheme = defineTheme({extends: pick(baseTheme), name: 'p'});\n",
    );
    const r = await cli(['theme', 'build', 'plain/p.theme.ts']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('a call to a helper');
    expect(r.stdout + r.stderr).not.toContain('Theme sets an icon registry');
  }, 240_000);
});

describe('fonts, family by family', () => {
  it('the full help names only the family the app copy does not load', async () => {
    await themeEditNew('y7', {cwd});
    const remove = installFont('lora', 'Lora');
    try {
      await themeEditSet('y7', 'font', 'Merriweather, Lora, serif', {cwd});
      const full = await compile('themes/y7/y7.theme.ts', '--detail', 'full');
      expect(full.stdout).toContain('"Merriweather"');
      expect(full.stdout).not.toContain('"Lora"');
    } finally {
      remove();
    }
  }, 240_000);

  it('a family in a font shorthand is loaded by the app copy once installed, and named until then', async () => {
    await themeEditNew('y9', {cwd});
    writeSource(
      'y9',
      "export const y9Theme = defineTheme({extends: y9Settings, name: 'y9', components: {button: {base: {font: '600 14px Lora, serif'}}}});",
    );
    const missing = await compile('themes/y9/y9.theme.ts');
    expect(missing.stdout + missing.stderr).toMatch(/not loaded[^\n]*Lora/);
    const remove = installFont('lora', 'Lora');
    try {
      expect((await compile('themes/y9/y9.theme.ts')).status).toBe(0);
      expect(read('src/themes/y9/y9.fonts.css')).toContain(
        '@fontsource/lora/index.css',
      );
    } finally {
      remove();
    }
  }, 240_000);
});

describe('the result says what text says', () => {
  it('compile --json carries the --out warnings text prints', async () => {
    await themeEditNew('y2', {cwd});
    await themeEditNew('y2b', {cwd});
    const named = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/y2/y2.theme.ts',
          '--out',
          'out-y2/a.txt',
        ])
      ).stdout,
    );
    expect(named.data.warnings.join(' ')).toContain('give it a .css name');
    expect(
      (await compile('themes/y2/y2.theme.ts', '--out', 'out-y2/a.css')).status,
    ).toBe(0);
    const replaced = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/y2b/y2b.theme.ts',
          '--out',
          'out-y2/a.css',
        ])
      ).stdout,
    );
    expect(replaced.data.warnings.join(' ')).toContain(
      'was built from themes/y2/y2.theme.ts',
    );
  }, 240_000);

  it('a family a font token sets gets the install line from set and show', async () => {
    await themeEditNew('y6', {cwd});
    const r = await themeEditSet(
      'y6',
      '--font-family-heading',
      '"Playfair Display", Georgia, serif',
      {cwd},
    );
    expect(r.data.notes.join(' ')).toContain('@fontsource/playfair-display');
    const shown = await themeEditShow('y6', {cwd});
    expect(JSON.stringify(shown.data.notes)).toContain(
      '@fontsource/playfair-display',
    );
  }, 240_000);

  it('a theme made by a function is refused naming what the build cannot follow', async () => {
    await themeEditNew('y8b', {cwd});
    // With a registry, the build follows the theme to carry it.
    fs.writeFileSync(
      path.join(cwd, 'themes/y8b/icons.mjs'),
      "export default {check: 'check'};\n",
    );
    writeSource(
      'y8b',
      "const make = () => defineTheme({extends: y8bSettings, name: 'y8b', icons: myIcons});\nexport const y8bTheme = make();",
      "import myIcons from './icons.mjs';",
    );
    const r = await compile('themes/y8b/y8b.theme.ts');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('a call to a helper');
    expect(r.stdout + r.stderr).not.toContain('inline registries');
  }, 240_000);
});

describe('compile refusals that name the fix', () => {
  it('a theme folder that is not writable is named, with nothing written', async () => {
    if (process.getuid?.() === 0) return;
    await themeEditNew('y8', {cwd});
    writeSource(
      'y8',
      "export const y8Theme = defineTheme({extends: y8Settings, name: 'y8', tokens: {'--radius-element': '3px'}});",
    );
    const dir = path.join(cwd, 'themes/y8');
    fs.chmodSync(dir, 0o555);
    try {
      const r = await compile('themes/y8/y8.theme.ts');
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('themes/y8 is not writable');
      expect(r.stdout + r.stderr).not.toContain('.tmp-');
      expect(r.stdout + r.stderr).not.toContain('template');
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  }, 240_000);

  it('compiling an editor theme with --icons-specifier says its next build drops it, in text and JSON', async () => {
    await themeEditNew('y11', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/y11/icons.mjs'),
      "export default {check: 'check'};\n",
    );
    writeSource(
      'y11',
      "export const y11Theme = defineTheme({extends: y11Settings, name: 'y11', icons: myIcons});",
      "import myIcons from './icons.mjs';",
    );
    const text = await compile(
      'themes/y11/y11.theme.ts',
      '--icons-specifier',
      'my-icons',
    );
    expect(text.status).toBe(0);
    expect(text.stderr).toContain('without --icons-specifier');
    const json = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/y11/y11.theme.ts',
          '--icons-specifier',
          'my-icons',
        ])
      ).stdout,
    );
    expect(json.data.warnings.join(' ')).toContain('without --icons-specifier');
  }, 240_000);
});
