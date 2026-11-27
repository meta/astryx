// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hero-theme-content.test.ts
 * @input The home hero reel's slides and the lists of fonts and photos that
 *   the reel loads ahead of time
 * @output Proof that each slide names its own three photos and the fonts of
 *   its own cards, and that the slides together name the full lists
 * @position Docsite unit tests. hero-reel-warm-up.test.tsx proves when the
 *   reel loads them, and hero-reel-photos.test.tsx that a slide's photos have
 *   the sources that its cards render.
 * Run: pnpm -F @astryxdesign/docsite test hero-theme-content
 */

import {describe, expect, it, vi} from 'vitest';
import {
  HERO_THEME_SLIDES,
  REEL_FONT_SPECIFIERS,
  REEL_IMAGES,
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

const specifiers = (family: string, ...weights: number[]) =>
  weights.map(weight => `${weight} 1rem "${family}"`);

// The fonts that the cards of each slide draw, with each weight that their
// text asks for. No slide has the display font of its theme: Sarina,
// Manufacturing Consent or Crimson Text.
const FONTS_OF_SLIDES = [
  specifiers('Figtree', 400, 500, 600),
  [
    ...specifiers('DM Sans', 400, 500, 600),
    ...specifiers('Playwrite US Trad', 600),
  ],
  specifiers('Outfit', 400, 500, 600, 700),
  specifiers('Fustat', 400, 500, 600, 700),
  specifiers('Poppins', 400, 500, 600),
];

/** The file in `public` that a photo's sources load through the optimizer. */
const fileOf = (image: {src: string}) =>
  new URL(image.src, 'http://site').searchParams.get('url');

describe('the hero reel', () => {
  it('has the five slides in their order', () => {
    expect(HERO_THEME_SLIDES.map(slide => slide.label)).toEqual([
      'Astryx',
      'Matcha',
      'Butter',
      'Gothic',
      'Y2K',
    ]);
  });

  it('names the fonts of every slide, in slide order', () => {
    expect(REEL_FONT_SPECIFIERS).toEqual(FONTS_OF_SLIDES.flat());
  });

  it('names the three photos of every slide once, in slide order', () => {
    expect(REEL_IMAGES).toEqual(
      HERO_THEME_SLIDES.flatMap(slide => slideAssets(slide).images),
    );
    expect(REEL_IMAGES.map(fileOf)).toEqual(
      [
        ['neutral', 'watch', 'headphones', 'backpack'],
        ['matcha', 'watch', 'headphones', 'tumbler'],
        ['butter', 'watch', 'backpack', 'headphones'],
        ['gothic', 'watch', 'headphones', 'backpack'],
        ['y2k', 'watch', 'headphones', 'backpack'],
      ].flatMap(([theme, ...products]) =>
        products.map(product => `/landing/hero/${theme}-${product}.webp`),
      ),
    );
  });
});

describe('slideAssets', () => {
  it('names the fonts of the slide and no font of another slide', () => {
    const fonts = HERO_THEME_SLIDES.map(slide => slideAssets(slide).fonts);
    expect(fonts).toEqual(FONTS_OF_SLIDES);
  });

  it('names the photos of the three cards of the slide', () => {
    for (const slide of HERO_THEME_SLIDES) {
      expect(slideAssets(slide).images.map(fileOf)).toEqual([
        slide.content.product.image,
        slide.content.feature.image,
        slide.content.mini.image,
      ]);
    }
    expect(slideAssets(HERO_THEME_SLIDES[1]).images.map(fileOf)).toEqual([
      expect.stringContaining('matcha'),
      expect.stringContaining('matcha'),
      expect.stringContaining('matcha'),
    ]);
  });

  it('names no font for a theme that the font list does not hold', () => {
    expect(
      slideAssets({...HERO_THEME_SLIDES[0], name: '@astryxdesign/theme-new'})
        .fonts,
    ).toEqual([]);
  });
});
