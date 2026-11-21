// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlogShowcase.tsx
 *
 * Home-page "Blog" section. Auto-surfaces the most recent posts from the
 * build-time blog registry (already sorted latest-first). The layout adapts to
 * how many posts are published so the section always looks intentional:
 *
 *   - Exactly 2 posts → a balanced 50/50 grid of two equal feature cards.
 *   - 3+ posts → a featured split: the latest post is a large feature card on the
 *     left and the next two posts render as smaller cards stacked on the right.
 *
 * Cards are the shared `BlogCard` (also used on the blog index) with the excerpt
 * hidden to keep this marketing section tighter. The left/large card uses
 * BlogCard's `feature` variant; the right/stacked cards use the default variant.
 *
 * @input  blogPosts (from the generated registry)
 * @output A marketing section linking to the latest blog posts
 * @position Rendered inside the home page showcase overlay (app/(site)/HomePage.tsx)
 */

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {ArrowRight} from 'lucide-react';
import {Heading} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {blogPosts} from '../../../generated/blogRegistry';
import {BlogCard} from '../../../components/blog/BlogCard';
import {BlogFeatureCard} from '../../../components/blog/BlogFeatureCard';

// The featured-split layout (3+ posts) renders 1 feature (left) + 2 compact
// (right), filled by the 3 most recent posts (blogPosts is emitted latest-first
// by the generator).
const SLOT_COUNT = 3;

const styles = stylex.create({
  section: {
    width: '100%',
    maxWidth: 1200,
  },
  header: {
    width: '100%',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    rowGap: spacingVars['--spacing-2'],
  },
  // Featured split (3+ posts): a wide feature card + a stack of two compact
  // cards at a 2.4 : 1 ratio. align-items:stretch makes both columns equal
  // height; collapses to one column below 1024px.
  splitGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '2.4fr 1fr',
    },
    gap: spacingVars['--spacing-8'],
    alignItems: 'stretch',
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-6'],
    minWidth: 0,
    height: '100%',
  },
  // Two equal cards, side by side when there's room and stacked otherwise.
  // `min(480px, 100%)` clamps the track to the container so it never forces a
  // 480px column wider than a small viewport (which overflowed the page).
  twoUpGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px, 100%), 1fr))',
    gap: spacingVars['--spacing-8'],
    width: '100%',
    alignItems: 'start',
  },
});

// Section shell shared by both layouts:
// with the layout-specific grid passed in as children.
function BlogSection({children}: {children: ReactNode}) {
  return (
    <VStack as="section" align="center" gap={8} width="100%">
      <VStack gap={8} xstyle={styles.section}>
        <HStack xstyle={styles.header}>
          <Heading level={2} type="display-2" color="primary">
            Stay in the know
          </Heading>
          <Button
            variant="ghost"
            label="View all posts"
            href="/blog"
            endContent={<Icon icon={ArrowRight} size="sm" />}
          />
        </HStack>
        {children}
      </VStack>
    </VStack>
  );
}

export function BlogShowcase() {
  // The registry can be empty when a deployment has no published posts yet.
  // Omit the entire section rather than passing an undefined post to a card.
  if (blogPosts.length === 0) {
    return null;
  }

  // A single post gets the same full-width feature treatment as the two-post
  // layout, without rendering an empty secondary column.
  if (blogPosts.length === 1) {
    return (
      <BlogSection>
        <div {...stylex.props(styles.twoUpGrid)}>
          <BlogCard post={blogPosts[0]} feature hideDescription />
        </div>
      </BlogSection>
    );
  }

  // Exactly two posts → balanced 50/50 grid of two equal feature cards. This
  // reads as intentional, whereas the featured split would leave a lonely blank
  // placeholder in the right column.
  if (blogPosts.length === 2) {
    const [first, second] = blogPosts;
    return (
      <BlogSection>
        <div {...stylex.props(styles.twoUpGrid)}>
          <BlogCard post={first} feature hideDescription />
          <BlogCard post={second} feature hideDescription />
        </div>
      </BlogSection>
    );
  }

  // Three+ posts → featured split. Slot 0 → feature (left); slots 1–2 → compact
  // (right), filled by the 3 most recent posts.
  const [featurePost, ...compactPosts] = blogPosts.slice(0, SLOT_COUNT);

  return (
    <BlogSection>
      <div {...stylex.props(styles.splitGrid)}>
        <BlogFeatureCard post={featurePost} hideDescription />
        <div {...stylex.props(styles.rightCol)}>
          {compactPosts.map(post => (
            <BlogCard key={post.slug} post={post} hideDescription />
          ))}
        </div>
      </div>
    </BlogSection>
  );
}
