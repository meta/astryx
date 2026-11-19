// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A tooltip's text is measured against the tooltip's own ground: a
 * fill set on the tooltip, a text color set on it, and a page token the
 * tooltip draws its text with each make a problem naming the tooltip when
 * the text stops reading at 4.5:1.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-tooltip-text-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The problems a set makes that name the tooltip. @param {any} r */
const tooltipProblems = r =>
  (r.data?.newProblems ?? [])
    .map((/** @type {any} */ p) => String(p.problem))
    .filter((/** @type {string} */ p) => p.startsWith('text in tooltip'));

describe("a tooltip's text on its own ground", () => {
  it.each([
    ['a fill on the tooltip', 'background-color', '#f2f2f2', 'tooltip'],
    ['a text color on the tooltip', 'color', '#3a3a3a', 'tooltip'],
    ['the page token its text reads', '--color-background-surface', '#202020'],
  ])(
    'is measured when %s stops it reading',
    async (_, thing, value, on) => {
      if (unbuilt) throw new Error(unbuilt);
      const slug = `t${thing.replace(/[^a-z]/g, '')}`;
      await themeEditNew(slug, {cwd, like: 'neutral'});
      const r = await themeEditSet(slug, thing, value, {
        cwd,
        ...(on ? {on} : {}),
      });
      const found = tooltipProblems(r);
      expect(found.length, JSON.stringify(r.data?.newProblems)).toBeGreaterThan(
        0,
      );
      expect(found[0]).toContain(value);
      expect(found[0]).toMatch(/text needs 4\.5:1$/);
    },
    600_000,
  );
});
