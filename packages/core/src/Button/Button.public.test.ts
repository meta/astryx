// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.public.test.ts
 * @input The public `ButtonProps` type
 * @output Compile-time checks that pin the type of Button's `ref`
 * @position Public type contract for packages/core/src/Button. The
 *   `expectTypeOf` assertions run in `pnpm -F @astryxdesign/core typecheck`.
 */

import type * as React from 'react';
import {describe, expectTypeOf, it} from 'vitest';
import type {ButtonProps} from './index';

describe('Button public types', () => {
  it('types the ref as the button element, also in link mode (Button FR17 gap)', () => {
    // In link mode (FR11) the ref receives the link element at runtime; the
    // type names the button. A change to this type is a public API change.
    expectTypeOf<ButtonProps['ref']>().toEqualTypeOf<
      React.Ref<HTMLButtonElement> | undefined
    >();
  });
});
