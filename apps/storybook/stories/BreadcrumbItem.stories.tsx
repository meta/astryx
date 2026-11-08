// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  BreadcrumbItem,
  BreadcrumbMenuItem,
  Breadcrumbs,
} from '@astryxdesign/core/Breadcrumbs';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';

const meta: Meta<typeof BreadcrumbItem> = {
  title: 'Core/BreadcrumbItem',
  component: BreadcrumbItem,
  tags: ['autodocs'],
  parameters: {
    controls: {disable: true},
  },
};

export default meta;
type Story = StoryObj<typeof BreadcrumbItem>;

/**
 * Keeps the public rendering branches on one reusable fixture: navigation link,
 * action button, explicit current item, icon content, and a current menu trigger.
 * The menu opens so component-scoped accessibility and RTL audits can reach its
 * popup semantics without creating a story per audit row.
 */
export const PublicStates: Story = {
  name: 'Public States',
  render: () => (
    <VStack gap={4}>
      <Breadcrumbs label="Link, action, and current breadcrumb items">
        <BreadcrumbItem
          href="/calendar"
          startIcon={<Icon icon="calendar" size="sm" />}>
          Calendar
        </BreadcrumbItem>
        <BreadcrumbItem onClick={() => {}}>Refresh</BreadcrumbItem>
        <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
      </Breadcrumbs>
      <Breadcrumbs label="Current breadcrumb item with a menu">
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem
          isCurrent
          menu={
            <>
              <BreadcrumbMenuItem label="Design" />
              <BreadcrumbMenuItem label="Engineering" />
            </>
          }>
          <span>Teams</span>
        </BreadcrumbItem>
      </Breadcrumbs>
    </VStack>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector(
      '.astryx-breadcrumb-item-menu-trigger',
    );
    if (
      trigger instanceof HTMLButtonElement &&
      trigger.getAttribute('aria-expanded') === 'false'
    ) {
      trigger.click();
    }
  },
};
