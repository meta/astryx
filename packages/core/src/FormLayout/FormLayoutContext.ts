// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FormLayoutContext.ts
 * @input Layer-scoped React context
 * @output Exports FormLayoutContext, FormLayoutDirection, and FormOptionality types
 * @position Context for form layout direction + default-optionality detection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FormLayout/FormLayout.tsx (prop + context value)
 * - /packages/core/src/Field/FieldLabel.tsx (indicator resolution)
 * - /packages/core/src/FormLayout/index.ts (exports if types change)
 */

import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

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
 * for spatial arrangement, and `defaultOptionality` so a field can suppress the
 * indicator that merely restates the form-wide default.
 */
export const FormLayoutContext = createContext<{
  direction: FormLayoutDirection;
  defaultOptionality?: FormOptionality;
}>({direction: 'vertical'});
FormLayoutContext.displayName = 'FormLayoutContext';
