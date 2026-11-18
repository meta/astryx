// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FormLayoutContext.ts
 * @input Layer-scoped React context
 * @output Exports FormLayoutContext, FormLayoutDirection, FormOptionality, and
 *   EntryErrorBehavior types
 * @position Context for form layout direction, default optionality, and the
 *   default entry error behavior
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FormLayout/FormLayout.tsx (prop + context value)
 * - /packages/core/src/Field/FieldLabel.tsx (indicator resolution)
 * - /packages/core/src/Field/useEntryErrorBehavior.ts (entry error behavior resolution)
 * - /packages/core/src/FormLayout/index.ts (exports if types change)
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

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
 * When an input that checks its own entries shows its entry error: a date,
 * time, or number that it rejects. It sets when the error shows, not when
 * validation runs; validation runs on every edit.
 *
 * - `'complete'` — the input shows the error at its own moment, as it does
 *   without the setting. DateInput shows a date the calendar does not have, or
 *   one outside its bounds, as soon as the typed date is complete.
 * - `'blur-or-enter'` — the input holds the message, `aria-invalid`, the
 *   invalid styling, the announcement, and the `onEntryErrorChange` report
 *   until the person presses Enter or leaves the field. An edit that makes
 *   the entry valid or empty clears the error at once.
 */
export type EntryErrorBehavior = 'complete' | 'blur-or-enter';

/**
 * Context for detecting which form layout a component is rendered in. Children
 * can use this to adapt their rendering based on the parent layout — direction
 * for spatial arrangement, `defaultOptionality` so a field can suppress the
 * indicator that merely restates the form-wide default, and
 * `defaultEntryErrorBehavior` for inputs that set no `entryErrorBehavior`.
 */
export const FormLayoutContext = createLayerScopedContext<{
  direction: FormLayoutDirection;
  defaultOptionality?: FormOptionality;
  defaultEntryErrorBehavior?: EntryErrorBehavior;
}>('FormLayoutContext', 1, {direction: 'vertical'});
FormLayoutContext.displayName = 'FormLayoutContext';
