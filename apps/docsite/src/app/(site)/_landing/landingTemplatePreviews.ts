// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lists the landing templates card tiles and their pre-generated preview images.
 * @input Reads the manifest that scripts/capture-landing-template-previews.mjs writes.
 * @output Exports the tile rows and the image file for each slug and color mode.
 * @position Shared by TemplatesPreview and the preview freshness test.
 */

import manifest from '../../../../public/landing/template-previews/manifest.json';

export type LandingPreviewMode = 'light' | 'dark';

type PreviewEntry = {source: string} & Record<LandingPreviewMode, string>;

/**
 * Tile rows of the landing card. The middle row holds three tiles so that the
 * centered (login) template sits in the middle.
 */
export const LANDING_TEMPLATE_ROWS: readonly (readonly string[])[] = [
  ['product-gallery', 'ide'],
  ['payment-form', 'login-split', 'settings-sidebar'],
  ['ai-chat-landing', 'product-detail'],
];

export const LANDING_PREVIEW_DIRECTORY = '/landing/template-previews';

export const LANDING_PREVIEW_SIZE: {width: number; height: number} = {
  width: manifest.width,
  height: manifest.height,
};

const previews: Record<string, PreviewEntry | undefined> = manifest.previews;

/** Returns the preview image URL, or `undefined` when no image was captured. */
export function landingPreviewSrc(
  slug: string,
  mode: LandingPreviewMode,
): string | undefined {
  const file = previews[slug]?.[mode];
  return file ? `${LANDING_PREVIEW_DIRECTORY}/${file}` : undefined;
}
