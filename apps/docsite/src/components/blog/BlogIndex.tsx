// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlogIndex.tsx
 * Blog index: post-type filters + a card grid, latest post featured.
 */

'use client';

import {useState, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import type {BlogPostMeta, BlogPostType} from '../../lib/blog/schema';
import {POST_TYPE_LABELS} from '../../lib/blog/schema';
import {BlogCard} from './BlogCard';

const styles = stylex.create({
  typeFilter: {
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  // Responsive card grid. `min(320px, 100%)` clamps the track to the container
  // so a 320px column never overflows a narrower viewport (e.g. small phones).
  postGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
    columnGap: spacingVars['--spacing-5'],
    rowGap: spacingVars['--spacing-10'],
  },
});

export interface BlogIndexProps {
  posts: BlogPostMeta[];
  availableTypes: BlogPostType[];
}

export function BlogIndex({posts, availableTypes}: BlogIndexProps) {
  const [activeType, setActiveType] = useState<'all' | BlogPostType>('all');

  const filtered = useMemo(() => {
    if (activeType === 'all') {
      return posts;
    }
    return posts.filter(p => p.type === activeType);
  }, [posts, activeType]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {all: posts.length};
    for (const t of availableTypes) {
      map[t] = posts.filter(p => p.type === t).length;
    }
    return map;
  }, [posts, availableTypes]);

  const showFeature = activeType === 'all' && filtered.length > 0;
  const featurePost = showFeature ? filtered[0] : null;
  const restPosts = showFeature ? filtered.slice(1) : filtered;

  return (
    <Section maxWidth={800} padding={6} style={{marginInline: 'auto'}}>
      <VStack gap={10}>
        <VStack gap={2}>
          <Heading level={1} type="display-1" justify="center">
            Blog
          </Heading>
          <Text weight="normal" color="secondary" justify="center">
            Releases, guides, and stories on building Astryx for humans and
            agents.
          </Text>
        </VStack>

        {availableTypes.length > 1 ? (
          <ToggleButtonGroup
            label="Filter posts by type"
            value={activeType}
            onChange={value =>
              setActiveType((value as 'all' | BlogPostType) ?? 'all')
            }
            xstyle={styles.typeFilter}>
            <ToggleButton value="all" label={`All (${counts.all})`} />
            {availableTypes.map(t => (
              <ToggleButton
                key={t}
                value={t}
                label={`${POST_TYPE_LABELS[t]} (${counts[t]})`}
              />
            ))}
          </ToggleButtonGroup>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            title="No posts yet"
            description="Check back soon for releases, guides, and stories."
          />
        ) : (
          <VStack gap={10}>
            {featurePost ? <BlogCard post={featurePost} feature /> : null}
            {restPosts.length > 0 ? (
              <div {...stylex.props(styles.postGrid)}>
                {restPosts.map(post => (
                  <BlogCard key={post.slug} post={post} />
                ))}
              </div>
            ) : null}
          </VStack>
        )}
      </VStack>
    </Section>
  );
}
