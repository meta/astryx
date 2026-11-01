// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file interactionModality.ts
 * @input Global pointerdown/keydown events
 * @output `useInteractionModalityTracking()` activates document-lifetime tracking;
 *   `getInteractionModality()` reads how the user last interacted;
 *   `trackInteractionModalityIn(doc)` and `getInteractionModality(doc)` do the
 *   same for a second document
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
 * listeners stay only while a consumer there is mounted. Importing this module
 * has no DOM side effects, and server rendering keeps the keyboard-safe
 * default.
 */

import {useEffect} from 'react';

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

function trackInteractionModality(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const targetDocument = document;
  const store = getStore(targetDocument);
  if (!store.isListening) {
    store.isListening = true;
    targetDocument.addEventListener('pointerdown', store.onPointerDown, {
      capture: true,
      passive: true,
    });
    targetDocument.addEventListener('keydown', store.onKeyDown, {
      capture: true,
      passive: true,
    });
  }

  // The document owns these listeners once activated. Removing them when the
  // last consumer unmounts would miss input before the next consumer mounts.
  return () => {};
}

/** Activate shared modality tracking when the first consumer mounts. */
export function useInteractionModalityTracking(): void {
  useEffect(() => trackInteractionModality(), []);
}

/**
 * Track a second document while a consumer there is mounted: a component an
 * app renders into a same-origin iframe or a Document Picture-in-Picture
 * window gets input there that never reaches the page's listeners. The first
 * consumer installs the document's listener pair and the last one's cleanup
 * removes it. Read the value with `getInteractionModality(doc)`. The page's
 * own document keeps its document-lifetime listeners.
 */
export function trackInteractionModalityIn(
  targetDocument: Document,
): () => void {
  if (typeof document !== 'undefined' && targetDocument === document) {
    return trackInteractionModality();
  }
  const store = getStore(targetDocument);
  store.consumers = (store.consumers ?? 0) + 1;
  if (store.consumers === 1) {
    store.isListening = true;
    targetDocument.addEventListener('pointerdown', store.onPointerDown, {
      capture: true,
      passive: true,
    });
    targetDocument.addEventListener('keydown', store.onKeyDown, {
      capture: true,
      passive: true,
    });
  }
  let isReleased = false;
  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    store.consumers = (store.consumers ?? 1) - 1;
    if (store.consumers === 0) {
      store.isListening = false;
      targetDocument.removeEventListener('pointerdown', store.onPointerDown, {
        capture: true,
      });
      targetDocument.removeEventListener('keydown', store.onKeyDown, {
        capture: true,
      });
    }
  };
}

/** How the user last interacted with the page, or with `targetDocument`. */
export function getInteractionModality(
  targetDocument?: Document,
): InteractionModality {
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
