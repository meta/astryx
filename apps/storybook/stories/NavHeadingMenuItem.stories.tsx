// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {NavHeadingMenu, NavHeadingMenuItem} from '@astryxdesign/core/NavMenu';
import {
  ArrowRightStartOnRectangleIcon,
  BellIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

/**
 * The menu row on its own. Story checks that select stories by component
 * reach NavHeadingMenuItem through this file; the menu stories live under
 * Core/NavMenu.
 */
const meta: Meta<typeof NavHeadingMenuItem> = {
  title: 'Core/NavHeadingMenuItem',
  component: NavHeadingMenuItem,
  parameters: {layout: 'padded'},
};

export default meta;
type Story = StoryObj<typeof NavHeadingMenuItem>;

/**
 * Link and action rows, both disabled, and a row whose label and description
 * are longer than the menu, so they cut off on one line each.
 */
export const States: Story = {
  render: () => (
    <div style={{maxWidth: 280}}>
      <NavHeadingMenu aria-label="Account">
        <NavHeadingMenuItem
          label="Profile"
          description="Manage your account"
          icon={UserIcon}
          href="#"
        />
        <NavHeadingMenuItem
          label="Sign out"
          icon={ArrowRightStartOnRectangleIcon}
          onClick={() => {}}
        />
        <NavHeadingMenuItem label="Billing" href="#" isDisabled />
        <NavHeadingMenuItem label="Admin" onClick={() => {}} isDisabled />
        <NavHeadingMenuItem
          label="Organization-wide notification preferences and delivery schedules"
          description="Choose which teams receive digests, alerts, and weekly summaries"
          icon={BellIcon}
          href="#"
        />
      </NavHeadingMenu>
    </div>
  ),
};
