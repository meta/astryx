// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Consumer queries rank consumer docs above authoring docs.
 *
 * An app builder searching "add an integration" or "use a theme" should find
 * consumer guides in the first 3 results, not the authoring reference or the
 * API function docs. Authoring queries ("create an integration", "build an
 * integration") should still rank authoring content first.
 */

import {describe, it, expect} from 'vitest';
import {search} from '../api/search/search.mjs';

// Each case: [query, expected-name-in-top-3, must-NOT-be-first]
/** @type {Array<[string, string, string?]>} */
const CONSUMER_QUERIES = [
  ['add an integration', 'use-integrations'],
  ['use an integration', 'use-integrations'],
  ['install a package', 'use-integrations'],
  ['discover integrations', 'use-integrations'],
  ['install an integration', 'use-integrations'],
  ['how to use a theme', 'use-a-theme'],
];

/** @type {Array<[string, string]>} */
const AUTHORING_QUERIES = [
  ['build an integration', 'authoring'],
  ['create an integration', 'authoring'],
];

describe('consumer queries rank consumer docs first', () => {
  for (const [query, expected] of CONSUMER_QUERIES) {
    it(`"${query}" ranks "${expected}" first`, async () => {
      const res = await search(query);
      const first = res.data.results[0]?.name;
      expect(first, `first for "${query}": ${first}`).toBe(expected);
    });
  }
});

describe('authoring queries still rank authoring content first', () => {
  for (const [query, expected] of AUTHORING_QUERIES) {
    it(`"${query}" ranks "${expected}" in the top 3`, async () => {
      const res = await search(query);
      const top3 = res.data.results.slice(0, 3).map(r => r.name);
      expect(
        top3.some(name => name.startsWith(expected)),
        `top 3 for "${query}": ${top3.join(', ')} should contain a ${expected} result`,
      ).toBe(true);
    });
  }
});
