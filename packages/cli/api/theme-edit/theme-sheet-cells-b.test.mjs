// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet's pictures read whole: a tall family's picture is cut
 * into pictures a reader takes in whole, between parts; a looping animation
 * is pictured at a frame a person sees; a required prop the doc's defaults
 * leave out is sampled; a vertical part has a height; a wide part's
 * variants each take a row; a deprecated part and an overlay the open
 * states draw are not drawn closed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {FAMILY_PICTURE_HEIGHT} from './_context.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {
  cutTall,
  decodePng,
  encodePng,
  pngTexts,
  EDITOR_STAMP,
} from './_png.mjs';
import {demoProps} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {showcaseItems} from './_preview.mjs';
import {SETTLE_ANIMATIONS} from '../../foundation/render/picture-window.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/**
 * A picture `height` rows tall, 4 wide: a gray mark on each row, with a
 * white band 14 rows tall (the page between two rows of cells) starting at
 * each of `bands`, by default every 400th row.
 * @param {number} height
 * @param {number[]} [bands]
 */
function picture(height, bands) {
  const rgba = new Uint8Array(4 * height * 4).fill(255);
  const at =
    bands ?? Array.from({length: Math.ceil(height / 400)}, (_, k) => k * 400);
  for (let y = 0; y < height; y++)
    if (!at.some(b => y >= b && y < b + 14))
      rgba.set([128, 128, 128, 255], y * 16 + 4);
  return {width: 4, height, rgba};
}

/** How tall the stand-in browser draws each page, by its file name. */
const tall = {/** @type {number} */ value: 4000};

vi.mock('./_preview.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  const png = await import('./_png.mjs');
  return {
    ...real,
    screenshots: async (
      /** @type {any} */ _project,
      /** @type {Array<{html: string, png: string}>} */ jobs,
    ) =>
      jobs.map(({html, png: out}) => {
        fs.writeFileSync(
          out,
          png.encodePng(picture(/sheet-inputs/.test(html) ? tall.value : 300)),
        );
        return {ok: true};
      }),
  };
});

const T = 300_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-sheet-cells-b-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a tall picture', () => {
  it('is cut into readable pictures between parts, losing no row', () => {
    const pic = picture(4000);
    const pieces = cutTall(pic, 1600);
    expect(pieces.map(p => p.height)).toEqual([1214, 1600, 1186]);
    expect(Buffer.concat(pieces.map(p => Buffer.from(p.rgba)))).toEqual(
      Buffer.from(pic.rgba),
    );
    // Each cut piece ends on a white row.
    for (const p of pieces.slice(0, -1))
      expect([...p.rgba.subarray((p.height - 1) * 16)]).toEqual(
        Array(16).fill(255),
      );
    expect(cutTall(picture(900), 1600)).toHaveLength(1);
    // Never inside a row: a single plain row (inside a cell) is no cut, and
    // a row taller than the limit is a piece of its own.
    const tallRow = picture(3000, [300]);
    tallRow.rgba.fill(255, 1500 * 16, 1501 * 16);
    expect(cutTall(tallRow, 1600).map(p => p.height)).toEqual([314, 2686]);
    // A last piece under 300px joins the one before it.
    expect(cutTall(picture(1750, [1500]), 1600).map(p => p.height)).toEqual([
      1750,
    ]);
    const back = decodePng(encodePng(pieces[1]));
    expect(back.height).toBe(1600);
    expect(Buffer.from(back.rgba)).toEqual(Buffer.from(pieces[1].rgba));
  });

  it(
    "show --section inputs --png cuts a tall family's picture into pictures in order, and removes them once it fits",
    async () => {
      const dir = path.join(cwd, 'themes/t');
      tall.value = 4000;
      const r = /** @type {any} */ (
        await themeEditShow('t', {cwd, png: true, section: 'inputs'})
      );
      const cut = ['1', '2', '3'].map(n => `themes/t/sheet-inputs-${n}.png`);
      expect(r.data.pictures).toEqual(expect.arrayContaining(cut));
      expect(r.data.pictures).not.toContain('themes/t/sheet-inputs.png');
      expect(fs.existsSync(path.join(dir, 'sheet-inputs.png'))).toBe(false);
      for (const f of cut) {
        const bytes = fs.readFileSync(path.join(cwd, f));
        expect(decodePng(bytes).height).toBeLessThanOrEqual(
          FAMILY_PICTURE_HEIGHT,
        );
        expect(pngTexts(bytes)[EDITOR_STAMP]).toBe('t');
      }
      expect(r.data.look).toContain(cut.join(', '));
      // A short family stays one picture; the cut ones go.
      tall.value = 900;
      const again = /** @type {any} */ (
        await themeEditShow('t', {cwd, png: true, section: 'inputs'})
      );
      expect(again.data.pictures).toContain('themes/t/sheet-inputs.png');
      for (const f of cut) expect(fs.existsSync(path.join(cwd, f))).toBe(false);
    },
    T,
  );
});

describe('the sheet', () => {
  it('pictures a looping animation mid-round, in both browsers', () => {
    expect(SETTLE_ANIMATIONS).toMatch(/a\.pause\(\)/);
    expect(SETTLE_ANIMATIONS).toMatch(/currentTime = .*duration.* \/ 2/);
    const dir = path.resolve(import.meta.dirname, '../../foundation/render');
    expect(
      fs.readFileSync(path.join(dir, 'picture-playwright.mjs'), 'utf8'),
    ).toContain("animations: 'allow'");
    expect(SHEET_CSS).not.toContain('animation:none');
  });

  it('gives a vertical part a height and a wide part a row per variant', () => {
    expect(SHEET_CSS).toContain(
      '.cs-item:has([role="separator"][aria-orientation="vertical"]) [data-astryx-theme]{display:flex;height:64px}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-sheet>.cs-cell:has(table,pre,.astryx-app-shell)>.cs-row>.cs-item{flex-basis:100%}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-item .astryx-app-shell{height:360px!important;min-height:0!important}',
    );
  });

  it(
    'samples a required prop the defaults leave out, and draws a deprecated part or an overlay the open states show nowhere closed',
    async () => {
      const project = await openProject(cwd);
      expect(/** @type {any} */ (demoProps(project, 'StatusDot')).variant).toBe(
        'success',
      );
      const {items} = showcaseItems(project, undefined);
      expect(items.some(it => it.name === 'BottomSheetSwitcher')).toBe(false);
      expect(items.some(it => it.name === 'MobileNav')).toBe(false);
      expect(items.some(it => it.name === 'MobileNav open')).toBe(true);
      // A card's sample children, named in its doc by an older name, are
      // drawn by the names Core exports.
      const card = JSON.stringify(
        items.find(it => it.name === 'ClickableCard')?.tree,
      );
      const named = /** @type {any} */ (
        project.components.ClickableCard.defaults
      ).children.__element;
      expect(named).not.toBe('VStack');
      expect(card).toContain('"__element":"VStack"');
      expect(card).not.toContain(`"__element":"${named}"`);
      expect(SHEET_CSS).toContain(
        '.cs-item .astryx-aspect-ratio{outline:1px dashed #8888}',
      );
      const section = items.find(it => it.name === 'Section');
      expect(JSON.stringify(section?.tree)).toContain('Sample content');
    },
    T,
  );
});
