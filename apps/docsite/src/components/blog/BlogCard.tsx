// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlogCard.tsx
 * Blog index card: cover, title, excerpt, and byline.
 * The `feature` variant (latest post) renders larger.
 */

import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import type {BlogPost} from '../../lib/blog/schema';
import {AuthorByline} from './AuthorByline';
import {BlogCoverArt} from './BlogCoverArt';
import {ReleaseCoverArt} from './ReleaseCoverArt';
import {parseReleaseVersion} from '../../lib/blog/release';
import {blogCoverUrl} from '../../lib/blog/coverImage';
import css from './BlogCard.module.css';

const styles = stylex.create({
  card: {
    display: 'block',
    width: '100%',
    height: '100%',
    color: 'inherit',
    textDecoration: {
      default: 'none',
      ':hover': 'none',
    },
  },
  inner: {
    height: '100%',
  },
  // Hover tint lives in BlogCard.module.css (.cover::after).
  cover: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  excerpt: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  // Below 720px (where the post grid becomes a single column) the feature
  // card's title/excerpt match the regular cards' size for a consistent stack.
  featureTitle: {
    fontSize: {
      default: 'var(--text-heading-3-size)',
      '@media (min-width: 720px)': 'var(--text-heading-1-size)',
    },
    lineHeight: {
      default: 'var(--text-heading-3-leading)',
      '@media (min-width: 720px)': 'var(--text-heading-1-leading)',
    },
  },
  featureExcerpt: {
    fontSize: {
      default: 'var(--text-body-size)',
      '@media (min-width: 720px)': 'var(--text-large-size)',
    },
    lineHeight: {
      default: 'var(--text-body-leading)',
      '@media (min-width: 720px)': 'var(--text-large-leading)',
    },
  },
});

export interface BlogCardProps {
  post: BlogPost;
  feature?: boolean;
  /** Hide the description/excerpt (e.g. to keep the home showcase tight). */
  hideDescription?: boolean;
}

export function BlogCard({
  post,
  feature = false,
  hideDescription = false,
}: BlogCardProps) {
  const releaseVersion = parseReleaseVersion(post.title);
  return (
    <Link
      href={`/blog/${post.slug}`}
      label={post.title}
      color="inherit"
      display="block"
      xstyle={styles.card}
      className={css.card}>
      <VStack gap={feature ? 4 : 3} xstyle={styles.inner}>
        <AspectRatio ratio={16 / 9} xstyle={styles.cover} className={css.cover}>
          {post.coverImage ? (
            <img
              src={blogCoverUrl(post.coverImage)}
              alt={post.coverAlt ?? ''}
              {...stylex.props(styles.coverImg)}
            />
          ) : releaseVersion ? (
            <ReleaseCoverArt
              version={releaseVersion}
              packageName={post.releasePackage ?? undefined}
            />
          ) : (
            <BlogCoverArt seed={post.slug} feature={feature} />
          )}
        </AspectRatio>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading
              level={feature ? 1 : 3}
              xstyle={feature ? styles.featureTitle : undefined}>
              {post.title}
            </Heading>
            {hideDescription ? null : (
              <Text
                type={feature ? 'large' : 'body'}
                weight="normal"
                color="secondary"
                xstyle={
                  feature
                    ? [styles.excerpt, styles.featureExcerpt]
                    : styles.excerpt
                }
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
      </VStack>
    </Link>
  );
}
