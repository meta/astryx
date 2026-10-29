// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnimatedLayout.ts
 * @input React (useMemo), motion/animatedLayout.ts
 * @output Exports `useAnimatedLayout` and the opaque `AnimatedLayout` handle
 *   type
 * @position Public hook (`spec:AST-105`) over the one size-change module
 *   (`architecture:react-component-runtime` INV12)
 *
 * SYNC: When modified, update /packages/core/src/motion/animatedLayout.ts
 */

import {useMemo, type RefObject} from 'react';
import {
  createAnimatedLayout,
  type AnimatedLayout,
} from '../motion/animatedLayout';

export type {AnimatedLayout} from '../motion/animatedLayout';

export interface UseAnimatedLayoutOptions {
  /** The container whose content glides: a scroll container or a panel. */
  containerRef: RefObject<HTMLElement | null>;
}

/**
 * Returns a handle to pass to a component whose size changes, such as
 * TreeList or Collapsible. When that component changes size, it and the
 * content after it inside `containerRef` animate together on one shared
 * motion role. Fixed and stuck sticky elements stay put, the glide never
 * scrolls the area, and Reduce Motion is respected.
 *
 * `containerRef` names the area: an app passes the ref it already gives its
 * scroll container or panel (a ScrollableArea's ref reaches its native scroll
 * viewport). The handle has no public members (`spec:AST-105` FR1).
 *
 * @example
 * ```
 * const containerRef = useRef<HTMLDivElement>(null);
 * const animatedLayout = useAnimatedLayout({containerRef});
 * return (
 *   <div ref={containerRef}>
 *     <TreeList items={items} animatedLayout={animatedLayout} />
 *     <p>Notes</p>
 *   </div>
 * );
 * ```
 */
export function useAnimatedLayout({
  containerRef,
}: UseAnimatedLayoutOptions): AnimatedLayout {
  // The container is read when a change runs, so the handle stays stable
  // across renders and a later ref assignment is still seen.
  return useMemo(
    () => createAnimatedLayout(() => containerRef.current),
    [containerRef],
  );
}
