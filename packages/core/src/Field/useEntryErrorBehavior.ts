// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useEntryErrorBehavior.ts
 * @input A field's own entryErrorBehavior and the nearest FormLayout's
 *   defaultEntryErrorBehavior
 * @output The entry error behavior that the field follows
 * @position Shared internal hook of the input-field family; used by DateInput,
 *   DateTimeInput, and TimeInput
 *
 * SYNC: When modified, update:
 * - /packages/core/src/FormLayout/FormLayoutContext.ts (EntryErrorBehavior)
 * - /packages/core/src/FormLayout/FormLayout.test.tsx (precedence tests)
 */

import {use} from 'react';
import {
  FormLayoutContext,
  type EntryErrorBehavior,
} from '../FormLayout/FormLayoutContext';

/**
 * The entry error behavior of a field: its own prop, else the nearest
 * FormLayout's default, else `'complete'`. A layer starts a new FormLayout
 * scope, so a field in a Dialog opened from a form takes no default from it.
 */
export function useEntryErrorBehavior(
  entryErrorBehavior: EntryErrorBehavior | undefined,
): EntryErrorBehavior {
  const {defaultEntryErrorBehavior} = use(FormLayoutContext);
  return entryErrorBehavior ?? defaultEntryErrorBehavior ?? 'complete';
}
