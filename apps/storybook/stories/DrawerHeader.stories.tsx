// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof DrawerHeader> = {
  title: 'Core/DrawerHeader',
  component: DrawerHeader,
  tags: ['autodocs'],
  parameters: {docs: {disable: true}},
};

export default meta;
type Story = StoryObj<typeof DrawerHeader>;

export const Audit: Story = {
  args: {
    title: 'Deployment health for web-prod-04',
    subtitle: 'us-east-1, deployed 12 minutes ago',
    startContent: 0,
    endContent: 0,
    hasDivider: true,
  },
  render: args => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <Drawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Deployment details">
        <Layout
          header={<DrawerHeader {...args} onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <Text type="body">
                All six instances are passing readiness checks.
              </Text>
            </LayoutContent>
          }
        />
      </Drawer>
    );
  },
};

export const AuditWithoutClose: Story = {
  args: {
    title: 'Deployment health for web-prod-04',
    subtitle: 'us-east-1, deployed 12 minutes ago',
    startContent: 0,
    endContent: 0,
    hasDivider: true,
  },
  render: args => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <Drawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Deployment details">
        <Layout
          header={<DrawerHeader {...args} />}
          content={
            <LayoutContent>
              <Text type="body">
                All six instances are passing readiness checks.
              </Text>
            </LayoutContent>
          }
        />
      </Drawer>
    );
  },
};
