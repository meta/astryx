// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.public.test.ts
 * @input Imports the AlertDialog public barrel
 * @output Locks AlertDialog's public props: the touch presentation adds none
 * @position Compatibility test guarding @astryxdesign/core/AlertDialog
 *
 * The touch presentation changes behavior, not the public contract. Its way
 * back on a phone is the existing `width` prop, and nothing else is added for
 * it. The `expectTypeOf` assertions run in `pnpm -F @astryxdesign/core
 * typecheck`, not in the test run.
 */

import {describe, expectTypeOf, it} from 'vitest';

import type {AlertDialogProps} from './index';

describe('AlertDialog public surface', () => {
  it('adds no prop for the touch presentation', () => {
    expectTypeOf<AlertDialogProps>().not.toHaveProperty('presentation');
  });

  it("keeps a caller's width, the way back from the phone width", () => {
    expectTypeOf<AlertDialogProps>().toHaveProperty('width');
  });
});
