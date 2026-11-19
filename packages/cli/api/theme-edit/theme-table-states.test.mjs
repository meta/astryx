// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The open states page draws a table with a row selected and a column
 * sorted, as the browser shows it: Core marks the selected row and the
 * sorted column as it mounts, so the server render alone has neither.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {OPEN_SCENES, elementNames} from './_catalog.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-table-states-', FIXTURE_PACKAGES);
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

describe('a table on the open states page', () => {
  it('names the hooks its plugins call, so the page imports them', () => {
    const table = OPEN_SCENES.find(s => s.name === 'Table');
    expect(table).toBeTruthy();
    expect([...elementNames(table?.tree)].sort()).toEqual([
      'Table',
      'useTableSelection',
      'useTableSortable',
    ]);
  });

  it(
    'is drawn with its row selected and its column sorted',
    async () => {
      await themeEditShow('t', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-overlays.html'),
        'utf8',
      );
      const at = html.indexOf(
        '<div class="cs-name">Table selected and sorted</div>',
      );
      expect(at).toBeGreaterThan(-1);
      const cell = html.slice(
        at,
        html.indexOf('<div class="cs-name">', at + 1),
      );
      // The selected row carries its state and the wash Core paints on it.
      const row = /<tr\b[^>]*\baria-selected="true"[^>]*>/.exec(cell)?.[0];
      expect(row).toBeTruthy();
      expect(row).toContain('data-selected="selected"');
      expect(row).toContain('--color-accent-muted');
      expect(cell).toContain('aria-sort="ascending"');
    },
    T,
  );
});
