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
    expect(early.run).toEqual([
      expect.stringMatching(/ how pagination-list$/),
      expect.stringMatching(/ corners 3px --on pagination$/),
    ]);
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

  it('counts a fill the same ask gives in a state as the edge its corners show on', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    // A link shows no corners of its own: the asked fill gives them an edge.
    await themeEditNew('h', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'links when disabled: a #0069d6 fill and 12px corners',
      {cwd, theme: 'h'},
    );
    const whole =
      (data.results ?? []).find(r => /^all of it, in order/.test(r.text)) ??
      (data.results ?? [])[0];
    const sets = (whole?.commands ?? []).join('\n');
    expect(sets).toMatch(/#0069d6.*--on link/);
    expect(sets).toMatch(/12px --on link/);
    expect(sets.indexOf('#0069d6')).toBeLessThan(sets.indexOf('12px'));
  }, 240_000);

  it('names the pager for each page and keeps a removal off the row', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('r', {cwd, like: 'neutral'});
    const asked = await refusal(() =>
      themeEditSet('r', 'border-radius', '4px', {cwd, on: 'pagination-list'}),
    );
    expect(asked.message).toMatch(/corners 4px --on pagination\b/);
    expect(asked.run).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/corners 4px --on pagination$/),
      ]),
    );
    // A removal gives the row no edge: the corners round each page.
    const {data} = await themeEditHow('pagination: no border, 6px radius', {
      cwd,
      theme: 'r',
    });
    const sets = (data.results ?? []).flatMap(r => r.commands).join('\n');
    expect(sets).not.toMatch(/radius \S+ --on pagination-list\b/);
  }, 240_000);

  it('rounds a bar the theme fills, as before', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'background-color', '#f8f9fa', {
      cwd,
      on: 'pagination',
    });
    const {data} = await themeEditSet('f', 'border-radius', '8px', {
      cwd,
      on: 'pagination',
    });
    expect(data.parts).toEqual(['pagination']);
    const css = fs.readFileSync(themeFiles(cwd, 'f').css, 'utf8');
    expect(css).toMatch(/\.astryx-pagination\s*\{[^}]*border-radius: 8px/);
  }, 240_000);

  it('keeps a shadow on a bar the theme fills, and a side border on the bar', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'background-color', '#f8f9fa', {
      cwd,
      on: 'pagination',
    });
    const shadow = await themeEditSet(
      'g',
      'box-shadow',
      '0 1px 2px rgba(0, 0, 0, 0.05)',
      {cwd, on: 'pagination'},
    );
    expect(shadow.data.parts).toEqual(['pagination']);
    const side = await themeEditSet('g', 'border-top', '1px solid #dddddd', {
      cwd,
      on: 'pagination',
    });
    expect(side.data.parts).toEqual(['pagination']);
    const {data} = await themeEditHow(
      'a 1px #dddddd top border on pagination',
      {
        cwd,
        theme: 'g',
      },
    );
    const sets = (data.results ?? []).flatMap(r => r.commands).join('\n');
    expect(sets).not.toMatch(/--on pagination-list\b/);
  }, 240_000);
});
