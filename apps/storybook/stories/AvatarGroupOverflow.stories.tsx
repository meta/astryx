// Copyright (c) Meta Platforms, Inc. and affiliates.
import type {Meta, StoryObj} from '@storybook/react';
import {fn} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {AvatarGroup, AvatarGroupOverflow} from '@astryxdesign/core/AvatarGroup';
import {Avatar} from '@astryxdesign/core/Avatar';
import {
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const storyStyles = stylex.create({
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
    flexWrap: 'wrap',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
  },
  label: {
    fontFamily: typographyVars['--font-family-body'],
    margin: 0,
  },
  narrow: {
    width: 120,
  },
});

const meta: Meta<typeof AvatarGroupOverflow> = {
  title: 'Core/AvatarGroupOverflow',
  component: AvatarGroupOverflow,
  tags: ['autodocs'],
  args: {
    count: 2,
    onClick: undefined,
  },
  argTypes: {
    count: {control: 'number'},
    children: {control: 'text'},
    onClick: {
      control: false,
      description: 'Callback for intentionally clickable overflow indicators.',
    },
    ref: {control: false},
    xstyle: {
      control: false,
      description: 'stylex.create() value — not an inline style object.',
    },
  },
  render: args => (
    <AvatarGroup size="lg">
      <Avatar name="Alice" />
      <Avatar name="Bob" />
      <AvatarGroupOverflow {...args} />
    </AvatarGroup>
  ),
};

export default meta;
type Story = StoryObj<typeof AvatarGroupOverflow>;

export const Default: Story = {};

export const Clickable: Story = {
  args: {
    onClick: fn(),
  },
};

export const CustomContent: Story = {
  args: {
    count: 12,
    children: '12+',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div {...stylex.props(storyStyles.column)}>
      {(['xsm', 'sm', 'md', 'lg', 'xl'] as const).map(size => (
        <div key={size} {...stylex.props(storyStyles.item)}>
          <p {...stylex.props(storyStyles.label)}>{size}</p>
          <AvatarGroup size={size}>
            <Avatar name="Alice" />
            <AvatarGroupOverflow count={2} />
          </AvatarGroup>
        </div>
      ))}
    </div>
  ),
};

export const AllShapes: Story = {
  render: () => (
    <div {...stylex.props(storyStyles.row)}>
      {(['circle', 'rounded', 'square'] as const).map(shape => (
        <div key={shape} {...stylex.props(storyStyles.item)}>
          <p {...stylex.props(storyStyles.label)}>{shape}</p>
          <AvatarGroup size="lg" shape={shape}>
            <Avatar name="Alice" />
            <AvatarGroupOverflow count={2} />
          </AvatarGroup>
        </div>
      ))}
    </div>
  ),
};

export const LargeCount: Story = {
  args: {
    count: 4912,
  },
};

export const ZeroCount: Story = {
  args: {
    count: 0,
  },
};

export const Standalone: Story = {
  render: args => <AvatarGroupOverflow {...args} />,
};

export const RightToLeft: Story = {
  globals: {direction: 'rtl'},
};

export const NarrowContainer: Story = {
  render: args => (
    <div {...stylex.props(storyStyles.narrow)}>
      <AvatarGroup size="lg">
        <Avatar name="Alice" />
        <Avatar name="Bob" />
        <AvatarGroupOverflow {...args} />
      </AvatarGroup>
    </div>
  ),
};
