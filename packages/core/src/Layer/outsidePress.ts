// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file outsidePress.ts
 * @input Listens for pointerdown, pointerup and pointercancel on a document
 * @output Exports watchOutsidePress and useOutsidePress, which owns one watch
 *   for a component: start on show, stop on hide, stop on unmount; and the
 *   inside tests a text field's owner runs: isPressInsideOwnedLayer for a
 *   press, isFocusInsideOwnedLayer for a blur
 * @position Internal to Layer; the outside-press dismissal for a manual
 *   popover whose owner decides what counts as inside (a combobox's field
 *   and its list). Not exported from the package.
 *
 * A press closes the layer only when it starts and ends outside, as native
 * light dismiss does: a pointerdown outside is remembered, the pointerup that
 * follows closes the layer if it is outside too, and a pointercancel (the
 * browser took the gesture for a scroll or a pinch) forgets it. Inside is
 * judged on the event's composed path, so a field or list inside an open
 * shadow root, which the document sees as its shadow host, is still inside.
 */

import {useCallback, useEffect, useMemo, useRef} from 'react';

/**
 * Watch the owner's document for a press outside, until the returned function
 * is called. The caller stops it when its layer hides and when it unmounts.
 *
 * @param owner - The element that owns the layer (the field); its document is
 *   watched.
 * @param isInside - Whether a press with this composed path is inside.
 * @param onOutside - Called once for each press that starts and ends outside.
 * @returns Stops watching.
 */
export function watchOutsidePress(
  owner: Element,
  isInside: (path: ReadonlyArray<EventTarget>) => boolean,
  onOutside: () => void,
): () => void {
  const doc = owner.ownerDocument;
  let startedOutside = false;

  // Capture phase, so a press whose target stops propagation is still seen.
  const handleDown = (event: PointerEvent) => {
    startedOutside = !isInside(event.composedPath());
  };
  const handleUp = (event: PointerEvent) => {
    const wasOutside = startedOutside;
    startedOutside = false;
    if (wasOutside && !isInside(event.composedPath())) {
      onOutside();
    }
  };
  const handleCancel = () => {
    startedOutside = false;
  };

  doc.addEventListener('pointerdown', handleDown, true);
  doc.addEventListener('pointerup', handleUp, true);
  doc.addEventListener('pointercancel', handleCancel, true);
  return () => {
    doc.removeEventListener('pointerdown', handleDown, true);
    doc.removeEventListener('pointerup', handleUp, true);
    doc.removeEventListener('pointercancel', handleCancel, true);
  };
}

export interface OutsidePressWatch {
  /** Start watching, replacing any watch already running. */
  start: (
    owner: Element,
    isInside: (path: ReadonlyArray<EventTarget>) => boolean,
    onOutside: () => void,
  ) => void;
  /** Stop watching; does nothing when no watch is running. */
  stop: () => void;
}

/**
 * One outside-press watch for a component: it calls `start` when its layer
 * shows and `stop` when it hides, and the watch's document listeners (an
 * external system) are removed when the component unmounts with it running.
 * Both functions are stable.
 */
export function useOutsidePress(): OutsidePressWatch {
  const stopRef = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);
  const start = useCallback<OutsidePressWatch['start']>(
    (owner, isInside, onOutside) => {
      stopRef.current?.();
      stopRef.current = watchOutsidePress(owner, isInside, onOutside);
    },
    [],
  );
  useEffect(() => stop, [stop]);
  return useMemo(() => ({start, stop}), [start, stop]);
}

// Node, Element and ShadowRoot are checked by nodeType, not instanceof: a
// node from a same-origin iframe or a Picture-in-Picture window belongs to
// another realm, where instanceof against this window's classes is false.
function isNode(target: unknown): target is Node {
  return (
    typeof target === 'object' &&
    target !== null &&
    typeof (target as {nodeType?: unknown}).nodeType === 'number'
  );
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node;
}

/** Whether `node` is the layer with this id, or inside it across shadow roots. */
function isWithinLayer(node: Node, layerId: string): boolean {
  for (
    let current: Node | null = node;
    current != null;
    current =
      current.parentNode ?? (isShadowRoot(current) ? current.host : null)
  ) {
    if (isElement(current) && current.id === layerId) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a press with this composed path is on a text field or in the
 * field's own layer, which may be hosted outside the field.
 *
 * @param path - The press's composed path.
 * @param field - The field that owns the layer.
 * @param layerId - The layer element's id.
 */
export function isPressInsideOwnedLayer(
  path: ReadonlyArray<EventTarget>,
  field: Element,
  layerId: string,
): boolean {
  return path.some(
    target =>
      target === field ||
      (layerId !== '' &&
        isNode(target) &&
        isElement(target) &&
        target.id === layerId),
  );
}

/**
 * Whether focus moving to `next` stays with a text field's own layer: on the
 * field, or in the layer, which may be hosted outside the field or inside a
 * shadow root. Each owner decides what a blur that fails this means,
 * including when `next` is null.
 *
 * @param next - The blur's `relatedTarget`.
 * @param field - The field that owns the layer.
 * @param layerId - The layer element's id.
 */
export function isFocusInsideOwnedLayer(
  next: EventTarget | null,
  field: Element | null | undefined,
  layerId: string,
): boolean {
  return (
    isNode(next) &&
    (field?.contains(next) === true || isWithinLayer(next, layerId))
  );
}
