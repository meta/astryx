// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCommittedRef.ts
 * @input A value from the current render: a prop or a callback
 * @output Exports useCommittedRef, a read-only ref that holds the value of
 *   the last committed render
 * @position Internal hook; not in hooks/index.ts or the package entry. Event
 *   and gesture callbacks read the latest committed prop or callback through
 *   it. Render and useMemo read the value directly, never the ref.
 */

import {useInsertionEffect, useRef} from 'react';

/**
 * Returns a ref whose `current` is the value of the last committed render.
 * The ref object stays the same for the life of the component. Read
 * `current` only in event and gesture callbacks, never during render.
 */
export function useCommittedRef<T>(value: T): {readonly current: T} {
  const ref = useRef(value);
  // Stores values only. Refs to DOM nodes are not attached yet when this runs.
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
