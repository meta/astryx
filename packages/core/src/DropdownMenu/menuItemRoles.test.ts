// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuItemRoles.test.ts
 * @input The menu-item role set and the row selectors
 * @output Pins the value of each selector to the roles in the set
 * @position Unit test of menuItemRoles.ts
 */

import {describe, expect, it} from 'vitest';
import {
  MENU_ITEM_ROLES,
  MENU_ITEM_SELECTOR,
  MENU_ROW_SELECTOR,
} from './menuItemRoles';

describe('menu item roles', () => {
  it('lists the three roles of a menu row', () => {
    expect([...MENU_ITEM_ROLES]).toEqual([
      'menuitem',
      'menuitemradio',
      'menuitemcheckbox',
    ]);
  });

  it('selects every row of each role', () => {
    expect(MENU_ROW_SELECTOR).toBe(
      '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]',
    );
  });

  it('selects the enabled rows of each role', () => {
    expect(MENU_ITEM_SELECTOR).toBe(
      [
        '[role="menuitem"]:not([aria-disabled="true"])',
        '[role="menuitemradio"]:not([aria-disabled="true"])',
        '[role="menuitemcheckbox"]:not([aria-disabled="true"])',
      ].join(','),
    );
  });
});
