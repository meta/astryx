// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useResolvedRequired.ts
 * @input Uses React, FormLayoutContext
 * @output Exports useResolvedOptionality and useResolvedRequired
 * @position Resolves a field's effective aria-required, and which optionality
 *   marker its label shows, against the form default
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FormLayout/FormLayoutContext.ts (defaultOptionality source)
 * - /packages/core/src/FormLayout/FormLayout.tsx (prop doc: aria-required behavior)
 * - /packages/core/src/Field/FieldLabel.tsx (the visible marker)
 */

import {use} from 'react';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';

/** A field's resolved optionality: what it announces and what its label shows. */
export interface ResolvedOptionality {
  /** The field's `aria-required`. */
  readonly isRequired: boolean;
  /** The label shows the "Required" marker, which is part of its name. */
  readonly showsRequiredMarker: boolean;
  /** The label shows the "Optional" marker. */
  readonly showsOptionalMarker: boolean;
}

/**
 * Resolve a field's optionality against a surrounding `FormLayout`'s
 * `defaultOptionality`.
 *
 * `isRequired` drives `aria-required`: under `defaultOptionality="required"`
 * a field is required unless it opts out with `isOptional`.
 *
 * The markers are the label's visible indicator. A form-level default means
 * "only the exception is marked", so a field that restates the default shows
 * no marker and only a deviation from it does:
 *
 *   defaultOptionality  isRequired            isOptional
 *   'optional'          → required marker     → (matches default, hidden)
 *   'required'          → (matches, hidden)   → optional marker
 *   unset               → required marker     → optional marker
 *
 * `isOptional` takes precedence over `isRequired`.
 */
export function useResolvedOptionality({
  isRequired = false,
  isOptional = false,
}: {
  isRequired?: boolean;
  isOptional?: boolean;
}): ResolvedOptionality {
  const {defaultOptionality} = use(FormLayoutContext);
  const showsOptionalMarker = isOptional && defaultOptionality !== 'optional';
  return {
    isRequired:
      !isOptional && (isRequired || defaultOptionality === 'required'),
    showsRequiredMarker:
      !showsOptionalMarker && isRequired && defaultOptionality !== 'required',
    showsOptionalMarker,
  };
}

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
  return useResolvedOptionality({isRequired, isOptional}).isRequired;
}
