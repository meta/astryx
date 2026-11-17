// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Each command of the theme editor that draws pages, drawn for real
 * end to end: new, set and undo draw the sample page, show draws the sheet,
 * show --png takes its pictures, and preview add writes the preview app.
 * Every other test file stands in for the drawing (it costs seconds a page);
 * these keep a crash in the real drawing failing the suite.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (Drawn for real: that is what this file checks.)
realRenders(true);

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-renders-e2e-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The sample page as drawn. */
const preview = () =>
  fs.readFileSync(path.join(cwd, 'themes/t/preview.html'), 'utf8');
/** Whether a page holds components drawn for real. @param {string} html */
const drawn = html => /class="[^"]*\bastryx-button\b/.test(html);

describe('the drawing, end to end', () => {
  it(
    'new, set and undo draw the sample page',
    async () => {
      await themeEditNew('t', {cwd, like: 'neutral'});
      expect(drawn(preview())).toBe(true);
      await themeEditSet('t', 'accent', '#2563eb', {cwd});
      const set = preview();
      expect(drawn(set)).toBe(true);
      await themeEditUndo('t', {cwd});
      const undone = preview();
      expect(drawn(undone)).toBe(true);
      expect(undone).not.toBe(set);
    },
    T,
  );

  it(
    'show draws the sheet, and show --png takes its pictures',
    async () => {
      await themeEditShow('t', {cwd});
      const sheet = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet.html'),
        'utf8',
      );
      expect(drawn(sheet)).toBe(true);
      const shot = /** @type {any} */ (
        await themeEditShow('t', {cwd, png: true, section: 'actions'})
      );
      // (A machine with no browser names why instead of pictures.)
      if (!shot.data.pictures.length) {
        expect(shot.data.pictureProblem).toBeTruthy();
        return;
      }
      for (const p of shot.data.pictures)
        expect(
          fs.readFileSync(path.join(cwd, p)).subarray(0, 4).toString('hex'),
          p,
        ).toBe('89504e47');
    },
    T,
  );

  it(
    'preview add writes the preview app for the theme',
    async () => {
      // (A Next app with a root layout: where the preview goes.)
      fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
      fs.writeFileSync(
        path.join(cwd, 'app/layout.tsx'),
        'export default function L({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }\n',
      );
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
      );
      pkg.dependencies = {...pkg.dependencies, next: '*'};
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
      const r = /** @type {any} */ (
        await themeEditPreviewAdd(undefined, {cwd, theme: 't'})
      );
      expect([...r.data.added, ...r.data.refreshed].length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(cwd, r.data.folder))).toBe(true);
    },
    T,
  );
});
