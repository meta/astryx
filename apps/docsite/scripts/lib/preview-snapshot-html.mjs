// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preview-snapshot-html.mjs
 * The last step on a preview snapshot's markup before the page shows it.
 *
 * @input  The HTML that react-dom/static renders for one preview.
 * @output The same HTML, with no image preload hints and lazy images.
 * @position Used by scripts/generate-preview-snapshots.mjs. It reads no
 *   files, so a test can import it without tracing the docsite's files.
 */

/**
 * The page renders the snapshot as plain markup, so it must not start image
 * downloads before the visitor scrolls to it. React adds a preload hint for
 * each eager image; this removes the hints and makes the images lazy.
 * @param {string} html
 * @returns {string}
 */
export function finishSnapshotHtml(html) {
  return html
    .replace(/<link rel="preload" as="image"[^>]*\/>/gu, '')
    .replace(
      /<img (?![^>]*\bloading=)/gu,
      '<img loading="lazy" decoding="async" ',
    );
}
