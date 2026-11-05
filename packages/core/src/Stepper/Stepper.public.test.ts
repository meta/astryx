// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stepper.public.test.ts
 * @input Imports the Stepper public barrel and internal context module
 * @output Locks the supported horizontal options and context surfaces
 * @position Compatibility test guarding @astryxdesign/core/Stepper
 *
 * The `expectTypeOf` assertions here are enforced by `pnpm -F
 * @astryxdesign/core typecheck`, not by the test run. A failed negative property
 * assertion surfaces as `TS2554: Expected 2 arguments, but got 1`.
 */

import {describe, expectTypeOf, it} from 'vitest';

import type {
  StepperContextValue,
  StepperProps,
  StepperRegistrationOptions,
  useStepperContext,
} from './index';
import type {StepperInternalContextValue} from './StepperContext';

const privateContextFields = [
  'stepCount',
  'isCompact',
  'summarySlot',
  'minimumStepWidth',
  'minStepWidthMeasureRef',
] as const;

describe('Stepper public surface', () => {
  it('accepts only pixel numbers for the minimum step width', () => {
    type HorizontalOptions = NonNullable<StepperProps['horizontalOptions']>;

    expectTypeOf<
      HorizontalOptions['minimumStepWidth']
    >().toEqualTypeOf<number>();
  });

  it('keeps private coordination off the public context', () => {
    for (const field of privateContextFields) {
      expectTypeOf<StepperContextValue>().not.toHaveProperty(field);
      expectTypeOf<ReturnType<typeof useStepperContext>>().not.toHaveProperty(
        field,
      );
    }
  });

  it('preserves the supported public context reads', () => {
    expectTypeOf<
      ReturnType<typeof useStepperContext>
    >().toEqualTypeOf<StepperContextValue>();
    expectTypeOf<StepperContextValue>().toHaveProperty('activeStep');
    expectTypeOf<StepperContextValue>().toHaveProperty('previousActiveStep');
    expectTypeOf<StepperContextValue>().toHaveProperty('orientation');
    expectTypeOf<StepperContextValue>().toHaveProperty('isNonLinear');
    expectTypeOf<StepperContextValue>().toHaveProperty('onStepClick');
    expectTypeOf<StepperContextValue>().toHaveProperty('density');
    expectTypeOf<StepperContextValue>().toHaveProperty('indicatorPosition');
    expectTypeOf<StepperContextValue>().toHaveProperty('registerStep');
  });

  it('keeps the registration options on the public context', () => {
    type RegisterStep = StepperContextValue['registerStep'];

    expectTypeOf<Parameters<RegisterStep>[1]>().toEqualTypeOf<
      StepperRegistrationOptions | undefined
    >();
    expectTypeOf<StepperRegistrationOptions['getIsDisabled']>().toEqualTypeOf<
      (() => boolean) | undefined
    >();
  });

  it('keeps layout coordination on the internal context only', () => {
    expectTypeOf<StepperInternalContextValue>().toMatchTypeOf<StepperContextValue>();
    expectTypeOf<StepperInternalContextValue>().toHaveProperty(
      'previousActiveStep',
    );
    expectTypeOf<StepperInternalContextValue>().toHaveProperty('registerStep');
    expectTypeOf<StepperInternalContextValue>().toHaveProperty('stepCount');
    expectTypeOf<StepperInternalContextValue>().toHaveProperty('isCompact');
    expectTypeOf<StepperInternalContextValue>().toHaveProperty('summarySlot');
    expectTypeOf<StepperInternalContextValue>().not.toHaveProperty(
      'minimumStepWidth',
    );
    expectTypeOf<StepperInternalContextValue>().not.toHaveProperty(
      'minStepWidthMeasureRef',
    );
  });
});
