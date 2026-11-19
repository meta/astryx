// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerClickBoundary.ts
 * @input React pointer, mouse, touch and click events on a layer root
 * @output Exports layerClickBoundary, the props every layer content root
 *   spreads, including the layer-root mark; also stopInReactTree
 * @position Internal to Layer; used by useLayer's renderers and the Dialog,
 *   Drawer, Lightbox, MobileNav, BottomSheetPanel and ToastViewport roots.
 *   Not exported from the package.
 *
 * A press that starts inside a layer runs the handlers inside the layer and
 * the root's own, then stops propagating through the React tree, so no
 * bubble-phase handler on an ancestor of the layer's JSX position receives it.
 * Capture-phase handlers on those ancestors already ran. The stop is
 * React-only: it marks the synthetic event stopped and never calls the
 * native `stopPropagation()`, so document and window listeners (outside
 * presses, light dismiss, deferred clicks) still receive the press.
 */

import type {SyntheticEvent} from 'react';
import {layerRootProps} from '../privateAttributes/layerRoot.stylex';

/** The React event props that stop at a layer root. */
const BOUNDARY_EVENTS = [
  'onClick',
  'onAuxClick',
  'onDoubleClick',
  'onContextMenu',
  'onMouseDown',
  'onMouseUp',
  'onMouseMove',
  'onMouseOver',
  'onMouseOut',
  'onPointerDown',
  'onPointerUp',
  'onPointerMove',
  'onPointerOver',
  'onPointerOut',
  'onPointerCancel',
  'onGotPointerCapture',
  'onLostPointerCapture',
  'onTouchStart',
  'onTouchMove',
  'onTouchEnd',
  'onTouchCancel',
] as const;

type BoundaryEvent = (typeof BOUNDARY_EVENTS)[number];
type Handler = (event: SyntheticEvent) => void;

export type LayerClickBoundaryProps = Record<BoundaryEvent, Handler> &
  Readonly<Record<`data-${string}`, string>>;

const returnTrue = () => true;

/**
 * Stop a synthetic event at this element for the rest of the React tree only.
 * React's dispatch asks `isPropagationStopped()` before each further
 * listener; the native event is left alone.
 */
export function stopInReactTree(event: SyntheticEvent): void {
  event.isPropagationStopped = returnTrue;
}

/**
 * The boundary props for a layer content root. Pass the root's own props
 * (its caller's rest props and its own handlers): for each boundary event, a
 * handler found there runs first, then the event stops. Spread the result
 * after the root's other props.
 *
 * @param own - The root's props; only its boundary-event handlers are read.
 * @returns One handler per boundary event, to spread on the root element.
 */
export function layerClickBoundary(
  own: Readonly<Record<string, unknown>> = {},
): LayerClickBoundaryProps {
  const props: Partial<Record<BoundaryEvent, Handler>> = {};
  for (const name of BOUNDARY_EVENTS) {
    const handler = own[name];
    props[name] =
      typeof handler === 'function'
        ? event => {
            (handler as Handler)(event);
            stopInReactTree(event);
          }
        : stopInReactTree;
  }
  return {
    // Every boundary event is set by the loop above.
    ...(props as Record<BoundaryEvent, Handler>),
    // Marks the root, so code outside the layer can find where it starts.
    ...layerRootProps,
  };
}
