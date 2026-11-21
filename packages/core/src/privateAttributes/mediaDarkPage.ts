// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/mediaDarkPage.ts
 * @input The media side a surface takes on a dark page, when it differs from
 *   the side it takes on a light page.
 * @output The attribute a surface's MediaTheme writes for it, and the selector
 *   text the theme engine scopes that side's on-media rules to.
 * @position Owner module of the private dark-page media attribute.
 *   theme/MediaDarkPage.tsx gives it to MediaTheme, which writes it (Toast
 *   provides it until it measures its card); the theme engine (theme/) reads
 *   it. No package entry exports it.
 */

const MEDIA_DARK_PAGE = 'data-astryx-media-dark-page';

/** The attribute for a surface that takes `side` on a dark page. */
export function mediaDarkPageAttribute(
  side: 'dark' | 'light',
): Record<string, string> {
  return {[MEDIA_DARK_PAGE]: side};
}

/** Matches a surface that takes `side` on a dark page. */
export function mediaDarkPageIs(side: 'dark' | 'light'): string {
  return `[${MEDIA_DARK_PAGE}="${side}"]`;
}
