// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * How reads which corners an ask names: a side ("the top corners", "rounded
 * on top", "on the right side"), one corner ("the top-left corner"), "only"
 * and "except", with the part's own words naming no corner ("bottom sheet").
 * Against real bundled base themes; each answer's command is run by set.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {cornersNamed} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-how-corner-positions-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) await themeEditNew('k', {cwd, like: 'neutral'});
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** The set commands of the first answer. @param {string} q */
const writes = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'k'});
  return (data.results?.[0]?.commands ?? [])
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.*? editor set k /, ''));
};

describe('the corners an ask names', () => {
  it('reads sides, single corners, only and except', () => {
    expect(cornersNamed('4px top corners')).toEqual({
      corners: ['start-start', 'start-end'],
      only: false,
      except: false,
    });
    expect(cornersNamed('card top-left corner 12px')?.corners).toEqual([
      'start-start',
    ]);
    expect(cornersNamed('rounded on top')?.corners).toEqual([
      'start-start',
      'start-end',
    ]);
    expect(cornersNamed('square on the right side')?.corners).toEqual([
      'start-end',
      'end-end',
    ]);
    expect(cornersNamed('round only the bottom corners 6px')?.only).toBe(true);
    expect(cornersNamed('corners 4px except the bottom')).toEqual({
      corners: ['start-start', 'start-end'],
      only: true,
      except: true,
    });
    expect(cornersNamed('4px corners except the top left')?.corners).toEqual([
      'start-end',
      'end-start',
      'end-end',
    ]);
    // A part's own words name no corner.
    expect(cornersNamed('bottom sheet corners 16px', 'bottom-sheet')).toBe(
      null,
    );
    expect(
      cornersNamed('top nav items rounded on the bottom', 'top-nav-item')
        ?.corners,
    ).toEqual(['end-start', 'end-end']);
    expect(cornersNamed('rounder corners')).toBe(null);
  });

  it('writes the corners named, and squares the rest when the ask says only those', async ctx => {
    if (needBases(ctx)) return;
    // The part's own words are no side.
    expect(await writes('bottom sheet top corners 16px')).toEqual([
      'border-start-start-radius 16px --on bottom-sheet',
      'border-start-end-radius 16px --on bottom-sheet',
    ]);
    // One corner is one corner.
    expect(await writes('card top-left corner 12px')).toEqual([
      'border-start-start-radius 12px --on card',
    ]);
    // A size on some corners leaves the others as they are.
    expect(await writes('4px top corners on cards')).toEqual([
      'border-start-start-radius 4px --on card',
      'border-start-end-radius 4px --on card',
    ]);
    // Only, except, and rounded on a side: every corner settled, one radius.
    expect(await writes('tab corners 4px except the bottom')).toEqual([
      "border-radius '4px 4px 0 0' --on tab",
    ]);
    expect(await writes('round only the bottom corners of menus 6px')).toEqual([
      "border-radius '0 0 6px 6px' --on menus",
    ]);
    expect(await writes('tooltips 4px corners except the top left')).toEqual([
      "border-radius '0 4px 4px 4px' --on tooltip",
    ]);
    // Rounded with no size keeps the radius the part reads (the corners
    // dial still moves it) and squares the other side.
    expect(await writes('tabs rounded on top')).toEqual([
      "border-radius 'var(--radius-element) var(--radius-element) 0 0' --on tab",
    ]);
    // A part that is square and reads no corner token takes the round rung
    // there (a heading with a fill of its own, as a title bar).
    await themeEditSet('k', 'background-color', '#eeeeee', {
      cwd,
      on: 'heading',
    });
    expect(await writes('heading rounded top corners')).toEqual([
      "border-radius '16px 16px 0 0' --on heading",
    ]);
    // Square on a side squares those corners only.
    expect(await writes('inputs square on the right side')).toEqual([
      'border-start-end-radius 0 --on inputs',
      'border-end-end-radius 0 --on inputs',
    ]);
  }, 240_000);

  it('set takes each answer, a menu included', async ctx => {
    if (needBases(ctx)) return;
    for (const q of [
      'menus only rounded at the bottom',
      'tabs rounded on top',
    ]) {
      const [w] = await writes(q);
      const m = /^border-radius '([^']+)' --on (\S+)$/.exec(String(w));
      expect(m, q).not.toBeNull();
      await themeEditSet('k', 'border-radius', String(m?.[1]), {
        cwd,
        on: String(m?.[2]),
      });
    }
  }, 240_000);
});
