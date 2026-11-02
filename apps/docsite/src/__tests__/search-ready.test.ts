// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A search server gathers the CLI's catalog once, however many requests
 * arrive while it starts: queries typed during a cold start wait for the one
 * gather instead of each starting their own.
 */

import {describe, expect, it, vi} from 'vitest';

const calls: string[] = [];
let finishGather: () => void = () => {};

vi.mock('@astryxdesign/cli/api', () => ({
  search: vi.fn((query: string) => {
    calls.push(query);
    const response = {
      type: 'search',
      data: {query, matchCount: 0, results: []},
    };
    if (calls.length === 1) {
      return new Promise(resolve => {
        finishGather = () => resolve(response);
      });
    }
    return Promise.resolve(response);
  }),
}));

const {GET} = await import('../app/api/search/route');

describe('search server start', () => {
  it('runs one gather for a warm-up and the queries that arrive during it', async () => {
    const warm = GET(new Request('http://site/api/search?warm=1'));
    const typed = ['a', 'ap', 'app'].map(q =>
      GET(new Request(`http://site/api/search?q=${q}`)),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    // Only the gather has started; the typed queries wait for it.
    expect(calls).toEqual(['button']);

    finishGather();
    const responses = await Promise.all([warm, ...typed]);
    expect(responses.map(response => response.status)).toEqual([
      204, 200, 200, 200,
    ]);
    expect(calls).toEqual(['button', 'a', 'ap', 'app']);

    // Later requests do not gather again.
    await GET(new Request('http://site/api/search?warm=1'));
    await GET(new Request('http://site/api/search?q=app%20shell'));
    expect(calls).toEqual(['button', 'a', 'ap', 'app', 'app shell']);
  });
});
