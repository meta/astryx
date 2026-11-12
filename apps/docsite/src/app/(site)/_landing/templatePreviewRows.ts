// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page templates the homepage templates card shows.
 * @input Template slugs from TEMPLATE_COMPONENTS.
 * @output TEMPLATE_PREVIEW_ROWS, grouped into the card's rows.
 * @position Read by TemplatesPreview (the tile layout) and by
 *   previewSnapshotSources (the snapshots the build renders).
 */

// A representative set of the real page templates (storefront, IDE, payment,
// login, settings, AI chat, product detail), grouped into rows. The middle row
// holds three so the centered (login) template sits in the middle.
export const TEMPLATE_PREVIEW_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  ['product-gallery', 'ide'],
  ['payment-form', 'login-split', 'settings-sidebar'],
  ['ai-chat-landing', 'product-detail'],
];
