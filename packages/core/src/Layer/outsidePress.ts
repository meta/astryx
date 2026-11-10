// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file outsidePress.ts
 * @input Pointer presses on a document and on the shadow roots around a
 *   given root; with closesOnPan, pan moves from core's input stream
 * @output watchOutsidePress, and useOutsidePress, one watch per component.
 *   noteOutsideDismissal and outsideDismissalCount keep a per-document count
 *   of layers that an outside press or focus move closed. The inside tests
 *   are isPressInsideOwnedLayer and isFocusInsideOwnedLayer
 * @position Internal to Layer: the outside-press dismissal for a manual
 *   popover whose owner decides what counts as inside. Not exported.
 */

import {useCallback, useEffect, useMemo, useRef} from 'react';
import {UIKIT_PAN} from '../motion/uikit/gestures';
import {shadowHostOf, shadowRootsOutward} from '../utils/flatTree';
import {subscribeInput} from '../utils/inputStream';
import {isElement, isNode} from '../utils/nodeType';
import {sharedWeakMap} from '../utils/sharedRealm';

export interface OutsidePressOptions {
  /** The pointer types the watch follows; every type when omitted. */
  readonly pointerTypes?: ReadonlyArray<string>;
  /**
   * A press outside also closes the layer as it begins to pan, or when the
   * browser takes it. While one press outside is followed, other pointers are
   * ignored. A new primary pointer starts a new press.
   */
  readonly closesOnPan?: boolean;
  /**
   * The shadow root the layer renders in. The document sees a press inside a
   * closed root as a press on its host. So each root from this one out to the
   * document judges presses too, and an inner root's judgment stands.
   */
  readonly root?: Node | null;
}

// A modal host's backdrop press reads this. A press that closed a layer above
// the host is that layer's, so the host stays open.
const outsideDismissals = sharedWeakMap<Document, number>(
  'layer/outside-press/outside-dismissals',
  1,
);

/** Records that a layer in `doc` is closing because a press or focus went outside it. */
export function noteOutsideDismissal(doc: Document): void {
  outsideDismissals.set(doc, (outsideDismissals.get(doc) ?? 0) + 1);
}

/** How many layers an outside press has closed in `doc` so far. */
export function outsideDismissalCount(doc: Document): number {
  return outsideDismissals.get(doc) ?? 0;
}

/**
 * Watch the owner's document for a press outside, until the returned function
 * is called. The caller stops it when its layer hides and when it unmounts.
 *
 * @param owner - The element that owns the layer (the field); its document is
 *   watched.
 * @param isInside - Whether a press with this composed path is inside.
 * @param onOutside - Called once for each press that starts and ends outside,
 *   as native light dismiss does. With `closesOnPan`, also when that press
 *   pans or is cancelled.
 * @returns Stops watching.
 */
export function watchOutsidePress(
  owner: Element,
  isInside: (path: ReadonlyArray<EventTarget>) => boolean,
  onOutside: () => void,
  {pointerTypes, closesOnPan = false, root = null}: OutsidePressOptions = {},
): () => void {
  const doc = owner.ownerDocument;
  const shadows = root == null ? [] : shadowRootsOutward(root);
  let startedOutside = false;
  let panStart: {id: number; x: number; y: number} | null = null;
  const follows = (event: PointerEvent) =>
    pointerTypes == null || pointerTypes.includes(event.pointerType);
  const close = () => {
    startedOutside = false;
    panStart = null;
    noteOutsideDismissal(doc);
    onOutside();
  };

  // Capture phase, so a press whose target stops propagation is still seen.
  // An inner root's listener runs after the outer ones', so its judgment
  // stands.
  const handleDown = (event: PointerEvent) => {
    if (!follows(event)) {
      return;
    }
    if (
      closesOnPan &&
      panStart != null &&
      panStart.id !== event.pointerId &&
      !event.isPrimary
    ) {
      return;
    }
    startedOutside = !isInside(event.composedPath());
    if (closesOnPan) {
      panStart = startedOutside
        ? {id: event.pointerId, x: event.clientX, y: event.clientY}
        : null;
    }
  };
  const handleMove = (event: PointerEvent) => {
    if (
      panStart?.id === event.pointerId &&
      Math.max(
        Math.abs(event.clientX - panStart.x),
        Math.abs(event.clientY - panStart.y),
      ) >= UIKIT_PAN.hysteresis.value
    ) {
      close();
    }
  };
  const judgeUp = (event: PointerEvent) => {
    if (!follows(event) || (closesOnPan && panStart?.id !== event.pointerId)) {
      return;
    }
    const wasOutside = startedOutside;
    startedOutside = false;
    panStart = null;
    if (wasOutside && !isInside(event.composedPath())) {
      noteOutsideDismissal(doc);
      onOutside();
    }
  };
  // The document and each root see a lift inside a deeper closed root as a
  // lift on that root's host. So each of them judges, in the capture phase,
  // only a lift whose path does not hold the host below it. The innermost root
  // judges every lift it sees. A host judges a lift on itself, which no root
  // sees.
  let judgedLift: Event | null = null;
  const judgeUpUnlessBelow =
    (hostBelow: Element | null) => (event: PointerEvent) => {
      if (
        event === judgedLift ||
        (hostBelow != null && event.composedPath().includes(hostBelow))
      ) {
        return;
      }
      judgedLift = event;
      judgeUp(event);
    };
  const handleUp = judgeUpUnlessBelow(shadows.at(-1)?.host ?? null);
  const liftJudges = shadows.map(({root: shadow, host}, index) => ({
    shadow,
    host,
    handleRootUp: judgeUpUnlessBelow(
      index === 0 ? null : shadows[index - 1].host,
    ) as EventListener,
    handleHostUp: judgeUpUnlessBelow(null) as EventListener,
  }));
  const handleCancel = (event: PointerEvent) => {
    if (!follows(event)) {
      return;
    }
    if (closesOnPan && panStart?.id === event.pointerId) {
      close();
    } else if (!closesOnPan) {
      startedOutside = false;
    }
  };

  const judges: EventTarget[] = [
    doc,
    ...shadows.map(({root: shadow}) => shadow),
  ];
  for (const target of judges) {
    target.addEventListener('pointerdown', handleDown as EventListener, true);
  }
  const view = doc.defaultView;
  const stopMoves =
    closesOnPan && view != null
      ? subscribeInput(view, 'pointermove', handleMove)
      : null;
  doc.addEventListener('pointerup', handleUp, true);
  for (const {shadow, host, handleRootUp, handleHostUp} of liftJudges) {
    shadow.addEventListener('pointerup', handleRootUp, true);
    host.addEventListener('pointerup', handleHostUp);
  }
  doc.addEventListener('pointercancel', handleCancel, true);
  return () => {
    for (const target of judges) {
      target.removeEventListener(
        'pointerdown',
        handleDown as EventListener,
        true,
      );
    }
    stopMoves?.();
    doc.removeEventListener('pointerup', handleUp, true);
    for (const {shadow, host, handleRootUp, handleHostUp} of liftJudges) {
      shadow.removeEventListener('pointerup', handleRootUp, true);
      host.removeEventListener('pointerup', handleHostUp);
    }
    doc.removeEventListener('pointercancel', handleCancel, true);
  };
}

export interface OutsidePressWatch {
  /** Start watching, replacing any watch already running. */
  start: (
    owner: Element,
    isInside: (path: ReadonlyArray<EventTarget>) => boolean,
    onOutside: () => void,
    options?: OutsidePressOptions,
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
    (owner, isInside, onOutside, options) => {
      stopRef.current?.();
      stopRef.current = watchOutsidePress(owner, isInside, onOutside, options);
    },
    [],
  );
  // Stops the outside-press listeners on unmount.
  useEffect(() => stop, [stop]);
  return useMemo(() => ({start, stop}), [start, stop]);
}

/** Whether `node` is the layer with this id, or inside it across shadow roots. */
function isWithinLayer(node: Node, layerId: string): boolean {
  for (
    let current: Node | null = node;
    current != null;
    current = current.parentNode ?? shadowHostOf(current)
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
