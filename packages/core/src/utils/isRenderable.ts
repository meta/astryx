// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file isRenderable.ts
 * @input A ReactNode value
 * @output Boolean indicating whether the value passes the shallow React-slot check
 * @position Utility for checking if a React slot prop has non-empty scalar content.
 *
 * React treats null, undefined, true, false, and '' as empty — they render
 * nothing. This utility excludes exactly those values. It does not inspect
 * descendants: elements, arrays, fragments, and other containers return true
 * even when their contents ultimately render nothing.
 *
 * Use this instead of `prop != null` when a slot should also reject booleans and
 * the empty string. Do not use the return value as proof that DOM output exists.
 */

import type {ReactNode} from 'react';

/**
 * Returns false for null, undefined, booleans, and the empty string; true for
 * every other ReactNode value. The check is shallow and does not inspect the
 * descendants of elements or containers.
 *
 * @example
 * ```tsx
 * const hasSideNav = isRenderable(sideNav);
 * const hasTopNav = isRenderable(topNav);
 * ```
 */
export function isRenderable(node: ReactNode): boolean {
  return node != null && typeof node !== 'boolean' && node !== '';
}
