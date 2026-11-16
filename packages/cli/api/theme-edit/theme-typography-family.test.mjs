// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The editor judges a typography family by what Core writes: a
 * quoted name without a space and a list without one build as written, so
 * compile takes them; a quoted name with a space is still refused. And a
 * weight number in any form CSS reads (`Inter +500`, `Inter 1e3`) after a
 * known family, or a weight before it (`700 Inter`, `bold Inter`), is a
 * weight on the font dial.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-typography-family-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * Compile the theme with its typography body family written as given.
 * @param {string} family the family's source, quotes included
 */
const compileWith = async family => {
  const file = path.join(cwd, 'themes/t/t.theme.ts');
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(
    file,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nexport const tTheme = defineTheme({\n  extends: tSettings,\n  name: 't',\n  typography: {body: {family: ${family}}},\n});\n`,
  );
  try {
    const r = await runCli(
      ['experimental', 'theme', 'compile', 'themes/t/t.theme.ts', '--json'],
      cwd,
    );
    return JSON.parse(r.stdout);
  } finally {
    fs.writeFileSync(file, before);
  }
};

describe('a typography family in the theme file', () => {
  it('builds a quoted name or a list without a space as written', async () => {
    for (const family of [`'"Lato"'`, `"'Lato'"`, `'Lato,serif'`]) {
      const r = await compileWith(family);
      expect(r.error, family).toBeUndefined();
    }
  }, 240_000);

  it('refuses a quoted name with a space, naming what Core writes', async () => {
    const r = await compileWith(`'"Open Sans"'`);
    expect(r.error).toMatch(/Core adds its own around a name with a space/);
  }, 120_000);
});

describe('a weight beside a known family on the font dial', () => {
  it('is a weight in any form CSS reads', async () => {
    for (const typed of [
      'Inter +500',
      'Inter 1e3',
      '700 Inter',
      'bold Inter',
      '600 Georgia',
    ]) {
      /** @type {any} */
      let err = null;
      try {
        await themeEditSet('t', 'font', typed, {cwd});
      } catch (e) {
        err = e;
      }
      expect(err, typed).not.toBeNull();
      expect(String(err.message), typed).toMatch(
        /holds a weight where a family goes/,
      );
    }
  }, 120_000);
});
