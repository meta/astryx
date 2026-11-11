// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const auditStyles = stylex.create({
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
    boxSizing: 'border-box',
    inlineSize: '100%',
    maxInlineSize: 360,
    minInlineSize: 0,
  },
});

const meta: Meta<typeof Heading> = {
  title: 'Core/Heading',
  component: Heading,
  tags: ['autodocs'],
  argTypes: {
    level: {
      control: 'select',
      options: [1, 2, 3, 4, 5, 6],
      description: 'Visual heading level (1-6)',
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
    hasCapsize: {
      control: 'boolean',
      description: 'Enable optical alignment (text-box-trim)',
    },
    accessibilityLevel: {
      control: 'select',
      options: [1, 2, 3, 4, 5, 6],
      description: 'Semantic level for accessibility (aria-level)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Heading>;

// =============================================================================
// Heading Levels
// =============================================================================

export const Level1: Story = {
  args: {
    level: 1,
    children: 'Heading Level 1 (24px)',
  },
};

export const Level2: Story = {
  args: {
    level: 2,
    children: 'Heading Level 2 (20px)',
  },
};

export const Level3: Story = {
  args: {
    level: 3,
    children: 'Heading Level 3 (17px)',
  },
};

export const Level4: Story = {
  args: {
    level: 4,
    children: 'Heading Level 4 (14px — base)',
  },
};

export const Level5: Story = {
  args: {
    level: 5,
    children: 'Heading Level 5 (12px)',
  },
};

export const Level6: Story = {
  args: {
    level: 6,
    children: 'Heading Level 6 (10px)',
  },
};

// =============================================================================
// All Levels Overview
// =============================================================================

export const AllLevels: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <Text type="supporting" display="block">
        Type scale: base=14px, ratio=1.2, h4 anchored to base. Sizes are
        computed from the geometric progression: size = base × ratio^step
      </Text>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '8px',
        }}>
        <Heading level={1}>Heading 1 — 24px</Heading>
        <Heading level={2}>Heading 2 — 20px</Heading>
        <Heading level={3}>Heading 3 — 17px</Heading>
        <Heading level={4}>Heading 4 — 14px (base)</Heading>
        <Heading level={5}>Heading 5 — 12px</Heading>
        <Heading level={6}>Heading 6 — 10px</Heading>
      </div>
    </div>
  ),
};

// =============================================================================
// Color Variants
// =============================================================================

export const ColorVariants: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
      <Heading level={2} color="primary">
        Primary heading (default)
      </Heading>
      <Heading level={2} color="secondary">
        Secondary heading
      </Heading>
      <Heading level={2} color="disabled">
        Disabled heading
      </Heading>
      <Heading level={2} color="placeholder">
        Placeholder heading
      </Heading>
      <Heading level={2} color="accent">
        Active heading (accent)
      </Heading>
      <div style={{color: 'purple'}}>
        <Heading level={2} color="inherit">
          Inherit heading (from parent)
        </Heading>
      </div>
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
        <Heading level={3} display="inline">
          Inline H3{' '}
        </Heading>
        <Heading level={3} display="inline">
          flows together{' '}
        </Heading>
        <Heading level={3} display="inline">
          on the same line
        </Heading>
      </div>
      <div>
        <Heading level={3} display="block">
          Block H3 (default)
        </Heading>
        <Heading level={3} display="block">
          Each heading on its own line
        </Heading>
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
      <Heading level={2} maxLines={1}>
        Very Long Heading That Will Be Truncated To One Line With Ellipsis
      </Heading>
    </div>
  ),
};

export const MultiLineTruncation: Story = {
  render: () => (
    <div style={{width: '300px', border: '1px solid #ccc', padding: '12px'}}>
      <Heading level={2} maxLines={2}>
        Very Long Heading That Will Be Truncated To Two Lines To Keep Card
        Layout Compact
      </Heading>
    </div>
  ),
};

// =============================================================================
// Accessibility Level Override
// =============================================================================

export const AccessibilityLevel: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <Text type="supporting" display="block">
          Normal heading: visual and semantic levels match
        </Text>
        <Heading level={2}>Section Title (h2, aria-level=2)</Heading>
      </div>
      <div style={{marginTop: '16px'}}>
        <Text type="supporting" display="block">
          Sidebar heading: visual h2 but semantic h3 (doesn't affect main
          outline)
        </Text>
        <Heading level={2} accessibilityLevel={3}>
          Sidebar Section (looks like h2, aria-level=3)
        </Heading>
      </div>
    </div>
  ),
};

// =============================================================================
// Decorations
// =============================================================================

export const Strikethrough: Story = {
  args: {
    level: 2,
    hasStrikethrough: true,
    children: 'Deprecated Section',
  },
};

export const Capsize: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <Text type="label" display="block">
          Without capsize (red border shows extra space):
        </Text>
        <div style={{border: '1px solid red', display: 'inline-block'}}>
          <Heading level={1}>Regular Heading</Heading>
        </div>
      </div>
      <div>
        <Text type="label" display="block">
          With capsize (optically aligned):
        </Text>
        <div style={{border: '1px solid red', display: 'inline-block'}}>
          <Heading level={1} hasCapsize>
            Capsize Heading
          </Heading>
        </div>
      </div>
    </div>
  ),
};

// =============================================================================
// Real-World Examples
// =============================================================================

export const PageLayout: Story = {
  render: () => (
    <div style={{maxWidth: '800px'}}>
      <Heading level={1}>Dashboard Overview</Heading>
      <Text type="supporting" display="block">
        Last updated 5 minutes ago
      </Text>

      <div style={{marginTop: '32px'}}>
        <Heading level={2}>Recent Activity</Heading>
        <Text type="body" display="block">
          Here's what's been happening in your workspace.
        </Text>
      </div>

      <div style={{marginTop: '24px'}}>
        <Heading level={3}>Today</Heading>
        <Text type="body" display="block">
          • Project Alpha updated
          <br />
          • 3 new comments
          <br />• Task completed
        </Text>
      </div>
    </div>
  ),
};

export const CardGrid: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '16px',
        maxWidth: '800px',
      }}>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}>
          <Heading level={3} maxLines={1}>
            {i === 1 && 'Very Long Card Title That Gets Truncated'}
            {i === 2 && 'Another Card'}
            {i === 3 &&
              'Third Card With An Even Longer Title That Will Be Truncated'}
          </Heading>
          <Text type="body" maxLines={2} display="block">
            This is a card description that might be quite long and needs to be
            truncated after two lines to keep the card compact and uniform.
          </Text>
          <Text type="supporting" display="block">
            Updated {i} hour{i > 1 ? 's' : ''} ago
          </Text>
        </div>
      ))}
    </div>
  ),
};

// =============================================================================
// Audit matrix
// =============================================================================

/**
 * Bounded browser fixture for the Heading contract: outline levels, display
 * types and weight, color, logical alignment, both truncation modes, and a
 * long unbroken token, in one 360px column.
 */
export const AuditMatrix: Story = {
  parameters: {layout: 'padded'},
  render: () => (
    <div {...stylex.props(auditStyles.column)}>
      <Heading data-audit-case="level-2" level={2}>
        Level two section
      </Heading>
      <Heading data-audit-case="outline-equal" level={3} accessibilityLevel={3}>
        Matching outline level
      </Heading>
      <Heading
        data-audit-case="outline-override"
        level={2}
        accessibilityLevel={4}>
        Drawn as two, outlined as four
      </Heading>
      <Heading data-audit-case="display-1" level={2} type="display-1">
        Display one
      </Heading>
      <Heading data-audit-case="display-2" level={2} type="display-2">
        Display two
      </Heading>
      <Heading data-audit-case="display-3" level={2} type="display-3">
        Display three
      </Heading>
      <Heading
        data-audit-case="display-weight"
        level={2}
        type="display-2"
        weight="bold">
        Display two, bold
      </Heading>
      <Heading data-audit-case="secondary" level={3} color="secondary">
        Secondary heading
      </Heading>
      <Heading data-audit-case="justify-center" level={4} justify="center">
        Centered heading
      </Heading>
      <Heading data-audit-case="justify-end" level={4} justify="end">
        End-aligned heading
      </Heading>
      <Heading data-audit-case="truncate-1" level={3} maxLines={1}>
        A single-line heading that is far too long for this column
      </Heading>
      <Heading
        data-audit-case="truncate-2"
        level={3}
        maxLines={2}
        hasTruncateTooltip="below">
        A two-line heading that keeps going well past its second line so the
        clamp has something to cut
      </Heading>
      <Heading data-audit-case="long-token" level={3}>
        Report_2026_quarterly_revenue_by_region_and_product_line_final
      </Heading>
    </div>
  ),
};
