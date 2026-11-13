// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {slotFor, wordsIn} from './place.mjs';

/** A dashboard-shaped page: a filter bar, two chart bands, a table. */
const PAGE = [
  {name: 'filters', kind: 'toolbar', description: 'The filter bar above every band.'},
  {name: 'kpis', kind: 'metrics', description: 'The row of headline tiles.'},
  {name: 'trends', kind: 'chart', description: 'Revenue and usage trend charts.'},
  {name: 'funnel', kind: 'chart', description: 'The signup funnel chart.'},
  {name: 'tables', kind: 'table', description: 'Supporting tables of top pages.'},
];

/** A shell: navigation and a body that takes any section. */
const SHELL = [
  {name: 'nav', kind: 'navigation', description: 'The top navigation bar.'},
  {name: 'content', kind: 'main', description: 'The page body under the nav.'},
];

describe('slotFor', () => {
  it("puts a block in the slot of its best fit the page has", () => {
    expect(slotFor(['toolbar'], PAGE)).toBe('filters');
    expect(slotFor(['metrics', 'list'], PAGE)).toBe('kpis');
    expect(slotFor(['list', 'table'], PAGE)).toBe('tables');
  });

  it('puts a block in the page body when the page has no slot of its kinds', () => {
    expect(slotFor(['form'], SHELL)).toBe('content');
    expect(slotFor(['navigation'], SHELL)).toBe('nav');
    expect(slotFor(['form'], PAGE)).toBeNull();
  });

  it('prefers an exact kind over the body, whatever the order of fits', () => {
    expect(slotFor(['panel', 'navigation'], SHELL)).toBe('nav');
  });

  it('gives an overlay, an inline piece and a reference no slot', () => {
    expect(slotFor(['overlay'], SHELL)).toBeNull();
    expect(slotFor(['inline'], SHELL)).toBeNull();
    expect(slotFor([], SHELL)).toBeNull();
    expect(slotFor(undefined, SHELL)).toBeNull();
  });

  it('skips a kind it does not know', () => {
    expect(slotFor(['hologram', 'chart'], PAGE)).toBe('trends');
    expect(slotFor(['hologram'], SHELL)).toBeNull();
  });

  it('places nothing in a page with no slots', () => {
    expect(slotFor(['chart'], undefined)).toBeNull();
    expect(slotFor(['chart'], [])).toBeNull();
  });

  it("picks between slots of one kind by the request's words in each slot's own name and description", () => {
    expect(slotFor(['chart'], PAGE)).toBe('trends');
    expect(slotFor(['chart'], PAGE, wordsIn('a funnel of signups'))).toBe('funnel');
    expect(slotFor(['chart'], PAGE, wordsIn('a usage chart'))).toBe('trends');
  });

  it('never lets request words move a block out of its best fit', () => {
    expect(slotFor(['metrics', 'chart'], PAGE, wordsIn('a signup funnel tile'))).toBe('kpis');
  });
});

describe('wordsIn', () => {
  it('keeps content words and folds a plural', () => {
    expect([...wordsIn('The charts of a dashboard')].sort()).toEqual(['chart', 'dashboard']);
  });
});
