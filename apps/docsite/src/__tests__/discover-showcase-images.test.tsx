// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover-showcase-images.test.tsx
 * @input The home page's Discover section
 * @output Proof that each floating image offers a screen too narrow to show
 *   it a source with nothing to download, and keeps its own file
 * @position Docsite unit tests. e2e/home-photo-sizes.spec.ts counts the
 *   requests of the built page at a narrow and at a wide size.
 * Run: pnpm -F @astryxdesign/docsite test discover-showcase-images
 */

import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {DiscoverShowcase} from '../app/(site)/_landing/DiscoverShowcase';

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
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/Layout', () => stubs.passthrough(['VStack']));
vi.mock('@astryxdesign/core/Grid', () => stubs.passthrough(['Grid']));
vi.mock('@astryxdesign/core/Card', () => stubs.passthrough(['Card']));
vi.mock('@astryxdesign/core/Text', () =>
  stubs.passthrough(['Heading', 'Text']),
);
vi.mock('@astryxdesign/core/Button', () => stubs.passthrough(['Button']));
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({spacingVars: {}}));
vi.mock('../components/logos', () => stubs.passthrough(['AstryxLogo']));
vi.mock('../layout.stylex', () => ({layout: {}}));

describe('the Discover images', () => {
  const html = renderToStaticMarkup(
    <DiscoverShowcase coreComponentCount={150} />,
  );
  const pictures = [...html.matchAll(/<picture>(.*?)<\/picture>/gu)].map(
    ([, inner]) => inner,
  );

  it('are four pictures, each with its own file', () => {
    expect(
      pictures.map(inner => /<img[^>]*\bsrc="([^"]*)"/u.exec(inner)?.[1]),
    ).toEqual([1, 3, 2, 4].map(n => `/landing/discover-card-${n}.webp`));
    expect(html.match(/<img\b/gu)).toHaveLength(4);
  });

  it('offer a screen that does not show them one transparent pixel, before the file', () => {
    for (const inner of pictures) {
      const [source] = /^<source[^>]*>/u.exec(inner) ?? [];
      expect(source).toContain('media="not all and (min-width: 960px)"');
      const data = /\bsrcSet="(data:image\/gif;base64,[^"]*)"/iu.exec(
        source ?? '',
      )?.[1];
      expect(data).toBeDefined();
      const bytes = Buffer.from((data as string).split(',')[1], 'base64');
      // A GIF of 1 by 1 pixel: the size is in bytes 6 to 9.
      expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
      expect([...bytes.subarray(6, 10)]).toEqual([1, 0, 1, 0]);
    }
  });
});
