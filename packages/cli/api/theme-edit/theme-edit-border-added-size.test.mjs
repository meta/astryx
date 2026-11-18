// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The border a border color brings to a part that draws none: the
 * change measures what the added width moves, the
 * part's boxes on the sheet before and after it, at rest and in each state
 * the sheet draws, and says how much the part grows, or that it keeps its
 * size. One case draws for real; the rest feed measured boxes to the
 * comparison and the note directly.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {boxChanges, sizeChangeNote} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases measure drawn pages: drawn for real.)
realRenders(true);

const T = 300_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-border-added-size-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const sizeNote = r =>
  /** @type {string[]} */ (r.data.notes ?? []).find(n =>
    /the added border/.test(n),
  );

describe('what the added border moves', () => {
  it(
    'names how much a part with no fixed size grows',
    async () => {
      const r = await themeEditSet('t', 'border-color', '#999999', {
        cwd,
        on: 'badge',
      });
      expect(sizeNote(r)).toBe(
        'badge grows by 2px in width (the added border; measured on the sheet)',
      );
    },
    T,
  );
});

describe('the size comparison', () => {
  it('names the growth of each part, in height and width', () => {
    const changes = boxChanges(
      ['badge', 'card'],
      {badge: [[40, 20], [52, 20]], card: [[300, 120]]},
      {badge: [[42, 22], [54, 22]], card: [[300, 122]]},
    );
    expect(changes).toEqual([
      {part: 'badge', width: 2, height: 2, drawn: 2},
      {part: 'card', width: 0, height: 2, drawn: 1},
    ]);
    expect(sizeChangeNote(changes, 'the added border')).toBe(
      'badge grows by 2px in height and 2px in width (the added border; measured on the sheet); card grows by 2px in height (the added border; measured on the sheet)',
    );
  });

  it('says a part that keeps its size keeps it, a shrink included', () => {
    const changes = boxChanges(
      ['avatar'],
      {avatar: [[32, 32]]},
      {avatar: [[31.5, 32]]},
    );
    expect(sizeChangeNote(changes, 'the added border')).toMatch(
      /^avatar keeps its size with the added border/,
    );
  });

  it('says nothing for a part neither page draws', () => {
    expect(
      sizeChangeNote(boxChanges(['tooltip'], {}, {}), 'the added border'),
    ).toBeNull();
  });
});
