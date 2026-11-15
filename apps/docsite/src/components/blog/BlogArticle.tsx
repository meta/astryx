// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlogArticle.tsx
 * Full blog post layout: breadcrumb, title, byline, cover, prose, related docs.
 */

import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Icon} from '@astryxdesign/core/Icon';
import {Section} from '@astryxdesign/core/Section';
import {Badge} from '@astryxdesign/core/Badge';
import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {Divider} from '@astryxdesign/core/Divider';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';
import type {BlogPost} from '../../lib/blog/schema';
import {POST_TYPE_LABELS} from '../../lib/blog/schema';
import {MarkdownText} from '../MarkdownText';
import {AuthorByline} from './AuthorByline';
import {ReleaseCoverArt} from './ReleaseCoverArt';
import {BlogPostBody} from './BlogPostBody';
import {parseReleaseVersion} from '../../lib/blog/release';
import {layout} from '../../layout.stylex';

const styles = stylex.create({
  section: {
    marginInline: 'auto',
    // Match the docs article body treatment (17px / 1.6470588235) from DocPageLayout.
    // The post body renders via Markdown, whose root reads these tokens;
    // re-assigning them here scopes the larger/airier body to the blog
    // article only. The title (display-1) and subtitle/description (large)
    // use different tokens, so they're unaffected.
    [typeScaleVars['--text-body-size']]: '1.0625rem', // 17px
    [typeScaleVars['--text-body-leading']]: '1.6470588235', // 28px
    [typeScaleVars['--text-large-size']]: '1.25rem', // 20px
    [typeScaleVars['--text-large-leading']]: '2rem', // 40px
  },
  cover: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    border: '1px solid var(--color-border)',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  tagRow: {
    flexWrap: 'wrap',
  },
});

export interface BlogArticleProps {
  post: BlogPost;
}

export function BlogArticle({post}: BlogArticleProps) {
  const releaseVersion = parseReleaseVersion(post.title);
  return (
    <Section
      maxWidth={layout.proseMaxWidth}
      padding={6}
      xstyle={styles.section}>
      <VStack gap={10}>
        <VStack gap={4}>
          <Breadcrumbs>
            <BreadcrumbItem href="/blog">Blog</BreadcrumbItem>
            <BreadcrumbItem isCurrent>
              {POST_TYPE_LABELS[post.type]}
            </BreadcrumbItem>
          </Breadcrumbs>
          <Heading level={1} type="display-1">
            {post.title}
          </Heading>
          <MarkdownText type="large" weight="normal" color="secondary">
            {post.dek ?? post.description}
          </MarkdownText>
          <AuthorByline
            authors={post.authors}
            date={post.date}
            updatedAt={post.updatedAt}
            readingTimeMinutes={post.readingTimeMinutes}
            variant="full"
          />
          <Divider />
        </VStack>

        {post.coverImage ? (
          <AspectRatio ratio={16 / 9} xstyle={styles.cover}>
            <img
              src={post.coverImage}
              alt={post.coverAlt ?? ''}
              {...stylex.props(styles.coverImg)}
            />
          </AspectRatio>
        ) : releaseVersion ? (
          <AspectRatio ratio={16 / 9} xstyle={styles.cover}>
            <ReleaseCoverArt
              version={releaseVersion}
              packageName={post.releasePackage ?? undefined}
            />
          </AspectRatio>
        ) : null}

        <BlogPostBody body={post.body} slug={post.slug} />

        {post.tags.length > 0 ? (
          <HStack gap={1} xstyle={styles.tagRow}>
            {post.tags.map(tag => (
              <Badge key={tag} label={tag} variant="neutral" />
            ))}
          </HStack>
        ) : null}

        {post.relatedDocs && post.relatedDocs.length > 0 ? (
          <VStack gap={6}>
            <Divider />
            <Heading level={2} type="display-3">
              Related
            </Heading>
            <Grid columns={{minWidth: 280, repeat: 'fill'}} gap={2}>
              {post.relatedDocs.map(doc => (
                <ClickableCard
                  key={doc.href}
                  href={doc.href}
                  label={doc.title}
                  padding={3}
                  variant="muted">
                  <HStack justify="between" align="center" gap={2}>
                    <Text type="body" weight="medium">
                      {doc.title}
                    </Text>
                    <Icon icon="chevronRight" size="sm" color="secondary" />
                  </HStack>
                </ClickableCard>
              ))}
            </Grid>
          </VStack>
        ) : null}
      </VStack>
    </Section>
  );
}
