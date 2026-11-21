// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file compoundHit visits only the runs of a long query that can score
 * against a candidate (runsToVisit in _compound.mjs). Each tier's run, set in
 * a long query of words no name holds, scores as it does alone, where every
 * run is visited.
 */

import {describe, expect, it} from 'vitest';
import {compoundHit} from './_compound.mjs';

/** Words that no name or keyword below holds. */
const PAD = ['zzq', 'qqx', 'xxj', 'jjv', 'vvk', 'kkw', 'wwz', 'zqx', 'qxj'];

const CASES = /** @type {[string, string[], object, number | null][]} */ ([
  [
    'the joined name',
    ['icon', 'button'],
    {name: 'IconButton', domain: 'component'},
    100,
  ],
  [
    'its plural with s',
    ['table', 'header', 'cells'],
    {name: 'TableHeaderCell', domain: 'component'},
    100,
  ],
  [
    'its plural with es',
    ['search', 'boxes'],
    {name: 'SearchBox', domain: 'component'},
    100,
  ],
  [
    'a hook without use',
    ['table', 'sticky', 'columns'],
    {name: 'useTableStickyColumns', domain: 'hook'},
    100,
  ],
  [
    'most of the name',
    ['dropdown', 'menu', 'radio'],
    {name: 'DropdownMenuRadioItem', domain: 'component'},
    95,
  ],
  [
    'the shortest start that counts',
    ['complex', 'selec'],
    {name: 'ComplexSelector', domain: 'component'},
    95,
  ],
  [
    'a start one letter too short',
    ['complex', 'sele'],
    {name: 'ComplexSelector', domain: 'component'},
    null,
  ],
  [
    'the leading words',
    ['top', 'nav', 'mega'],
    {name: 'TopNavMegaMenu', domain: 'component'},
    92,
  ],
  [
    'the leading words after use',
    ['table', 'sticky'],
    {name: 'useTableStickyColumns', domain: 'hook'},
    92,
  ],
  [
    'words the name holds',
    ['header', 'cell'],
    {name: 'TableHeaderCell', domain: 'component'},
    70,
  ],
  [
    'a one-word keyword',
    ['number', 'field'],
    {name: 'Form', domain: 'template', keywords: ['numberfield']},
    90,
  ],
  [
    'an alias',
    ['side', 'nav'],
    {name: 'Navigation', aliases: ['SideNav'], domain: 'component'},
    100,
  ],
]);

describe('compoundHit in a long query', () => {
  it('scores each tier as the run does alone', () => {
    for (const [what, words, candidate, score] of CASES) {
      const alone = compoundHit(words, candidate);
      expect(alone?.score ?? null, what).toBe(score);
      expect(compoundHit([...PAD, ...words, ...PAD], candidate), what).toEqual(
        alone,
      );
    }
  });
});
