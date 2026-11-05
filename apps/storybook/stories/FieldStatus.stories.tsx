// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldStatus.stories.tsx
 * @input FieldStatus from @astryxdesign/core
 * @output Stable visual coverage for status tones and variants, plus the audit matrix (every tone in both presentations and wrapping content)
 * @position Core component stories and visual regression coverage
 */

import type {Meta, StoryObj} from '@storybook/react';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {Stack} from '@astryxdesign/core/Stack';

const meta: Meta<typeof FieldStatus> = {
  title: 'Core/FieldStatus',
  component: FieldStatus,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FieldStatus>;

export const Variants: Story = {
  tags: ['visual-baseline'],
  render: () => (
    <Stack gap={3}>
      <FieldStatus type="error" message="This field is required" />
      <FieldStatus
        type="warning"
        message="This value may be visible to others"
        variant="detached"
      />
      <FieldStatus
        type="success"
        message="Your changes were saved"
        variant="detached"
      />
    </Stack>
  ),
};

const STATUS_TYPES = ['error', 'warning', 'success'] as const;
const PRESENTATIONS = ['attached', 'detached'] as const;

const STATUS_MESSAGES = {
  error: 'This field is required',
  warning: 'This value may be visible to others',
  success: 'Your changes were saved',
} as const;

// A validation message that echoes the value the person typed. The address is
// one unbroken token, so it can only fit a narrow field if the message wraps
// inside it.
const LONG_TOKEN_MESSAGE =
  'Enter a valid address: firstname.lastname.department.team@subdomain.example.com is not recognised';

const LONG_PROSE_MESSAGE =
  'Passwords must be at least twelve characters long and include a mix of letters, numbers, and symbols so that they are hard to guess.';

const matrixStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
  gap: 16,
  width: '100%',
  padding: 16,
  boxSizing: 'border-box',
} as const;

const columnStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
} as const;

const narrowColumnStyle = {...columnStyle, maxWidth: 240} as const;

// A flex row sizes its items from their min-content width, the way a
// horizontal form row or an inline toolbar would.
const rowStyle = {display: 'flex', minWidth: 0} as const;

/**
 * Every status tone in both presentations, plus wrapping content in a narrow
 * container: a long sentence, a message carrying one long unbroken token, an
 * empty message, and the long-token message as an item of a flex row.
 */
export const AuditMatrix: Story = {
  render: () => (
    <div style={matrixStyle}>
      {PRESENTATIONS.map(variant => (
        <div key={variant} style={columnStyle}>
          {STATUS_TYPES.map(type => (
            <FieldStatus
              key={type}
              type={type}
              variant={variant}
              message={STATUS_MESSAGES[type]}
              data-audit-case={`${variant}-${type}`}
            />
          ))}
        </div>
      ))}
      <div style={narrowColumnStyle}>
        {PRESENTATIONS.map(variant => (
          <FieldStatus
            key={`${variant}-prose`}
            type="warning"
            variant={variant}
            message={LONG_PROSE_MESSAGE}
            data-audit-case={`${variant}-long-prose`}
          />
        ))}
        {PRESENTATIONS.map(variant => (
          <FieldStatus
            key={`${variant}-token`}
            type="error"
            variant={variant}
            message={LONG_TOKEN_MESSAGE}
            data-audit-case={`${variant}-long-token`}
          />
        ))}
        {PRESENTATIONS.map(variant => (
          <FieldStatus
            key={`${variant}-empty`}
            type="success"
            variant={variant}
            message=""
            data-audit-case={`${variant}-empty`}
          />
        ))}
        <div style={rowStyle}>
          <FieldStatus
            type="error"
            message={LONG_TOKEN_MESSAGE}
            data-audit-case="attached-long-token-in-row"
          />
        </div>
      </div>
    </div>
  ),
};
