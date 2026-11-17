// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavItem.iconTarget.test.tsx
 * @input Uses vitest, @testing-library/react, SideNav, SideNavItem, Icon
 * @output Tests for the `side-nav-item-icon` theming target
 * @position Testing; validates where the side nav item icon target sits
 */

import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {Icon} from '../Icon';
import {SideNav} from './SideNav';
import {SideNavItem} from './SideNavItem';

const TARGET = '.astryx-side-nav-item-icon';

function nav(isCollapsed: boolean) {
  return render(
    <div>
      <Icon icon="close" data-testid="outside-icon" />
      <SideNav collapsible={{isCollapsed, hasButton: false}}>
        <SideNavItem
          label="Dashboard"
          icon="viewColumns"
          href="/dash"
          isSelected
        />
        <SideNavItem label="Reports" icon="viewColumns" href="/reports" />
        <SideNavItem
          label="Archive"
          icon="viewColumns"
          href="/archive"
          isDisabled
        />
        <SideNavItem
          label="Custom"
          icon={<span data-testid="custom-glyph">c</span>}
          href="/custom"
        />
        <SideNavItem label="Group" icon="viewColumns">
          <SideNavItem label="Child" href="/child" />
        </SideNavItem>
      </SideNav>
    </div>,
  );
}

describe('side-nav-item-icon target', () => {
  for (const isCollapsed of [false, true]) {
    describe(
      isCollapsed ? 'in a collapsed rail' : 'in an expanded rail',
      () => {
        it('sits on each built-in item icon, with the row states', () => {
          const {container} = nav(isCollapsed);
          const targets = [...container.querySelectorAll(TARGET)];
          // Dashboard, Reports, Archive and Group: the four built-in icons.
          expect(targets).toHaveLength(4);
          for (const t of targets) {
            // The target rides on the Icon element that paints the glyph.
            expect(t.classList.contains('astryx-icon')).toBe(true);
            // The Icon keeps its own size attribute on the same element.
            expect(t).toHaveAttribute('data-size', 'sm');
          }
          expect(
            container.querySelectorAll(`${TARGET}[data-selected="selected"]`),
          ).toHaveLength(1);
          expect(
            container.querySelectorAll(`${TARGET}[data-disabled="disabled"]`),
          ).toHaveLength(1);
        });

        it('reaches no other icon, no label, and no custom icon node', () => {
          const {container, getByTestId} = nav(isCollapsed);
          expect(getByTestId('outside-icon').matches(TARGET)).toBe(false);
          // A custom React node is the consumer's element: Core adds nothing.
          expect(getByTestId('custom-glyph').className).toBe('');
          for (const el of container.querySelectorAll(TARGET)) {
            expect(el.textContent ?? '').not.toMatch(
              /Dashboard|Reports|Archive/,
            );
            // Never a label or the row: only the icon, nested in the row.
            expect(el.matches('.astryx-side-nav-item')).toBe(false);
            expect(el.closest('.astryx-side-nav-item')).not.toBeNull();
          }
          // An icon outside the target (the expand chevron) holds none.
          for (const el of container.querySelectorAll('.astryx-icon')) {
            if (!el.matches(TARGET)) {
              expect(el.closest(TARGET)).toBeNull();
            }
          }
        });
      },
    );
  }
});
