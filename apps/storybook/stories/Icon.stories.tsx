// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  HomeIcon,
  HeartIcon,
  StarIcon,
  BellIcon,
  UserIcon,
  CogIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartIconSolid,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid';

const meta: Meta<typeof Icon> = {
  title: 'Core/Icon',
  component: Icon,
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: false,
      description: 'Hero Icon component to render',
    },
    color: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'tertiary',
        'disabled',
        'accent',
        'success',
        'error',
        'warning',
        'inherit',
      ],
      description: 'Color variant',
    },
    size: {
      control: 'select',
      options: ['xsm', 'sm', 'md', 'lg'],
      description: 'Icon size',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Icon>;

export const Default: Story = {
  args: {
    icon: HomeIcon,
    color: 'primary',
    size: 'md',
  },
};

/**
 * Icons are decorative by default (`aria-hidden`), which is correct when
 * adjacent text already conveys the meaning. When an icon stands alone and
 * carries meaning on its own, give it an accessible name with `label` — this
 * exposes it to screen readers as `role="img"` with that name and unhides it.
 */
export const AccessibleName: Story = {
  render: () => (
    <HStack gap={6} vAlign="center">
      <VStack gap={2} hAlign="center">
        <Icon
          icon={CheckCircleIcon}
          color="success"
          size="lg"
          label="Completed"
        />
        <Text type="supporting">Meaningful (label="Completed")</Text>
      </VStack>
      <VStack gap={2} hAlign="center">
        <Icon icon={HomeIcon} color="secondary" size="lg" />
        <Text type="supporting">Decorative (no label)</Text>
      </VStack>
    </HStack>
  ),
};

export const Primary: Story = {
  args: {
    icon: HomeIcon,
    color: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    icon: HomeIcon,
    color: 'secondary',
  },
};

export const Accent: Story = {
  args: {
    icon: HeartIcon,
    color: 'accent',
  },
};

export const Positive: Story = {
  args: {
    icon: CheckCircleIcon,
    color: 'success',
  },
};

export const Negative: Story = {
  args: {
    icon: XCircleIcon,
    color: 'error',
  },
};

export const Warning: Story = {
  args: {
    icon: ExclamationTriangleIcon,
    color: 'warning',
  },
};

export const ExtraSmall: Story = {
  args: {
    icon: StarIcon,
    size: 'xsm',
  },
};

export const Small: Story = {
  args: {
    icon: StarIcon,
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    icon: StarIcon,
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    icon: StarIcon,
    size: 'lg',
  },
};

export const SolidIcon: Story = {
  args: {
    icon: HeartIconSolid,
    color: 'error',
    size: 'lg',
  },
};

export const AllColors: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <Icon icon={HomeIcon} color="primary" />
      <Icon icon={UserIcon} color="secondary" />
      <Icon icon={CogIcon} color="tertiary" />
      <Icon icon={BellIcon} color="disabled" />
      <Icon icon={HeartIcon} color="accent" />
      <Icon icon={CheckCircleIcon} color="success" />
      <Icon icon={XCircleIcon} color="error" />
      <Icon icon={ExclamationTriangleIcon} color="warning" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <Icon icon={StarIcon} size="xsm" />
      <Icon icon={StarIcon} size="sm" />
      <Icon icon={StarIcon} size="md" />
      <Icon icon={StarIcon} size="lg" />
    </div>
  ),
};

export const OutlineVsSolid: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
        <Icon icon={HeartIcon} size="lg" color="error" />
        <span style={{fontSize: '12px', color: 'var(--color-text-secondary)'}}>
          Outline
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
        <Icon icon={HeartIconSolid} size="lg" color="error" />
        <span style={{fontSize: '12px', color: 'var(--color-text-secondary)'}}>
          Solid
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
        <Icon icon={StarIcon} size="lg" color="warning" />
        <span style={{fontSize: '12px', color: 'var(--color-text-secondary)'}}>
          Outline
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
        <Icon icon={StarIconSolid} size="lg" color="warning" />
        <span style={{fontSize: '12px', color: 'var(--color-text-secondary)'}}>
          Solid
        </span>
      </div>
    </div>
  ),
};

export const InheritColor: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <span
        style={{
          color: 'blue',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
        <Icon icon={HomeIcon} color="inherit" size="sm" />
        Blue text
      </span>
      <span
        style={{
          color: 'green',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
        <Icon icon={CheckCircleIcon} color="inherit" size="sm" />
        Green text
      </span>
      <span
        style={{
          color: 'var(--color-text-error)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
        <Icon icon={XCircleIcon} color="inherit" size="sm" />
        Red text
      </span>
    </div>
  ),
};

export const NonSemanticColors: Story = {
  render: () => (
    <HStack gap={4} wrap="wrap">
      {(
        [
          'blue',
          'red',
          'green',
          'gray',
          'cyan',
          'teal',
          'yellow',
          'orange',
          'pink',
          'purple',
        ] as const
      ).map(color => (
        <VStack key={color} gap={1} hAlign="center">
          <Icon icon={StarIcon} color={color} />
          <Text type="supporting">{color}</Text>
        </VStack>
      ))}
    </HStack>
  ),
};
