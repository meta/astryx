// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for docsite DidYouMean matching.
 * @input Representative missing paths and canonical sitemap page candidates
 * @output Confidence, ranking, normalization, deduplication, and limit guarantees
 * @position Unit coverage for the pure similar-page matcher
 */

import {describe, expect, it} from 'vitest';
import {findSimilarPages, type PageCandidate} from '../lib/didYouMean';

const pages: PageCandidate[] = [
  {path: '/', title: 'Home'},
  {path: '/docs', title: 'Docs'},
  {path: '/docs/getting-started', title: 'Getting Started'},
  {path: '/components', title: 'Components'},
  {path: '/components/AppShell', title: 'App Shell'},
  {path: '/components/Button', title: 'Button'},
  {path: '/changelog', title: "What's New"},
  {path: '/templates/dashboard', title: 'Dashboard'},
];

function suggestedPaths(pathname: string, limit?: number): string[] {
  return findSimilarPages(pathname, pages, limit).map(page => page.path);
}

describe('findSimilarPages', () => {
  it('finds a page whose final segment exactly matches the missing path', () => {
    expect(suggestedPaths('/getting-started')[0]).toBe('/docs/getting-started');
  });

  it('matches a partial page title', () => {
    expect(suggestedPaths('/start')[0]).toBe('/docs/getting-started');
  });

  it('matches a word from the canonical page title', () => {
    expect(suggestedPaths('/new')[0]).toBe('/changelog');
  });

  it('corrects typos in a full nested path', () => {
    expect(suggestedPaths('/doc/geting-started')[0]).toBe(
      '/docs/getting-started',
    );
  });

  it('normalizes case and punctuation', () => {
    expect(suggestedPaths('/components/app-shell')[0]).toBe(
      '/components/AppShell',
    );
  });

  it('does not offer low-confidence matches', () => {
    expect(suggestedPaths('/nothing-like-a-real-page')).toEqual([]);
  });

  it('deduplicates pages and respects the result limit', () => {
    const duplicatePages = [
      ...pages,
      {path: '/components/Button', title: 'Button duplicate'},
    ];

    expect(findSimilarPages('/components/Buton', duplicatePages, 1)).toEqual([
      {path: '/components/Button', title: 'Button'},
    ]);
  });

  it('ignores unusually long input rather than doing fuzzy work', () => {
    expect(suggestedPaths(`/${'x'.repeat(129)}`)).toEqual([]);
  });
});
