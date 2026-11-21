// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border, border radius or shadow asked of a part that draws no
 * edge of its own, whose controls sit side by side in a row of the same
 * component that frames them (a pager's control row around its page
 * cells), goes on that row: one strip, never a border on each control,
 * said with its undo; a radius before the row has an edge is refused with
 * the per-page line. The corners dial still rounds each control. `how`
 * puts an ask's corners on the row once the row has an edge at rest, from
 * the ask or the theme; with none, it rounds each page.
 *
 * @position api/theme-edit — tests
 */

import fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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

describe('a border, radius, shadow or corners on a row of joined controls', () => {
  it('writes a border, radius or shadow on the row that frames them, never on each control', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    // With no edge on the row yet, its corners show nothing: refused, with
    // the lookup that names the edges it takes and the per-page line.
    const early = await refusal(() =>
      themeEditSet('p', 'border-radius', '3px', {cwd, on: 'pagination'}),
    );
    expect(early.message).toMatch(/corners 3px --on pagination\b/);
    expect(early.code).toBe('ERR_THEME_NO_EFFECT');
    expect(early.run).toEqual([expect.stringMatching(/ how pagination-list$/)]);
    // A border or shadow is written on the row, said with its undo; the
    // setting keeps the part it was asked of.
    for (const [thing, value] of [
      ['border', '1px solid rgba(0, 0, 0, 0.15)'],
      ['border-radius', '3px'],
      ['box-shadow', '0 1px 2px rgba(0, 0, 0, 0.05)'],
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
    // Set again unchanged: no undo line for a step that was never added.
    const again = await themeEditSet(
      'p',
      'border',
      '1px solid rgba(0, 0, 0, 0.15)',
      {cwd, on: 'pagination'},
    );
    expect(again.data.notes.join('\n')).not.toMatch(/wrote on pagination-list/);
    // The corners dial on the pager rounds each page, as it always did.
    const dial = await themeEditSet('p', 'corners', '6px', {
      cwd,
      on: 'pagination',
    });
    expect(dial.data.parts).not.toContain('pagination-list');
    const css = fs.readFileSync(themeFiles(cwd, 'p').css, 'utf8');
    const row = /\.astryx-pagination-list\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(row).toMatch(/border: 1px solid rgba\(0, 0, 0, 0\.15\)/);
    expect(row).toMatch(/border-radius: 3px/);
    expect(row).toMatch(/box-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.05\)/);
    expect(css).not.toMatch(
      /\.astryx-pagination\s*\{[^}]*(?:border|box-shadow)/,
    );
    expect(css).not.toMatch(/\.astryx-pagination-item\s*\{[^}]*border:/);
  }, 240_000);

  it("puts an ask's corners on the row after the border it gives the row", async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('b', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'pagination: 6px radius, 1px #dee2e6 border, and the active page #0d6efd with white text',
      {cwd, theme: 'b'},
    );
    const whole = (data.results ?? []).find(r =>
      /^all of it, in order/.test(r.text),
    );
    const sets = (whole?.commands ?? [])
      .flatMap(c => c.split(' && '))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
    const border = sets.findIndex(x =>
      /^border '1px solid .*' --on pagination-list$/.test(x),
    );
    const radius = sets.indexOf('border-radius 6px --on pagination-list');
    expect(border).toBeGreaterThan(-1);
    expect(radius).toBeGreaterThan(border);
    expect(sets.join('\n')).not.toMatch(
      /(?:corners|radius) \S+ --on (?:pagination-item|button)\b/,
    );
    // The corners' own answer keeps them too: it runs them after the border
    // the same ask gives the row, never refuses them for a row with no edge.
    const corners = (data.results ?? []).find(r =>
      /^corners on pagination-list\b/.test(r.text),
    );
    const own = (corners?.commands ?? []).map(c =>
      c.replace(/^.* editor set \S+ /, ''),
    );
    expect(own.at(-1)).toBe('border-radius 6px --on pagination-list');
    expect(own[0]).toMatch(/^border '1px solid .*' --on pagination-list$/);
    expect(corners?.text).toMatch(/after the border this ask gives it/);
  }, 240_000);

  it('rounds each page when an ask gives the row no edge', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('c', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('pagination 6px radius', {
      cwd,
      theme: 'c',
    });
    const sets = (data.results ?? [])
      .flatMap(r => r.commands)
      .map(c => c.replace(/^.* editor set \S+ /, ''));
    expect(sets).toContain('border-radius 6px --on pagination-item');
    expect(sets.join('\n')).not.toMatch(/--on pagination-list\b/);
  }, 240_000);
});
