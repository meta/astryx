// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchPointerStore.ts
 * @input Uses React useSyncExternalStore and window.matchMedia
 * @output useIsTouchPointer: whether the primary pointer is coarse
 * @position Internal store beside touchPresentation.ts, read by CheckboxListItem
 *
 * Every reader shares one subscription, so a repeated row adds no observer.
 * One `change` listener on the touch query is live while any reader is
 * mounted, and none remains after the last unmounts. A server render and the
 * hydrating render read the fine-pointer answer; the client's follows.
 */

import {useSyncExternalStore} from 'react';
import {TOUCH_QUERY} from './touchPresentation';

/** Every mounted reader's store-change callback. */
const readers = new Set<() => void>();
/** The touch query, held only while a reader is subscribed. */
let touchQuery: MediaQueryList | null = null;

function notifyReaders(): void {
  for (const reader of readers) {
    reader();
  }
}

function canQuery(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  );
}

function subscribe(reader: () => void): () => void {
  if (readers.size === 0 && canQuery()) {
    touchQuery = window.matchMedia(TOUCH_QUERY);
    touchQuery.addEventListener('change', notifyReaders);
  }
  readers.add(reader);
  return () => {
    readers.delete(reader);
    if (readers.size === 0 && touchQuery != null) {
      touchQuery.removeEventListener('change', notifyReaders);
      touchQuery = null;
    }
  };
}

function getSnapshot(): boolean {
  if (touchQuery != null) {
    return touchQuery.matches;
  }
  return canQuery() && window.matchMedia(TOUCH_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the primary pointer is coarse (a finger), from the one shared
 * subscription: false on the server and while hydrating.
 */
export function useIsTouchPointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
