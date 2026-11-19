// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chooses the URL that a blog cover image loads from.
 * @input A post's `coverImage`.
 * @output The image optimizer URL for a root-relative PNG or JPEG path. Any
 *   other cover keeps its own URL.
 * @position Used by BlogCard, BlogFeatureCard, and BlogArticle. Page metadata
 *   keeps `coverImage` as written, because a crawler needs the file's own URL.
 */

import {isOptimizedFormat, optimizedImageUrl} from '../optimizedImageUrl.mjs';

// Each place that shows a cover has a layout where the cover is 659 to 975
// CSS pixels wide. On a 2x screen, this width gives each CSS pixel 1.97 image
// pixels or more. One width also lets a card and its article share one
// download.
export const BLOG_COVER_WIDTH = 1920;

// The optimizer refuses a URL on another host, and a browser reads `/\` as
// `//`. The optimizer also refuses a query string, so a cover that has one
// loads as written.
const PUBLIC_FILE_PATH = /^\/(?![/\\])[^?#]*$/u;

/** The URL to load a cover from. */
export function blogCoverUrl(coverImage: string): string {
  return PUBLIC_FILE_PATH.test(coverImage) && isOptimizedFormat(coverImage)
    ? optimizedImageUrl(coverImage, BLOG_COVER_WIDTH)
    : coverImage;
}
