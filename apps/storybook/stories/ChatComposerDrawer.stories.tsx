// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, within} from 'storybook/test';
import {ChatComposerDrawer} from '@astryxdesign/core/Chat';
import {Token} from '@astryxdesign/core/Token';

const meta: Meta<typeof ChatComposerDrawer> = {
  title: 'Core/ChatComposerDrawer',
  component: ChatComposerDrawer,
  tags: ['autodocs'],
  parameters: {layout: 'centered'},
  decorators: [
    Story => (
      <div style={{width: 480}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatComposerDrawer>;

const attachments = (
  <>
    <Token label="design-spec.pdf" onRemove={() => {}} />
    <Token label="api-schema.json" onRemove={() => {}} />
  </>
);

export const Expanded: Story = {
  args: {
    count: 2,
    label: 'Attachments',
    children: attachments,
  },
};

export const Collapsed: Story = {
  args: {
    count: 1,
    label: 'Attachment',
    defaultIsCollapsed: true,
    children: (
      <button type="button" data-audit-child="">
        Remove attachment
      </button>
    ),
  },
  render: args => (
    <>
      <ChatComposerDrawer {...args} />
      <button type="button" data-audit-after="">
        After drawer
      </button>
    </>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', {name: /Attachment/});
    const region = document.getElementById(
      toggle.getAttribute('aria-controls') as string,
    );
    const child =
      canvasElement.querySelector<HTMLElement>('[data-audit-child]');
    const after =
      canvasElement.querySelector<HTMLElement>('[data-audit-after]');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(region).toHaveAttribute('inert');
    await userEvent.tab();
    await expect(toggle).toHaveFocus();
    await userEvent.tab();
    await expect(after).toHaveFocus();

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(region).not.toHaveAttribute('inert');
    await userEvent.tab();
    await expect(child).toHaveFocus();
  },
};

export const CustomCollapsedSummary: Story = {
  tags: ['visual-baseline'],
  args: {
    count: 2,
    label: 'Attachments',
    collapsedSummary: <span>2 files ready</span>,
    defaultIsCollapsed: true,
    children: attachments,
  },
};

export const KeyboardFocus: Story = {
  args: {
    count: 2,
    label: 'Attachments',
    children: attachments,
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const toggle = canvas.getByRole('button', {name: /Attachments/});
    await expect(toggle).toHaveFocus();
    const style = getComputedStyle(toggle);
    await expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(
      2,
    );
    await expect(style.outlineStyle).not.toBe('none');
  },
};
