// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A reader looking for the check a build runs finds
 * `astryx integration check` first.
 */

import {describe, expect, it} from 'vitest';
import {search} from './search.mjs';

describe('search finds integration check for CI', () => {
  it.each([
    'ci',
    'continuous integration',
    'typecheck integration',
    'integration check',
  ])('`%s` ranks it first', async query => {
    const {results} = (await search(query)).data;
    expect(results[0], JSON.stringify(results.slice(0, 3))).toMatchObject({
      domain: 'doc',
      name: 'cli/commands/integration-check',
    });
  });
});
