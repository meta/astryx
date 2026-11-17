// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/layerPortalBoundary.stylex.ts
 * @input An element whose DOM a renderer reconciles
 * @output rendererManagedRootProps, which marks such a root, and
 *   isRendererManagedRoot, which reads the mark
 * @position Owner module of the private layer-portal-boundary attribute in
 *   Core: the only Core file that writes its name. Layer's corrective portal
 *   resolver reads it. RichText writes the same mark from its own owner
 *   module. No package entry exports it.
 */

const LAYER_PORTAL_BOUNDARY = 'data-astryx-layer-portal-boundary';
const RENDERER_MANAGED = 'external';

/** Spread on the root of DOM a renderer reconciles. */
export const rendererManagedRootProps: Readonly<
  Record<`data-${string}`, string>
> = {
  [LAYER_PORTAL_BOUNDARY]: RENDERER_MANAGED,
};

/** Whether `element` is the root of DOM a renderer reconciles. */
export function isRendererManagedRoot(element: Element): boolean {
  return element.getAttribute(LAYER_PORTAL_BOUNDARY) === RENDERER_MANAGED;
}
