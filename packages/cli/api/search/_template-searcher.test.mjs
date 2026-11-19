// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the template searcher (_template-searcher.mjs): with its own weights
 * it ranks a template first for a query that asks for one. Run against the real
 * @astryxdesign/core.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherCandidates, loadSearchData} from './_adapter.mjs';
import {template} from './_template-searcher.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('template searcher', () => {
  it('ranks a template near the top for a template query', async () => {
    const catalog = {
      ...(await gatherCandidates({cwd: REPO})),
      data: loadSearchData(),
    };
    const answer = /** @type {any} */ (
      await template.run(
        {query: 'page of settings with a side menu', options: {cwd: REPO}},
        catalog,
        null,
      )
    );
    expect(
      answer.data.results
        .slice(0, 3)
        .some((/** @type {any} */ r) => r.domain === 'template'),
    ).toBe(true);
    expect(answer.data.results.length).toBeLessThanOrEqual(20);
  });
});
