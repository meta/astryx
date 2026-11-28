// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The photos of the Butter store that the homepage themes card shows.
 * @input The six WebP copies of the Butter product photos, 320 px wide.
 * @output Each photo's path, and the `src`, `srcSet` and `sizes` that its
 *   `<img>` in the card loads it from.
 * @position ThemesStorePreview gives the paths to the store template.
 *   scripts/generate-landing-template-previews.mjs gives the sources to the
 *   store's markup, because the template's own `<img>` has only a `src`.
 */

import {optimizedImageSources} from '../../../lib/optimizedImageUrl.mjs';

// 320 px WebP copies of the Butter product photos, which are 704 px PNGs.
export const THEMES_STORE_PHOTOS = {
  watch: '/landing/themes/butter-watch.webp',
  headphones: '/landing/themes/butter-headphones.webp',
  backpack: '/landing/themes/butter-backpack.webp',
  wallet: '/landing/themes/butter-wallet.webp',
  tumbler: '/landing/themes/butter-tumbler.webp',
  throw_: '/landing/themes/butter-throw.webp',
};

// The card draws the store at 20% to 36% of its size. A product photo is
// then at most 86 px wide from 1024 px. Below that it is 56 to 101 px wide
// and grows with the viewport. A browser cannot read that from the layout:
// the store is laid out at full size and scaled down as a whole.
// SYNC: the scale of the store in ThemesPreview.tsx.
const PHOTO_SIZES = '(min-width: 1024px) 86px, min(28vw - 33px, 101px)';
// 384 px gives a photo's own 320 px.
const PHOTO_WIDTHS = [128, 256, 384];

/**
 * The sources of one of the store's photos.
 *
 * @param {string} src the `src` of an `<img>` in the store's markup
 * @returns {{src: string, srcSet: string, sizes: string} | null} null for an
 *   image that is not one of the photos
 */
export function themesStorePhotoSources(src) {
  return Object.values(THEMES_STORE_PHOTOS).includes(src)
    ? optimizedImageSources(src, PHOTO_WIDTHS, PHOTO_SIZES)
    : null;
}
