// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pages section draws the sample app whole (the app shell's cap
 * holds on the sheet only), and its pictures, cut between pages, are named
 * among the pictures to open.
 */

import {describe, expect, it} from 'vitest';
import {lookAtPictures} from './_context.mjs';
import {SHEET_CSS} from './_catalog.mjs';

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
});
