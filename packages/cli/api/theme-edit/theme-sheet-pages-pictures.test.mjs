// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pages section draws the sample app whole (the app shell's cap
 * holds on the sheet only), and its pictures, cut between pages, are named
 * among the pictures to open and removed by a change, with what takes them
 * again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {lookAtPictures} from './_context.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {recordWritten} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

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
    'astryx-theme-sheet-pages-pictures-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the pages section', () => {
  it('draws the sample app whole: the app shell is capped on the sheet only', () => {
    expect(SHEET_CSS).toContain(
      '.cs-sheet .cs-item .astryx-app-shell{height:360px!important;min-height:0!important}',
    );
    expect(SHEET_CSS).not.toMatch(/(^|\})\.cs-item \.astryx-app-shell\{/);
  });

  it('is named among the pictures to open', () => {
    expect(
      lookAtPictures([
        'themes/t/preview.png',
        'themes/t/sheet-overlays.png',
        'themes/t/sheet-pages-1.png',
        'themes/t/sheet-pages-2.png',
      ]),
    ).toContain(
      'themes/t/sheet-pages-1.png, themes/t/sheet-pages-2.png (the sample app and each page template)',
    );
  });

  it(
    'has its cut pictures removed by a change, named with what takes them again',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      const cut = ['sheet-pages-1.png', 'sheet-pages-dark-2.png'];
      for (const n of cut) fs.writeFileSync(path.join(dir, n), 'png');
      recordWritten(
        cwd,
        't',
        cut.map(n => path.join(dir, n)),
      );
      const r = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'square', {cwd})
      );
      for (const n of cut)
        expect(fs.existsSync(path.join(dir, n)), n).toBe(false);
      const removed = r.data.notes.find((/** @type {string} */ n) =>
        n.startsWith('removed '),
      );
      expect(removed).toContain('themes/t/sheet-pages-1.png');
      expect(removed).toContain('show t --png --section pages');
    },
    T,
  );
});
