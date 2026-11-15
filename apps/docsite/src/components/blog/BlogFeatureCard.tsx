// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlogFeatureCard.tsx
 * Showcase-only feature card for BlogShowcase's equal-height split. Generated
 * covers absorb extra height so the title + byline stay tight at the bottom.
 * Custom artwork keeps its 16:9 frame and remains fully visible.
 *
 * @input  a blog post; hideDescription
 * @output a full-height feature card for the home "Stay in the know" split
 * @position Used only by BlogShowcase's featured-split layout.
 */

import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import type {BlogPost} from '../../lib/blog/schema';
import {AuthorByline} from './AuthorByline';
import {BlogCoverArt} from './BlogCoverArt';
import {ReleaseCoverArt} from './ReleaseCoverArt';
import {parseReleaseVersion} from '../../lib/blog/release';
import css from './BlogCard.module.css';

const styles = stylex.create({
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-4)',
    minWidth: 0,
    height: '100%',
    color: 'inherit',
  },
  cover: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
    // Generated art fills the split's extra height; custom artwork must not crop.
    flexGrow: 1,
  },
  artworkCover: {
    flexGrow: 0,
  },
  excerpt: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  // Below 1024px (where the showcase split stacks) match the compact cards'
  // title size; scale up to the feature size only in the two-column split.
  title: {
    fontSize: {
      default: 'var(--text-heading-3-size)',
      '@media (min-width: 1024px)': 'var(--text-heading-1-size)',
    },
    lineHeight: {
      default: 'var(--text-heading-3-leading)',
      '@media (min-width: 1024px)': 'var(--text-heading-1-leading)',
    },
  },
  link: {
    position: 'absolute',
    inset: 0,
    borderRadius: 'var(--radius-container)',
  },
});

export function BlogFeatureCard({
  post,
  hideDescription = false,
}: {
  post: BlogPost;
  hideDescription?: boolean;
}) {
  const releaseVersion = parseReleaseVersion(post.title);

  const coverContent = post.coverImage ? (
    <img src={post.coverImage} alt={post.coverAlt ?? ''} />
  ) : releaseVersion ? (
    <ReleaseCoverArt
      version={releaseVersion}
      packageName={post.releasePackage ?? undefined}
    />
  ) : (
    <BlogCoverArt seed={post.slug} feature />
  );

  // Merge stylex's className with the CSS-module class; a bare
  // className={css.card} after the spread would drop all of styles.card.
  const cardProps = stylex.props(styles.card);

  return (
    <div
      className={`${cardProps.className ?? ''} ${css.card}`}
      style={cardProps.style}>
      <AspectRatio
        ratio={16 / 9}
        fit={post.coverImage ? 'contain' : undefined}
        xstyle={[
          styles.cover,
          post.coverImage ? styles.artworkCover : styles.cover,
        ]}
        className={css.cover}>
        {coverContent}
      </AspectRatio>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={1} xstyle={styles.title}>
            {post.title}
          </Heading>
          {hideDescription ? null : (
            <Text
              type="large"
              weight="normal"
              color="secondary"
              xstyle={styles.excerpt}
              className={css.description}>
              {post.description}
            </Text>
          )}
        </VStack>
        <AuthorByline
          authors={post.authors}
          date={post.date}
          readingTimeMinutes={post.readingTimeMinutes}
          variant="compact"
          className={css.byline}
        />
      </VStack>
      <Link
        href={`/blog/${post.slug}`}
        label={post.title}
        color="inherit"
        display="block"
        xstyle={styles.link}>
        <VisuallyHidden>{post.title}</VisuallyHidden>
      </Link>
    </div>
  );
}
