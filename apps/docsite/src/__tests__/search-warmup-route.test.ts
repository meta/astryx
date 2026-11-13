// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search API's warm-up: it loads the search and is never cached, so
 * it reaches, and warms, a server.
 */

import {describe, expect, it} from 'vitest';
import {GET} from '../app/api/search/route';
import {SEARCH_WARMUP_URL} from '../lib/searchWarmup';

describe('GET /api/search?warm=1', () => {
  it('answers 204, uncached, after loading the search', async () => {
    const response = await GET(new Request(`http://site${SEARCH_WARMUP_URL}`));
    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
  }, 120_000);

  it('leaves a request without a query rejected', async () => {
    const response = await GET(new Request('http://site/api/search'));
    expect(response.status).toBe(400);
  });
});
