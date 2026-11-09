// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Checked-in browser fixtures for Selector's Combobox contract binding. */

import {expect, userEvent, waitFor, within} from 'storybook/test';
import type {Meta, StoryObj} from '@storybook/react';
import {Selector} from '@astryxdesign/core/Selector';

const meta: Meta<typeof Selector> = {
  title: 'a11y/Combobox pattern',
  component: Selector,
  tags: ['no-visual'],
  parameters: {layout: 'centered'},
  decorators: [
    Story => (
      <div style={{width: 280}}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Fruit',
    options: [
      {value: 'apple', label: 'Apple'},
      {value: 'banana', label: 'Banana'},
    ],
    onChange: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof Selector>;

export const SelectorClosed: Story = {};
export const SelectorOpen: Story = {
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', {name: 'Fruit'}));
    await expect(canvas.getByRole('combobox', {name: 'Fruit'})).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  },
};
export const SelectorReadOnly: Story = {
  args: {isReadOnly: true, value: 'apple'},
};
export const SelectorBusy: Story = {
  args: {isLoading: true},
};
export const SelectorSheetOpen: Story = {
  args: {presentation: 'bottom-sheet'},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', {name: 'Fruit'}));
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('dialog', {name: 'Fruit'}),
    ).toBeVisible();
  },
};
export const SelectorSearchActive: Story = {
  args: {hasSearch: true},
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {name: /Fruit/}));
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('combobox', {name: 'Search options'});
    await waitFor(() => expect(search).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant'),
    );
  },
};
