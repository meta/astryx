// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useResolvedRequired.ts
 * @input Uses React, FormLayoutContext
 * @output Exports useResolvedRequired
 * @position Resolves a field's effective aria-required against the form default
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FormLayout/FormLayoutContext.ts (defaultOptionality source)
 * - /packages/core/src/FormLayout/FormLayout.tsx (prop doc: aria-required behavior)
 */

import {use} from 'react';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';

/**
 * Resolve a field's effective *required* state for `aria-required`, honoring a
 * surrounding `FormLayout`'s `defaultOptionality`.
 *
 * Under `defaultOptionality="required"` a field is required unless it opts out
 * with `isOptional`. The visible indicator is suppressed for the unmarked
 * majority, so those fields must still expose `aria-required` — otherwise a
 * sighted user reads them as required (form-wide default, no indicator) while a
 * screen reader hears "not required". This closes that mismatch.
 *
 * Semantics only: this drives `aria-required`, never the native `required`
 * attribute, so a layout-level default can't silently switch on browser
 * validation bubbles. `isOptional` takes precedence, matching `FieldLabel`.
 *
 * CheckboxInput and Switch do not use this hook: an unchecked box or an off
 * switch is an answer, so a form default gives them no required state.
 */
export function useResolvedRequired({
  isRequired = false,
  isOptional = false,
}: {
  isRequired?: boolean;
  isOptional?: boolean;
}): boolean {
  const {defaultOptionality} = use(FormLayoutContext);
  return !isOptional && (isRequired || defaultOptionality === 'required');
}
