// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fieldInputFamily.testing.ts
 * @input Uses the FR10 forbidden root styling prop names
 * @output Exports expectFieldInputProps, a compile-time check for member tests
 * @position Test helper for family:input-fields FR10; each Field-composed
 *   component's test calls it, and fieldInputFamily.test.ts verifies the call
 *   exists for every component that renders Field
 */

import type {
  FieldInputForbiddenStyleProp,
  FieldPartStyleProps,
} from './fieldParts';

type AcceptsRootStyling<P> = [
  Extract<keyof P, FieldInputForbiddenStyleProp>,
] extends [never]
  ? false
  : true;

type MissingParts<P> = Exclude<keyof FieldPartStyleProps, keyof P>;

/**
 * Compile-time FR10 check: fails type-checking when `P` accepts root
 * `xstyle`/`className`/`style`, or lacks any `container*`/`control*` prop.
 * A no-op at runtime.
 *
 * @example
 * ```
 * it('has no root styling props (FR10)', () => {
 *   expectFieldInputProps<TextInputProps>();
 * });
 * ```
 */
export function expectFieldInputProps<P>(
  ..._check: AcceptsRootStyling<P> extends true
    ? [error: 'accepts root xstyle, className, or style']
    : [MissingParts<P>] extends [never]
      ? []
      : [
          error: 'missing container* or control* part props',
          missing: MissingParts<P>,
        ]
): void {}
