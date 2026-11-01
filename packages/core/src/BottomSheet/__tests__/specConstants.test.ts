// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file specConstants.test.ts
 * @input specConstants.ts and the modules its values come from
 * @output Fails when a browser-spec constant drifts from the source's value
 * @position Guard for BottomSheet's browser specs
 */

import {describe, expect, it} from 'vitest';
import {END_HOLD_MS} from '../../motion/animator';
import * as spec from './specConstants';

describe("BottomSheet's browser-spec constants", () => {
  it("match the animator's end-state hold", () => {
    expect(spec.END_HOLD_MS).toBe(END_HOLD_MS);
  });
});
