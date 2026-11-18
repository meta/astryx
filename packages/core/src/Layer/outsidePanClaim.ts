// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file outsidePanClaim.ts
 * @input An open auto layer; touches through Layer's outside-press watch
 * @output watchOutsidePans: claims for the layer a touch outside it that
 *   begins a pan the browser could take as a scroll, until stopped
 * @position Internal to Layer. usePopover passes it to useLayer
 *   (`watchesOutsidePans`), so a layer that never light-dismisses, such as
 *   Carousel's, bundles none of it
 */

import {claimPress} from './gestureCounter';
import {watchOutsidePress} from './outsidePress';
import {armClickGuard} from '../utils/clickGuard';
import {isShadowRoot} from '../utils/nodeType';

/** A layer the browser light-dismisses learns only of pans outside it. */
function reportsNoOutsidePress(): void {}

/**
 * Claims for `layer` each touch that starts outside it and begins a pan the
 * browser could take as a scroll. Such a touch is a gesture, not an outside
 * press, but a browser can still read it as a tap, for example when its main
 * thread is late. The claim puts the touch's release on the layer, for a
 * browser that light-dismisses at the release. At the release it cancels
 * the touch's lift, so the browser makes no tap, no click and no light
 * dismiss from it. Returns the function that stops watching.
 */
export function watchOutsidePans(layer: HTMLElement): () => void {
  const root = layer.getRootNode();
  return watchOutsidePress(
    layer,
    path => path.includes(layer),
    reportsNoOutsidePress,
    {
      pointerTypes: ['touch'],
      root: isShadowRoot(root) ? root : null,
      onPan: () =>
        claimPress(layer, {
          onRelease: () =>
            armClickGuard(layer.ownerDocument, {cancelsTouchEnd: true}),
        }),
    },
  );
}
