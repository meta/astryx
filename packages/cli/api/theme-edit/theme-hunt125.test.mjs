// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Font family names are read as CSS reads them (escapes included);
 * a family held in the theme's own property counts as built; a theme bound
 * with `let` or `var` builds as a `const` does; compile gives the phone note
 * show gives, with a fix that works for weights; and the full report wires
 * an editor theme through its app copy.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {cssUnescape} from '../../foundation/text/css-escape.mjs';
import {
  collectUnloadedFonts,
  expandFontVars,
} from '../theme/build/font-warning.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt125-', FIXTURE_PACKAGES);
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

const B = '\\';

describe('font names as CSS reads them', () => {
  it('reads escapes as the characters they stand for', () => {
    expect(cssUnescape(`Gill${B} Sans`)).toBe('Gill Sans');
    expect(cssUnescape(`${B}5FAE${B}8F6F${B}96C5${B}9ED1`)).toBe('微软雅黑');
    expect(cssUnescape(`${B}31 23`)).toBe('123');
  });

  it('an escaped family in the theme own source builds', async () => {
    await themeEditNew('z4', {cwd});
    for (const family of [
      `Gill${B}${B} Sans, serif`,
      `"${B}${B}5FAE${B}${B}8F6F${B}${B}96C5${B}${B}9ED1", sans-serif`,
    ]) {
      writeSource(
        'z4',
        `export const z4Theme = defineTheme({extends: z4Settings, name: 'z4', tokens: {'--font-family-body': '${family.replace(/'/g, "\\'")}'}});`,
      );
      const r = await compile('themes/z4/z4.theme.ts');
      expect(r.status, family).toBe(0);
      expect(r.stdout + r.stderr).not.toContain('a font file or a link');
    }
  }, 240_000);
});

describe("a family held in the theme's own property", () => {
  it('reads var() through the theme own values', () => {
    expect(
      expandFontVars('var(--brand-font), serif', name =>
        name === '--brand-font' ? ['Lora'] : [],
      ),
    ).toEqual(['Lora, serif']);
    // A fallback is not a family the theme declares.
    expect(expandFontVars('var(--none, Inter)', () => [])).toEqual(['']);
    expect(
      collectUnloadedFonts({
        tokens: {'--brand-font': 'Lora, serif'},
        components: {button: {base: {fontFamily: 'var(--brand-font)'}}},
      }),
    ).toContain('Lora');
  });

  it('is loaded by the app copy once installed', async () => {
    await themeEditNew('z8', {cwd});
    writeSource(
      'z8',
      "export const z8Theme = defineTheme({extends: z8Settings, name: 'z8', localTokens: {'--brand-font': 'Lora, serif'}, components: {button: {base: {fontFamily: 'var(--brand-font)'}}}});",
    );
    const missing = await compile('themes/z8/z8.theme.ts');
    expect(missing.stdout + missing.stderr).toMatch(/not loaded[^\n]*Lora/);
    const remove = installFont('lora', 'Lora');
    try {
      expect((await compile('themes/z8/z8.theme.ts')).status).toBe(0);
      expect(read('src/themes/z8/z8.fonts.css')).toContain(
        '@fontsource/lora/index.css',
      );
    } finally {
      remove();
    }
  }, 240_000);
});

describe('a theme bound with let or var', () => {
  it('builds as a const does, and a reassigned one is refused naming that', async () => {
    const dir = path.join(cwd, 'plain9');
    fs.mkdirSync(dir, {recursive: true});
    // A base with an icon registry: the build follows the theme to carry it.
    fs.writeFileSync(
      path.join(dir, 'icons.mjs'),
      "export default {check: 'check'};\n",
    );
    fs.writeFileSync(
      path.join(dir, 'base.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport myIcons from './icons.mjs';\nexport const baseTheme = defineTheme({name: 'b', tokens: {}, icons: myIcons});\n",
    );
    for (const kind of ['let', 'var']) {
      fs.writeFileSync(
        path.join(dir, 'p.theme.ts'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTheme} from './base';\nexport ${kind} pTheme = defineTheme({extends: baseTheme, name: 'p'});\n`,
      );
      expect(
        (await cli(['theme', 'build', 'plain9/p.theme.ts'])).status,
        kind,
      ).toBe(0);
    }
    fs.writeFileSync(
      path.join(dir, 'p.theme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTheme} from './base';\nexport let pTheme = defineTheme({extends: baseTheme, name: 'p'});\npTheme = defineTheme({extends: baseTheme, name: 'p'});\n",
    );
    const r = await cli(['theme', 'build', 'plain9/p.theme.ts']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('pTheme is assigned again');
    expect(r.stdout + r.stderr).not.toContain('Theme sets');
  }, 240_000);
});

describe('own type tokens on phones', () => {
  it('compile gives the note show gives, and its fix for a weight is a same-screens rule that keeps it', async () => {
    await themeEditNew('z11', {cwd, like: 'neutral'});
    writeSource(
      'z11',
      "export const z11Theme = defineTheme({extends: z11Settings, name: 'z11', tokens: {'--text-heading-3-weight': '800'}});",
    );
    const text = await compile('themes/z11/z11.theme.ts');
    expect(text.stdout).toContain('on phones');
    const json = JSON.parse(
      (
        await cli([
          '--json',
          'experimental',
          'theme',
          'compile',
          'themes/z11/z11.theme.ts',
        ])
      ).stdout,
    );
    const note = json.data.notices.find((/** @type {string} */ n) =>
      n.includes('on phones'),
    );
    expect(note).toContain('adaptations: {rules: [');
    // Following the note keeps the weight on those screens.
    const rule = /\((adaptations: \{rules: \[.*\]\})\)$/.exec(note)?.[1];
    expect(rule).toBeTruthy();
    writeSource(
      'z11',
      `export const z11Theme = defineTheme({extends: z11Settings, name: 'z11', tokens: {'--text-heading-3-weight': '800'}, ${rule}});`,
    );
    const after = await compile('themes/z11/z11.theme.ts');
    expect(after.status).toBe(0);
    expect(after.stdout).not.toContain('on phones');
  }, 240_000);
});

describe('the full report of an editor theme', () => {
  it('wires the app copy, not the theme folder', async () => {
    await themeEditNew('z13', {cwd});
    const full = await compile('themes/z13/z13.theme.ts', '--detail', 'full');
    expect(full.stdout).toContain('theme add z13');
    expect(full.stdout).not.toContain("from '../themes/z13/z13'");
  }, 240_000);
});
