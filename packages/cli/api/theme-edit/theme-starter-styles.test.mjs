// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A starter whose theme imports a stylesheet in a language other than
 * CSS is refused, whatever its extension (the theme build's own list) and
 * with a query after it, before anything is written; a refusal that comes
 * after a stale theme was built puts that build back.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditPreviewApp} from './theme-edit.mjs';
import {isOtherLanguageStylesheet} from '../../foundation/fs/stylesheet-file.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-starter-styles-', FIXTURE_PACKAGES);
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

describe('a stylesheet in another language', () => {
  it('is named by the theme build list, a query or hash left out', () => {
    for (const spec of [
      './brand.scss',
      './brand.stylus',
      './brand.pcss',
      './brand.postcss',
      './brand.sss',
      './brand.scss?inline',
      './brand.less#x',
    ])
      expect(isOtherLanguageStylesheet(spec), spec).toBe(true);
    for (const spec of ['./brand.css', './brand.css?inline', './brand.ts'])
      expect(isOtherLanguageStylesheet(spec), spec).toBe(false);
  });

  it(
    'refuses a starter that imports one, before anything is written',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      const source = path.join(dir, 't.theme.ts');
      const original = fs.readFileSync(source, 'utf8');
      try {
        for (const spec of [
          './brand.stylus',
          './brand.pcss',
          './brand.postcss',
          './brand.sss',
          './brand.scss?inline',
        ]) {
          const file = path.join(
            dir,
            spec.replace(/^\.\//, '').replace(/\?.*$/, ''),
          );
          fs.writeFileSync(file, '');
          fs.writeFileSync(source, `import '${spec}';\n${original}`);
          const e = await refusal(() =>
            themeEditPreviewApp('q', {cwd, theme: 't'}),
          );
          expect(e.message, spec).toContain(
            `imports '${spec}', a stylesheet in another language than CSS`,
          );
          expect(fs.existsSync(path.join(cwd, 'q')), spec).toBe(false);
          fs.rmSync(file, {force: true});
        }
      } finally {
        fs.writeFileSync(source, original);
      }
    },
    T,
  );
});

describe('a refused starter from a stale theme', () => {
  it(
    'leaves every file of the theme as it was, times included',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      const source = path.join(dir, 't.theme.ts');
      const original = fs.readFileSync(source, 'utf8');
      /** Every file of the theme folder with its bytes. */
      const snapshot = () =>
        Object.fromEntries(
          /** @type {string[]} */ (fs.readdirSync(dir, {recursive: true}))
            .map(String)
            .filter(f => fs.statSync(path.join(dir, f)).isFile())
            .sort()
            .map(f => [
              f,
              {
                bytes: fs.readFileSync(path.join(dir, f), 'base64'),
                // A watcher sees a new time as a change.
                mtime: Math.round(fs.statSync(path.join(dir, f)).mtimeMs),
              },
            ]),
        );
      fs.writeFileSync(path.join(dir, 'extra.scss'), '');
      // A hand edit the build has not seen: the starter builds first.
      fs.writeFileSync(source, `import './extra.scss';\n${original}`);
      try {
        const before = snapshot();
        const folderTime = Math.round(fs.statSync(dir).mtimeMs);
        const e = await refusal(() =>
          themeEditPreviewApp('q', {cwd, theme: 't'}),
        );
        expect(e.message).toContain('Nothing was changed');
        expect(snapshot()).toEqual(before);
        expect(Math.round(fs.statSync(dir).mtimeMs)).toBe(folderTime);
        expect(fs.existsSync(path.join(cwd, 'q'))).toBe(false);
      } finally {
        fs.writeFileSync(source, original);
        fs.rmSync(path.join(dir, 'extra.scss'), {force: true});
      }
    },
    T,
  );
});
