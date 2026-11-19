// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Builds the image optimizer URL for an image that `public` serves.
 * @input A root-relative image path and a width the optimizer allows.
 * @output The `/_next/image` URL: the same picture in the format the browser
 *   accepts, no wider than the width. Also whether a file's format goes to
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
 * Whether the docsite sends the file at a path to the optimizer: a PNG or a
 * JPEG.
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
