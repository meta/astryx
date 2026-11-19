// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuContext.public.test.ts
 * @input The DropdownMenu barrel and its public `DropdownMenuContextValue`
 * @output Guards that the menu context keeps its members and that the internal
 *   surface context a sub-menu with a header or footer reads is not exported
 * @position Public API test guarding @astryxdesign/core/DropdownMenu
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import * as dropdownMenu from './index';
import type {DropdownMenuContextValue} from './index';

describe('DropdownMenu public context', () => {
  it('keeps its members and exports no surface context', () => {
    expectTypeOf<keyof DropdownMenuContextValue>().toEqualTypeOf<
      'closeMenu' | 'menuSize' | 'drillIn' | 'menuLabel'
    >();
    expect('DropdownMenuSurfaceContext' in dropdownMenu).toBe(false);
  });
});
