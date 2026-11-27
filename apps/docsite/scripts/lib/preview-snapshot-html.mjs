// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preview-snapshot-html.mjs
 * The last step on a preview snapshot's markup before the page shows it.
 *
 * @input  The HTML that react-dom/static renders for one preview.
 * @output The same HTML, with no image preload hints and low-priority images.
 *   An image with sources for its slot gets them.
 * @position Used by scripts/generate-landing-template-previews.mjs. It reads no
 *   files, so a test can import it without tracing the docsite's files.
 */

/**
 * The preview photos must not compete with the top of the page, and they must
 * be in place when the visitor scrolls to the card. A lazy image starts only
 * near the viewport, so the visitor sees it arrive. React adds a preload hint
 * for each image; this removes the hints and gives each image low fetch
 * priority, so the browser loads it after the page's own resources.
 *
 * A snapshot is laid out at full size and scaled down, and its template gives
 * an image one URL. `imageSources` gives an image the `sizes` and `srcset`
 * for the size that the page draws it at.
 * @param {string} html
 * @param {(src: string) => {src: string, srcSet: string, sizes: string} | null} [imageSources]
 *   the sources of an image by its `src`, or null to keep the image as it is
 * @returns {string}
 */
export function finishSnapshotHtml(html, imageSources = () => null) {
  return html
    .replace(/<link rel="preload" as="image"[^>]*\/>/gu, '')
    .replace(
      /<img (?![^>]*\bfetchpriority=)/gu,
      '<img fetchpriority="low" decoding="async" ',
    )
    .replace(/<img ((?:[^>]*?\s)?)src="([^"]*)"/gu, (tag, attributes, src) => {
      const sources = imageSources(src.replaceAll('&amp;', '&'));
      return sources == null
        ? tag
        : `<img ${attributes}sizes="${attribute(sources.sizes)}" srcset="${attribute(sources.srcSet)}" src="${attribute(sources.src)}"`;
    });
}

/** @param {string} value */
function attribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
