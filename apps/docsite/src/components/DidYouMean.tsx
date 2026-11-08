// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Suggested destinations for a missing docsite page.
 * @input Current pathname and canonical pages exported by the sitemap
 * @output High-confidence navigation links when a likely destination exists
 * @position Client-side recovery UI within the server-rendered 404 page
 */

'use client';

import {usePathname} from 'next/navigation';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {findSimilarPages, type PageCandidate} from '../lib/didYouMean';

interface DidYouMeanProps {
  pages: readonly PageCandidate[];
}

export function DidYouMean({pages}: DidYouMeanProps) {
  const pathname = usePathname();
  const suggestions = findSimilarPages(pathname, pages);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <VStack gap={1} hAlign="center">
      <Text type="body" color="secondary">
        Did you mean?
      </Text>
      {suggestions.map(suggestion => (
        <Link key={suggestion.path} href={suggestion.path} isStandalone>
          {suggestion.title}
        </Link>
      ))}
    </VStack>
  );
}
