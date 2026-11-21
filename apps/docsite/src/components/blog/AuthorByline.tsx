// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AuthorByline.tsx
 * Blog byline: author avatars + names, plus publish/updated date and reading
 * time. A GitHub avatar loads at the size the byline shows it.
 */

import * as stylex from '@stylexjs/stylex';
import {Fragment} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {AvatarGroup} from '@astryxdesign/core/AvatarGroup';
import {Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {HStack} from '@astryxdesign/core/Layout';
import {Divider} from '@astryxdesign/core/Divider';
import {resolveAuthor} from '../../content/blog/authors';
import {githubAvatarUrl} from '../../lib/githubAvatarUrl';

export function formatDate(iso: string): string {
  // Parse as UTC to avoid off-by-one from local timezones.
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// The side of an avatar in CSS pixels, for each Avatar size the byline uses.
// The Avatar module is client code, so the server cannot call its size scale.
const AVATAR_PIXELS = {xsm: 20, md: 36} as const;

const styles = stylex.create({
  divider: {
    height: '0.75em',
  },
});

export interface AuthorBylineProps {
  authors: string[];
  date: string;
  updatedAt?: string | null;
  readingTimeMinutes?: number;
  variant?: 'compact' | 'full';
  className?: string;
}

export function AuthorByline({
  authors,
  date,
  updatedAt,
  readingTimeMinutes,
  variant = 'compact',
  className,
}: AuthorBylineProps) {
  const resolved = authors.map(resolveAuthor);
  const avatarSize = variant === 'full' ? 'md' : 'xsm';
  const textType = variant === 'full' ? 'body' : 'supporting';
  // Only link author names in the full (article) byline. The compact byline
  // renders inside a card-wide anchor (BlogCard), where a nested <a> would be
  // invalid HTML and break hydration.
  const linkAuthors = variant === 'full';

  return (
    <HStack
      gap={variant === 'full' ? 4 : 2}
      align="center"
      className={className}>
      {resolved.length > 0 ? (
        <>
          <AvatarGroup size={avatarSize}>
            {resolved.map(author => (
              <Avatar
                key={author.key}
                src={githubAvatarUrl(author.avatar, AVATAR_PIXELS[avatarSize])}
                name={author.name}
              />
            ))}
          </AvatarGroup>
          <Text type={textType} color="secondary">
            {resolved.map((author, i) => (
              <Fragment key={author.key}>
                {i > 0 ? ', ' : ''}
                {linkAuthors && author.href ? (
                  <Link
                    href={author.href}
                    type={textType}
                    color="secondary"
                    target="_blank"
                    rel="noopener noreferrer">
                    {author.name}
                  </Link>
                ) : (
                  author.name
                )}
              </Fragment>
            ))}
          </Text>
          <Divider orientation="vertical" xstyle={styles.divider} />
        </>
      ) : null}
      <Text type={textType} color="secondary">
        {formatDate(date)}
      </Text>
      {variant === 'full' && updatedAt ? (
        <>
          <Divider orientation="vertical" xstyle={styles.divider} />
          <Text type={textType} color="secondary">
            Updated {formatDate(updatedAt)}
          </Text>
        </>
      ) : null}
      {readingTimeMinutes ? (
        <>
          <Divider orientation="vertical" xstyle={styles.divider} />
          <Text type={textType} color="secondary">
            {readingTimeMinutes} min read
          </Text>
        </>
      ) : null}
    </HStack>
  );
}
