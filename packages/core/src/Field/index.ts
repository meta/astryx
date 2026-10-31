// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports Field component and types from Field.tsx, FieldLabel from FieldLabel.tsx, FieldStatus from FieldStatus.tsx
 * @output Exports Field, FieldProps, FieldStatusInput, FieldStatusType, FieldLabel, FieldLabelProps, FieldStatus component,
 *   and the shared input types (including the text-entry keyboard trait types)
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Field/Field.doc.mjs
 */

export {Field} from './Field';
export type {FieldProps, FieldStatusInput, FieldStatusType} from './Field';
export {FieldLabel} from './FieldLabel';
export type {FieldLabelProps} from './FieldLabel';
export {FieldStatus} from '../FieldStatus';
export type {
  FieldStatusProps,
  FieldStatusVariant,
  FieldStatusVariantMap,
} from '../FieldStatus';

// Shared input types
export type {InputStatus, InputStatusType, InputSize} from './types';
export type {
  FieldInputBaseProps,
  FieldContainerStyleProps,
  FieldControlStyleProps,
  FieldPartStyleProps,
} from './fieldParts';
export type {
  TextEntryAutoCapitalize,
  TextEntryEnterKeyHint,
  TextEntryInputMode,
  TextEntryTraitProps,
} from './textEntryTraits';

// Shared input styles
export {
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  inputStatusFocusStyles,
} from './inputStyles.stylex';

// Shared input components
export {InputClearButton} from './InputClearButton';
