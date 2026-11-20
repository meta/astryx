// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A one-mode theme on a real bundled base keeps both halves of its colors
 * (a toast or a lightbox Core draws in the other mode reads the other
 * half); its mode is the one the app's <Theme> is given, which the wiring
 * writes. Its generated module carries only names Core's types take.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {themeImports} from './_preview.mjs';
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

/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-one-mode-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(CLI, 'package.json'))('typescript');

/**
 * Type errors in one generated file, checked with the starter app's
 * compiler options against Core's types (errors in other files, such as a
 * package's own types, are not the file's).
 * @param {string} file
 * @returns {string[]}
 */
function typeErrorsIn(file) {
  const config = JSON.parse(
    fs.readFileSync(path.join(CLI, 'assets/preview-app/tsconfig.json'), 'utf8'),
  );
  const {options} = ts.convertCompilerOptionsFromJson(
    {...config.compilerOptions, incremental: false, plugins: []},
    path.dirname(file),
  );
  return ts
    .getPreEmitDiagnostics(ts.createProgram([file], options))
    .filter((/** @type {any} */ d) => d.file?.fileName === file)
    .map((/** @type {any} */ d) =>
      ts.flattenDiagnosticMessageText(d.messageText, ' '),
    );
}

/** @param {string} slug @param {string} file */
const read = (slug, file) =>
  fs.readFileSync(path.join(cwd, 'themes', slug, file), 'utf8');

describe('a one-mode theme', () => {
  for (const [mode, half] of [
    ['dark-only', 'dark'],
    ['light-only', 'light'],
  ])
    it(`${mode} keeps both halves, type-checks, and is given its mode by <Theme>`, async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        return test.skip();
      }
      const slug = half[0] + 'k';
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'accent', '#e11d48', {cwd});
      const before = read(slug, `${slug}.css`);
      const r = await themeEditSet(slug, 'mode', mode, {cwd});
      // The colors keep both halves: the build is the two-mode one.
      expect(read(slug, `${slug}.css`)).toBe(before);
      expect(before).toContain('light-dark(');
      // Its mode is the one the app's <Theme> is given, as the wiring
      // writes it and the result says.
      expect(r.data.notes.join(' ')).toContain(`mode="${half}"`);
      const ctx = await context(cwd);
      const data = JSON.parse(read(slug, `${slug}.settings.json`));
      expect(themeImports(ctx, slug, data, cwd).mode).toBe(half);
      // The generated module type-checks against Core's types.
      const settings = path.join(cwd, 'themes', slug, `${slug}.settings.ts`);
      expect(typeErrorsIn(settings)).toEqual([]);
      expect(fs.readFileSync(settings, 'utf8')).not.toContain('color-scheme');
    }, 240_000);
});
