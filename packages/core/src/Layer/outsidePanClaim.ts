// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file outsidePanClaim.ts
 * @input An open layer; pointers through Layer's outside-press watch
 * @output watchOutsidePans: claims for an auto layer a touch outside it that
 *   begins a pan the browser could take as a scroll, until stopped.
 *   watchOutsidePresses: closes a manual popover for a press outside it
 * @position Internal to Layer. usePopover passes one of them to useLayer
 *   (`watchesOutside`), so a layer that never light-dismisses, such as
 *   Carousel's, bundles none of it
 */

import {claimPress} from './gestureCounter';
import {watchOutsidePress} from './outsidePress';
import {armClickGuard} from '../utils/clickGuard';
import {containsAlongFlatTree} from '../utils/flatTree';
import {isModalDialog, isShadowRoot} from '../utils/nodeType';

/** A layer the browser light-dismisses learns only of pans outside it. */
function reportsNoOutsidePress(): void {}

/** The shadow root `layer` renders in, if any. */
function shadowRootOf(layer: HTMLElement): Node | null {
  const root = layer.getRootNode();
  return isShadowRoot(root) ? root : null;
}

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
  return watchOutsidePress(
    layer,
    path => path.includes(layer),
    reportsNoOutsidePress,
    {
      pointerTypes: ['touch'],
      root: shadowRootOf(layer),
      onPan: () =>
        claimPress(layer, {
          onRelease: () =>
            armClickGuard(layer.ownerDocument, {cancelsTouchEnd: true}),
        }),
    },
  );
}

/**
 * Closes a manual popover for a press that starts and ends outside it. Its
 * trigger counts as inside, so the trigger's own toggle answers a press on
 * it. A press in a modal dialog that does not hold the layer belongs to that
 * dialog. A touch pan is not a press. Returns the function that stops
 * watching.
 *
 * @param layer - The open popover's layer element.
 * @param triggerRef - The popover's trigger, if it has one.
 * @param closesRef - Whether a press outside closes the popover now.
 * @param dismiss - Closes the popover for a press outside it.
 */
export function watchOutsidePresses(
  layer: HTMLElement,
  triggerRef: {readonly current: Element | null},
  closesRef: {readonly current: boolean},
  dismiss: () => void,
): () => void {
  return watchOutsidePress(
    layer,
    path =>
      !closesRef.current ||
      path.includes(layer) ||
      path.includes(triggerRef.current as Element) ||
      // Only a dialog element passes the check.
      path.some(
        target =>
          isModalDialog(target as Element) &&
          !containsAlongFlatTree(target as Element, layer),
      ),
    dismiss,
    {ignoresPans: true, root: shadowRootOf(layer)},
  );
}
