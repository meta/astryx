// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file interactionModality.ts
 * @input Global pointerdown/keydown events
 * @output `useInteractionModalityTracking(ref?)` activates tracking for the page
 *   and, when the ref's element lives in a second document, for that document,
 *   and returns a reader for the element's own document;
 *   `getInteractionModality(target?)` reads how the user last interacted in a
 *   node's or document's own document (the page by default)
 * @position Internal document-wide singleton; used where `:focus-visible` alone
 *   is too broad
 *
 * `:focus-visible` is the right selector for a focus ring and should stay the
 * condition that draws one. It is not, on its own, "focused by keyboard":
 * per CSS Selectors 4 a pointer-focused element that supports text entry
 * matches it too, deliberately, so that a clicked text field still shows where
 * typing will go. Measured in Chromium — a bare `<input>` clicked with a mouse
 * matches `:focus-visible`.
 *
 * A component that wants a ring for keyboard focus ONLY therefore needs one bit
 * `:focus-visible` cannot give it: which device moved focus. This records that,
 * to be used as a gate ALONGSIDE `:focus-visible`, never as a replacement for
 * it — the browser's heuristic still decides everything else, including
 * `focus({focusVisible: true})`.
 *
 * The store lives on `document`, so duplicate Astryx bundles share one state
 * value and one listener pair. The first mounted consumer activates tracking;
 * the listeners then remain for the document lifetime so input during a gap
 * between consumers is not lost. A second document (a same-origin iframe, a
 * Document Picture-in-Picture window) gets its own store when a component
 * tracks it, since input there never reaches the page's listeners; its
 * listeners stay only while a consumer there is mounted. A component passes its
 * element's ref to the one hook and gets both; it never tracks a document
 * itself. Importing this module
 * has no DOM side effects, and server rendering keeps the keyboard-safe
 * default.
 */

import {useCallback, useEffect, useRef, type RefObject} from 'react';

export type InteractionModality = 'keyboard' | 'pointer';

type InteractionModalityStore = {
  modality: InteractionModality;
  isListening: boolean;
  /** Mounted consumers holding a second document's listeners. */
  consumers?: number;
  onPointerDown: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

const interactionModalityStoreKey = Symbol.for(
  '@astryxdesign/core/interaction-modality/v1',
);

function getStore(targetDocument: Document): InteractionModalityStore {
  const singletonDocument = targetDocument as Document & {
    [interactionModalityStoreKey]?: InteractionModalityStore;
  };
  const existingStore = singletonDocument[interactionModalityStoreKey];
  if (existingStore != null) {
    return existingStore;
  }

  // Default to keyboard: with no interaction yet, focus arrived
  // programmatically or from the browser restoring it, and showing a ring is
  // the safe error.
  const store: InteractionModalityStore = {
    modality: 'keyboard',
    isListening: false,
    onPointerDown: () => {
      store.modality = 'pointer';
    },
    onKeyDown: event => {
      // Modifier-only presses are not navigation — holding Shift before a
      // click must not turn that click into "keyboard".
      if (event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }
      store.modality = 'keyboard';
    },
  };
  Object.defineProperty(singletonDocument, interactionModalityStoreKey, {
    value: store,
  });
  return store;
}

/**
 * Start or stop hearing a document's input. The one place that listens, so a
 * change in how input is heard touches nothing else.
 */
function setListening(
  targetDocument: Document,
  store: InteractionModalityStore,
  isListening: boolean,
): void {
  if (store.isListening === isListening) {
    return;
  }
  store.isListening = isListening;
  if (isListening) {
    targetDocument.addEventListener('pointerdown', store.onPointerDown, {
      capture: true,
      passive: true,
    });
    targetDocument.addEventListener('keydown', store.onKeyDown, {
      capture: true,
      passive: true,
    });
  } else {
    targetDocument.removeEventListener('pointerdown', store.onPointerDown, {
      capture: true,
    });
    targetDocument.removeEventListener('keydown', store.onKeyDown, {
      capture: true,
    });
  }
}

function trackInteractionModality(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  setListening(document, getStore(document), true);

  // The document owns these listeners once activated. Removing them when the
  // last consumer unmounts would miss input before the next consumer mounts.
  return () => {};
}

/**
 * Track a second document while a consumer there is mounted: a component an
 * app renders into a same-origin iframe or a Document Picture-in-Picture
 * window gets input there that never reaches the page's listeners. The first
 * consumer installs the document's listener pair and the last one's cleanup
 * removes it. The page's own document keeps its document-lifetime listeners.
 */
function trackInteractionModalityIn(targetDocument: Document): () => void {
  if (typeof document !== 'undefined' && targetDocument === document) {
    return trackInteractionModality();
  }
  const store = getStore(targetDocument);
  store.consumers = (store.consumers ?? 0) + 1;
  setListening(targetDocument, store, true);
  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    store.consumers = (store.consumers ?? 1) - 1;
    if (store.consumers === 0) {
      setListening(targetDocument, store, false);
    }
  };
}

/**
 * Activate shared modality tracking when the first consumer mounts, and read
 * it. Pass the component's element ref: when the element renders into a
 * second document (a same-origin iframe, a Document Picture-in-Picture
 * window), that document is tracked too while the component is mounted, and
 * the returned reader answers for the element's own document rather than the
 * page's. The component makes this one call and needs no effect of its own.
 */
export function useInteractionModalityTracking(
  elementRef?: RefObject<Element | null>,
): () => InteractionModality {
  useEffect(() => trackInteractionModality(), []);

  // The one owner of this component's hold on a second document: attach,
  // `null` detachment and replacement all go through `hold`, which releases
  // the old document before it tracks the new one (INV6), and unmount
  // releases it (INV5).
  const holdRef = useRef<SecondDocumentHold | null>(null);
  holdRef.current ??= createSecondDocumentHold();
  const hold = holdRef.current;
  // Synchronizes the per-document listener registry with the element's
  // CURRENT owner document. It re-reads the ref after every commit, so a node
  // that is detached, replaced or moved to another document re-targets the
  // hold. `hold` is idempotent, so an unchanged commit and a StrictMode replay
  // are free. A callback ref cannot do this here: useMenuPress, useTouchTrigger
  // and useFocusReturnVisibility receive object refs their callers own.
  useEffect(() => {
    hold(elementRef?.current?.ownerDocument ?? null);
  });
  useEffect(() => () => hold(null), [hold]);

  return useCallback(
    () => getInteractionModality(elementRef?.current),
    [elementRef],
  );
}

/** Holds at most one second document, re-targeted idempotently. */
type SecondDocumentHold = (ownerDocument: Document | null) => void;

function createSecondDocumentHold(): SecondDocumentHold {
  let heldDocument: Document | null = null;
  let release: (() => void) | null = null;
  return ownerDocument => {
    const secondDocument =
      ownerDocument != null &&
      (typeof document === 'undefined' || ownerDocument !== document)
        ? ownerDocument
        : null;
    if (secondDocument === heldDocument) {
      return;
    }
    release?.();
    release =
      secondDocument == null
        ? null
        : trackInteractionModalityIn(secondDocument);
    heldDocument = secondDocument;
  };
}

/**
 * How the user last interacted with the page, or in `target`'s own document
 * (a document, or any node in one: an element in a same-origin iframe or a
 * Document Picture-in-Picture window answers for that document).
 */
export function getInteractionModality(
  target?: Document | Node | null,
): InteractionModality {
  const targetDocument =
    target == null
      ? null
      : target.nodeType === 9
        ? (target as Document)
        : target.ownerDocument;
  if (targetDocument != null) {
    return getStore(targetDocument).modality;
  }
  return typeof document === 'undefined'
    ? 'keyboard'
    : getStore(document).modality;
}

/** Test-only: restore the initial state between cases. */
export function __resetInteractionModalityForTest(): void {
  if (typeof document !== 'undefined') {
    getStore(document).modality = 'keyboard';
  }
}

/** Test-only: activate the tracker without rendering a hook. */
export const __startInteractionModalityTrackingForTest =
  trackInteractionModality;

/** Test-only: track a second document without rendering a hook. */
export const __trackInteractionModalityInForTest = trackInteractionModalityIn;
