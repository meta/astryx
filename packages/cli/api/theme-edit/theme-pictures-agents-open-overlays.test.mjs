// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pictures agents open show the overlays: the sample page has a
 * strip of a tooltip, a popover, a menu and a list drawn open below it; the
 * overlays sheet shows the small overlays first, five to a row, without the
 * parts of an overlay alone. A change names the pictures to take, and
 * counts what the theme's changes did not reach near its top; show lists
 * those last, where a tail of its output keeps them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-agents-open-overlays-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the sample page', () => {
  it(
    'draws a tooltip, a popover, a menu and a list open in a strip below it',
    async () => {
      await themeEditShow('t', {cwd});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/preview.html'),
        'utf8',
      );
      const strip = html.slice(html.indexOf('class="cs-strip"'));
      expect(strip.length).toBeGreaterThan(0);
      for (const name of ['Tooltip', 'Popover', 'DropdownMenu', 'Selector'])
        expect(strip).toContain(`>${name}</div>`);
      expect(strip).toMatch(/role="tooltip"/);
      expect(strip).toMatch(/role="menu"/);
      expect(strip).toMatch(/role="listbox"/);
    },
    T,
  );
});

describe('the overlays sheet', () => {
  it(
    'shows the small overlays first, five to a row, and no part of an overlay alone',
    async () => {
      await themeEditShow('t', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-overlays.html'),
        'utf8',
      );
      const cells = [...html.matchAll(/class="cs-name">([A-Za-z]+)</g)].map(
        m => m[1],
      );
      expect(cells.indexOf('Tooltip')).toBeLessThan(cells.indexOf('Dialog'));
      expect(cells.indexOf('DropdownMenu')).toBeLessThan(
        cells.indexOf('Drawer'),
      );
      for (const part of ['DialogHeader', 'DrawerHeader', 'CommandPaletteItem'])
        expect(cells).not.toContain(part);
      expect(SHEET_CSS).toContain(
        '.cs-open-group .cs-sheet{grid-template-columns:repeat(5,minmax(0,1fr))}',
      );
    },
    T,
  );
});

describe('what a change says', () => {
  it(
    'names the pictures to take, and counts what the changes did not reach',
    async () => {
      const r = await runCli([...ED, 'set', 't', 'accent', '#5E6AD2'], {cwd});
      const lines = r.stdout.split('\n');
      const see = lines.find(l => l.startsWith('see:')) ?? '';
      expect(see).toMatch(/show t --png writes themes\/t\/preview\.png/);
      expect(see).toContain('themes/t/sheet-overlays.png');
      const at = lines.findIndex(l =>
        /^missed: +\d+ miss(es)? on \d+ parts? the theme's changes did not reach/.test(
          l,
        ),
      );
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(6);
      const json = JSON.parse(
        (await runCli([...ED, 'set', 't', 'corners', 'round', '--json'], {cwd}))
          .stdout,
      );
      expect(typeof json.data.missed).toBe('number');
    },
    T,
  );

  it(
    'show lists the missed parts just before the generated files, where a tail keeps them',
    async () => {
      await themeEditSet('t', 'neutral', '#6b7280', {cwd});
      const out = (await runCli([...ED, 'show', 't'], {cwd})).stdout
        .trimEnd()
        .split('\n');
      const at = out.findIndex(l =>
        /^missed \(\d+ miss(es)? on \d+ parts?/.test(l),
      );
      expect(at).toBeGreaterThan(-1);
      // The generated files stay last, right after the missed block.
      const files = out.findIndex(l => /^colorFiles:/.test(l));
      expect(files).toBeGreaterThan(at);
      expect(
        out.slice(at, files).some(l => /^(colors|colorNotes):/.test(l)),
      ).toBe(false);
      // The block itself is short: six parts with their lines and the
      // count (the open problems, when there are any, come after the files).
      expect(files - at).toBeLessThanOrEqual(18);
    },
    T,
  );
});
