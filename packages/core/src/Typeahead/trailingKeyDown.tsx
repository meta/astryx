// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file trailingKeyDown.tsx
 * @input React context
 * @output Exports TrailingKeyDownContext and useTrailingKeyDown
 * @position Package-internal; not exported from the package entry point.
 *   Typeahead and Tokenizer pass a consumer `onKeyDown` through it so
 *   BaseTypeahead calls it on the combobox input after its own key handling:
 *   the consumer observes every key on the input and cannot cancel built-in
 *   navigation, selection, or token editing (family:input-fields FR10).
 */

import {createContext, use, type KeyboardEvent} from 'react';

export type TrailingKeyDown =
  ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;

export const TrailingKeyDownContext = createContext<TrailingKeyDown>(undefined);
TrailingKeyDownContext.displayName = 'TrailingKeyDownContext';

/** The consumer key handler BaseTypeahead runs after its own, if any. */
export function useTrailingKeyDown(): TrailingKeyDown {
  return use(TrailingKeyDownContext);
}
