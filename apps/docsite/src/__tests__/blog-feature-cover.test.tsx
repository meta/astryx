// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {CSSProperties, ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import type {BlogPost} from '../lib/blog/schema';

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) => styles,
  props: (...styles: unknown[]) => ({
    style: Object.assign(
      {},
      ...styles.filter(style => style && typeof style === 'object'),
    ),
  }),
}));

vi.mock('@astryxdesign/core/AspectRatio', async () => {
  const {createElement} = await import('react');
  return {
    AspectRatio: ({
      ratio,
      fit,
      xstyle,
      children,
    }: {
      ratio: number;
      fit?: string;
      xstyle: (Record<string, unknown> | false | null | undefined)[];
      children: ReactNode;
    }) =>
      createElement(
        'div',
        {
          'data-ratio': ratio,
          'data-fit': fit ?? 'self',
          style: Object.assign({}, ...xstyle.filter(Boolean)) as CSSProperties,
        },
        children,
      ),
  };
});

vi.mock('@astryxdesign/core/Text', async () => {
  const {createElement} = await import('react');
  return {
    Heading: ({children}: {children: ReactNode}) =>
      createElement('h1', null, children),
    Text: ({children}: {children: ReactNode}) =>
      createElement('p', null, children),
  };
});

vi.mock('@astryxdesign/core/Layout', async () => {
  const {createElement} = await import('react');
  return {
    VStack: ({children}: {children: ReactNode}) =>
      createElement('div', null, children),
  };
});

vi.mock('@astryxdesign/core/Link', async () => {
  const {createElement} = await import('react');
  return {
    Link: ({href, children}: {href: string; children: ReactNode}) =>
      createElement('a', {href}, children),
  };
});

vi.mock('@astryxdesign/core/VisuallyHidden', async () => {
  const {createElement} = await import('react');
  return {
    VisuallyHidden: ({children}: {children: ReactNode}) =>
      createElement('span', null, children),
  };
});

vi.mock('../components/blog/AuthorByline', () => ({AuthorByline: () => null}));
vi.mock('../components/blog/BlogCoverArt', () => ({
  BlogCoverArt: () => 'Generated cover',
}));
vi.mock('../components/blog/ReleaseCoverArt', () => ({
  ReleaseCoverArt: () => 'Release cover',
}));

import {BlogFeatureCard} from '../components/blog/BlogFeatureCard';

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

function render(overrides: Partial<BlogPost> = {}) {
  return renderToStaticMarkup(
    <BlogFeatureCard post={{...post, ...overrides}} />,
  );
}

describe('BlogFeatureCard cover presentation', () => {
  it('fits custom artwork without letting the frame grow off its 16:9 ratio', () => {
    const html = render();
    expect(html).toContain('data-ratio="1.7777777777777777"');
    expect(html).toContain('data-fit="contain"');
    expect(html).toContain('flex-grow:0');
    expect(html).toContain('src="/blog/cover-example/cover.png"');
    expect(html).toContain('alt="The complete event artwork"');
  });

  it('retains the stretched generated-art fallback', () => {
    const html = render({coverImage: null, coverAlt: null});
    expect(html).toContain('data-fit="self"');
    expect(html).toContain('flex-grow:1');
    expect(html).toContain('Generated cover');
  });

  it('retains the stretched release-art fallback', () => {
    const html = render({
      title: 'Astryx v0.7.0',
      coverImage: null,
      coverAlt: null,
    });
    expect(html).toContain('data-fit="self"');
    expect(html).toContain('flex-grow:1');
    expect(html).toContain('Release cover');
  });
});
