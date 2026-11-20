// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file interactionModality.ts
 * @input Global pointerdown/keydown events, and focus and the window's blur
 *   through the input stream
 * @output useInteractionModalityTracking, useInteractionModalityTrackingFor,
 *   and getInteractionModality, which reads how the user last interacted in a
 *   document, and isTextEntrySincePointer, which reads whether every key
 *   since the last pointer press typed into a text-entry field
 * @position Internal document-wide singleton; used where `:focus-visible`
 *   alone is too broad
 */

// `:focus-visible` stays the condition that draws a focus ring. But it also
// matches a text field that a pointer focused, so a clicked field shows where
// typing goes. A ring for keyboard focus only needs to know which device
// moved focus. Use this as a gate beside `:focus-visible`, never in its
// place.
//
// The store lives on `document`, so duplicate Astryx bundles share one state
// and one listener pair. The page's listeners stay for the document lifetime,
// so input between consumers is not lost. A second document (a same-origin
// iframe, a Document Picture-in-Picture window) gets its own store while a
// consumer there is mounted. Importing this module has no DOM side effects,
// and server rendering keeps the keyboard-safe default.

import {
  useCallback,
  useEffect,
  useRef,
  type RefCallback,
  type RefObject,
} from 'react';
import {isTextEntryControl} from '../keyboard/keyboardHeight';
import {subscribeInput} from './inputStream';

export type InteractionModality = 'keyboard' | 'pointer';

type InteractionModalityStore = {
  modality: InteractionModality;
  /**
   * Whether every key since the last pointer press typed into a text-entry
   * field. Undefined in a store that an older bundle made.
   */
  isTextEntrySincePointer?: boolean;
  isListening: boolean;
  /** Mounted consumers holding a second document's listeners. */
  consumers?: number;
  onPointerDown: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  /**
   * Where focus went when it left this document's own elements: into a child
   * frame, or out of the window. Undefined in a store that an older bundle
   * made.
   */
  focusAway?: 'frame' | 'window' | null;
  /** The element that had focus when it left the window. */
  focusLeftFrom?: Element | null;
  onFocusIn?: (event: FocusEvent) => void;
  onWindowBlur?: (event: FocusEvent) => void;
  /** Whether the window's blur is heard: from the first pointer press on. */
  isHearingWindow?: boolean;
  /** Ends the input-stream subscription for focus that comes in. */
  stopFocusIn?: (() => void) | null;
  /** Ends the input-stream subscription for the window's blur. */
  stopWindowBlur?: (() => void) | null;
};

// Core's private ring switch. The shared rings read it as
// `var(--_focus-ring, 1)`.
const FOCUS_RING_PROPERTY = '--_focus-ring';

/**
 * Turn the shared focus rings off after a pointer press, and back on (by
 * dropping the override) when a key makes the modality keyboard again.
 */
function setFocusRings(targetDocument: Document, isOn: boolean): void {
  const root = targetDocument.documentElement as HTMLElement | null;
  if (root?.style == null) {
    return;
  }
  if (isOn) {
    root.style.removeProperty(FOCUS_RING_PROPERTY);
  } else {
    root.style.setProperty(FOCUS_RING_PROPERTY, '0');
  }
}

/**
 * Hear the window's blur while the rings are off: only then can focus that
 * leaves and comes back need them turned on again.
 */
function hearWindow(
  targetDocument: Document,
  store: InteractionModalityStore,
): void {
  if (
    !store.isListening ||
    store.isHearingWindow === true ||
    store.onWindowBlur == null
  ) {
    return;
  }
  const view = targetDocument.defaultView;
  if (view == null) {
    return;
  }
  store.isHearingWindow = true;
  store.stopWindowBlur = subscribeInput(view, 'blur', store.onWindowBlur);
}

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
    isTextEntrySincePointer: false,
    isListening: false,
    onPointerDown: () => {
      store.modality = 'pointer';
      store.isTextEntrySincePointer = true;
      store.focusAway = null;
      setFocusRings(targetDocument, false);
      hearWindow(targetDocument, store);
    },
    onKeyDown: event => {
      // A key with Meta, Alt or Control held is a shortcut, so it leaves the
      // modality alone. Tab with them still moves focus (Safari's Option+Tab),
      // so it shows the rings.
      if (event.metaKey || event.altKey || event.ctrlKey) {
        if (event.key === 'Tab') {
          setFocusRings(targetDocument, true);
        }
        return;
      }
      store.modality = 'keyboard';
      setFocusRings(targetDocument, true);
      if (!isTextEntryKey(event)) {
        store.isTextEntrySincePointer = false;
      }
    },
    // Focus that leaves for a child frame or the browser's own interface can
    // come back by keyboard, with no key event in this document. Coming back
    // with no pointer press here first shows the rings. The window giving
    // focus back to the element it left from is a restore, not a move.
    onWindowBlur: event => {
      if (event.target !== targetDocument.defaultView) {
        return;
      }
      const left = targetDocument.activeElement;
      store.focusAway =
        left != null && (left.tagName === 'IFRAME' || left.tagName === 'FRAME')
          ? 'frame'
          : 'window';
      store.focusLeftFrom = left;
    },
    onFocusIn: event => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.tagName === 'IFRAME' || target.tagName === 'FRAME')
      ) {
        store.focusAway = 'frame';
        return;
      }
      if (
        store.focusAway === 'frame' ||
        (store.focusAway === 'window' && target !== store.focusLeftFrom)
      ) {
        setFocusRings(targetDocument, true);
      }
      store.focusAway = null;
      store.focusLeftFrom = null;
    },
  };
  Object.defineProperty(singletonDocument, interactionModalityStoreKey, {
    value: store,
  });
  return store;
}

/**
 * An on-screen keyboard sends `Unidentified` or `Process` for many keys, and
 * `Enter` is its Go key. `Shift`, `CapsLock` and `Dead` only shape the next
 * character. Other named keys move focus or the caret, so they are keyboard
 * navigation.
 */
const TEXT_ENTRY_NAMED_KEYS = new Set([
  'Backspace',
  'CapsLock',
  'Dead',
  'Delete',
  'Enter',
  'Process',
  'Shift',
  'Unidentified',
]);

function isTextEntryKey(event: KeyboardEvent): boolean {
  const target =
    typeof event.composedPath === 'function'
      ? event.composedPath()[0]
      : event.target;
  if (!isTextEntryControl(target instanceof Element ? target : null)) {
    return false;
  }
  const key = typeof event.key === 'string' ? event.key : '';
  return (
    event.isComposing === true ||
    [...key].length === 1 ||
    TEXT_ENTRY_NAMED_KEYS.has(key)
  );
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
    // A store an older bundle made has no focus listener.
    const view = targetDocument.defaultView;
    if (store.onFocusIn != null && view != null) {
      store.stopFocusIn = subscribeInput(view, 'focusin', store.onFocusIn);
    }
    // Listening that resumes while a press has the rings off, as when a
    // consumer releases and holds again in one commit, hears the window too.
    const root = targetDocument.documentElement as HTMLElement | null;
    if (root?.style?.getPropertyValue(FOCUS_RING_PROPERTY) === '0') {
      hearWindow(targetDocument, store);
    }
  } else {
    targetDocument.removeEventListener('pointerdown', store.onPointerDown, {
      capture: true,
    });
    targetDocument.removeEventListener('keydown', store.onKeyDown, {
      capture: true,
    });
    store.stopFocusIn?.();
    store.stopFocusIn = null;
    if (store.isHearingWindow === true) {
      store.isHearingWindow = false;
      store.stopWindowBlur?.();
      store.stopWindowBlur = null;
    }
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
      // With no listener left, nothing could turn the rings back on, so drop
      // the override. A consumer that releases and holds again in one commit
      // keeps it.
      queueMicrotask(() => {
        if ((store.consumers ?? 0) === 0) {
          setFocusRings(targetDocument, true);
        }
      });
    }
  };
}

/** What a component gets from its one modality call. */
export type InteractionModalityTracking = {
  /**
   * Attach to the element the component renders (merge it with the element's
   * other refs with useMergedRefs, or call it with each node and `null` from
   * a callback ref of the component's own without returning its cleanup).
   * While the element lives in a second document (a same-origin iframe, a
   * Document Picture-in-Picture window), that document is tracked; detaching
   * or replacing the node releases it first.
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
    if (previous.release === release) {
      previous.release = null;
    }
  };
}

/**
 * Activate shared modality tracking when the first consumer mounts, and read
 * it for the element the component renders: attach the returned `ref` to that
 * element. The component makes this one call and adds no effect, listener or
 * tracker of its own for modality.
 */
export function useInteractionModalityTracking(): InteractionModalityTracking {
  // Syncs the document's interaction-modality tracking with this mount.
  useEffect(() => trackInteractionModality(), []);
  const nodeRef = useRef<Element | null>(null);
  const holdRef = useRef<{release: (() => void) | null}>({release: null});
  const ref = useCallback((node: Element | null) => {
    nodeRef.current = node;
    const release = holdNodeDocument(node, holdRef.current);
    // React's ref cleanup runs instead of a `null` call; it must also forget
    // the detached node, so the reader never answers from a document whose
    // listeners are gone.
    return () => {
      release?.();
      if (nodeRef.current === node) {
        nodeRef.current = null;
      }
    };
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
 * and the same Effect's cleanup releases it, so a detached, replaced or moved
 * node releases the old document before the new one is held. While
 * `isEnabled` is false, it holds no tracking.
 */
export function useInteractionModalityTrackingFor(
  elementRef: RefObject<Element | null>,
  isEnabled: boolean = true,
): () => InteractionModality {
  // Syncs the document's interaction-modality tracking with this mount.
  useEffect(
    () => (isEnabled ? trackInteractionModality() : undefined),
    [isEnabled],
  );
  // Syncs modality tracking in the element's second document, such as an iframe
  // or a Picture-in-Picture window.
  useEffect(() => {
    const ownerDocument = elementRef.current?.ownerDocument;
    if (
      !isEnabled ||
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

/**
 * Whether a pointer pressed last in `target`'s document, or the page's, and
 * every key since then typed into a text-entry field. Typing is text entry,
 * not keyboard navigation: an on-screen keyboard sends a key press for each
 * character. The modality still turns to `keyboard` for those keys.
 */
export function isTextEntrySincePointer(
  target?: Document | Node | null,
): boolean {
  const targetDocument =
    target == null
      ? typeof document === 'undefined'
        ? null
        : document
      : target.nodeType === 9
        ? (target as Document)
        : target.ownerDocument;
  if (targetDocument == null) {
    return false;
  }
  const store = getStore(targetDocument);
  return store.isTextEntrySincePointer ?? store.modality === 'pointer';
}

/** Test-only: restore the initial state between cases. */
export function __resetInteractionModalityForTest(): void {
  if (typeof document !== 'undefined') {
    const store = getStore(document);
    store.modality = 'keyboard';
    store.isTextEntrySincePointer = false;
  }
}

/** Test-only: activate the tracker without rendering a hook. */
export const __startInteractionModalityTrackingForTest =
  trackInteractionModality;

/** Test-only: track a second document without rendering a hook. */
export const __trackInteractionModalityInForTest = trackInteractionModalityIn;
