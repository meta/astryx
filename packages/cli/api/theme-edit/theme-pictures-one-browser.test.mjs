// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show --png takes every picture with one browser start; a group of
 * parts (`--on inputs`) counts as the parts it sets, for the families
 * pictured; a focus ring at a cell's edge shows whole; the sample page has
 * a link in its running text and one in a card.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {touchedFamilies} from './_preview.mjs';
import {SAMPLE_PAGE, SHEET_CSS} from './_catalog.mjs';
import {encodePng} from './_png.mjs';
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

const T = 300_000;

/** @type {string} */
let cwd;
const savedPath = process.env.PATH;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-one-browser-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  process.env.PATH = savedPath;
  if (cwd) removeLinkedFixture(cwd);
});

describe('show --png', () => {
  it(
    'takes every picture with one browser start',
    async () => {
      // A Playwright stand-in that counts its starts and writes each picture.
      const pw = path.join(cwd, 'node_modules/playwright');
      fs.mkdirSync(pw, {recursive: true});
      const starts = path.join(pw, 'starts');
      fs.writeFileSync(
        path.join(pw, 'package.json'),
        JSON.stringify({name: 'playwright', main: 'index.js'}),
      );
      const png = encodePng({
        width: 1,
        height: 1,
        rgba: new Uint8Array(4).fill(255),
      });
      fs.writeFileSync(
        path.join(pw, 'index.js'),
        `const fs = require('fs');
         exports.chromium = {async launch() {
           fs.appendFileSync(${JSON.stringify(starts)}, 'x');
           return {
             async newPage() { return {async route() {}, async goto() {}, async evaluate() {}, async screenshot({path}) { fs.writeFileSync(path, Buffer.from(${JSON.stringify(png.toString('base64'))}, 'base64')); }}; },
             async close() {},
           };
         }};`,
      );
      // No Chrome to fall back to.
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-nochrome-'));
      process.env.PATH = `${empty}${path.delimiter}${path.dirname(process.execPath)}`;
      try {
        const r = /** @type {any} */ (
          await themeEditShow('t', {cwd, png: true})
        );
        expect(r.data.pictures).toEqual([
          'themes/t/preview.png',
          'themes/t/preview-dark.png',
          'themes/t/sheet-overlays.png',
          'themes/t/sheet-overlays-dark.png',
          'themes/t/sheet-actions.png',
          'themes/t/sheet-actions-dark.png',
        ]);
        expect(fs.readFileSync(starts, 'utf8')).toBe('x');
      } finally {
        process.env.PATH = savedPath;
        fs.rmSync(empty, {recursive: true, force: true});
        fs.rmSync(pw, {recursive: true, force: true});
      }
    },
    T,
  );

  it('counts a group of parts as the parts it sets', async () => {
    const ctx = await context(cwd);
    /** @param {string} on */
    const families = on =>
      touchedFamilies(
        ctx,
        /** @type {any} */ ({
          settings: [{thing: 'x', value: 'y', source: 'property', on}],
        }),
      );
    expect(families('inputs')).toContain('inputs');
    expect(families('containers')).toContain('containers');
    expect(families('badge')).toEqual(['feedback']);
    // A family role is read from the census, as the change reads it.
    expect(families('option-rows')).not.toEqual([]);
    expect(families('button-like')).toContain(families('button')[0]);
  });
});

describe('the pages pictured', () => {
  it('give a focus ring at a cell edge room', () => {
    expect(SHEET_CSS).toContain(
      '.cs-cell{border:1px dashed #8885;padding:10px;overflow:clip;overflow-clip-margin:8px}',
    );
    expect(SHEET_CSS).toContain(
      '.cs-states-cell{min-width:0;overflow:clip;overflow-clip-margin:8px;padding:6px}',
    );
  });

  it('show a link in running text and in a card', () => {
    /** @type {string[]} */
    const where = [];
    /** @param {any} v @param {string[]} up */
    const walk = (v, up) => {
      if (Array.isArray(v)) return v.forEach(x => walk(x, up));
      if (!v || typeof v !== 'object' || !v.__element) return;
      if (v.__element === 'Link') where.push(up.join('>'));
      for (const x of Object.values(v.props ?? {}))
        walk(x, [...up, v.__element]);
      walk(v.children, [...up, v.__element]);
    };
    walk(SAMPLE_PAGE, []);
    expect(where.some(p => /Text$/.test(p) && !p.includes('Card'))).toBe(true);
    expect(where.some(p => /Card>.*Text$/.test(p))).toBe(true);
  });
});
