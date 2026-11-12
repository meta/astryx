// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loads the /themes showcase photos of every theme before a visitor picks one.
 * @input The bespoke showcase photos (themeShowcaseContent.ts), the browser's idle time, and the connection's data-saving hints.
 * @output Image requests that fill the browser's cache, and a function that cancels a warm-up that has not started.
 * @position Called by ThemePackagePage.tsx.
 *
 * A theme's photos are not requested until the theme renders, so a theme
 * switch shows empty product cards while they load. Through the optimizer the
 * 30 photos are about 0.7 MB in all, so the page can load them in idle time.
 */

import {THEME_SHOWCASE_PHOTOS} from './themeShowcaseContent';

interface ConnectionHints {
  saveData?: boolean;
  effectiveType?: string;
}

/** Whether the visitor's browser reports a data-saving mode or a 2G link. */
function shouldSaveData(): boolean {
  const {connection} = navigator as Navigator & {connection?: ConnectionHints};
  return (
    connection?.saveData === true ||
    /(?:^|-)2g$/u.test(connection?.effectiveType ?? '')
  );
}

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
  if (shouldSaveData()) {
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
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(load);
    return {images, cancel: () => window.cancelIdleCallback(handle)};
  }
  const handle = window.setTimeout(load, 200);
  return {images, cancel: () => window.clearTimeout(handle)};
}
