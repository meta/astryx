// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Builds the image optimizer URL for an image that `public` serves.
 * @input A root-relative image path and a width the optimizer allows.
 * @output The `/_next/image` URL: the same picture in the format the browser
 *   accepts, no wider than the width.
 * @position Shared by the template image loader (scripts) and by docsite
 *   pages that name their own photos, so both write one URL form.
 */

// Must be in `images.qualities`.
export const OPTIMIZED_IMAGE_QUALITY = 75;

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
