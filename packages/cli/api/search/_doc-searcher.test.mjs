// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the doc searcher (_doc-searcher.mjs): with its own weights
 * it ranks a doc first for a query that asks for one. Run against the real
 * @astryxdesign/core.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherCandidates, loadSearchData} from './_adapter.mjs';
import {doc} from './_doc-searcher.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('doc searcher', () => {
  it('ranks a doc first for a doc query', async () => {
    const catalog = {
      ...(await gatherCandidates({cwd: REPO})),
      data: loadSearchData(),
    };
    const answer = /** @type {any} */ (
      await doc.run(
        {query: 'how do I install a theme', options: {cwd: REPO}},
        catalog,
        null,
      )
    );
    expect(answer.data.results[0].domain).toBe('doc');
    expect(answer.data.results.length).toBeLessThanOrEqual(20);
  });
});
