// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet's cells draw each part whole: a drawn hover applies no
 * rule a real hover would not (a forced-colors one), a cell is as tall as
 * what it holds, a part that needs a row's width takes the row, and an
 * empty container holds sample text.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import postcss from 'postcss';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {cutCss} from '../../foundation/render/css-cut.mjs';
import {desktopMatches} from '../../foundation/render/picture-window.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-sheet-cells-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the picture window', () => {
  it('has no forced colors, no contrast preference and a color screen', () => {
    expect(desktopMatches('(forced-colors: active)')).toBe(false);
    expect(desktopMatches('(forced-colors: none)')).toBe(true);
    expect(desktopMatches('(forced-colors)')).toBe(false);
    expect(desktopMatches('(prefers-contrast: more)')).toBe(false);
    expect(desktopMatches('(inverted-colors: inverted)')).toBe(false);
    expect(desktopMatches('(monochrome)')).toBe(false);
  });

  it('is sure only of what it answers', () => {
    expect(desktopMatches('(hover: hover)', {sure: true})).toBe(true);
    expect(desktopMatches('(prefers-reduced-motion: reduce)')).toBe(true);
    expect(
      desktopMatches('(prefers-reduced-motion: reduce)', {sure: true}),
    ).toBe(false);
  });
});

describe('a drawn hover', () => {
  it('copies no rule a real hover in that window would not apply', () => {
    const css =
      '@media (hover: hover){@media (forced-colors: active){.a:hover{background-color:Highlight}}}' +
      '@media (hover: hover){@media (prefers-reduced-motion: reduce){.b:hover{color:red}}}';
    const out = cutCss(css, new Set(['a', 'b']), {states: true});
    /** @type {string[]} */
    const free = [];
    postcss.parse(out).walkRules(rule => {
      if (rule.parent?.type === 'root') free.push(rule.toString());
    });
    expect(free).toEqual([]);
  });
});

describe('a sheet cell', () => {
  it('is as tall as what it holds, and a wide part takes the row', () => {
    expect(SHEET_CSS).not.toMatch(/(^|\})\.cs-cell\{[^}]*max-height/);
    expect(SHEET_CSS).not.toMatch(/\.cs-open-group \.cs-cell\{[^}]*max-height/);
    expect(SHEET_CSS).toContain(
      '.cs-sheet>.cs-cell:has(table,pre,.astryx-app-shell){grid-column:1/-1}',
    );
    expect(SHEET_CSS).toMatch(/\.cs-item\{[^}]*flex:1 1 200px/);
  });

  it(
    'gives an empty container sample text',
    async () => {
      // The containers' own sheet: the whole sheet is not needed.
      await themeEditShow('t', {cwd, section: 'containers'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-containers.html'),
        'utf8',
      );
      for (const name of ['Section', 'FormLayout']) {
        const at = html.indexOf(`<div class="cs-name">${name}</div>`);
        expect(at, name).toBeGreaterThan(-1);
        const cell = html.slice(
          at,
          html.indexOf('<div class="cs-name">', at + 1),
        );
        expect(cell, name).toContain('Sample content');
      }
    },
    T,
  );
});
