// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {CubeIcon, FolderIcon, HomeIcon} from '@heroicons/react/24/outline';
import {HomeIcon as HomeIconSolid} from '@heroicons/react/24/solid';

const meta: Meta<typeof SideNav> = {
  title: 'Core/SideNav',
  component: SideNav,
  parameters: {layout: 'centered'},
  decorators: [
    Story => (
      <div style={{height: 480}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SideNav>;

export const CollapseOwnership: Story = {
  name: 'Collapse ownership',
  args: {
    collapsible: true,
    resizable: {
      autoSaveId: 'sidenav-collapse-ownership-story',
      defaultWidth: 260,
    },
  },
  render: args => (
    <SideNav
      {...args}
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
          href="/dashboard"
        />
        <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
      </SideNavSection>
    </SideNav>
  ),
};
