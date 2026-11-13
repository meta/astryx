// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useValueReplacesEntry.ts
 * @input A field's committed value and a signal that changes at each Enter or
 *   blur that keeps rejected text
 * @output Whether a new value replaces the field's kept entry in this render
 * @position Shared internal hook of the input-field family; used by
 *   DateInput/useTypedDate.ts (DateInput, DateTimeInput), NumberInput.tsx, and
 *   TimeInput/useTypedTime.ts (TimeInput, DateTimeInput)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Field/useValueReplacesEntry.test.tsx
 * - /packages/core/src/DateInput/useTypedDate.ts
 * - /packages/core/src/NumberInput/NumberInput.tsx
 * - /packages/core/src/TimeInput/useTypedTime.ts
 */

import {useState} from 'react';

/**
 * Whether a new `value` replaces the entry that a field keeps. A value that
 * arrives in the same update as a change of `keepSignal` does not replace it,
 * so a caller can restore its own value at an Enter or blur that keeps
 * rejected text. The member changes `keepSignal` at each such commit.
 *
 * The record is render-phase state, so a render React discards takes its
 * update with it. The result is true in one render per new value at most.
 */
export function useValueReplacesEntry(
  value: unknown,
  keepSignal: unknown,
): boolean {
  const [rendered, setRendered] = useState({value, keepSignal});
  const isNewValue = !Object.is(rendered.value, value);
  const isKeptNow = !Object.is(rendered.keepSignal, keepSignal);
  if (!isNewValue && !isKeptNow) {
    return false;
  }
  setRendered({value, keepSignal});
  return isNewValue && !isKeptNow;
}
