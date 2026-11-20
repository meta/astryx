// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TypeScript's other ways to bring in a file: an
 * `import x = require('…')` is an import everywhere (theme build --watch
 * follows it); a `/// <reference path="…" />` before the first statement
 * brings in types, which the starter's type check reads. So a starter whose
 * theme reaches a file outside its folder either way is refused.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditPreviewApp} from './theme-edit.mjs';
import {
  parsedSpecifiers,
  referencedPaths,
} from '../../foundation/discovery/template-needs.mjs';
import {themeSourceFiles} from '../theme/build/build.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-starter-typescript-imports-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The theme source with one more import line, for the length of `fn`.
 * @param {string} line
 * @param {string} file the file the import names, made empty
 * @param {() => Promise<void>} fn
 */
async function withImport(line, file, fn) {
  const dir = path.join(cwd, 'themes/t');
  const source = path.join(dir, 't.theme.ts');
  const original = fs.readFileSync(source, 'utf8');
  // A data file the theme build reads holds data.
  fs.writeFileSync(path.join(dir, file), file.endsWith('.json') ? '{}' : '');
  fs.writeFileSync(source, `${line}\n${original}`);
  try {
    await fn();
  } finally {
    fs.writeFileSync(source, original);
    fs.rmSync(path.join(dir, file), {force: true});
    fs.rmSync(path.join(cwd, 'q'), {recursive: true, force: true});
  }
}

describe('TypeScript imports', () => {
  it('read an import-equals as an import, and a leading reference path apart', () => {
    const source = [
      '/// <reference path="../shared.ts" />',
      "/// <reference types='node' />",
      "import s = require('../helpers');",
      "import type t = require('./types');",
      'export const a = s;',
      '/// <reference path="./late.ts" />',
    ].join('\n');
    expect(parsedSpecifiers(source)).toEqual(['../helpers', './types']);
    expect(referencedPaths(source)).toEqual(['../shared.ts']);
  });

  it('make theme build --watch follow a file an import-equals brings in, and not a referenced one', () => {
    const dir = fs.mkdtempSync(path.join(cwd, 'watch-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'a.theme.ts'),
        [
          '/// <reference path="./types.ts" />',
          "import parts = require('./parts');",
          "export default {name: 'a', tokens: {'--color-accent': parts.accent}};",
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(dir, 'parts.ts'),
        "export const accent = '#f00';\n",
      );
      fs.writeFileSync(path.join(dir, 'types.ts'), 'export {};\n');
      expect(themeSourceFiles(path.join(dir, 'a.theme.ts'))).toEqual([
        path.join(dir, 'a.theme.ts'),
        path.join(dir, 'parts.ts'),
      ]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it(
    'refuse a starter whose theme references a file outside its folder',
    async () => {
      fs.writeFileSync(path.join(cwd, 'themes/shared.ts'), 'export {};\n');
      try {
        await withImport(
          '/// <reference path="../shared.ts" />',
          'unused.txt',
          async () => {
            const e = await refusal(() =>
              themeEditPreviewApp('q', {cwd, theme: 't'}),
            );
            expect(e.message).toContain("imports '../shared.ts'");
            expect(fs.existsSync(path.join(cwd, 'q')), 'no app').toBe(false);
          },
        );
      } finally {
        fs.rmSync(path.join(cwd, 'themes/shared.ts'), {force: true});
      }
    },
    T,
  );
});
