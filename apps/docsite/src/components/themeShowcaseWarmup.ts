// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loads the /themes showcase photos of every theme before a visitor picks one.
 * @input The bespoke showcase photos (themeShowcaseContent.ts), the docsite's idle scheduler (lib/searchWarmup.ts), and the connection's data-saving hints (lib/prefersReducedData.ts).
 * @output Image requests that fill the browser's cache, and a function that cancels a warm-up that has not started.
 * @position Called by ThemePackagePage.tsx.
 *
 * A theme's photos are not requested until the theme renders, so a theme
 * switch shows empty product cards while they load. Through the optimizer the
 * 30 photos are about 0.6 MB in all, so the page can load them in idle time.
 */

import {prefersReducedData} from '../lib/prefersReducedData';
import {whenIdle} from '../lib/searchWarmup';
import {THEME_SHOWCASE_PHOTOS} from './themeShowcaseContent';

// A browser with no idle callback waits this long. The others wait for idle
// time, for at most twice this long.
const WARMUP_FALLBACK_MS = 1000;

/**
 * Requests every showcase photo once the page is idle. The returned images
 * must stay referenced while the page shows the showcase: a held image stays
 * in the browser's memory cache, so a theme switch needs no request.
 *
 * @returns the images being loaded, empty until the page is idle, and a
 *   function that cancels a warm-up that has not started
 */
export function warmThemeShowcasePhotos(): {
  images: HTMLImageElement[];
  cancel: () => void;
} {
  const images: HTMLImageElement[] = [];
  if (prefersReducedData()) {
    return {images, cancel: () => {}};
  }
  const load = () => {
    for (const src of THEME_SHOWCASE_PHOTOS) {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      images.push(image);
    }
  };
  return {images, cancel: whenIdle(load, WARMUP_FALLBACK_MS)};
}
