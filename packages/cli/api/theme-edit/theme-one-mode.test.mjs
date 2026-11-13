// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A one-mode theme on a real bundled base: nothing in its build keeps the
 * other mode, so it looks the same whatever the system asks for.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

const THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../themes',
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-one-mode-', FIXTURE_PACKAGES);
  // The bundled themes themselves, as an app that installs them has them.
  for (const like of ['butter', 'neutral']) {
    const link = path.join(
      path.dirname(cwd),
      'node_modules/@astryxdesign',
      `theme-${like}`,
    );
    fs.rmSync(link, {recursive: true, force: true});
    fs.symlinkSync(path.join(THEMES, like), link, 'dir');
  }
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

describe('a one-mode theme', () => {
  for (const [mode, half] of [
    ['dark-only', 'dark'],
    ['light-only', 'light'],
  ])
    it(`${mode} keeps no light-dark() and says its mode`, async () => {
      const slug = half[0] + 'k';
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'mode', mode, {cwd});
      const css = cssOf(slug);
      // The base theme's own deprecated local token is the one value the
      // editor cannot write (it is the base's, by its name); the theme's
      // color-scheme takes its mode's branch for it.
      const left = css
        .split('\n')
        .filter(
          l => l.includes('light-dark(') && !/--astryx-theme-neutral-/.test(l),
        );
      expect(left, left.slice(0, 5).join('\n')).toEqual([]);
      expect(css).toMatch(new RegExp(`color-scheme:\\s*${half}`));
    }, 240_000);
});
