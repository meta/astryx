// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {NavHeadingMenu, NavHeadingMenuItem} from '@astryxdesign/core/NavMenu';
import {
  Cog6ToothIcon,
  UserIcon,
  ArrowRightStartOnRectangleIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof NavHeadingMenu> = {
  title: 'Core/NavMenu',
  component: NavHeadingMenu,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size — controls min-width and flows to items for padding',
    },
    minWidth: {
      control: 'number',
      description: 'Minimum width override',
    },
  },
  decorators: [
    Story => (
      <div style={{padding: 24, maxWidth: 300}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NavHeadingMenu>;

export const Default: Story = {
  args: {
    size: 'md',
    children: (
      <>
        <NavHeadingMenuItem label="Dashboard" href="#" />
        <NavHeadingMenuItem label="Analytics" href="#" />
        <NavHeadingMenuItem label="Settings" href="#" />
      </>
    ),
  },
};

export const WithIcons: Story = {
  args: {
    size: 'md',
    children: (
      <>
        <NavHeadingMenuItem label="Profile" icon={UserIcon} href="#" />
        <NavHeadingMenuItem
          label="Documents"
          icon={DocumentTextIcon}
          href="#"
        />
        <NavHeadingMenuItem label="Analytics" icon={ChartBarIcon} href="#" />
        <NavHeadingMenuItem
          label="Security"
          icon={ShieldCheckIcon}
          href="#"
        />
        <NavHeadingMenuItem label="Settings" icon={Cog6ToothIcon} href="#" />
      </>
    ),
  },
};

export const WithDescriptions: Story = {
  args: {
    size: 'lg',
    children: (
      <>
        <NavHeadingMenuItem
          label="Profile"
          description="Manage your account settings"
          icon={UserIcon}
          href="#"
        />
        <NavHeadingMenuItem
          label="Settings"
          description="Configure application preferences"
          icon={Cog6ToothIcon}
          href="#"
        />
        <NavHeadingMenuItem
          label="Sign out"
          description="End your current session"
          icon={ArrowRightStartOnRectangleIcon}
        />
      </>
    ),
  },
};

export const SmallSize: Story = {
  args: {
    size: 'sm',
    children: (
      <>
        <NavHeadingMenuItem label="Edit" href="#" />
        <NavHeadingMenuItem label="Duplicate" href="#" />
        <NavHeadingMenuItem label="Delete" />
      </>
    ),
  },
};

export const DisabledItems: Story = {
  args: {
    size: 'md',
    children: (
      <>
        <NavHeadingMenuItem label="Dashboard" href="#" />
        <NavHeadingMenuItem label="Analytics" href="#" isDisabled />
        <NavHeadingMenuItem label="Settings" href="#" />
        <NavHeadingMenuItem label="Admin" isDisabled />
      </>
    ),
  },
};
