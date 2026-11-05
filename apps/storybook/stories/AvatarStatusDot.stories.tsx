// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {CheckIcon, ClockIcon, XMarkIcon} from '@heroicons/react/24/solid';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, max-content)',
    alignItems: 'center',
    gap: spacingVars['--spacing-6'],
  },
  narrow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
    width: '320px',
    maxWidth: '100%',
  },
});

const meta = {
  title: 'Core/AvatarStatusDot',
  component: AvatarStatusDot,
  tags: ['autodocs'],
} satisfies Meta<typeof AvatarStatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VariantsAndSizes: Story = {
  render: () => (
    <div {...stylex.props(styles.grid)}>
      {(['success', 'neutral', 'error'] as const).flatMap(variant =>
        (['xsm', 'lg', 'xl'] as const).map(size => (
          <Avatar
            key={`${variant}-${size}`}
            name={`${variant} ${size}`}
            size={size}
            tooltip={false}
            status={
              <AvatarStatusDot
                variant={variant}
                label={
                  variant === 'success'
                    ? 'Online'
                    : variant === 'neutral'
                      ? 'Away'
                      : 'Do not disturb'
                }
              />
            }
          />
        )),
      )}
    </div>
  ),
};

export const DistinctCustomIcons: Story = {
  render: () => (
    <div {...stylex.props(styles.grid)}>
      <Avatar
        name="Accepted"
        size="xl"
        tooltip={false}
        status={
          <AvatarStatusDot
            variant="success"
            label="Accepted"
            icon={<CheckIcon />}
          />
        }
      />
      <Avatar
        name="Pending"
        size="xl"
        tooltip={false}
        status={
          <AvatarStatusDot
            variant="neutral"
            label="Pending"
            icon={<ClockIcon />}
          />
        }
      />
      <Avatar
        name="Rejected"
        size="xl"
        tooltip={false}
        status={
          <AvatarStatusDot
            variant="error"
            label="Rejected"
            icon={<XMarkIcon />}
          />
        }
      />
    </div>
  ),
};

export const NarrowContainer: Story = {
  render: () => (
    <div {...stylex.props(styles.narrow)}>
      <Avatar
        name="Online"
        size="lg"
        tooltip={false}
        status={<AvatarStatusDot variant="success" label="Online" />}
      />
      <Avatar
        name="Away"
        size="lg"
        tooltip={false}
        status={<AvatarStatusDot variant="neutral" label="Away" />}
      />
      <Avatar
        name="Do not disturb"
        size="lg"
        tooltip={false}
        status={<AvatarStatusDot variant="error" label="Do not disturb" />}
      />
    </div>
  ),
};
