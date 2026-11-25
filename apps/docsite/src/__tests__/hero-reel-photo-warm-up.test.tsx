// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file hero-reel-photo-warm-up.test.tsx
 * @input The home hero reel's provider, with a list of photo sources
 * @output Proof that the warm-up gives the browser the `sizes` and the
 *   `srcset` of each photo before its `src`, so that it loads the file that
 *   the photo's card loads
 * @position Docsite unit tests. hero-reel-photos.test.tsx proves that the
 *   list and the cards have the same sources, and
 *   e2e/home-photo-sizes.spec.ts counts the requests of the built page.
 * Run: pnpm -F @astryxdesign/docsite test hero-reel-photo-warm-up
 */

import type {ReactNode} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {HeroReelProvider} from '../app/(site)/_landing/hero/HeroThemeReel';

const reel = vi.hoisted(() => ({
  HERO_THEME_SLIDES: [],
  REEL_FONT_SPECIFIERS: [],
  REEL_IMAGES: ['watch', 'backpack'].map(photo => ({
    src: `/optimized/${photo}?w=1080`,
    srcSet: `/optimized/${photo}?w=256 256w, /optimized/${photo}?w=1080 1080w`,
    sizes: `${photo}-slot`,
  })),
}));

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
vi.mock('@astryxdesign/core/theme', () => stubs.passthrough(['Theme']));
vi.mock('@astryxdesign/core/Text', () => stubs.passthrough(['Text']));
vi.mock('@astryxdesign/core/Pagination', () =>
  stubs.passthrough(['Pagination']),
);
vi.mock('../app/providers', () => ({
  useThemeMode: () => ({themeMode: 'light'}),
}));
vi.mock('../components/logos', () => stubs.passthrough(['AstryxLogo']));
vi.mock('../app/(site)/_landing/hero/HeroFloatingCards', () =>
  stubs.passthrough(['HeroFloatingCards']),
);
vi.mock('../app/(site)/_landing/hero/heroThemeContent', () => reel);

// Each attribute that the warm-up sets on an image, in the order it sets
// them.
let images: Array<Array<[string, string]>> = [];

beforeEach(() => {
  vi.useFakeTimers();
  images = [];
  vi.stubGlobal(
    'Image',
    class {
      private readonly set: Array<[string, string]> = [];
      decoding = '';
      constructor() {
        images.push(this.set);
      }
      set sizes(value: string) {
        this.set.push(['sizes', value]);
      }
      set srcset(value: string) {
        this.set.push(['srcset', value]);
      }
      set src(value: string) {
        this.set.push(['src', value]);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the reel warm-up', () => {
  it('gives each image the sizes and the srcset of its card, and then the src', () => {
    render(<HeroReelProvider>reel</HeroReelProvider>);
    expect(images).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // A browser starts a download when it gets a `src`. With the `sizes` and
    // the `srcset` already there, that download is the file the card shows.
    expect(images).toEqual(
      reel.REEL_IMAGES.map(({src, srcSet, sizes}) => [
        ['sizes', sizes],
        ['srcset', srcSet],
        ['src', src],
      ]),
    );
  });
});
