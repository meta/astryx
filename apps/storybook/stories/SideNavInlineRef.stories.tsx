// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {flushSync} from 'react-dom';
import {Button} from '@astryxdesign/core/Button';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {FolderIcon, HomeIcon} from '@heroicons/react/24/outline';

const meta: Meta<typeof SideNav> = {
  title: 'Core/SideNav',
  component: SideNav,
  parameters: {layout: 'centered'},
};

export default meta;
type Story = StoryObj<typeof SideNav>;

function InlineRefCollapseDemo() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setRenderCount] = useState(0);
  return (
    <div style={{display: 'flex', gap: 16, height: 480}}>
      <SideNav
        // A new callback on every render, so React re-attaches the nav.
        ref={node => {
          void node;
        }}
        collapsible={{isCollapsed, onCollapsedChange: setIsCollapsed}}>
        <SideNavSection title="Main">
          <SideNavItem
            label="Dashboard"
            icon={HomeIcon}
            isSelected
            href="/dashboard"
          />
          <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
        </SideNavSection>
      </SideNav>
      <Button
        label={
          isCollapsed ? 'Expand after a render' : 'Collapse after a render'
        }
        onClick={() => {
          // One commit renders the nav again. A later commit in the same
          // frame changes its state, and that change plays its motion.
          flushSync(() => setRenderCount(count => count + 1));
          setIsCollapsed(collapsed => !collapsed);
        }}
      />
    </div>
  );
}

export const InlineRefCollapse: Story = {
  name: 'Inline ref collapse',
  render: () => <InlineRefCollapseDemo />,
};
