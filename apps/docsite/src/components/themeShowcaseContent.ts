// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Per-theme content for the /themes showcase (the theme-showcase template
 * rendered by ThemePackagePage).
 *
 * The template ships with a generic "Studio" store (minimalist watch, wireless
 * headphones, etc.) as its defaults. Some themes read better with bespoke
 * products that match their personality — e.g. Matcha shows a matcha café menu
 * instead of gadgets. This registry supplies those overrides; the template
 * falls back to its own neutral defaults for any theme not listed here.
 *
 * Keyed by theme slug (the `<slug>` in `@astryxdesign/theme-<slug>` / /themes?theme=<slug>).
 */

import type {
  ProductSpec,
  InventoryRow,
} from '../../../../packages/cli/assets/templates/pages/theme-showcase/page';

export interface ThemeShowcaseContent {
  images: Record<string, string>;
  products: ProductSpec[];
  inventory: InventoryRow[];
}

// Matcha café — matcha-drink photos.
const MATCHA_IMAGES: Record<string, string> = {
  watch: '/images/matcha/preview-watch.png',
  headphones: '/images/matcha/preview-headphones.png',
  backpack: '/images/matcha/preview-backpack.png',
  wallet: '/images/matcha/preview-wallet.png',
  tumbler: '/images/matcha/preview-tumbler.png',
  throw_: '/images/matcha/preview-throw.png',
};

const MATCHA_CONTENT: ThemeShowcaseContent = {
  images: MATCHA_IMAGES,
  products: [
    {
      name: 'Matcha',
      description: 'Stone-ground ceremonial matcha over cold milk.',
      badge: 'Classic',
      badgeVariant: 'green',
    },
    {
      name: 'Strawberry Matcha',
      description: 'Fresh strawberry purée layered with bright matcha.',
      badge: 'Seasonal',
      badgeVariant: 'orange',
    },
    {
      name: 'Ube Matcha',
      description: 'Creamy ube and matcha for a sweet, earthy swirl.',
      badge: 'New',
      badgeVariant: 'blue',
    },
  ],
  inventory: [
    {
      id: 'a',
      name: 'Matcha',
      meta: 'Ceremonial grade, oat or whole',
      available: 64,
      location: 'Bar 1',
      tags: [{label: 'Classic', variant: 'green'}],
      imageKey: 'watch',
      thumbnailFallback: 'M',
      selected: false,
    },
    {
      id: 'b',
      name: 'Strawberry Matcha',
      meta: 'Real fruit purée, no syrup',
      available: 38,
      location: 'Bar 2',
      tags: [{label: 'Seasonal', variant: 'orange'}],
      imageKey: 'headphones',
      thumbnailFallback: 'S',
      selected: true,
    },
    {
      id: 'c',
      name: 'Ube Matcha',
      meta: 'Ube cream, double shot',
      available: 51,
      location: 'Bar 2',
      tags: [{label: 'New', variant: 'blue'}],
      imageKey: 'backpack',
      thumbnailFallback: 'U',
      selected: false,
    },
    {
      id: 'd',
      name: 'Vanilla Matcha',
      meta: 'Madagascar vanilla bean',
      available: 12,
      location: 'Bar 3',
      tags: [{label: 'Smooth', variant: 'yellow'}],
      imageKey: 'wallet',
      thumbnailFallback: 'V',
      selected: true,
    },
    {
      id: 'e',
      name: 'Hazelnut Matcha',
      meta: 'Toasted hazelnut, whipped top',
      available: 27,
      location: 'Bar 3',
      tags: [{label: 'Rich', variant: 'green'}],
      imageKey: 'tumbler',
      thumbnailFallback: 'H',
      selected: false,
    },
    {
      id: 'f',
      name: 'Matcha Mocha',
      meta: 'Dark chocolate, single origin',
      available: 19,
      location: 'Bar 4',
      tags: [{label: 'Bold', variant: 'orange'}],
      imageKey: 'throw_',
      thumbnailFallback: 'M',
      selected: true,
    },
  ],
};

// Butter bakery — butter/breakfast photos. Only five Butter assets exist, so
// the croissant is reused for the sixth slot.
const BUTTER_IMAGES: Record<string, string> = {
  watch: '/images/butter/preview-watch.png',
  headphones: '/images/butter/preview-headphones.png',
  backpack: '/images/butter/preview-backpack.png',
  wallet: '/images/butter/preview-wallet.png',
  tumbler: '/images/butter/preview-tumbler.png',
  throw_: '/images/butter/preview-throw.png',
};

const BUTTER_CONTENT: ThemeShowcaseContent = {
  images: BUTTER_IMAGES,
  products: [
    {
      name: 'Butter Croissant',
      description: 'Flaky, laminated layers baked golden each morning.',
      badge: 'Fresh',
      badgeVariant: 'yellow',
    },
    {
      name: 'Pancakes',
      description: 'Stacked tall with a melting pat of butter.',
      badge: 'Popular',
      badgeVariant: 'orange',
    },
    {
      name: 'Belgian Waffle',
      description: 'Deep pockets made for syrup and butter.',
      badge: 'New',
      badgeVariant: 'green',
    },
  ],
  inventory: [
    {
      id: 'a',
      name: 'Butter Croissant',
      meta: 'All-butter, 27 layers',
      available: 64,
      location: 'Case 1',
      tags: [{label: 'Fresh', variant: 'yellow'}],
      imageKey: 'watch',
      thumbnailFallback: 'C',
      selected: false,
    },
    {
      id: 'b',
      name: 'Pancakes',
      meta: 'Stack of three',
      available: 38,
      location: 'Griddle',
      tags: [{label: 'Popular', variant: 'orange'}],
      imageKey: 'headphones',
      thumbnailFallback: 'P',
      selected: true,
    },
    {
      id: 'c',
      name: 'Belgian Waffle',
      meta: 'Liège style, pearl sugar',
      available: 51,
      location: 'Griddle',
      tags: [{label: 'New', variant: 'green'}],
      imageKey: 'backpack',
      thumbnailFallback: 'W',
      selected: false,
    },
    {
      id: 'd',
      name: 'Buttered Toast',
      meta: 'Sourdough, thick cut',
      available: 12,
      location: 'Case 2',
      tags: [{label: 'Classic', variant: 'yellow'}],
      imageKey: 'wallet',
      thumbnailFallback: 'T',
      selected: true,
    },
    {
      id: 'e',
      name: 'Cultured Butter',
      meta: 'European style, salted',
      available: 27,
      location: 'Cooler',
      tags: [{label: 'Staple', variant: 'orange'}],
      imageKey: 'tumbler',
      thumbnailFallback: 'B',
      selected: false,
    },
    {
      id: 'f',
      name: 'Almond Croissant',
      meta: 'Frangipane filled',
      available: 19,
      location: 'Case 1',
      tags: [{label: 'Limited', variant: 'green'}],
      imageKey: 'throw_',
      thumbnailFallback: 'A',
      selected: true,
    },
  ],
};

// Stone homeware — stoneware photos on stone plinths.
const STONE_IMAGES: Record<string, string> = {
  watch: '/images/stone/preview-watch.png',
  headphones: '/images/stone/preview-headphones.png',
  backpack: '/images/stone/preview-backpack.png',
  wallet: '/images/stone/preview-wallet.png',
  tumbler: '/images/stone/preview-tumbler.png',
  throw_: '/images/stone/preview-throw.png',
};

const STONE_CONTENT: ThemeShowcaseContent = {
  images: STONE_IMAGES,
  products: [
    {
      name: 'Speckled Bowl',
      description: 'Hand-thrown stoneware with a raw clay foot.',
      badge: 'New',
      badgeVariant: 'blue',
    },
    {
      name: 'Ceramic Cup',
      description: 'Everyday cup and saucer with a tactile finish.',
      badge: 'Popular',
      badgeVariant: 'green',
    },
    {
      name: 'Stoneware Plate',
      description: 'Reactive matte glaze in a soft olive tone.',
      badge: 'Limited',
      badgeVariant: 'yellow',
    },
  ],
  inventory: [
    {
      id: 'a',
      name: 'Speckled Bowl',
      meta: 'Stoneware, 16cm',
      available: 64,
      location: 'Shelf 1',
      tags: [{label: 'New', variant: 'blue'}],
      imageKey: 'watch',
      thumbnailFallback: 'B',
      selected: false,
    },
    {
      id: 'b',
      name: 'Ceramic Cup',
      meta: 'Cup + saucer, 8oz',
      available: 38,
      location: 'Shelf 2',
      tags: [{label: 'Popular', variant: 'green'}],
      imageKey: 'headphones',
      thumbnailFallback: 'C',
      selected: true,
    },
    {
      id: 'c',
      name: 'Stoneware Plate',
      meta: 'Reactive glaze, 22cm',
      available: 51,
      location: 'Shelf 1',
      tags: [{label: 'Limited', variant: 'yellow'}],
      imageKey: 'backpack',
      thumbnailFallback: 'P',
      selected: false,
    },
    {
      id: 'd',
      name: 'Serving Bowl',
      meta: 'Two-tone, 24cm',
      available: 15,
      location: 'Shelf 3',
      tags: [{label: 'Tableware', variant: 'orange'}],
      imageKey: 'wallet',
      thumbnailFallback: 'S',
      selected: true,
    },
    {
      id: 'e',
      name: 'Stoneware Teapot',
      meta: 'Matte clay, 700ml',
      available: 27,
      location: 'Shelf 2',
      tags: [{label: 'Kitchen', variant: 'green'}],
      imageKey: 'tumbler',
      thumbnailFallback: 'T',
      selected: false,
    },
    {
      id: 'f',
      name: 'Bud Vase',
      meta: 'Olive glaze, 18cm',
      available: 19,
      location: 'Shelf 1',
      tags: [{label: 'Small batch', variant: 'orange'}],
      imageKey: 'throw_',
      thumbnailFallback: 'V',
      selected: true,
    },
  ],
};

// Y2K trinkets — iridescent/holo objects.
const Y2K_IMAGES: Record<string, string> = {
  watch: '/images/y2k/preview-watch.png',
  headphones: '/images/y2k/preview-headphones.png',
  backpack: '/images/y2k/preview-backpack.png',
  wallet: '/images/y2k/preview-wallet.png',
  tumbler: '/images/y2k/preview-tumbler.png',
  throw_: '/images/y2k/preview-throw.png',
};

const Y2K_CONTENT: ThemeShowcaseContent = {
  images: Y2K_IMAGES,
  products: [
    {
      name: 'Phone',
      description: 'Iridescent clamshell with a rainbow screen.',
      badge: 'Retro',
      badgeVariant: 'blue',
    },
    {
      name: 'Glow Star Set',
      description: 'Glow-in-the-dark stars, pack of three.',
      badge: 'Popular',
      badgeVariant: 'green',
    },
    {
      name: 'Butterfly',
      description: 'Sparkly stick-on in pastel chrome.',
      badge: 'New',
      badgeVariant: 'purple',
    },
  ],
  inventory: [
    {
      id: 'a',
      name: 'Phone',
      meta: 'Iridescent, rainbow LCD',
      available: 64,
      location: 'Bin 1',
      tags: [{label: 'Retro', variant: 'blue'}],
      imageKey: 'watch',
      thumbnailFallback: 'P',
      selected: false,
    },
    {
      id: 'b',
      name: 'Glow Star Set',
      meta: 'Glow-in-the-dark, pack of 3',
      available: 38,
      location: 'Bin 2',
      tags: [{label: 'Popular', variant: 'green'}],
      imageKey: 'headphones',
      thumbnailFallback: 'S',
      selected: true,
    },
    {
      id: 'c',
      name: 'Butterfly',
      meta: 'Stick-on, pastel chrome',
      available: 51,
      location: 'Bin 2',
      tags: [{label: 'New', variant: 'purple'}],
      imageKey: 'backpack',
      thumbnailFallback: 'B',
      selected: false,
    },
    {
      id: 'd',
      name: 'Puffy Heart Charm',
      meta: 'Squishy, holo finish',
      available: 12,
      location: 'Bin 3',
      tags: [{label: 'Classic', variant: 'pink'}],
      imageKey: 'wallet',
      thumbnailFallback: 'H',
      selected: true,
    },
    {
      id: 'e',
      name: 'Daisy Charm',
      meta: 'Holographic, clip-on',
      available: 27,
      location: 'Bin 3',
      tags: [{label: 'Cute', variant: 'pink'}],
      imageKey: 'tumbler',
      thumbnailFallback: 'D',
      selected: false,
    },
    {
      id: 'f',
      name: 'Inflatable Couch',
      meta: 'Transparent pink, 2-seater',
      available: 19,
      location: 'Bin 1',
      tags: [{label: 'Limited', variant: 'pink'}],
      imageKey: 'throw_',
      thumbnailFallback: 'C',
      selected: true,
    },
  ],
};

// Gothic botanicals — moody single-stem floral photos.
const GOTHIC_IMAGES: Record<string, string> = {
  watch: '/images/gothic/preview-watch.png',
  headphones: '/images/gothic/preview-headphones.png',
  backpack: '/images/gothic/preview-backpack.png',
  wallet: '/images/gothic/preview-wallet.png',
  tumbler: '/images/gothic/preview-tumbler.png',
  throw_: '/images/gothic/preview-throw.png',
};

const GOTHIC_CONTENT: ThemeShowcaseContent = {
  images: GOTHIC_IMAGES,
  products: [
    {
      name: 'Sea Holly',
      description: 'A single preserved thistle stem with a steely bloom.',
      badge: 'New',
      badgeVariant: 'blue',
    },
    {
      name: 'Garden Rose',
      description: 'One peach bloom, cut fresh each morning.',
      badge: 'Popular',
      badgeVariant: 'red',
    },
    {
      name: 'Ranunculus',
      description: 'Layered petals in a soft mauve.',
      badge: 'Limited',
      badgeVariant: 'purple',
    },
  ],
  inventory: [
    {
      id: 'a',
      name: 'Sea Holly',
      meta: 'Preserved, single stem',
      available: 64,
      location: 'Cooler 1',
      tags: [{label: 'New', variant: 'blue'}],
      imageKey: 'watch',
      thumbnailFallback: 'S',
      selected: false,
    },
    {
      id: 'b',
      name: 'Garden Rose',
      meta: 'Fresh cut, peach',
      available: 38,
      location: 'Cooler 2',
      tags: [{label: 'Popular', variant: 'red'}],
      imageKey: 'headphones',
      thumbnailFallback: 'R',
      selected: true,
    },
    {
      id: 'c',
      name: 'Ranunculus',
      meta: 'Fresh cut, mauve',
      available: 51,
      location: 'Cooler 2',
      tags: [{label: 'Limited', variant: 'purple'}],
      imageKey: 'backpack',
      thumbnailFallback: 'R',
      selected: false,
    },
    {
      id: 'd',
      name: 'Coral Poppy',
      meta: 'Fresh cut, single stem',
      available: 15,
      location: 'Cooler 3',
      tags: [{label: 'Seasonal', variant: 'orange'}],
      imageKey: 'wallet',
      thumbnailFallback: 'P',
      selected: true,
    },
    {
      id: 'e',
      name: 'Pink Tulip',
      meta: 'Fresh cut, single stem',
      available: 27,
      location: 'Cooler 2',
      tags: [{label: 'Spring', variant: 'pink'}],
      imageKey: 'tumbler',
      thumbnailFallback: 'T',
      selected: false,
    },
    {
      id: 'f',
      name: 'Dried Nigella Pods',
      meta: 'Preserved, branch',
      available: 19,
      location: 'Cooler 1',
      tags: [{label: 'Small batch', variant: 'green'}],
      imageKey: 'throw_',
      thumbnailFallback: 'N',
      selected: true,
    },
  ],
};

const CONTENT_BY_THEME: Record<string, ThemeShowcaseContent> = {
  matcha: MATCHA_CONTENT,
  butter: BUTTER_CONTENT,
  stone: STONE_CONTENT,
  y2k: Y2K_CONTENT,
  gothic: GOTHIC_CONTENT,
};

/**
 * Resolve bespoke showcase content for a theme slug, or `undefined` when the
 * theme has no override (the template then renders its neutral defaults).
 */
export function getThemeShowcaseContent(
  slug: string,
): ThemeShowcaseContent | undefined {
  return CONTENT_BY_THEME[slug];
}
