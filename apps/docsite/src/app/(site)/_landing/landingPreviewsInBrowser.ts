// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The landing preview map as the browser bundle sees it: empty.
 * @input None.
 * @output LANDING_PREVIEWS: an empty map.
 * @position next.config.mjs puts this module in the browser bundle in place
 *   of src/generated/landingPreviews.ts. The preview markup then reaches the
 *   page once, as server HTML.
 */

export const LANDING_PREVIEWS: Readonly<Record<string, string>> = {};
