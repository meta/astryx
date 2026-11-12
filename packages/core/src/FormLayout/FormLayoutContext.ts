// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FormLayoutContext.ts
 * @input Layer-scoped React context
 * @output Exports FormLayoutContext, FormLayoutDirection, FormOptionality, and EntryErrorBehavior types
 * @position Context for form layout direction + default-optionality and error behavior detection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FormLayout/FormLayout.tsx (prop + context value)
 * - /packages/core/src/Field/FieldLabel.tsx (indicator resolution)
 * - /packages/core/src/FormLayout/index.ts (exports if types change)
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

/**
 * When a field that checks its own entries shows its error (such as a typed date
 * that does not exist or falls outside min/max).
 *
 * - `'complete'` — shows the error as soon as the input is complete (default).
 * - `'blur-or-enter'` — defers the error display, `aria-invalid`, and live region
 *   announcement until the user presses Enter or moves focus away from the field.
 */
export type EntryErrorBehavior = 'complete' | 'blur-or-enter';

/**
 * Direction of form field arrangement.
 *
 * - `'vertical'` — Fields stack top-to-bottom (default). Most common.
 * - `'horizontal'` — Fields occupy one `1fr` grid track per child in logical inline order.
 * - `'horizontal-labels'` — Fields stack vertically while labels sit beside
 *   their inputs on the inline-start side (settings/admin panel pattern).
 */
export type FormLayoutDirection =
  'vertical' | 'horizontal' | 'horizontal-labels';

/**
 * Which state a form treats as its default, so only the *exception* carries a
 * visible optional/required indicator.
 *
 * - `'optional'` — fields are optional unless a field opts into `isRequired`;
 *   only required fields show an indicator.
 * - `'required'` — fields are required unless a field opts into `isOptional`;
 *   only optional fields show an indicator.
 */
export type FormOptionality = 'optional' | 'required';

/**
 * Context for detecting which form layout a component is rendered in. Children
 * can use this to adapt their rendering based on the parent layout — direction
 * for spatial arrangement, `defaultOptionality` to suppress indicators that restate
 * the form default, and `defaultEntryErrorBehavior` for entry error timing.
 */
export const FormLayoutContext = createLayerScopedContext<{
  direction: FormLayoutDirection;
  defaultOptionality?: FormOptionality;
  defaultEntryErrorBehavior?: EntryErrorBehavior;
}>('FormLayoutContext', 1, {direction: 'vertical'});
FormLayoutContext.displayName = 'FormLayoutContext';
