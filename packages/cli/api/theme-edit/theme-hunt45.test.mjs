// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt45: the headings half word in any letters picks that half; a
 * change removes only pictures the editor wrote and marks its section sheets
 * out of date; a link to nothing is named, with where it points, by set and
 * by undo alike.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {recordWritten} from './_settings.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt45-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {any} r */
const removed = r => r.data.removed ?? r.data.setting;

describe('hunt45 N1: the headings half word in any letters', () => {
  it('Tracking, TRACKING and Tight remove the tracking half; Weight never removes tracking', async () => {
    await themeEditNew('h', {cwd, like: 'neutral'});
    for (const word of ['tracking', 'Tracking', 'TRACKING', 'Tight']) {
      await themeEditSet('h', 'headings', 'bold', {cwd});
      await themeEditSet('h', 'headings', 'tight', {cwd});
      const r = await themeEditUndo('h', {cwd, thing: 'headings', value: word});
      expect(JSON.stringify(removed(r)), word).toContain('"axis":"tracking"');
    }
    // Only the tracking half set: a weight word is refused, nothing removed.
    await themeEditUndo('h', {cwd, thing: 'headings', value: 'weight'});
    for (const word of ['weight', 'Weight', 'WEIGHT']) {
      const err = await refusal(() =>
        themeEditUndo('h', {cwd, thing: 'headings', value: word}),
      );
      expect(err.code, word).toBe('ERR_THEME_NOT_SET');
    }
  }, 240_000);
});

describe('hunt45 N2: a change removes only what the editor wrote', () => {
  it('keeps the user files, removes an unchanged editor picture, marks a section sheet', async () => {
    await themeEditNew('s', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'themes/s');
    const mine = [
      'preview-before.png',
      'sheet-mockup.png',
      'sheet-my-notes.html',
    ];
    for (const n of mine) fs.writeFileSync(path.join(dir, n), 'mine');
    // A picture the editor took, and one it took that the user then changed.
    fs.writeFileSync(path.join(dir, 'preview.png'), 'shot');
    fs.writeFileSync(path.join(dir, 'sheet.png'), 'shot');
    recordWritten(cwd, 's', [
      path.join(dir, 'preview.png'),
      path.join(dir, 'sheet.png'),
    ]);
    fs.writeFileSync(path.join(dir, 'sheet.png'), 'edited by hand');
    // A section sheet the editor made carries its stamp.
    fs.writeFileSync(
      path.join(dir, 'sheet-overlays.html'),
      '<html><body>x</body></html>\n<!-- astryx: sheet of build 0123456789abcdef -->\n',
    );
    const r = await themeEditSet('s', 'corners', 'round', {cwd});
    for (const n of mine)
      expect(fs.readFileSync(path.join(dir, n), 'utf8'), n).toBe('mine');
    expect(fs.existsSync(path.join(dir, 'preview.png'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'sheet.png'), 'utf8')).toBe(
      'edited by hand',
    );
    expect(
      fs.readFileSync(path.join(dir, 'sheet-overlays.html'), 'utf8'),
    ).toContain('as it was before the last change');
    expect(/** @type {any} */ (r.data).sheetStale).toContain(
      'sheet-overlays.html',
    );
    await themeEditUndo('s', {cwd});
    for (const n of mine)
      expect(fs.existsSync(path.join(dir, n)), n).toBe(true);
  }, 240_000);
});

describe('hunt45 N3: a link to nothing', () => {
  it('is named with where it points, by set and by undo, with no remove step', async () => {
    await themeEditNew('d', {cwd, like: 'neutral'});
    await themeEditSet('d', 'spacing', 'roomy', {cwd});
    const history = path.join(cwd, 'themes/d/d.history.json');
    const kept = fs.readFileSync(history);
    fs.rmSync(history);
    fs.symlinkSync('/nonexistent/h.json', history);
    try {
      for (const run of [
        () => themeEditSet('d', 'spacing', 'tight', {cwd}),
        () => themeEditUndo('d', {cwd}),
      ]) {
        const err = await refusal(run);
        expect(err.code).toBe('ERR_THEME_INVALID');
        expect(err.message).toContain(
          '/nonexistent/h.json, which does not exist',
        );
        expect(err.run.join('\n')).not.toMatch(/\b(rm|mv|cp)\b/);
      }
    } finally {
      fs.rmSync(history);
      fs.writeFileSync(history, kept);
    }
  }, 240_000);
});
