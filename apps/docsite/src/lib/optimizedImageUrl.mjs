// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Builds the image optimizer URL for an image that `public` serves.
 * @input A root-relative image path and a width the optimizer allows.
 * @output The `/_next/image` URL: the same picture in the format the browser
 *   accepts, no wider than the width. The `src`, `srcSet` and `sizes` that
 *   let the browser select the width. Also whether a file's format goes to
 *   the optimizer.
 * @position Shared by the template image loader (scripts), the blog covers,
 *   and docsite pages that name their own photos, so all write one URL form
 *   and agree on the formats.
 */

// Must be in `images.qualities`.
export const OPTIMIZED_IMAGE_QUALITY = 75;

// The optimizer refuses a vector image. It returns an animated GIF as it is.
const OPTIMIZED_FORMAT = /\.(?:png|jpe?g)$/iu;

/**
 * Whether a caller that takes any image path sends the file to the
 * optimizer: a PNG or a JPEG. A caller that names its own photos does not
 * ask.
 *
 * @param {string} path a path with no query string or fragment
 * @returns {boolean}
 */
export function isOptimizedFormat(path) {
  return OPTIMIZED_FORMAT.test(path);
}

/**
 * The optimizer URL for an image. The optimizer does not enlarge, so an image
 * that is not wider than `width` keeps its pixel size.
 *
 * @param {string} path a root-relative path that `public` serves
 * @param {number} width a width in `images.deviceSizes` or `images.imageSizes`;
 *   the optimizer answers 400 for any other
 * @returns {string}
 */
export function optimizedImageUrl(path, width) {
  return `/_next/image?url=${encodeURIComponent(path)}&w=${width}&q=${OPTIMIZED_IMAGE_QUALITY}`;
}

/**
 * The `src`, `srcSet` and `sizes` of an `<img>`. The browser selects the
 * width for the slot and for the pixel density of the screen.
 *
 * @param {string} path a root-relative path that `public` serves
 * @param {readonly number[]} widths one width or more to offer, narrowest
 *   first; each one in `images.deviceSizes` or `images.imageSizes`
 * @param {string} sizes how wide the slot draws the image, as the `sizes`
 *   attribute states it
 * @returns {{src: string, srcSet: string, sizes: string}}
 */
export function optimizedImageSources(path, widths, sizes) {
  return {
    // For a browser that does not read `srcset`.
    src: optimizedImageUrl(path, widths[widths.length - 1]),
    srcSet: widths
      .map(width => `${optimizedImageUrl(path, width)} ${width}w`)
      .join(', '),
    sizes,
  };
}
