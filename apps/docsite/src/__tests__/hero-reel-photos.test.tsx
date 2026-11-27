// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hero-reel-photos.test.tsx
 * @input The home hero reel's slides, the sources of their photos, the cards
 *   that show them, and the Next.js image configuration
 * @output Proof that each reel photo loads through the image optimizer with a
 *   `srcset` and a `sizes` for its slot, in both card layouts, and that the
 *   warm-up names the same sources, for the whole reel and for one slide
 * @position Docsite unit tests. hero-reel-photo-warm-up.test.tsx proves what
 *   the warm-up gives the browser, and e2e/home-photo-sizes.spec.ts counts
 *   the requests of the built page.
 * Run: pnpm -F @astryxdesign/docsite test hero-reel-photos
 */

import fs from 'node:fs';
import path from 'node:path';
import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {imageConfigDefault} from 'next/dist/shared/lib/image-config';
import {HeroFloatingCards} from '../app/(site)/_landing/hero/HeroFloatingCards';
import {
  HERO_THEME_SLIDES,
  REEL_IMAGES,
  reelPhotoSources,
  reelThumbSources,
  slideAssets,
} from '../app/(site)/_landing/hero/heroThemeContent';

// The suite does not resolve the app's `@/` paths. The reel takes a theme
// object for each slide from these modules, and reads nothing in it.
vi.mock('@/generated/packageRegistry', () => ({packages: []}));
vi.mock('@/generated/themeRegistry', () => ({
  themeObjects: Object.fromEntries(
    ['matcha', 'butter', 'gothic', 'y2k'].map(name => [
      `@astryxdesign/theme-${name}`,
      {name},
    ]),
  ),
}));
vi.mock('@/themes/astryx', () => ({astryxTheme: {name: 'astryx'}}));
vi.mock('@/constants', () => ({BRAND_BLUE: 'blue'}));

// Each mocked component renders its children only, so a test reads the
// photos without the styles and context that the real components need.
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
  keyframes: () => 'keyframes',
  props: () => ({}),
}));
vi.mock('lucide-react', () => stubs.passthrough(['Plus', 'Sparkles']));
vi.mock('@astryxdesign/core/Card', () => stubs.passthrough(['Card']));
vi.mock('@astryxdesign/core/Badge', () => stubs.passthrough(['Badge']));
vi.mock('@astryxdesign/core/Button', () => stubs.passthrough(['Button']));
vi.mock('@astryxdesign/core/Text', () =>
  stubs.passthrough(['Text', 'Heading']),
);
vi.mock('@astryxdesign/core/Layout', () =>
  stubs.passthrough(['VStack', 'HStack']),
);
vi.mock('@astryxdesign/core/Chat', () =>
  stubs.passthrough(['ChatComposer', 'ChatSendButton']),
);
vi.mock('@astryxdesign/core/ProgressBar', () =>
  stubs.passthrough(['ProgressBar']),
);
vi.mock('@astryxdesign/core/RadioList', () =>
  stubs.passthrough(['RadioList', 'RadioListItem']),
);
vi.mock('@astryxdesign/core/Avatar', () => stubs.passthrough(['Avatar']));
vi.mock('@astryxdesign/core/AspectRatio', () =>
  stubs.passthrough(['AspectRatio']),
);

const publicDir = path.resolve(__dirname, '../../public');
const PHOTO_WIDTHS = [256, 384, 640, 750, 1080];
const PHOTO_SIZES =
  '(min-width: 1024px) 258px, (min-width: 768px) 315px, 216px';
const THUMB_WIDTHS = [128, 256];
const THUMB_SIZES = '66px';

const optimized = (file: string, width: number) =>
  `/_next/image?url=${encodeURIComponent(file)}&w=${width}&q=75`;
const srcSet = (file: string, widths: number[]) =>
  widths.map(width => `${optimized(file, width)} ${width}w`).join(', ');

/** The sources of each image in the markup, in document order. */
function images(html: string) {
  const attribute = (tag: string, name: string) =>
    (new RegExp(`\\b${name}="([^"]*)"`, 'iu').exec(tag)?.[1] ?? '').replaceAll(
      '&amp;',
      '&',
    );
  return [...html.matchAll(/<img\b[^>]*>/gu)].map(([tag]) => ({
    src: attribute(tag, 'src'),
    srcSet: attribute(tag, 'srcset'),
    sizes: attribute(tag, 'sizes'),
  }));
}

describe('the sources of a reel photo', () => {
  const file = '/landing/hero/matcha-watch.webp';

  it('offer a card photo at five widths, for the longer side of its box', () => {
    expect(reelPhotoSources(file)).toEqual({
      src: optimized(file, 1080),
      srcSet: srcSet(file, PHOTO_WIDTHS),
      sizes: PHOTO_SIZES,
    });
  });

  it('offer the buy card thumbnail at two small widths, for the widest box that a theme gives it', () => {
    expect(reelThumbSources(file)).toEqual({
      src: optimized(file, 256),
      srcSet: srcSet(file, THUMB_WIDTHS),
      sizes: THUMB_SIZES,
    });
  });

  it('ask the optimizer for widths that it allows', async () => {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const config = {
      ...imageConfigDefault,
      ...(nextConfig as {images?: Partial<typeof imageConfigDefault>}).images,
    };
    expect([...config.deviceSizes, ...config.imageSizes]).toEqual(
      expect.arrayContaining([...PHOTO_WIDTHS, ...THUMB_WIDTHS]),
    );
  });
});

describe('the reel cards', () => {
  it.each(['overlap', 'stack'] as const)(
    'the %s layout loads each photo from the sources of its slot',
    layout => {
      for (const {content} of HERO_THEME_SLIDES) {
        const html = renderToStaticMarkup(
          <HeroFloatingCards content={content} mounted layout={layout} />,
        );
        expect(images(html)).toEqual([
          reelPhotoSources(content.product.image),
          reelPhotoSources(content.feature.image),
          reelThumbSources(content.mini.image),
        ]);
      }
    },
  );
});

describe('the warm-up list', () => {
  it.each(['overlap', 'stack'] as const)(
    'names each photo once, with the sources that the %s layout renders',
    layout => {
      const rendered = HERO_THEME_SLIDES.flatMap(({content}) =>
        images(
          renderToStaticMarkup(
            <HeroFloatingCards content={content} mounted layout={layout} />,
          ),
        ),
      );
      expect(REEL_IMAGES).toEqual(rendered);
      expect(REEL_IMAGES).toHaveLength(15);
      expect(new Set(REEL_IMAGES.map(image => image.srcSet)).size).toBe(15);
    },
  );

  it.each(['overlap', 'stack'] as const)(
    'names, for one slide, the sources that the %s layout renders for it',
    layout => {
      for (const slide of HERO_THEME_SLIDES) {
        expect(slideAssets(slide).images).toEqual(
          images(
            renderToStaticMarkup(
              <HeroFloatingCards
                content={slide.content}
                mounted
                layout={layout}
              />,
            ),
          ),
        );
      }
    },
  );

  it('names files that the docsite serves', () => {
    for (const {content} of HERO_THEME_SLIDES) {
      for (const file of [
        content.product.image,
        content.feature.image,
        content.mini.image,
      ]) {
        expect(fs.existsSync(path.join(publicDir, file)), file).toBe(true);
      }
    }
  });
});
