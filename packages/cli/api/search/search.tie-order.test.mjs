// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Below the first result, matches the lexical ranker scored the same
 * are ordered by fit, not by name: a part of the first result leads its tie,
 * then the match on the query's rarer words. Scores, reasons and the set of
 * results stay the lexical ranker's (see _order.test.mjs).
 */

import {describe, expect, it} from 'vitest';
import {search} from './search.mjs';

describe('ties below the first result', () => {
  it('a part of the first result leads its tie', async () => {
    const results = (await search('progress bar with percent')).data.results;
    expect(results[0]).toMatchObject({name: 'ProgressBar'});
    expect(results[1]?.name).toMatch(/^ProgressBar./);
  });

  it('shows the top of one answer at every limit', async () => {
    const query = 'progress bar with percent';
    const all = (await search(query)).data.results.map(r => r.name);
    const three = (await search(query, {limit: 3})).data.results.map(
      r => r.name,
    );
    expect(three).toEqual(all.slice(0, 3));
  });

  it('reads a punctuated query word by its parts', async () => {
    const results = (await search('three-dot menu with actions')).data.results;
    expect(results.slice(0, 3).map(r => r.name)).toContain('MoreMenu');
  });

  it('lets few parts lead, so a big family keeps the rest in view', async () => {
    const results = (await search('chat')).data.results.map(r => r.name);
    expect(results).toContain('ai-chat');
    expect(results).toContain('ai-chat-landing');
  });
});
