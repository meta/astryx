// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/layerPortalBoundary.stylex.ts
 * @input The editable root Lexical reconciles
 * @output rendererManagedRootProps, which marks that root
 * @position Owner module of the private layer-portal-boundary attribute in
 *   RichText: the only RichText file that writes its name. Core's Layer reads
 *   the mark through its own owner module of the same name. No package entry
 *   exports it.
 */

/** Spread on the editable root, whose DOM Lexical reconciles. */
export const rendererManagedRootProps: Readonly<
  Record<`data-${string}`, string>
> = {
  'data-astryx-layer-portal-boundary': 'external',
};
