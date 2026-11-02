// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fieldStatusPlacement.public.test.ts
 * @input The package entry and the Field barrel
 * @output Guards that callers can name the type of every field control's
 *   `statusVariant` from the package entry
 * @position Public API test guarding @astryxdesign/core
 */

import {describe, expectTypeOf, it} from 'vitest';
import type {FieldStatusPlacement, TextInputProps} from '../index';
import type {FieldStatusPlacement as FieldBarrelPlacement} from './index';

describe('FieldStatusPlacement public type', () => {
  it('is importable from the package entry and types statusVariant', () => {
    expectTypeOf<FieldStatusPlacement>().toEqualTypeOf<
      'attached' | 'detached' | 'tooltip'
    >();
    expectTypeOf<FieldBarrelPlacement>().toEqualTypeOf<FieldStatusPlacement>();
    expectTypeOf<
      NonNullable<TextInputProps['statusVariant']>
    >().toEqualTypeOf<FieldStatusPlacement>();
  });
});
