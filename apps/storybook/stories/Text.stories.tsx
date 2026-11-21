// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Text> = {
  title: 'Core/Text',
  component: Text,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['body', 'large', 'label', 'supporting', 'code'],
      description: 'Semantic text type',
    },
    size: {
      control: 'select',
      options: [
        '4xs',
        '3xs',
        '2xs',
        'xsm',
        'sm',
        'base',
        'lg',
        'xl',
        '2xl',
        '3xl',
        '4xl',
      ],
      description: 'Explicit font size override',
    },
    color: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'disabled',
        'placeholder',
        'accent',
        'inherit',
      ],
      description: 'Text color',
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold'],
      description: 'Font weight override',
    },
    display: {
      control: 'select',
      options: ['inline', 'block'],
      description: 'Display mode',
    },
    maxLines: {
      control: 'number',
      description: 'Maximum lines before truncation (0 = no truncation)',
    },
    textWrap: {
      control: 'select',
      options: ['wrap', 'nowrap', 'balance', 'pretty'],
      description: 'Text wrapping behavior',
    },
    wordBreak: {
      control: 'select',
      options: ['break-word', 'break-all'],
      description: 'Word break behavior',
    },
    hasStrikethrough: {
      control: 'boolean',
      description: 'Apply strikethrough decoration',
    },
    hasTabularNumbers: {
      control: 'boolean',
      description: 'Use tabular (monospace) numbers',
    },
    hasCapsize: {
      control: 'boolean',
      description: 'Enable optical alignment (text-box-trim)',
    },
    as: {
      control: 'select',
      options: ['span', 'p', 'div', 'label'],
      description: 'HTML element to render',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Text>;

// =============================================================================
// Basic Types
// =============================================================================

export const Body: Story = {
  args: {
    type: 'body',
    children: 'Body text - the bulk of content (14px)',
  },
};

export const Large: Story = {
  args: {
    type: 'large',
    children: 'Large text - emphasized content, quotes, descriptions (16px)',
  },
};

export const Label: Story = {
  args: {
    type: 'label',
    children: 'Label text - form/chart/table labels (14px medium)',
  },
};

export const Supporting: Story = {
  args: {
    type: 'supporting',
    children:
      'Supporting text - helper text, supplemental info (12px, secondary color)',
  },
};

export const Code: Story = {
  args: {
    type: 'code',
    children: 'const x = 1; // Inline code (14px monospace)',
  },
};

// =============================================================================
// All Types Overview
// =============================================================================

export const AllTypes: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
      <Text type="body">Body: The bulk of content (14px)</Text>
      <Text type="large">Large: Emphasized content (16px)</Text>
      <Text type="label">Label: Form/chart labels (14px medium)</Text>
      <Text type="supporting">Supporting: Helper text (12px secondary)</Text>
      <Text type="code">Code: const x = 1; (14px monospace)</Text>
    </div>
  ),
};

// =============================================================================
// Color Variants
// =============================================================================

export const ColorVariants: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <Text type="body" color="primary">
        Primary color (default for body)
      </Text>
      <Text type="body" color="secondary">
        Secondary color
      </Text>
      <Text type="body" color="disabled">
        Disabled color
      </Text>
      <Text type="body" color="placeholder">
        Placeholder color
      </Text>
      <Text type="body" color="accent">
        Active color (accent)
      </Text>
      <div style={{color: 'purple'}}>
        <Text type="body" color="inherit">
          Inherit color (from parent)
        </Text>
      </div>
    </div>
  ),
};

// =============================================================================
// Weight Variants
// =============================================================================

export const WeightVariants: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <Text type="body" weight="normal">
        Normal weight (400)
      </Text>
      <Text type="body" weight="medium">
        Medium weight (500)
      </Text>
      <Text type="body" weight="semibold">
        Semibold weight (600)
      </Text>
      <Text type="body" weight="bold">
        Bold weight (700)
      </Text>
    </div>
  ),
};

// =============================================================================
// Display Modes
// =============================================================================

export const DisplayModes: Story = {
  render: () => (
    <div>
      <div style={{marginBottom: '16px'}}>
        <Text type="body" display="inline">
          Inline text{' '}
        </Text>
        <Text type="body" display="inline">
          flows together{' '}
        </Text>
        <Text type="body" display="inline">
          on the same line.
        </Text>
      </div>
      <div>
        <Text type="body" display="block">
          Block text takes its own line.
        </Text>
        <Text type="body" display="block">
          Each block is on a separate line.
        </Text>
      </div>
    </div>
  ),
};

// =============================================================================
// Truncation
// =============================================================================

export const SingleLineTruncation: Story = {
  render: () => (
    <div style={{width: '300px', border: '1px solid #ccc', padding: '12px'}}>
      <Text type="body" maxLines={1}>
        This is a very long text that will be truncated to a single line. Hover
        over it to see the full content in a tooltip.
      </Text>
    </div>
  ),
};

const MANY_ROWS = Array.from(
  {length: 500},
  (_, index) =>
    `Row ${index + 1}: a cell label far wider than the column it has been given`,
);

/** A long list of truncated cells, as in a table, for checking load cost. */
export const ManyTruncatedRows: Story = {
  render: () => (
    <div style={{width: '240px'}}>
      {MANY_ROWS.map(label => (
        <Text key={label} type="body" maxLines={1}>
          {label}
        </Text>
      ))}
    </div>
  ),
};

export const MultiLineTruncation: Story = {
  render: () => (
    <div style={{width: '300px', border: '1px solid #ccc', padding: '12px'}}>
      <Text type="body" maxLines={2}>
        This is a very long text that will be truncated to exactly two lines.
        When you hover over it, a tooltip will appear showing the full text
        content. This is useful for displaying preview text in cards and lists.
      </Text>
    </div>
  ),
};

export const TruncationWithoutTooltip: Story = {
  render: () => (
    <div style={{width: '300px', border: '1px solid #ccc', padding: '12px'}}>
      <Text type="body" maxLines={1} hasTruncateTooltip={false}>
        This text is truncated but has no tooltip on hover. Sometimes you don't
        want a tooltip.
      </Text>
    </div>
  ),
};

export const TruncationVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '300px',
      }}>
      <div>
        <Text type="label" display="block">
          1 Line:
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={1}>
            This is a very long text that will be truncated to one line with
            ellipsis.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          2 Lines:
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={2}>
            This is a very long text that will be truncated to two lines. The
            second line will end with an ellipsis if the content is too long.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          3 Lines:
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={3}>
            This is a very long text that will be truncated to three lines. It
            allows for more content to be shown but still limits the vertical
            space. The third line will end with an ellipsis.
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Multi-Line Truncation Tooltip (fix for #1710)
// =============================================================================

/**
 * Demonstrates the fix for #1710: multi-line truncation tooltip now works.
 * Previously, hovering over clamped multi-line text never showed a tooltip
 * because `-webkit-line-clamp` caused `scrollHeight === offsetHeight`.
 */
export const MultiLineTruncationTooltip: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '280px',
      }}>
      <div>
        <Text type="label" display="block">
          maxLines=1 (always worked):
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={1}>
            This single-line text is long enough to be truncated with an
            ellipsis. Hover to see the full content in a tooltip.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          maxLines=2 (was broken, now fixed):
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={2}>
            This two-line text should show a tooltip on hover when it overflows
            past two lines. Previously the tooltip never appeared because
            truncation was not detected. Now it works correctly.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          maxLines=3 (was broken, now fixed):
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={3}>
            This three-line text has even more content to demonstrate that the
            fix works for any maxLines value greater than one. The tooltip
            should appear on hover showing the full untruncated text. Previously
            this was broken because the browser reported clamped dimensions.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          maxLines=2, short text (no tooltip expected):
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={2}>
            Short text. No tooltip.
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Word Break
// =============================================================================

export const WordBreakVariants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', maxWidth: '600px'}}>
      <div style={{flex: 1}}>
        <Text type="label" display="block">
          break-word (default for multi-line):
        </Text>
        <div style={{width: '150px', border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={2} wordBreak="break-word">
            Thisisaverylongwordthatneedstobreakatwordlevel
          </Text>
        </div>
      </div>
      <div style={{flex: 1}}>
        <Text type="label" display="block">
          break-all (default for single-line):
        </Text>
        <div style={{width: '150px', border: '1px solid #ccc', padding: '8px'}}>
          <Text type="body" maxLines={2} wordBreak="break-all">
            Thisisaverylongwordthatneedstobreakatanylevel
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Text Wrap
// =============================================================================

export const TextWrapVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '400px',
      }}>
      <div>
        <Text type="label" display="block">
          wrap (default):
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px', width: '200px'}}>
          <Text type="body" textWrap="wrap">
            This text wraps normally at word boundaries when it reaches the
            edge.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          nowrap:
        </Text>
        <div
          style={{
            border: '1px solid #ccc',
            padding: '8px',
            width: '200px',
            overflow: 'hidden',
          }}>
          <Text type="body" textWrap="nowrap">
            This text does not wrap and will overflow its container.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          balance:
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px', width: '200px'}}>
          <Text type="body" textWrap="balance">
            This text is balanced for better visual appearance across lines.
          </Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          pretty:
        </Text>
        <div style={{border: '1px solid #ccc', padding: '8px', width: '200px'}}>
          <Text type="body" textWrap="pretty">
            This text uses pretty wrap to avoid orphans at the end of
            paragraphs.
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Decorations
// =============================================================================

export const Strikethrough: Story = {
  args: {
    type: 'body',
    hasStrikethrough: true,
    children: 'This text has a strikethrough decoration',
  },
};

export const TabularNumbers: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <div>
        <Text type="label" display="block">
          Without tabular numbers:
        </Text>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <Text type="body">1,234.56</Text>
          <Text type="body">99,999.99</Text>
          <Text type="body">111.11</Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          With tabular numbers:
        </Text>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <Text type="body" hasTabularNumbers>
            1,234.56
          </Text>
          <Text type="body" hasTabularNumbers>
            99,999.99
          </Text>
          <Text type="body" hasTabularNumbers>
            111.11
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Capsize (Optical Alignment)
// =============================================================================

export const Capsize: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <Text type="label" display="block">
          Without capsize (red border shows extra space):
        </Text>
        <div style={{border: '1px solid red', display: 'inline-block'}}>
          <Text type="large">Regular text with line-height space</Text>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          With capsize (optically aligned):
        </Text>
        <div style={{border: '1px solid red', display: 'inline-block'}}>
          <Text type="large" hasCapsize>
            Capsize removes extra space
          </Text>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// As Different Elements
// =============================================================================

export const AsElements: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <Text type="body" as="span">
        As span (default, inline)
      </Text>
      <Text type="body" as="p">
        As paragraph element
      </Text>
      <Text type="body" as="div">
        As div element
      </Text>
      <Text type="body" as="label">
        As label element
      </Text>
    </div>
  ),
};

// =============================================================================
// Real-World Examples
// =============================================================================

export const CardExample: Story = {
  render: () => (
    <div
      style={{
        maxWidth: '300px',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
      <Text type="label" display="block">
        Product Name
      </Text>
      <Text type="body" maxLines={2} display="block">
        This is a product description that might be quite long and needs to be
        truncated after two lines to keep the card compact.
      </Text>
      <Text type="supporting" display="block">
        Updated 5 minutes ago
      </Text>
    </div>
  ),
};

export const MetricsExample: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '24px'}}>
      <div style={{textAlign: 'start'}}>
        <Text type="body" color="secondary" display="block">
          Revenue
        </Text>
        <Text type="large" weight="bold" hasTabularNumbers>
          $1,234,567.89
        </Text>
      </div>
      <div style={{textAlign: 'start'}}>
        <Text type="body" color="secondary" display="block">
          Users
        </Text>
        <Text type="large" weight="bold" hasTabularNumbers>
          12,345
        </Text>
      </div>
      <div style={{textAlign: 'start'}}>
        <Text type="body" color="secondary" display="block">
          Conversion
        </Text>
        <Text type="large" weight="bold" color="accent" hasTabularNumbers>
          23.4%
        </Text>
      </div>
    </div>
  ),
};

/**
 * Text types in a form-like context. Note: for actual forms, prefer
 * TextInput or TextArea which include built-in labels and
 * descriptions. This example shows how Text types pair with content.
 */
export const FormLikeContext: Story = {
  render: () => (
    <div
      style={{
        maxWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
      <div>
        <Text type="label" display="block">
          Section title as label
        </Text>
        <Text type="body" display="block">
          Body text provides the main content or instructions for this section.
        </Text>
        <Text type="supporting" display="block">
          Supporting text adds extra context or constraints.
        </Text>
      </div>
      <div>
        <Text type="label" display="block">
          Another section
        </Text>
        <Text type="body" display="block">
          These text types create a natural visual hierarchy without any
          additional styling.
        </Text>
        <Text type="supporting" color="accent" display="block">
          Active supporting text draws attention to important details.
        </Text>
      </div>
    </div>
  ),
};
