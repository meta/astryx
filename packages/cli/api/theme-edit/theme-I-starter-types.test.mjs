// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A starter whose theme imports a file only a bundler loads by a name
 * the new app's type check reads no declaration for (a CSS file with a
 * query, a hash or an upper-case extension, a font file) is refused before
 * anything is written; a plain .css file and a picture are copied.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditPreviewApp} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-I-starter-types-', FIXTURE_PACKAGES);
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
  fs.writeFileSync(path.join(dir, file), '');
  fs.writeFileSync(source, `${line}\n${original}`);
  try {
    await fn();
  } finally {
    fs.writeFileSync(source, original);
    fs.rmSync(path.join(dir, file), {force: true});
    fs.rmSync(path.join(cwd, 'q'), {recursive: true, force: true});
  }
}

describe('a starter whose theme imports a file only a bundler loads', () => {
  it(
    'is refused for a name the new app types no declaration for',
    async () => {
      for (const [spec, file, line] of [
        ['./brand.css?inline', 'brand.css', null],
        ['./brand.css?url', 'brand.css', null],
        ['./brand.css#x', 'brand.css', null],
        ['./brand.CSS', 'brand.CSS', null],
        [
          './brand.woff2',
          'brand.woff2',
          "import f from './brand.woff2';\nvoid f;",
        ],
        ['./brand.ttf', 'brand.ttf', "import f from './brand.ttf';\nvoid f;"],
      ])
        await withImport(
          line ?? `import '${spec}';`,
          String(file),
          async () => {
            const e = await refusal(() =>
              themeEditPreviewApp('q', {cwd, theme: 't'}),
            );
            expect(e.message, spec).toContain(
              `imports '${spec}', a file whose name the new app's type check has no declaration for`,
            );
            expect(fs.existsSync(path.join(cwd, 'q')), spec).toBe(false);
          },
        );
    },
    T,
  );

  it(
    'is copied for a plain .css file and a picture',
    async () => {
      await withImport("import './brand.css';", 'brand.css', async () => {
        const r = await themeEditPreviewApp('q', {cwd, theme: 't'});
        expect(fs.existsSync(path.join(cwd, 'q/themes/t/brand.css'))).toBe(
          true,
        );
        expect(r.data).toBeTruthy();
      });
      await withImport(
        "import logo from './logo.svg';\nvoid logo;",
        'logo.svg',
        async () => {
          await themeEditPreviewApp('q', {cwd, theme: 't'});
          expect(fs.existsSync(path.join(cwd, 'q/themes/t/logo.svg'))).toBe(
            true,
          );
        },
      );
    },
    T,
  );
});
