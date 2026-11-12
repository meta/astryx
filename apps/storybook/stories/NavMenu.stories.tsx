// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {fn} from 'storybook/test';
import {NavHeadingMenu, NavHeadingMenuItem} from '@astryxdesign/core/NavMenu';
import {TopNavHeading} from '@astryxdesign/core/TopNav';
import {Text} from '@astryxdesign/core/Text';
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
        <NavHeadingMenuItem label="Security" icon={ShieldCheckIcon} href="#" />
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
  parameters: {
    docs: {
      description: {
        story:
          'Open the heading menu to try disabled link and action items. Admin does not invoke selection, click-capture, auxiliary-click, or Enter/Space keyboard callbacks. Disabled rows keep tabIndex=-1 and remain reachable by arrow navigation.',
      },
    },
  },
  render: args => (
    <>
      <TopNavHeading heading="Workspace" menu={<NavHeadingMenu {...args} />} />
      <Text id="analytics-unavailable" type="supporting">
        Analytics is unavailable on this plan.
      </Text>
    </>
  ),
  args: {
    size: 'md',
    children: (
      <>
        <NavHeadingMenuItem label="Dashboard" href="#" />
        <NavHeadingMenuItem
          label="Analytics"
          href="#analytics"
          aria-describedby="analytics-unavailable"
          isDisabled
        />
        <NavHeadingMenuItem label="Settings" href="#" />
        <NavHeadingMenuItem
          label="Admin"
          isDisabled
          onClick={fn()}
          onClickCapture={fn()}
          onAuxClick={fn()}
          onKeyDownCapture={fn()}
          onKeyDown={fn()}
          onKeyPressCapture={fn()}
          onKeyPress={fn()}
          onKeyUpCapture={fn()}
          onKeyUp={fn()}
        />
      </>
    ),
  },
};
