// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chooses the URL that a blog cover image loads from.
 * @input A post's `coverImage`.
 * @output The image optimizer URL for a root-relative PNG or JPEG path. Any
 *   other cover keeps its own URL. For a card whose slot width is known, the
 *   `srcSet` and `sizes` that let the browser select the width.
 * @position Used by BlogCard, BlogFeatureCard, and BlogArticle. Page metadata
 *   keeps `coverImage` as written, because a crawler needs the file's own URL.
 */

import {
  isOptimizedFormat,
  optimizedImageSources,
  optimizedImageUrl,
} from '../optimizedImageUrl.mjs';

// The article and the blog index have layouts where the cover is 659 to 975
// CSS pixels wide. On a 2x screen, this width gives each CSS pixel 1.97 image
// pixels or more. One width also lets a card of the index and its article
// share one download. A card that knows its slot width can load a narrower
// file (blogCoverSources), and then does not share it with the article.
export const BLOG_COVER_WIDTH = 1920;

// A cover can hold small text. A file at the exact size of its slot shows
// that text softer than a wider file that the browser scales down. These
// widths are far apart, so the file that the browser selects is wider than
// a slot needs on most screens.
const BLOG_COVER_WIDTHS = [640, 1080, BLOG_COVER_WIDTH];

// The optimizer refuses a URL on another host, and a browser reads `/\` as
// `//`. The optimizer also refuses a query string, so a cover that has one
// loads as written.
const PUBLIC_FILE_PATH = /^\/(?![/\\])[^?#]*$/u;

function isOptimizedCover(coverImage: string): boolean {
  return PUBLIC_FILE_PATH.test(coverImage) && isOptimizedFormat(coverImage);
}

/** The URL to load a cover from. */
export function blogCoverUrl(coverImage: string): string {
  return isOptimizedCover(coverImage)
    ? optimizedImageUrl(coverImage, BLOG_COVER_WIDTH)
    : coverImage;
}

/**
 * What a cover's `<img>` loads from, in a slot that draws the cover `sizes`
 * wide. The browser selects the width, so a small card does not load the
 * article's file. A cover that the optimizer does not convert has one URL.
 */
export function blogCoverSources(
  coverImage: string,
  sizes: string,
): {src: string; srcSet?: string; sizes?: string} {
  return isOptimizedCover(coverImage)
    ? optimizedImageSources(coverImage, BLOG_COVER_WIDTHS, sizes)
    : {src: coverImage};
}
