// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Section} from '@astryxdesign/core/Section';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {
  colorVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  surfaceWrapper: {
    backgroundColor: colorVars['--color-background-surface'],
    padding: spacingVars['--spacing-6'],
  },
  pageWrapper: {
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-6'],
  },
  text: {
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
    margin: 0,
  },
  textSecondary: {
    color: colorVars['--color-text-secondary'],
    fontSize: 14,
  },
  storyWrapper: {
    display: 'flex',
    gap: spacingVars['--spacing-6'],
    flexWrap: 'wrap',
  },
  heading: {
    margin: `0 0 ${spacingVars['--spacing-2']} 0`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: 14,
    color: colorVars['--color-text-secondary'],
  },
});

const meta: Meta<typeof Section> = {
  title: 'Core/Section',
  component: Section,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div {...stylex.props(styles.surfaceWrapper)}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    variant: {
      control: 'select',
      options: ['section', 'transparent', 'muted'],
      description: 'Visual variant of the section',
    },
    width: {
      control: {type: 'range', min: 100, max: 800, step: 10},
      description: 'Width in pixels',
    },
    height: {
      control: {type: 'range', min: 100, max: 600, step: 10},
      description: 'Height in pixels',
    },
    isScrollable: {
      control: 'boolean',
      description: 'Makes the section scroll its own content (overflow: auto)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Section>;

export const Default: Story = {
  args: {
    variant: 'section',
    width: 300,
  },
  render: args => (
    <Section {...args}>
      <p {...stylex.props(styles.text)}>
        A section with default padding. Sections are used to define distinct
        areas within a page.
      </p>
    </Section>
  ),
};

export const Variants: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>section (default)</h4>
        <Section variant="section" width={200}>
          <p {...stylex.props(styles.text)}>Surface background</p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>muted</h4>
        <Section variant="muted" width={200}>
          <p {...stylex.props(styles.text)}>Wash background</p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>transparent</h4>
        <Section variant="transparent" width={200}>
          <p {...stylex.props(styles.text)}>Transparent background</p>
        </Section>
      </div>
    </div>
  ),
};

export const WithSimpleContent: Story = {
  render: () => (
    <Section variant="muted" width={320}>
      <VStack gap={2}>
        <h3 {...stylex.props(styles.text)}>Section Title</h3>
        <p {...stylex.props(styles.text, styles.textSecondary)}>
          This section contains simple content without Layout. The container
          padding is applied automatically.
        </p>
      </VStack>
    </Section>
  ),
};

export const WithInnerLayout: Story = {
  render: () => (
    <Section variant="muted" width={350} height={250}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <h3 {...stylex.props(styles.text)}>Section with Layout</h3>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <p {...stylex.props(styles.text, styles.textSecondary)}>
              When using Layout, the layout manages its own padding
              independently from the container padding.
            </p>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button label="Action" variant="primary">
                Action
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Section>
  ),
};

export const PageLayout: Story = {
  render: () => (
    <Section variant="section" width={600} height={300}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <VStack gap={2}>
              <h2 {...stylex.props(styles.text)}>Page Header</h2>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                Welcome to the application
              </p>
            </VStack>
          </LayoutHeader>
        }
        start={
          <LayoutPanel hasDivider width={150}>
            <h3 {...stylex.props(styles.text)}>Sidebar</h3>
          </LayoutPanel>
        }
        content={
          <LayoutContent>
            <VStack gap={2}>
              <h3 {...stylex.props(styles.text)}>Main Content</h3>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                This demonstrates how Layout can be used to create page layouts
                with header, sidebar, and content areas.
              </p>
            </VStack>
          </LayoutContent>
        }
      />
    </Section>
  ),
};

export const FullBleed: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>Default (with padding)</h4>
        <Section variant="muted" width={250}>
          <div style={{backgroundColor: 'rgba(0,100,200,0.2)', padding: 8}}>
            <p {...stylex.props(styles.text)}>Content with section padding</p>
          </div>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>Full Bleed (no padding)</h4>
        <Section variant="muted" width={250} padding={0}>
          <div style={{backgroundColor: 'rgba(0,100,200,0.2)', padding: 8}}>
            <p {...stylex.props(styles.text)}>Content touches section edges</p>
          </div>
        </Section>
      </div>
    </div>
  ),
};

export const NestedPaddingInheritance: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          padding=6 → nested (inherits 6)
        </h4>
        <Section variant="section" width={350} padding={6}>
          <Section variant="muted">
            <p {...stylex.props(styles.text)}>
              Inner section inherits padding=6 from parent. Edge compensation
              and content inset should both use 24px.
            </p>
          </Section>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>padding=6 → nested padding=2</h4>
        <Section variant="section" width={350} padding={6}>
          <Section variant="muted" padding={2}>
            <p {...stylex.props(styles.text)}>
              Inner section explicitly sets padding=2, overriding the parent's
              padding=6. Content inset is 8px.
            </p>
          </Section>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          padding=2 → nested (inherits 2)
        </h4>
        <Section variant="section" width={350} padding={2}>
          <Section variant="muted">
            <p {...stylex.props(styles.text)}>
              Inner section inherits padding=2 from parent. Both edge
              compensation and content inset use 8px.
            </p>
          </Section>
        </Section>
      </div>
    </div>
  ),
};

export const AsymmetricPadding: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>padding=6 (all edges 24px)</h4>
        <Section variant="muted" width={350} padding={6}>
          <p {...stylex.props(styles.text)}>
            The baseline: every edge takes the same spacing step.
          </p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          padding=6 + paddingBlockStart=2 (tight above)
        </h4>
        <Section variant="muted" width={350} padding={6} paddingBlockStart={2}>
          <p {...stylex.props(styles.text)}>
            Only the top edge moves to 8px. Both inline edges and the bottom
            edge stay at 24px — the shape you want under a sticky header.
          </p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          padding=6 + paddingBlockEnd=0 (flush bottom)
        </h4>
        <Section variant="muted" width={350} padding={6} paddingBlockEnd={0}>
          <p {...stylex.props(styles.text)}>
            The bottom edge goes to 0 so content can sit flush against a
            following section, with the inline inset preserved.
          </p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          paddingBlock=6 + paddingBlockEnd=1 (edge beats axis)
        </h4>
        <Section
          variant="muted"
          width={350}
          paddingBlock={6}
          paddingBlockEnd={1}>
          <p {...stylex.props(styles.text)}>
            paddingBlockEnd wins over paddingBlock on its own edge: 24px top,
            4px bottom, inline padding from the theme default.
          </p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          padding=6 + paddingInlineStart=2 (tight leading edge)
        </h4>
        <Section variant="muted" width={350} padding={6} paddingInlineStart={2}>
          <p {...stylex.props(styles.text)}>
            Only the inline-start edge moves to 8px — the left edge in LTR, the
            right edge in RTL. The other three stay at 24px.
          </p>
        </Section>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>
          one prop per edge (1 / 2 / 3 / 4)
        </h4>
        <Section
          variant="muted"
          width={350}
          paddingInlineStart={1}
          paddingInlineEnd={2}
          paddingBlockStart={3}
          paddingBlockEnd={4}>
          <p {...stylex.props(styles.text)}>
            All four edges resolved independently: 4px leading, 8px trailing,
            12px top, 16px bottom.
          </p>
        </Section>
      </div>
    </div>
  ),
};

// ============================================================================
// Scrollable — isScrollable / overflow (issue #2623)
// ============================================================================

export const Scrollable: Story = {
  name: 'Scrollable',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        isScrollable — the section scrolls its own content
      </h4>
      <Section variant="section" width={320} height={200} dividers={['end']}>
        <Section variant="transparent" height="100%" isScrollable>
          <VStack gap={2}>
            {Array.from({length: 14}, (_, i) => (
              <p key={i} {...stylex.props(styles.text)}>
                Row {i + 1}
              </p>
            ))}
          </VStack>
        </Section>
      </Section>
      <p {...stylex.props(styles.text, styles.textSecondary)}>
        Overflow is applied to the padded surface, so the background, the
        dividers and the section&apos;s own padding stay put while the content
        scrolls.
      </p>
    </div>
  ),
};

// ============================================================================
// MultiPane — StackItem sizing + Section isScrollable (issue #2623)
// ============================================================================

export const MultiPane: Story = {
  name: 'Multi-pane (StackItem + isScrollable)',
  render: () => (
    <div {...stylex.props(styles.pageWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Fixed sidebar + detail column that takes the rest
      </h4>
      <HStack height={220} isScrollable>
        <StackItem size="static">
          <Section
            variant="muted"
            width={180}
            height="100%"
            isScrollable
            dividers={['end']}>
            <VStack gap={2}>
              {Array.from({length: 12}, (_, i) => (
                <p key={i} {...stylex.props(styles.text)}>
                  Item {i + 1}
                </p>
              ))}
            </VStack>
          </Section>
        </StackItem>
        <StackItem size="fill" minWidth={320}>
          <Section variant="section" height="100%" isScrollable>
            <VStack gap={2}>
              <p {...stylex.props(styles.text)}>
                This column grows into the leftover space and never shrinks
                below 320px — the strip scrolls horizontally instead.
              </p>
              {Array.from({length: 10}, (_, i) => (
                <p key={i} {...stylex.props(styles.text, styles.textSecondary)}>
                  Detail line {i + 1}
                </p>
              ))}
            </VStack>
          </Section>
        </StackItem>
      </HStack>
    </div>
  ),
};
