// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file deprecatedApis.public.test.ts
 * @input Public hooks barrel and focus option types
 * @output Guards the 0.6 removal of explicitly deprecated hook APIs
 * @position Public API compatibility test; enforced by Vitest and Core typecheck
 */

import {describe, expect, it} from 'vitest';
import * as hooks from './index';
import type {UseGridFocusOptions} from './useGridFocus';
import type {UseListFocusOptions} from './useListFocus';

describe('0.6 removed hook APIs', () => {
  it('does not export isImeKeyEvent from the hooks barrel', () => {
    expect(hooks).not.toHaveProperty('isImeKeyEvent');
  });

  it('does not accept explicit direction overrides', () => {
    const grid: UseGridFocusOptions = {
      columns: 3,
      // @ts-expect-error isRtl was removed; direction comes from the container
      isRtl: true,
    };
    const list: UseListFocusOptions = {
      // @ts-expect-error isRtl was removed; direction comes from the container
      isRtl: false,
    };
    expect(grid.columns).toBe(3);
    expect(list).toBeDefined();
  });
});
