// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet shows each overlay open, in light and dark: a tooltip, a
 * popover, a hover card and a dropdown's menu (which Core places only once
 * mounted) are drawn open beside their triggers, and a panel over the page
 * shows at its cell's size. show names the parts with a fill of their own
 * that the theme leaves on its base's look. The author-a-theme guide's
 * first section points to the editor, and the theme topic answers a search
 * for brand colors.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {docs as authorDocs} from '../../assets/docs/author-a-theme.doc.mjs';
import {docs as themeDocs} from '../../assets/docs/theme.doc.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-sheet-overlay-open-light-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The cell of one component in the sheet. @param {string} html @param {string} name */
const cell = (html, name) =>
  html.split('class="cs-cell"').find(c => c.includes(`>${name}</div>`)) ?? '';

describe('the overlays section', () => {
  it('draws each anchored overlay open beside its trigger, in light and dark', async () => {
    await themeEditShow('t', {cwd, section: 'overlays'});
    const html = fs.readFileSync(
      path.join(cwd, 'themes/t/sheet-overlays.html'),
      'utf8',
    );
    for (const name of ['Tooltip', 'Popover', 'HoverCard']) {
      const c = cell(html, name);
      // The layer itself, with Core's classes, not only its marker.
      expect(c, name).toMatch(/data-astryx-layer-root=""[^>]*popover=/);
      expect(c, name).not.toContain('<template></template>');
      expect(c, name).not.toContain('astryx-layer data-layer');
    }
    // A dropdown's menu, opened from its own prop, is shown with them.
    expect(cell(html, 'DropdownMenu')).toMatch(/role="menu"/);
  }, 240_000);

  it('shows a panel over the page in its cell, and a layer in place', () => {
    expect(SHEET_CSS).toContain('.cs-cell dialog{display:block!important');
    expect(SHEET_CSS).toContain(
      '.cs-cell [popover][data-astryx-layer-root]{display:block!important',
    );
  });
});

describe('show', () => {
  it('names the parts with a fill of their own the theme leaves on its base look', async () => {
    await themeEditSet('t', 'accent', '#d0021b', {cwd});
    const r = await themeEditShow('t', {cwd});
    const unreached = /** @type {any} */ (r).data.unreached;
    expect(unreached).toContain('toast');
    expect(unreached).toContain('banner');
    // A part that reads the accent is reached.
    expect(unreached).not.toContain('button');
    await themeEditSet('t', 'background-color', '#222222', {cwd, on: 'toast'});
    const after = /** @type {any} */ (await themeEditShow('t', {cwd})).data
      .unreached;
    expect(after).not.toContain('toast');
  }, 240_000);
});

describe('docs', () => {
  it("the author-a-theme guide's first words point to the editor", () => {
    const first = /** @type {any} */ (authorDocs).sections[0].content[0];
    expect(first.text).toContain('experimental theme editor new');
  });

  it('the theme topic is found by brand and color words', () => {
    expect(themeDocs.keywords).toEqual(
      expect.arrayContaining(['brand colors', 'change theme colors']),
    );
  });
});
