// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file interactionModality.ts
 * @input Global pointerdown/keydown events
 * @output `useInteractionModalityTracking()` activates tracking for the page and
 *   returns a callback ref that tracks the element's second document, if any,
 *   with a reader for that element's own document;
 *   `useInteractionModalityTrackingFor(objectRef)` does the same for hooks
 *   that receive a consumer's object ref;
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
 * listeners stay only while a consumer there is mounted. A component attaches
 * the one hook's callback ref to its element and gets both; it never tracks a
 * document itself. Importing this module
 * has no DOM side effects, and server rendering keeps the keyboard-safe
 * default.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type RefCallback,
  type RefObject,
} from 'react';

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

/** What a component gets from its one modality call. */
export type InteractionModalityTracking = {
  /**
   * Attach to the element the component renders (merge it with the element's
   * other refs). While the element lives in a second document (a same-origin
   * iframe, a Document Picture-in-Picture window), that document is tracked;
   * detaching or replacing the node releases it first (INV6).
   */
  ref: RefCallback<Element>;
  /** How the user last interacted in the element's own document. */
  readModality: () => InteractionModality;
};

/**
 * A second-document hold for the node a ref callback receives: called with
 * each node and with `null`, it releases the previous document before it holds
 * a new one, and its returned cleanup releases it too, so React's ref cleanup
 * and `null` calls both work and a release never runs twice.
 */
function holdNodeDocument(
  node: Element | null,
  previous: {release: (() => void) | null},
): (() => void) | undefined {
  previous.release?.();
  previous.release = null;
  const ownerDocument = node?.ownerDocument;
  if (
    ownerDocument == null ||
    (typeof document !== 'undefined' && ownerDocument === document)
  ) {
    return undefined;
  }
  const release = trackInteractionModalityIn(ownerDocument);
  previous.release = release;
  return () => {
    release();
    if (previous.release === release) previous.release = null;
  };
}

/**
 * Activate shared modality tracking when the first consumer mounts, and read
 * it for the element the component renders: attach the returned `ref` to that
 * element. The component makes this one call and adds no effect, listener or
 * tracker of its own for modality.
 */
export function useInteractionModalityTracking(): InteractionModalityTracking {
  useEffect(() => trackInteractionModality(), []);
  const nodeRef = useRef<Element | null>(null);
  const holdRef = useRef<{release: (() => void) | null}>({release: null});
  const ref = useCallback((node: Element | null) => {
    nodeRef.current = node;
    return holdNodeDocument(node, holdRef.current);
  }, []);
  const readModality = useCallback(
    () => getInteractionModality(nodeRef.current),
    [],
  );
  return {ref, readModality};
}

/**
 * The same, for a hook that receives an object ref its consumer owns
 * (useMenuPress's `menuRef`, useTouchTrigger's trigger), so it cannot attach a
 * callback ref. After every commit it holds the ref's CURRENT owner document,
 * and the same Effect's cleanup releases it (INV3), so a detached, replaced or
 * moved node releases the old document before the new one is held (INV6).
 */
export function useInteractionModalityTrackingFor(
  elementRef: RefObject<Element | null>,
): () => InteractionModality {
  useEffect(() => trackInteractionModality(), []);
  useEffect(() => {
    const ownerDocument = elementRef.current?.ownerDocument;
    if (
      ownerDocument == null ||
      (typeof document !== 'undefined' && ownerDocument === document)
    ) {
      return undefined;
    }
    return trackInteractionModalityIn(ownerDocument);
  });
  return useCallback(
    () => getInteractionModality(elementRef.current),
    [elementRef],
  );
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
