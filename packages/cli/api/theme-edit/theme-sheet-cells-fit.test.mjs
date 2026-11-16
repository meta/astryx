// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet's cells are never narrower than what they hold (a
 * calendar, a stepper, a toolbar, an overlay drawn open), so nothing is cut
 * at a cell's edge; the pages section draws the sample app whole and its
 * picture is named among the pictures to open; and a change removes the
 * pictures cut from a tall one with the others.
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
  cwd = makeLinkedFixture('astryx-theme-sheet-cells-fit-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a sheet cell', () => {
  it('is never narrower than what it holds, and wraps with the others', () => {
    expect(SHEET_CSS).toContain(
      '.cs-sheet{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px;padding:14px}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-sheet>.cs-cell{flex:1 1 360px;min-width:min-content;max-width:100%;box-sizing:border-box}',
    );
    expect(SHEET_CSS).toMatch(/\.cs-item\{[^}]*min-width:min-content/);
    // An overlay drawn open keeps its own width: its cell grows to it.
    expect(SHEET_CSS).not.toMatch(
      /\.cs-cell \[popover\]\[data-astryx-layer-root\]\{[^}]*max-width:100%/,
    );
    expect(SHEET_CSS).not.toMatch(/grid-template-columns:repeat\(3/);
  });

  it('caps an app shell on the sheet only, so the pages section draws the sample app whole', () => {
    expect(SHEET_CSS).toContain(
      '.cs-sheet .cs-item .astryx-app-shell{height:360px!important;min-height:0!important}',
    );
    expect(SHEET_CSS).not.toContain("'.cs-item .astryx-app-shell{height:360px");
  });
});

describe('the pages section', () => {
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
});

describe('a change', () => {
  it(
    'removes the pictures cut from a tall one with the others',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      const cut = ['sheet-containers-1.png', 'sheet-containers-dark-2.png'];
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
      expect(removed).toContain('themes/t/sheet-containers-1.png');
      expect(removed).toContain('show t --png --section containers');
    },
    T,
  );
});
