// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Center} from '@astryxdesign/core/Center';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {CheckCircleIcon} from '@heroicons/react/24/outline';
import {
  colorVars,
  spacingVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  box: {
    backgroundColor: colorVars['--color-background-blue'],
    color: colorVars['--color-text-blue'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-blue'],
    paddingBlock: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-6'],
    borderRadius: radiusVars['--radius-element'],
    fontWeight: 500,
  },
  storyWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  iconWrapper: {
    backgroundColor: colorVars['--color-background-blue'],
    color: colorVars['--color-text-blue'],
    padding: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
  },
  paddingOutline: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border-gray'],
    borderRadius: radiusVars['--radius-element'],
  },
  fillArea: {
    width: '100%',
    height: '100%',
  },
});

// Demo box component for visibility
const Box = ({children}: {children: React.ReactNode}) => (
  <div {...stylex.props(styles.box)}>{children}</div>
);

const meta: Meta<typeof Center> = {
  title: 'Core/Center',
  component: Center,
  tags: ['autodocs'],
  argTypes: {
    axis: {
      control: 'select',
      options: ['both', 'horizontal', 'vertical'],
      description:
        'Center mode. In horizontal writing, the names match physical axes; in vertical writing, current single-axis behavior follows flex main/cross axes.',
    },
    width: {
      control: 'text',
      description:
        'Width of the container (number for px, string for any unit)',
    },
    height: {
      control: 'text',
      description:
        'Height of the container (number for px, string for any unit)',
    },
    isInline: {
      control: 'boolean',
      description: 'Whether to render as inline-flex',
    },
    padding: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Inner padding on all sides (spacing step)',
    },
    paddingInline: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description:
        'Logical inline-axis padding; overrides padding on that axis',
    },
    paddingInlineStart: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description:
        'Logical inline-start padding; physical edge depends on writing mode and direction',
    },
    paddingInlineEnd: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description:
        'Logical inline-end padding; physical edge depends on writing mode and direction',
    },
    paddingBlock: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Logical block-axis padding; overrides padding on that axis',
    },
    paddingBlockStart: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description:
        'Logical block-start padding; physical edge depends on writing mode',
    },
    paddingBlockEnd: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description:
        'Logical block-end padding; physical edge depends on writing mode',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Center>;

export const Default: Story = {
  args: {
    axis: 'both',
    width: '100%',
    height: 200,
    children: null,
  },
  render: args => (
    <Section variant="muted" width="100%">
      <Center {...args}>
        <Box>Centered Content</Box>
      </Center>
    </Section>
  ),
};

export const HorizontalOnly: Story = {
  args: {
    axis: 'horizontal',
    width: '100%',
    children: null,
  },
  render: args => (
    <Section variant="muted" width="100%">
      <Center {...args}>
        <Box>Horizontal Center</Box>
      </Center>
    </Section>
  ),
};

export const VerticalOnly: Story = {
  args: {
    axis: 'vertical',
    height: 150,
    width: '100%',
    children: null,
  },
  render: args => (
    <Section variant="muted" width="100%">
      <Center {...args}>
        <Box>Vertical Center</Box>
      </Center>
    </Section>
  ),
};

export const FullSize: Story = {
  args: {
    axis: 'both',
    width: '100%',
    height: 300,
    children: null,
  },
  render: args => (
    <Section variant="muted">
      <Center {...args}>
        <Box>Full Width, Fixed Height</Box>
      </Center>
    </Section>
  ),
};

export const Inline: Story = {
  args: {
    isInline: true,
    children: null,
  },
  render: args => (
    <Section variant="muted">
      <Card>
        <Text type="body">
          Text with inline centered icon:{' '}
          <Center {...args} xstyle={styles.iconWrapper}>
            <Icon icon={CheckCircleIcon} size="sm" />
          </Center>{' '}
          and more text after.
        </Text>
      </Card>
    </Section>
  ),
};

export const WithIcon: Story = {
  args: {
    axis: 'both',
    width: 300,
    height: 200,
    children: null,
  },
  render: args => (
    <Section variant="muted">
      <Center {...args}>
        <div {...stylex.props(styles.iconWrapper)}>
          <Icon icon={CheckCircleIcon} size="lg" />
        </div>
      </Center>
    </Section>
  ),
};

export const InsideACard: Story = {
  args: {
    height: 150,
    children: null,
  },
  render: args => (
    <Section variant="muted">
      <Card>
        <Center {...args}>
          <Box>Centered in Card</Box>
        </Center>
      </Card>
    </Section>
  ),
};

// ============================================================================
// Padding — inner padding via the spacing scale (no inline styles needed)
// ============================================================================

export const Padding: Story = {
  args: {
    axis: 'both',
    width: '100%',
    height: 200,
    padding: 4,
    children: null,
  },
  render: args => (
    <Section variant="muted" width="100%">
      <Center {...args} xstyle={styles.paddingOutline}>
        <div {...stylex.props(styles.fillArea)}>
          <Box>Inset by padding on the spacing scale</Box>
        </div>
      </Center>
    </Section>
  ),
};

export const PaddingPerEdge: Story = {
  args: {
    axis: 'both',
    width: '100%',
    height: 200,
    padding: 6,
    paddingBlockEnd: 0,
    paddingInlineStart: 2,
    children: null,
  },
  render: args => (
    <Section variant="muted" width="100%">
      <Center {...args} xstyle={styles.paddingOutline}>
        <div {...stylex.props(styles.fillArea)}>
          <Box>Roomy above, flush below — only the block-end edge moved</Box>
        </div>
      </Center>
    </Section>
  ),
};

export const AllAxisModes: Story = {
  args: {
    children: null,
  },
  render: () => (
    <Section variant="muted">
      <div {...stylex.props(styles.storyWrapper)}>
        <Card>
          <Text type="supporting" display="block">
            axis: both (default)
          </Text>
          <Center axis="both" width={300} height={150}>
            <Box>Both Axes</Box>
          </Center>
        </Card>
        <Card>
          <Text type="supporting" display="block">
            axis: horizontal
          </Text>
          <Center axis="horizontal" width={300}>
            <Box>Horizontal Only</Box>
          </Center>
        </Card>
        <Card>
          <Text type="supporting" display="block">
            axis: vertical
          </Text>
          <Center axis="vertical" height={150}>
            <Box>Vertical Only</Box>
          </Center>
        </Card>
      </div>
    </Section>
  ),
};
