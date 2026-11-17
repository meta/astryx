// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The open states are in a picture people and agents open: `--png`
 * takes sheet-overlays.png (every menu, tooltip, popover and list drawn
 * open) beside preview.png, on show and on a change, and the result of
 * `new` names it. A typeahead, whose doc requires a search source, is in
 * the catalog the part data is read from, so its list is recorded.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {demoProps, partData, renderGenerated} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {SAMPLE_SOURCE, pageSource} from './_catalog.mjs';
import {showcaseItems} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read drawn components: drawn for real.)
realRenders(true);

// The renders are stood in for, and a picture is a few bytes where the
// browser would write it: these tests are about which pictures are taken.
vi.mock('./_preview.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(real);
  return {
    ...stubbed,
    screenshots: async (
      /** @type {any} */ _project,
      /** @type {Array<{png: string}>} */ jobs,
    ) =>
      jobs.map(({png}) => {
        fs.writeFileSync(png, 'png');
        return {ok: true};
      }),
  };
});

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-open-states-picture-people-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the open states picture', () => {
  it(
    'show --png takes sheet-overlays.png beside preview.png, and a change with --png takes it again',
    async () => {
      const shown = /** @type {any} */ (
        await themeEditShow('t', {cwd, png: true})
      );
      expect(
        shown.data.pictures.map((/** @type {string} */ p) => path.basename(p)),
      ).toEqual([
        'preview.png',
        'preview-dark.png',
        'sheet-overlays.png',
        'sheet-overlays-dark.png',
        // (The family the theme sets a part of: the buttons, when it sets
        // none or only dials.)
        'sheet-actions.png',
        'sheet-actions-dark.png',
      ]);
      const changed = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'square', {cwd, png: true})
      );
      expect(
        changed.data.pictures.map((/** @type {string} */ p) =>
          path.basename(p),
        ),
      ).toEqual([
        'preview.png',
        'preview-dark.png',
        'sheet-overlays.png',
        'sheet-overlays-dark.png',
      ]);
      // Made from the build there is now: never named as out of date.
      expect(String(changed.data.sheetStale ?? '')).not.toContain(
        'sheet-overlays.html',
      );
      // A change without --png removes the open states picture with the
      // others, and names plain show --png, which takes it again.
      const plain = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'pill', {cwd})
      );
      expect(fs.existsSync(path.join(cwd, 'themes/t/sheet-overlays.png'))).toBe(
        false,
      );
      const removed = plain.data.notes.find((/** @type {string} */ n) =>
        n.startsWith('removed '),
      );
      expect(removed).toContain('themes/t/sheet-overlays.png');
      expect(removed).toMatch(/show t --png take new ones$/);
      expect(removed).not.toContain('--section overlays');
      // A section asked for is its own picture in place of sheet.png, and
      // the open states come with it, as with every --png.
      const section = /** @type {any} */ (
        await themeEditShow('t', {cwd, png: true, section: 'inputs'})
      );
      expect(
        section.data.pictures.map((/** @type {string} */ p) =>
          path.basename(p),
        ),
      ).toEqual([
        'preview.png',
        'preview-dark.png',
        'sheet-overlays.png',
        'sheet-overlays-dark.png',
        'sheet-inputs.png',
        'sheet-inputs-dark.png',
      ]);
    },
    T,
  );

  it(
    "new's look-at-it line names the open states picture",
    async () => {
      const r = await runCli(
        ['experimental', 'theme', 'editor', 'new', 'u', '--like', 'neutral'],
        cwd,
      );
      expect(r.stdout).toContain(
        'sheet-overlays.png (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, open)',
      );
      expect(r.stdout).toContain(
        'open the family pictures, preview.png and sheet-overlays.png',
      );
    },
    T,
  );
});

describe('a typeahead in the catalog', () => {
  it(
    'is shown with the sample search source, and its list is recorded',
    async () => {
      const project = await openProject(cwd);
      expect(demoProps(project, 'Typeahead')).toMatchObject({
        searchSource: SAMPLE_SOURCE,
        value: null,
      });
      fs.rmSync(path.join(project.cacheDir, 'parts.json'), {force: true});
      const data = await partData(project);
      expect(Object.keys(data.map)).toEqual(
        expect.arrayContaining(['typeahead', 'typeahead-dropdown']),
      );
    },
    T,
  );
});

describe('a typeahead drawn open', () => {
  it(
    'opens its list when the drawing types into it, beside a part that loads the client with the page',
    async () => {
      const project = await openProject(cwd);
      const {items, imports} = showcaseItems(project, 'overlays');
      // The typeahead's open look, with a toast, whose module loads React
      // DOM's client as the page loads.
      const chosen = items.filter(
        i => i.name === 'Typeahead' || i.name === 'Toast',
      );
      expect(chosen.map(i => i.name)).toEqual(
        expect.arrayContaining(['Typeahead', 'Toast']),
      );
      const {markup} = await renderGenerated(
        project,
        'typeahead-open.mjs',
        pageSource({items: chosen, imports, theme: null, layout: 'sheet'}),
      );
      expect(markup).toContain('astryx-typeahead-dropdown');
      expect(markup).toContain('astryx-typeahead-item');
    },
    T,
  );
});
