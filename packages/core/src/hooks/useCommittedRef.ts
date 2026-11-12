// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCommittedRef.ts
 * @input A value from the current render: a prop or a callback
 * @output Exports useCommittedRef, a read-only ref that holds the value of
 *   the last committed render, and useCommittedRefInto, which writes that
 *   value into a ref the component already holds
 * @position Internal hook; not in hooks/index.ts or the package entry. Event
 *   and gesture callbacks read the latest committed prop or callback through
 *   it. Render and useMemo read the value directly, never the ref.
 */

import {useInsertionEffect, useRef} from 'react';

/**
 * Returns a ref whose `current` is the value of the last committed render.
 * The ref object stays the same for the life of the component. Read
 * `current` only in event and gesture callbacks, never during render.
 *
 * In an Effect cleanup, read `current` through a function that the Effect
 * body declares. A direct read in the cleanup trips
 * `@eslint-react/exhaustive-deps`.
 *
 * ```
 * const getTarget = () => committed.current;
 * subscribe(getTarget());
 * return () => unsubscribe(getTarget());
 * ```
 */
export function useCommittedRef<T>(value: T): {readonly current: T} {
  const ref = useRef(value);
  useCommittedRefInto(ref, value);
  return ref;
}

/**
 * Writes the value of each committed render into `ref`. Use this shape when
 * callbacks that read the ref come before the value in the component. Create
 * the ref with `useRef` first, then call this hook after the value exists.
 * In all other cases, use `useCommittedRef`. The read rules are the same.
 */
export function useCommittedRefInto<T>(ref: {current: T}, value: T): void {
  // Stores values only. Refs to DOM nodes are not attached yet when this runs.
  useInsertionEffect(() => {
    // eslint-disable-next-line react-compiler/react-compiler -- the caller hands over its own ref so that this hook writes it
    ref.current = value;
  });
}
