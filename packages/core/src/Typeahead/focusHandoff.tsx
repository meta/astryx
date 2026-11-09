// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file focusHandoff.tsx
 * @input A wrapper's ref, set just before it moves focus to the input itself
 * @output Context BaseTypeahead reads so that focus opens no suggestions
 * @position Package-internal; not exported from the package entry point.
 *   Typeahead moves focus to the input when its focused Token goes away. That
 *   move keeps the person's place; it is not a request for suggestions, so on
 *   a `hasEntriesOnFocus` field it opens nothing and reports no open.
 */

import {use, type RefObject} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export const FocusHandoffContext =
  createSharedContext<RefObject<boolean> | null>(
    'FocusHandoffContext',
    1,
    null,
  );
FocusHandoffContext.displayName = 'FocusHandoffContext';

/** The wrapper's handoff flag, or null when the base is used directly. */
export function useFocusHandoff(): RefObject<boolean> | null {
  return use(FocusHandoffContext);
}
