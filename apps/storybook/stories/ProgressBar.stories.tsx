// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Core/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: {type: 'range', min: 0, max: 100, step: 1},
      description: 'Current value',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    label: {
      control: 'text',
      description: 'Accessible label',
    },
    variant: {
      control: 'select',
      options: ['accent', 'success', 'warning', 'error', 'neutral'],
      description: 'Semantic color variant',
    },
    isLabelHidden: {
      control: 'boolean',
      description: 'Visually hide the label',
    },
    hasValueLabel: {
      control: 'boolean',
      description: 'Show formatted value',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state (grayed out)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: {
    value: 60,
    label: 'Progress',
  },
};

export const WithValueLabel: Story = {
  args: {
    value: 75,
    label: 'Storage used',
    hasValueLabel: true,
  },
};

export const CustomFormat: Story = {
  args: {
    value: 3.2,
    max: 5,
    label: 'Disk usage',
    hasValueLabel: true,
    formatValueLabel: (value: number, max: number) => `${value} GB / ${max} GB`,
  },
};

export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '300px',
      }}>
      <ProgressBar value={60} label="Accent" variant="accent" hasValueLabel />
      <ProgressBar value={80} label="Success" variant="success" hasValueLabel />
      <ProgressBar value={50} label="Warning" variant="warning" hasValueLabel />
      <ProgressBar value={92} label="Error" variant="error" hasValueLabel />
      <ProgressBar value={35} label="Neutral" variant="neutral" hasValueLabel />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '300px',
      }}>
      <ProgressBar
        value={30}
        label="Upload canceled"
        isDisabled
        hasValueLabel
      />
      <ProgressBar isIndeterminate label="Processing disabled" isDisabled />
    </div>
  ),
};

export const ComposedWithDescription: Story = {
  name: 'Composed: with description',
  render: () => (
    <div style={{width: '300px'}}>
      <ProgressBar
        value={40}
        max={100}
        label="Download progress"
        hasValueLabel
      />
      <div
        style={{
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          marginTop: '4px',
        }}>
        40 MB / 100 MB downloaded
      </div>
    </div>
  ),
};

export const HiddenLabel: Story = {
  args: {
    value: 50,
    label: 'Loading progress',
    isLabelHidden: true,
  },
};

export const HiddenLabelWithValue: Story = {
  args: {
    value: 75,
    label: 'Upload',
    isLabelHidden: true,
    hasValueLabel: true,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    label: 'Not started',
    hasValueLabel: true,
  },
};

export const Full: Story = {
  args: {
    value: 100,
    label: 'Complete',
    hasValueLabel: true,
    variant: 'success',
  },
};

export const Indeterminate: Story = {
  args: {
    isIndeterminate: true,
    label: 'Loading...',
  },
};

export const IndeterminateHiddenLabel: Story = {
  args: {
    isIndeterminate: true,
    label: 'Loading',
    isLabelHidden: true,
  },
};

export const IndeterminateVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '300px',
      }}>
      <ProgressBar isIndeterminate label="Accent" variant="accent" />
      <ProgressBar isIndeterminate label="Success" variant="success" />
      <ProgressBar isIndeterminate label="Warning" variant="warning" />
      <ProgressBar isIndeterminate label="Error" variant="error" />
      <ProgressBar isIndeterminate label="Neutral" variant="neutral" />
    </div>
  ),
};

export const WithTargetMark: Story = {
  args: {
    value: 45,
    label: 'Fundraiser',
    hasValueLabel: true,
    marks: [{value: 80, label: 'Goal'}],
  },
};

export const WithMultipleMarks: Story = {
  args: {
    value: 55,
    label: 'Quarterly milestones',
    hasValueLabel: true,
    marks: [
      {value: 25, label: 'Q1 target'},
      {value: 50, label: 'Q2 target'},
      {value: 80, label: 'Stretch goal'},
    ],
  },
};

export const ProgressPastMark: Story = {
  args: {
    value: 92,
    label: 'Budget used',
    hasValueLabel: true,
    variant: 'warning',
    marks: [{value: 75, label: 'Budget cap'}],
  },
};

export const MarksAcrossVariants: Story = {
  // A mark takes its color from what it sits on: inside the filled area it
  // uses the fill variant's on-color (on-accent / on-success / on-warning /
  // on-error), out on the bare track it uses the primary text color.
  // Neutral and disabled fill with the muted gray, which has no on-token, so
  // their marks keep one plain foreground on both sides — the primary text
  // color for a live neutral bar, the secondary one for a disabled bar, which
  // dims everything it draws.
  //
  // Every fill style is covered here: each semantic variant, the disabled
  // fill, both fill extremes (nothing filled / fully filled), and the
  // indeterminate fill, which ignores marks entirely.
  render: () => {
    const MARKS = [
      {value: 30, label: 'Mark at 30'},
      {value: 85, label: 'Mark at 85'},
    ];
    const section: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      width: '320px',
    };
    const heading: React.CSSProperties = {
      font: '600 12px/1.4 system-ui, sans-serif',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      opacity: 0.6,
      marginBlockEnd: '-4px',
    };
    return (
      <div style={{...section, gap: '28px'}}>
        <div style={section}>
          <div style={heading}>Semantic variants — 60% filled</div>
          {(['accent', 'success', 'warning', 'error', 'neutral'] as const).map(
            variant => (
              <ProgressBar
                key={variant}
                value={60}
                variant={variant}
                label={variant}
                hasValueLabel
                marks={MARKS}
              />
            ),
          )}
          <ProgressBar
            value={60}
            isDisabled
            label="disabled"
            hasValueLabel
            marks={MARKS}
          />
        </div>

        <div style={section}>
          <div style={heading}>Fill extremes</div>
          <ProgressBar
            value={0}
            label="0% — every mark on the track"
            hasValueLabel
            marks={MARKS}
          />
          <ProgressBar
            value={100}
            label="100% — every mark on the fill"
            hasValueLabel
            marks={MARKS}
          />
          <ProgressBar
            value={30}
            label="30% — a mark exactly at the fill edge"
            hasValueLabel
            marks={MARKS}
          />
        </div>

        <div style={section}>
          <div style={heading}>Indeterminate — marks are ignored</div>
          <ProgressBar isIndeterminate label="indeterminate" marks={MARKS} />
        </div>
      </div>
    );
  },
};

export const ThemedMarks: Story = {
  // Marks are themeable directly via the `progress-bar-mark` target: a theme sets
  // `backgroundColor`, `width`, and `height` on it with `defineTheme`. A taller
  // height overhangs the bar symmetrically above and below. The style block below
  // stands in for a full theme, in the shape `astryx theme build` emits — the
  // layer, and the size arriving as the derived vars rather than as `width` /
  // `height` — so the demo exercises the real theming path.
  render: () => (
    <div style={{width: '320px'}}>
      <style>{`
        @layer astryx-theme {
          .themed-marks-demo .astryx-progress-bar-mark {
            background-color: red;
            --_progressbar-mark-width: 3px;
            --_progressbar-mark-height: 14px;
          }
        }
      `}</style>
      <div className="themed-marks-demo">
        <ProgressBar
          value={55}
          label="Themed target marks"
          hasValueLabel
          marks={[
            {value: 25, label: 'Lower bound'},
            {value: 80, label: 'Upper bound'},
          ]}
        />
      </div>
    </div>
  ),
};
