// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file heroThemeContent.ts
 * @input the docsite theme package registry (generated) + the local Astryx theme
 * @output an ordered list of {theme, label, content} slides the hero cycles
 * @position Home hero — single source of truth for the theming showcase reel.
 *
 * Per-theme content (copy + product photos) for the reel's cards, plus the
 * curated theme list/order (REEL_THEMES) and per-theme aurora/wordmark/mode.
 */

import type {DefinedTheme} from '@astryxdesign/core/theme';
import {packages} from '@/generated/packageRegistry';
import {themeObjects} from '@/generated/themeRegistry';
// Built theme (__built:true) so the hero reel's <Theme> slide uses pre-built
// CSS and skips runtime injection. BRAND_BLUE (logo-only) lives in @/constants.
import {astryxTheme} from '@/themes/astryx';
import {BRAND_BLUE} from '@/constants';
import {optimizedImageSources} from '../../../../lib/optimizedImageUrl.mjs';

// Sentinel for the docsite's local brand theme (not an @astryxdesign/theme-* package).
const ASTRYX = 'astryx';

export interface HeroThemeContent {
  /** Product card (image + title/description + price). */
  product: {
    image: string;
    title: string;
    description: string;
    price: string;
  };
  /** Feature/reward card image + title/price. */
  feature: {
    image: string;
    title: string;
    price: string;
  };
  /** The buy card (thumbnail + title/description + cart). */
  mini: {
    image: string;
    title: string;
    description: string;
  };
  /** Floating pill callouts (leading badge, trailing radio). */
  pills: {
    leading: string;
    trailing: string;
  };
  /** Chat composer placeholder. */
  chatPrompt: string;
  /** Reward-progress card copy. */
  reward: {
    label: string;
    value: number;
    total: number;
    member: string;
  };
}

/** The three aurora blob colors (left, center, right). */
export interface HeroAuroraPalette {
  left: string;
  center: string;
  right: string;
}

export interface HeroThemeSlide {
  /** Theme package name, e.g. '@astryxdesign/theme-matcha'. */
  name: string;
  /** Human-readable label, e.g. 'Matcha'. */
  label: string;
  /** Resolved theme object passed to <Theme>. */
  theme: DefinedTheme;
  /** Per-theme content for the floating cards. */
  content: HeroThemeContent;
  /** Soft pastel palette feeding the blurred aurora background blobs. */
  aurora: HeroAuroraPalette;
  /** CSS color the wordmark paints in (must read on the slide's hero fill). */
  wordmarkColor: string;
  /**
   * Dark-first theme. On dark slides the hero text/links/nav switch to light,
   * and the theme renders in dark mode (fill, cards, blobs use its dark palette).
   */
  isDark: boolean;
  /** Color mode the slide's theme renders in. Dark-first themes use 'dark'. */
  mode: 'light' | 'dark';
}

// The curated reel — these themes, in this order. Edit here to add/remove.
const REEL_THEMES: ReadonlyArray<string> = [
  ASTRYX,
  '@astryxdesign/theme-matcha',
  '@astryxdesign/theme-butter',
  '@astryxdesign/theme-gothic',
  '@astryxdesign/theme-y2k',
];

// Per-theme card content, keyed by theme name (or the ASTRYX sentinel).
// The photos are WebP copies of the theme product PNGs, 700 to 960 px wide.
// A card loads a photo through reelPhotoSources or reelThumbSources, at the
// width that its slot and the screen need.
const CONTENT_BY_THEME: Record<string, HeroThemeContent> = {
  [ASTRYX]: {
    // Product photos reuse the Neutral theme's image set (watch / headphones /
    // backpack) now that Neutral is no longer a standalone reel slide.
    product: {
      image: '/landing/hero/neutral-watch.webp',
      title: 'Minimalist watch',
      description: 'Clean design, everyday durability.',
      price: '$240',
    },
    feature: {
      image: '/landing/hero/neutral-headphones.webp',
      title: 'Wireless headphones',
      price: '$180',
    },
    mini: {
      image: '/landing/hero/neutral-backpack.webp',
      title: 'Canvas backpack',
      description: 'Water-resistant.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {
      label: 'Points',
      value: 7,
      total: 8,
      member: 'Astryx team',
    },
  },
  '@astryxdesign/theme-neutral': {
    product: {
      image: '/landing/hero/neutral-watch.webp',
      title: 'Minimalist watch',
      description: 'Clean design, everyday durability.',
      price: '$240',
    },
    feature: {
      image: '/landing/hero/neutral-headphones.webp',
      title: 'Wireless headphones',
      price: '$180',
    },
    mini: {
      image: '/landing/hero/neutral-backpack.webp',
      title: 'Canvas backpack',
      description: 'Water-resistant.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {
      label: 'Points',
      value: 6,
      total: 10,
      member: 'Alex Rivera',
    },
  },
  '@astryxdesign/theme-butter': {
    product: {
      image: '/landing/hero/butter-watch.webp',
      title: 'Butter croissant',
      description: 'Flaky, laminated layers baked golden each morning.',
      price: '$6',
    },
    feature: {
      image: '/landing/hero/butter-backpack.webp',
      title: 'Belgian waffle',
      price: '$8',
    },
    mini: {
      image: '/landing/hero/butter-headphones.webp',
      title: 'Pancakes',
      description: 'Stacked tall with melting butter.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {label: 'Points', value: 5, total: 9, member: 'Noa Bright'},
  },
  '@astryxdesign/theme-matcha': {
    product: {
      image: '/landing/hero/matcha-watch.webp',
      title: 'Matcha',
      description: 'Stone-ground ceremonial matcha over cold milk.',
      price: '$6',
    },
    feature: {
      image: '/landing/hero/matcha-headphones.webp',
      title: 'Strawberry matcha',
      price: '$7',
    },
    mini: {
      image: '/landing/hero/matcha-tumbler.webp',
      title: 'Ube matcha',
      description: 'Ube and cream matcha.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {
      label: 'Points',
      value: 7,
      total: 8,
      member: 'Lottie Wang',
    },
  },
  '@astryxdesign/theme-gothic': {
    product: {
      image: '/landing/hero/gothic-watch.webp',
      title: 'Sea holly',
      description: 'A single preserved thistle stem with a steely bloom.',
      price: '$24',
    },
    feature: {
      image: '/landing/hero/gothic-headphones.webp',
      title: 'Garden rose',
      price: '$18',
    },
    mini: {
      image: '/landing/hero/gothic-backpack.webp',
      title: 'Ranunculus',
      description: 'Layered petals in a soft mauve.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {label: 'Points', value: 7, total: 8, member: 'Mara Vale'},
  },
  '@astryxdesign/theme-y2k': {
    product: {
      image: '/landing/hero/y2k-watch.webp',
      title: 'Phone',
      description: 'Iridescent clamshell with a rainbow screen.',
      price: '$18',
    },
    feature: {
      image: '/landing/hero/y2k-headphones.webp',
      title: 'Glow star set',
      price: '$12',
    },
    mini: {
      image: '/landing/hero/y2k-backpack.webp',
      title: 'Butterfly',
      description: 'Sparkly stick-on in pastel chrome.',
    },
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {label: 'Points', value: 6, total: 8, member: 'Bella Cruz'},
  },
};

// Fallback content for any theme without a bespoke entry (uses its preview img).
function fallbackContent(name: string): HeroThemeContent {
  const slug = name.replace('@astryxdesign/theme-', '');
  const image = `/theme-${slug}-preview.png`;
  return {
    product: {
      image,
      title: 'Featured product',
      description: 'A polished surface, styled by this theme.',
      price: '$40',
    },
    feature: {image, title: 'Featured product', price: '$40'},
    mini: {image, title: 'Featured', description: 'In stock now.'},
    pills: {leading: 'Limited time', trailing: 'Free shipping'},
    chatPrompt: 'How can I help?',
    reward: {label: 'Points', value: 6, total: 10, member: 'Sam Lee'},
  };
}

// Properly-cased dot labels (package displayNames are sometimes lowercased).
const LABEL_BY_THEME: Record<string, string> = {
  [ASTRYX]: 'Astryx',
  '@astryxdesign/theme-neutral': 'Neutral',
  '@astryxdesign/theme-butter': 'Butter',
  '@astryxdesign/theme-matcha': 'Matcha',
  '@astryxdesign/theme-gothic': 'Gothic',
  '@astryxdesign/theme-y2k': 'Y2K',
};

function labelFor(name: string): string {
  if (LABEL_BY_THEME[name]) {
    return LABEL_BY_THEME[name];
  }
  const pkg = packages.find(p => p.name === name);
  const raw = pkg?.displayName ?? name.replace('@astryxdesign/theme-', '');
  return raw.replace(/^Theme:\s*/, '').replace(/\s*Theme$/, '');
}

// Resolve a slide's theme object (Astryx is local; others from the registry).
// Returns null for an uninstalled package so the reel skips it.
function themeFor(name: string): DefinedTheme | null {
  if (name === ASTRYX) {
    return astryxTheme;
  }
  return themeObjects[name] ?? null;
}

// Wordmark color — by default the theme's accent text token. Each theme's
// --color-text-accent is already mode-correct (a dark ink on light themes,
// a light ink on dark-only themes like Gothic where accent === #E8F1F6).
const WORDMARK_COLOR = 'var(--color-text-accent)';

// Per-theme wordmark overrides. Astryx is special: its theme repoints every
// accent token to the warm primary ink (the brand blue is reserved for the
// logo), so --color-text-accent is now near-black. The wordmark therefore
// uses the brand blue directly so the Astryx logo stays blue while the rest of
// the slide's UI reads as primary. Other themes fall back to WORDMARK_COLOR.
const WORDMARK_COLOR_BY_THEME: Record<string, string> = {
  [ASTRYX]: BRAND_BLUE,
};

function wordmarkColorFor(name: string): string {
  return WORDMARK_COLOR_BY_THEME[name] ?? WORDMARK_COLOR;
}

// Dark-first themes (rendered in dark mode; hero text/nav go light).
const DARK_THEMES: ReadonlySet<string> = new Set<string>([
  '@astryxdesign/theme-gothic',
]);

// Per-theme aurora blob palettes (categorical background tokens, on-brand hues).
const AURORA_BY_THEME: Record<string, HeroAuroraPalette> = {
  [ASTRYX]: {
    left: 'var(--color-background-yellow)',
    center: 'var(--color-background-yellow)',
    right: 'var(--color-background-pink)',
  },
  '@astryxdesign/theme-neutral': {
    left: 'var(--color-background-blue)',
    center: 'var(--color-background-gray)',
    right: 'var(--color-background-cyan)',
  },
  '@astryxdesign/theme-butter': {
    left: 'var(--color-background-yellow)',
    center: 'var(--color-background-yellow)',
    right: 'var(--color-background-orange)',
  },
  '@astryxdesign/theme-matcha': {
    left: 'var(--color-background-green)',
    center: 'var(--color-background-cyan)',
    right: 'var(--color-background-yellow)',
  },
  // Gothic (dark mode): use saturated --color-border-* tokens so the blobs glow
  // instead of washing out white (the 20%-alpha background tints would).
  '@astryxdesign/theme-gothic': {
    left: 'var(--color-border-purple)',
    center: 'var(--color-border-blue)',
    right: 'var(--color-border-teal)',
  },
  '@astryxdesign/theme-y2k': {
    left: 'var(--color-background-pink)',
    center: 'var(--color-background-purple)',
    right: 'var(--color-background-blue)',
  },
};

// Fallback aurora for any theme without a bespoke palette above.
const DEFAULT_AURORA: HeroAuroraPalette = {
  left: 'var(--color-background-blue)',
  center: 'var(--color-background-purple)',
  right: 'var(--color-background-pink)',
};

// The custom (web) font families each reel theme paints with — body, heading,
// and the marketing-scale display family. Listed here so the hero can warm them
// before the first auto-advance (the @font-face rules ship in the docsite's
// Google Fonts <link>, but the browser only fetches a family's woff2 once a
// glyph using it first paints — i.e. when the reel swaps to that slide, which
// is the visible FOUT first-time visitors hit). System/fallback stacks
// (-apple-system, Georgia, …) are intentionally omitted: they need no fetch.
//
// Keep in sync with the typography.{body,heading} families + display overrides
// in each theme package (packages/themes/<name>/src/<name>Theme.ts).
const REEL_FONT_FAMILIES: Record<string, ReadonlyArray<string>> = {
  // Astryx (docsite brand)
  [ASTRYX]: ['Figtree'],
  // Matcha (DM Sans body + Playwrite US Trad heading)
  '@astryxdesign/theme-matcha': ['DM Sans', 'Playwrite US Trad'],
  // Butter (Outfit body/heading + Sarina display)
  '@astryxdesign/theme-butter': ['Outfit', 'Sarina'],
  // Gothic (Fustat body/heading + Manufacturing Consent display)
  '@astryxdesign/theme-gothic': ['Fustat', 'Manufacturing Consent'],
  // Y2K (Poppins body/heading + Crimson Text display)
  '@astryxdesign/theme-y2k': ['Poppins', 'Crimson Text'],
};

/**
 * `document.fonts.load()` specifiers for a theme's custom families. A short
 * representative string is enough to pull the right woff2 — the API loads the
 * whole face that would render those glyphs. We warm a normal and a bold-ish
 * weight since the cards mix body and heading weights.
 */
function fontSpecifiers(themeName: string): string[] {
  return (REEL_FONT_FAMILIES[themeName] ?? []).flatMap(family => [
    `400 1rem "${family}"`,
    `600 1rem "${family}"`,
  ]);
}

/** The specifiers for every theme of the reel, in slide order. */
export const REEL_FONT_SPECIFIERS: ReadonlyArray<string> =
  REEL_THEMES.flatMap(fontSpecifiers);

// Ordered slides from REEL_THEMES; unresolved (uninstalled) themes are skipped.
export const HERO_THEME_SLIDES: ReadonlyArray<HeroThemeSlide> = REEL_THEMES.map(
  name => {
    const theme = themeFor(name);
    return theme
      ? {
          name,
          label: labelFor(name),
          theme,
          content: CONTENT_BY_THEME[name] ?? fallbackContent(name),
          aurora: AURORA_BY_THEME[name] ?? DEFAULT_AURORA,
          wordmarkColor: wordmarkColorFor(name),
          isDark: DARK_THEMES.has(name),
          mode: DARK_THEMES.has(name) ? 'dark' : 'light',
        }
      : null;
  },
).filter((s): s is HeroThemeSlide => s !== null);

// The photos are square and cover their boxes, so the longer side of a box
// is the size that its photo needs. Each value is the largest box of the
// five slides in one layout of HeroFloatingCards. The layouts are the wide
// one, the collage from 768 px, and the narrow collage.
const PHOTO_SIZES =
  '(min-width: 1024px) 258px, (min-width: 768px) 315px, 216px';
// 1080 px gives a photo its own width, which is 700 to 960 px.
const PHOTO_WIDTHS = [256, 384, 640, 750, 1080];
// The thumbnail's frame is a spacing token, so its size comes from the
// theme of the slide: 38 to 65 px. A file this small loses detail at the
// exact size, so each width is well above the size that a screen needs.
const THUMB_SIZES = '66px';
const THUMB_WIDTHS = [128, 256];

/** What an `<img>` or a warm-up `Image` loads a reel photo from. */
export interface ReelImageSources {
  src: string;
  srcSet: string;
  sizes: string;
}

/** The sources of a product card or feature card photo. */
export function reelPhotoSources(image: string): ReelImageSources {
  return optimizedImageSources(image, PHOTO_WIDTHS, PHOTO_SIZES);
}

/** The sources of the buy card's thumbnail. */
export function reelThumbSources(image: string): ReelImageSources {
  return optimizedImageSources(image, THUMB_WIDTHS, THUMB_SIZES);
}

/**
 * The three photos of each slide, in slide order, with the sources that the
 * slide's cards give their <img>. A card loads a photo only when its slide
 * shows. On a wide screen the hero loads this list after the page loads, so
 * that the browser has each file before the reel advances to its slide.
 */
export const REEL_IMAGES: ReadonlyArray<ReelImageSources> =
  HERO_THEME_SLIDES.flatMap(slide => slideAssets(slide).images);

/** The fonts and the photos that one slide loads when it shows. */
export function slideAssets(slide: HeroThemeSlide): {
  fonts: ReadonlyArray<string>;
  images: ReadonlyArray<ReelImageSources>;
} {
  return {
    fonts: fontSpecifiers(slide.name),
    images: [
      reelPhotoSources(slide.content.product.image),
      reelPhotoSources(slide.content.feature.image),
      reelThumbSources(slide.content.mini.image),
    ],
  };
}
