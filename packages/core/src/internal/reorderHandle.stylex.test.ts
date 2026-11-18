// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {MIN_TOUCH_TARGET} from '../utils/hitArea';
import {reorderHandle} from './reorderHandle.stylex';

describe('reorderHandle', () => {
  it("measures a finger's reach from the smallest touch target", () => {
    expect(reorderHandle.touchReach).toBe(
      `calc((${MIN_TOUCH_TARGET}px - ${reorderHandle.grip}) / 2)`,
    );
  });
});
