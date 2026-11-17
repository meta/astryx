// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A blog cover loads through the image optimizer, wherever a page shows
 * it. A cover the optimizer does not convert keeps its own URL. Page metadata
 * names the cover file itself.
 *
 * @input The cover components, the generated blog registry, and the Next.js
 *   config
 * @output Regression coverage for blog cover image URLs
 * @position Docsite blog verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import fs from 'node:fs';
import path from 'node:path';
import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {imageConfigDefault} from 'next/dist/shared/lib/image-config';
import type * as BlogRegistry from '../generated/blogRegistry';
import type {BlogPost} from '../lib/blog/schema';

const fixtures = vi.hoisted(() => {
  const post: BlogPost = {
    slug: 'cover-example',
    title: 'Building with a design system',
    description: 'A cover example',
    dek: null,
    date: '2026-11-12',
    type: 'story',
    authors: [],
    tags: ['Design systems'],
    updatedAt: null,
    draft: false,
    coverImage: '/blog/cover-example/cover.png',
    coverAlt: 'The complete event artwork',
    releasePackage: null,
    relatedDocs: null,
    body: '',
    readingTimeMinutes: 1,
  };
  return {
    post,
    published: [
      post,
      {...post, slug: 'animated', coverImage: '/blog/animated/cover.gif'},
      {...post, slug: 'photo', coverImage: '/blog/photo/header.jpg'},
    ],
  };
});

// Each mocked component renders its children only, so a test reads the cover
// markup without the styles and context that the real components need.
const stubs = vi.hoisted(() => ({
  passthrough: async (names: string[]) => {
    const {createElement} = await import('react');
    return Object.fromEntries(
      names.map(name => [
        name,
        ({children}: {children?: ReactNode}) =>
          createElement('div', null, children),
      ]),
    );
  },
}));

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) => styles,
  defineConsts: (consts: Record<string, unknown>) => consts,
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/Text', () =>
  stubs.passthrough(['Text', 'Heading']),
);
vi.mock('@astryxdesign/core/Layout', () =>
  stubs.passthrough(['VStack', 'HStack']),
);
vi.mock('@astryxdesign/core/Link', () => stubs.passthrough(['Link']));
vi.mock('@astryxdesign/core/AspectRatio', () =>
  stubs.passthrough(['AspectRatio']),
);
vi.mock('@astryxdesign/core/VisuallyHidden', () =>
  stubs.passthrough(['VisuallyHidden']),
);
vi.mock('@astryxdesign/core/Grid', () => stubs.passthrough(['Grid']));
vi.mock('@astryxdesign/core/Icon', () => stubs.passthrough(['Icon']));
vi.mock('@astryxdesign/core/Section', () => stubs.passthrough(['Section']));
vi.mock('@astryxdesign/core/Badge', () => stubs.passthrough(['Badge']));
vi.mock('@astryxdesign/core/Breadcrumbs', () =>
  stubs.passthrough(['Breadcrumbs', 'BreadcrumbItem']),
);
vi.mock('@astryxdesign/core/Divider', () => stubs.passthrough(['Divider']));
vi.mock('@astryxdesign/core/ClickableCard', () =>
  stubs.passthrough(['ClickableCard']),
);
vi.mock('@astryxdesign/core/Button', () => stubs.passthrough(['Button']));
vi.mock('@astryxdesign/core/ToggleButton', () =>
  stubs.passthrough(['ToggleButton', 'ToggleButtonGroup']),
);
vi.mock('@astryxdesign/core/EmptyState', () =>
  stubs.passthrough(['EmptyState']),
);
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  spacingVars: {},
  typeScaleVars: {},
}));
vi.mock('../generated/blogRegistry', () => ({
  blogPosts: fixtures.published,
  blogFixturePosts: [],
}));
vi.mock('../components/MarkdownText', () =>
  stubs.passthrough(['MarkdownText']),
);
vi.mock('../components/blog/AuthorByline', () =>
  stubs.passthrough(['AuthorByline']),
);
vi.mock('../components/blog/BlogPostBody', () =>
  stubs.passthrough(['BlogPostBody']),
);
vi.mock('../components/blog/BlogCoverArt', () =>
  stubs.passthrough(['BlogCoverArt']),
);
vi.mock('../components/blog/ReleaseCoverArt', () =>
  stubs.passthrough(['ReleaseCoverArt']),
);

import {BlogArticle} from '../components/blog/BlogArticle';
import {BlogCard} from '../components/blog/BlogCard';
import {BlogFeatureCard} from '../components/blog/BlogFeatureCard';
import {BlogIndex} from '../components/blog/BlogIndex';
import {BlogShowcase} from '../app/(site)/_landing/BlogShowcase';
import {generateMetadata} from '../app/blog/[slug]/page';
import {BLOG_COVER_WIDTH, blogCoverUrl} from '../lib/blog/coverImage';

const publicDir = path.resolve(__dirname, '../../public');
const {post} = fixtures;

const optimized = (file: string) =>
  `/_next/image?url=${encodeURIComponent(file)}&w=1920&q=75`;

/** The `src` and `alt` of each image in the markup, in document order. */
function images(html: string): Array<{src: string; alt: string}> {
  return [...html.matchAll(/<img\b[^>]*>/gu)].map(([tag]) => ({
    src: (/\bsrc="([^"]*)"/u.exec(tag)?.[1] ?? '').replaceAll('&amp;', '&'),
    alt: /\balt="([^"]*)"/u.exec(tag)?.[1] ?? '',
  }));
}

describe('blogCoverUrl', () => {
  it.each(['cover.png', 'header.jpg', 'photo.jpeg', 'COVER.PNG'])(
    'loads %s through the optimizer',
    file => {
      expect(blogCoverUrl(`/blog/a-post/${file}`)).toBe(
        optimized(`/blog/a-post/${file}`),
      );
    },
  );

  it('keeps a GIF on its own file', () => {
    expect(blogCoverUrl('/blog/the-astryx-cli/cover.gif')).toBe(
      '/blog/the-astryx-cli/cover.gif',
    );
  });

  it.each([
    ['a vector image', '/blog/a-post/cover.svg'],
    ['a WebP image', '/blog/a-post/cover.webp'],
    ['a name with an image extension in the middle', '/blog/a/cover.png.gif'],
    ['a URL on another host', 'https://example.com/blog/a-post/cover.png'],
    ['a URL on another host with no scheme', '//example.com/cover.png'],
    ['a URL on another host behind a backslash', '/\\example.com/cover.png'],
    ['a path with a query string', '/blog/a-post/cover.png?v=2'],
    ['a query string that ends like a file', '/blog/a-post/cover?as=cover.png'],
    ['a fragment that ends like a file', '/blog/a-post/cover.gif#cover.png'],
    ['a path that is not root-relative', 'blog/a-post/cover.png'],
  ])('keeps %s as written', (_, cover) => {
    expect(blogCoverUrl(cover)).toBe(cover);
  });
});

describe('the places that show a cover', () => {
  const cover = {
    src: optimized(post.coverImage as string),
    alt: 'The complete event artwork',
  };

  it('the article loads its cover through the optimizer', () => {
    expect(images(renderToStaticMarkup(<BlogArticle post={post} />))).toEqual([
      cover,
    ]);
  });

  it('a card loads its cover through the optimizer', () => {
    expect(images(renderToStaticMarkup(<BlogCard post={post} />))).toEqual([
      cover,
    ]);
    expect(
      images(renderToStaticMarkup(<BlogCard post={post} feature />)),
    ).toEqual([cover]);
  });

  it('the landing feature card loads its cover through the optimizer', () => {
    expect(
      images(renderToStaticMarkup(<BlogFeatureCard post={post} />)),
    ).toEqual([cover]);
  });

  it('the blog index loads the cover of each card through the optimizer', () => {
    const posts = ['first', 'second', 'third'].map(slug => ({
      ...post,
      slug,
      coverImage: `/blog/${slug}/cover.png`,
    }));
    const html = renderToStaticMarkup(
      <BlogIndex posts={posts} availableTypes={['story']} />,
    );
    expect(images(html).map(image => image.src)).toEqual(
      posts.map(each => optimized(each.coverImage)),
    );
  });

  it('the landing page sends each PNG and JPEG cover through the optimizer', () => {
    expect(
      images(renderToStaticMarkup(<BlogShowcase />)).map(image => image.src),
    ).toEqual([
      optimized('/blog/cover-example/cover.png'),
      '/blog/animated/cover.gif',
      optimized('/blog/photo/header.jpg'),
    ]);
  });

  it('a GIF cover renders from its own URL in each place', () => {
    const gif = {...post, coverImage: '/blog/the-astryx-cli/cover.gif'};
    for (const html of [
      renderToStaticMarkup(<BlogArticle post={gif} />),
      renderToStaticMarkup(<BlogFeatureCard post={gif} />),
      renderToStaticMarkup(<BlogCard post={gif} />),
    ]) {
      expect(images(html)).toEqual([{...cover, src: gif.coverImage}]);
    }
  });
});

describe('the cover width', () => {
  it('is a width the optimizer allows', async () => {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const images = {
      ...imageConfigDefault,
      ...(nextConfig as {images?: Partial<typeof imageConfigDefault>}).images,
    };
    expect(images.deviceSizes).toContain(BLOG_COVER_WIDTH);
  });
});

describe('the published covers', () => {
  it('name a file that public serves in each optimizer URL', async () => {
    const {blogPosts} = await vi.importActual<typeof BlogRegistry>(
      '../generated/blogRegistry',
    );
    const optimizedCovers = blogPosts
      .flatMap(each => each.coverImage ?? [])
      .filter(file => blogCoverUrl(file) !== file);
    expect(
      optimizedCovers.filter(
        file => !fs.existsSync(path.join(publicDir, file)),
      ),
    ).toEqual([]);
  });
});

describe('what a crawler gets', () => {
  it("a post's social card names the cover file itself", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({slug: post.slug}),
    });
    expect(metadata.openGraph?.images).toEqual([
      {url: post.coverImage, alt: post.coverAlt},
    ]);
    expect(metadata.twitter?.images).toEqual([post.coverImage]);
  });
});
