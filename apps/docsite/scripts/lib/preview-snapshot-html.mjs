// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preview-snapshot-html.mjs
 * The last step on a preview snapshot's markup before the page shows it.
 *
 * @input  The HTML that react-dom/static renders for one preview.
 * @output The same HTML, with no image preload hints and low-priority images.
 * @position Used by scripts/generate-landing-template-previews.mjs. It reads no
 *   files, so a test can import it without tracing the docsite's files.
 */

/**
 * The preview photos must not compete with the top of the page, and they must
 * be in place when the visitor scrolls to the card. A lazy image starts only
 * near the viewport, so the visitor sees it arrive. React adds a preload hint
 * for each image; this removes the hints and gives each image low fetch
 * priority, so the browser loads it after the page's own resources.
 * @param {string} html
 * @returns {string}
 */
export function finishSnapshotHtml(html) {
  return html
    .replace(/<link rel="preload" as="image"[^>]*\/>/gu, '')
    .replace(
      /<img (?![^>]*\bfetchpriority=)/gu,
      '<img fetchpriority="low" decoding="async" ',
    );
}
