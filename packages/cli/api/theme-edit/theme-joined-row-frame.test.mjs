// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border, corners, shadow, fill or outline asked of a part that
 * draws no edge of its own, whose controls sit side by side in a row of
 * the same component that frames them (a pager's control row around its
 * page cells), go on that row: one strip, never a border or corners on
 * each control. Each is written there, said with its undo; corners with
 * no edge on the row yet are refused. A part whose edges sit in no such
 * row keeps its own answer.
 *
 * @position api/theme-edit — tests
 */

import fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {themeFiles} from './_settings.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-joined-row-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('p', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('a border, corners, shadow, fill or outline on a row of joined controls', () => {
  it('is written on the row that frames them, never on each control', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    // With no edge on the row yet, its corners show nothing: refused, with
    // the lookup that names the edges it takes, never a line on each page.
    const early = await refusal(() =>
      themeEditSet('p', 'border-radius', '3px', {cwd, on: 'pagination'}),
    );
    expect(early.code).toBe('ERR_THEME_NO_EFFECT');
    expect(early.run).toEqual([expect.stringMatching(/ how pagination-list$/)]);
    // Each is written on the row, said with its undo; the setting keeps the
    // part it was asked of, so a theme saved that way builds the strip.
    for (const [thing, value] of [
      ['border', '1px solid rgba(0, 0, 0, 0.15)'],
      ['border-radius', '3px'],
      ['box-shadow', '0 1px 2px rgba(0, 0, 0, 0.05)'],
      ['background-color', '#ffffff'],
      ['outline', '1px solid #dddddd'],
    ]) {
      const {data} = await themeEditSet('p', thing, value, {
        cwd,
        on: 'pagination',
      });
      expect(data.setting.on).toBe('pagination');
      expect(data.parts).toEqual(['pagination-list']);
      expect(data.notes.join('\n')).toMatch(
        new RegExp(
          `wrote on pagination-list, the row that frames pagination's controls[^\\n]* undo p ${thing} --on pagination`,
        ),
      );
    }
    const css = fs.readFileSync(themeFiles(cwd, 'p').css, 'utf8');
    const row = /\.astryx-pagination-list\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(row).toMatch(/border: 1px solid rgba\(0, 0, 0, 0\.15\)/);
    expect(row).toMatch(/border-radius: 3px/);
    expect(row).toMatch(/box-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.05\)/);
    expect(css).not.toMatch(
      /\.astryx-pagination\s*\{[^}]*(?:border|box-shadow|outline)/,
    );
    expect(css).not.toMatch(/\.astryx-pagination-item\s*\{[^}]*border:/);
  }, 240_000);
});
