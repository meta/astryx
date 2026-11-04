// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputPresentation.ts
 * @input A presentation policy, the deprecated nativePicker value, and pointer type
 * @output The resolved picker surface for DateInput, DateTimeInput, and TimeInput
 * @position Shared presentation vocabulary (AST-043)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /docs/specs/AST-043-input-presentation/spec.md
 * - /packages/core/src/DateInput/DateInput.tsx
 * - /packages/core/src/DateTimeInput/DateTimeInput.tsx
 * - /packages/core/src/TimeInput/TimeInput.tsx
 */

/** Picker-surface policy for date/time inputs. */
export type InputPresentation =
  | 'text-input'
  | 'popover'
  | 'bottom-sheet'
  | 'native'
  | 'adaptive-bottom-sheet'
  | 'adaptive-native';

/** `presentation` for components without a text-only surface: all except `TimeInput` exclude `text-input`. */
export type PickerPresentation = Exclude<InputPresentation, 'text-input'>;

/** The surface a resolved `InputPresentation` actually renders. */
export type InputPresentationSurface =
  'text-input' | 'desktop' | 'sheet' | 'native';

/** The surface a resolved `PickerPresentation` renders: one where a picker opens. */
export type PickerPresentationSurface = Exclude<
  InputPresentationSurface,
  'text-input'
>;

/** Deprecated picker policy. */
export type LegacyNativePicker = 'touch' | 'always' | 'never';

/**
 * Typed as the narrower policy because the default opens a picker for every
 * component; it is still a valid `InputPresentation`.
 */
export const DEFAULT_INPUT_PRESENTATION: PickerPresentation = 'adaptive-native';

/**
 * Map a deprecated `nativePicker` value to its `presentation` equivalent for
 * a component whose every surface opens a picker (`DateInput`,
 * `DateTimeInput`). Their released `never` was Astryx's own pickers on every
 * pointer, so no value maps to `text-input` — which is what lets the return
 * type exclude it.
 */
export function pickerPresentationFromNativePicker(
  nativePicker: LegacyNativePicker,
): PickerPresentation {
  switch (nativePicker) {
    case 'touch':
      return 'adaptive-native';
    case 'always':
      return 'native';
    case 'never':
      return 'adaptive-bottom-sheet';
  }
}

/**
 * Map a deprecated `nativePicker` value to its `presentation` equivalent.
 * `TimeInput` differs: its released `never` is the typed field on every
 * pointer, so it maps to `text-input`, not a sheet policy.
 */
export function presentationFromNativePicker(
  nativePicker: LegacyNativePicker,
  component: 'date' | 'time',
): InputPresentation {
  if (component === 'time' && nativePicker === 'never') {
    return 'text-input';
  }
  return pickerPresentationFromNativePicker(nativePicker);
}

/**
 * The effective picker-only policy: explicit `presentation` wins over the
 * deprecated prop. The narrow twin of {@link effectiveInputPresentation} for
 * `DateInput` and `DateTimeInput`, whose `presentation` cannot be
 * `text-input`.
 */
export function effectivePickerPresentation(
  presentation: PickerPresentation | undefined,
  nativePicker: LegacyNativePicker | undefined,
): PickerPresentation {
  if (presentation !== undefined) {
    return presentation;
  }
  if (nativePicker !== undefined) {
    return pickerPresentationFromNativePicker(nativePicker);
  }
  return DEFAULT_INPUT_PRESENTATION;
}

/** The effective policy: explicit `presentation` wins over the deprecated prop. */
export function effectiveInputPresentation(
  presentation: InputPresentation | undefined,
  nativePicker: LegacyNativePicker | undefined,
  component: 'date' | 'time',
): InputPresentation {
  if (presentation !== undefined) {
    return presentation;
  }
  if (nativePicker !== undefined) {
    return presentationFromNativePicker(nativePicker, component);
  }
  return DEFAULT_INPUT_PRESENTATION;
}

/** Resolve a picker-only policy to the surface rendered for the current pointer. */
export function resolvePickerPresentation(
  presentation: PickerPresentation,
  isCoarsePointer: boolean,
): PickerPresentationSurface {
  switch (presentation) {
    case 'popover':
      return 'desktop';
    case 'bottom-sheet':
      return 'sheet';
    case 'native':
      return 'native';
    case 'adaptive-bottom-sheet':
      return isCoarsePointer ? 'sheet' : 'desktop';
    case 'adaptive-native':
      return isCoarsePointer ? 'native' : 'desktop';
  }
}

/** Resolve a policy to the surface rendered for the current pointer. */
export function resolveInputPresentation(
  presentation: InputPresentation,
  isCoarsePointer: boolean,
): InputPresentationSurface {
  return presentation === 'text-input'
    ? 'text-input'
    : resolvePickerPresentation(presentation, isCoarsePointer);
}
