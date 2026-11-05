// Copyright (c) Meta Platforms, Inc. and affiliates.

import type * as React from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Badge} from '@astryxdesign/core/Badge';

const meta: Meta<typeof Badge> = {
  title: 'Core/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'neutral',
        'info',
        'success',
        'warning',
        'error',
        'blue',
        'cyan',
        'green',
        'orange',
        'pink',
        'purple',
        'red',
        'teal',
        'yellow',
      ],
      description: 'Visual style variant',
    },
    label: {
      control: 'text',
      description: 'Badge label text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    label: 'Badge',
  },
};

export const Variants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Badge variant="neutral" label="Neutral" />
      <Badge variant="info" label="Info" />
      <Badge variant="success" label="Success" />
      <Badge variant="warning" label="Warning" />
      <Badge variant="error" label="Error" />
    </div>
  ),
};

export const Counts: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Badge variant="info" label={3} />
      <Badge variant="error" label="99+" />
      <Badge variant="success" label={12} />
    </div>
  ),
};

export const StatusLabels: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Badge variant="success" label="Active" />
      <Badge variant="warning" label="Pending" />
      <Badge variant="error" label="Failed" />
      <Badge variant="neutral" label="Draft" />
    </div>
  ),
};

export const NonSemanticColors: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
      <Badge variant="blue" label="Design" />
      <Badge variant="cyan" label="DevOps" />
      <Badge variant="green" label="Backend" />
      <Badge variant="orange" label="Urgent" />
      <Badge variant="pink" label="Marketing" />
      <Badge variant="purple" label="Engineering" />
      <Badge variant="red" label="Critical" />
      <Badge variant="teal" label="Research" />
      <Badge variant="yellow" label="Review" />
    </div>
  ),
};

// A badge is one line, so a label wider than the space it has is cut short
// with an ellipsis rather than escaping the container. The full text rides in
// the badge's `title`, so hovering a truncated one shows it — a pointer-only
// affordance for now; the focus- and touch-reachable tooltip needs runtime
// measurement and is tracked in #5585.
export const LongLabels: Story = {
  name: 'Long labels in tight space',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      <div>
        <div style={{font: '600 12px system-ui', marginBottom: 6}}>
          In a 100px column
        </div>
        <div
          style={{
            width: 100,
            outline: '1px dashed var(--color-border)',
            padding: 4,
          }}>
          <Badge variant="pink" label="Awaiting security review" />
        </div>
      </div>
      <div>
        <div style={{font: '600 12px system-ui', marginBottom: 6}}>
          With an icon — the icon holds its place, the label gives way
        </div>
        <div
          style={{
            width: 140,
            outline: '1px dashed var(--color-border)',
            padding: 4,
          }}>
          <Badge
            variant="warning"
            icon={<span aria-hidden="true">⚠</span>}
            label="Awaiting security review"
          />
        </div>
      </div>
      <div>
        <div style={{font: '600 12px system-ui', marginBottom: 6}}>
          Room to spare — unchanged
        </div>
        <div
          style={{
            width: 300,
            outline: '1px dashed var(--color-border)',
            padding: 4,
          }}>
          <Badge variant="success" label="Active" />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A badge has a fixed height and never wraps, so a label wider than its container is truncated with an ellipsis rather than escaping the container. A badge that fits is untouched — the clamp only ever changes the case that would otherwise overflow.',
      },
    },
  },
};

// A badge with a label is at least one line of that label tall. When the text
// grows, the pill grows with the label instead of letting it spill out. Here
// the supporting text size is raised on a wrapper, and the rows wrap, as a
// layout has to at larger text sizes, so every badge keeps its whole label on a
// phone. Each row ends with a color-only badge, which has no text
// and keeps its size. The last two rows leave a count less room than one line
// of its text is tall (52px at 2.5rem): beside a title that cannot shrink, and
// in a cell. The count fits there at its own width; a minimum width of one
// line would push it out of the row or the cell (component:Badge FR3).
type LargerTextRow = React.CSSProperties & {'--text-supporting-size'?: string};
const CROWDED_ROW: LargerTextRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: 260,
  '--text-supporting-size': '2.5rem',
};
const NARROW_CELLS: LargerTextRow = {
  display: 'flex',
  gap: 8,
  '--text-supporting-size': '2.5rem',
};

export const LargerText: Story = {
  name: 'Larger text',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      {['default', '1.25rem', '2.5rem'].map(size => {
        const row: LargerTextRow = {
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          ...(size === 'default' ? null : {'--text-supporting-size': size}),
        };
        return (
          <div key={size} data-testid={`badge-row-${size}`} style={row}>
            <Badge variant="info" label={3} />
            <Badge label="Ready" />
            <Badge variant="success" label="Shipped" />
            <Badge
              variant="warning"
              icon={<span aria-hidden="true">⚠</span>}
              label="Review"
            />
            <Badge variant="success" label="" />
          </div>
        );
      })}
      <div data-testid="badge-row-crowded" style={CROWDED_ROW}>
        <span
          style={{
            flex: 'none',
            width: 200,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}>
          Messages waiting in the shared inbox
        </span>
        <Badge variant="info" label={3} />
      </div>
      <div data-testid="badge-row-narrow" style={NARROW_CELLS}>
        <div
          data-testid="narrow-cell"
          style={{width: 52, outline: '1px dashed var(--color-border)'}}>
          <Badge variant="info" label={3} />
        </div>
      </div>
    </div>
  ),
};
