// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCommittedRef.ts
 * @input A value from the current render: a prop or a callback
 * @output Exports useCommittedRef and useCommittedRefInto
 * @position Internal hooks; not in hooks/index.ts or the package entry
 */

import {useInsertionEffect, useRef} from 'react';

/**
 * Returns a ref whose `current` is the value of the last committed render.
 * The ref object stays the same for the life of the component. Read
 * `current` only in event and gesture callbacks, never during render. A
 * value that selects a resource (what to subscribe to) belongs in the Effect's
 * dependencies, not in a committed ref.
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
