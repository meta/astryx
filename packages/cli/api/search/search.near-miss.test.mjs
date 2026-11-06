// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One identifier read whole answers alone only when a match on it is
 * more than a typo: a near miss of a different name never hides every entry
 * the identifier's words match. A typo match still answers alone when the
 * entry's name spells every word of the identifier in order.
 */

import {describe, expect, it} from 'vitest';
import {search} from './search.mjs';

describe('a near miss of one identifier', () => {
  it('does not replace the entries its words match', async () => {
    // `basetable` is one edit from a doc keyword `base-table`; the words
    // `base table` match the table family.
    const {data} = await search('BaseTable');
    expect(data.matchCount).toBeGreaterThan(20);
    expect(data.results.map(r => r.name)).toContain('Table');
  });

  it('answers alone when the name spells every word in order', async () => {
    const {data} = await search('useTableExpansion');
    expect(data.results[0]).toMatchObject({name: 'useTableRowExpansion'});
  });
});
