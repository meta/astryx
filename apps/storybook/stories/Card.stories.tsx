// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {
  VStack,
  HStack,
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {
  colorVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
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
  // Lets the ThemeAddedVariant story's card colour reach its own text.
  textInherit: {
    color: 'inherit',
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
  narrowContainer: {
    width: 320,
  },
  frames: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  frame: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border'],
    borderRadius: 8,
  },
  frame320: {width: 320},
  frame390: {width: 390},
});

const meta: Meta<typeof Card> = {
  title: 'Core/Card',
  component: Card,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div {...stylex.props(styles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    width: {
      control: {type: 'range', min: 100, max: 800, step: 10},
      description: 'Width in pixels',
    },
    height: {
      control: {type: 'range', min: 100, max: 600, step: 10},
      description: 'Height in pixels',
    },
    maxWidth: {
      control: {type: 'range', min: 100, max: 800, step: 10},
      description: 'Maximum width in pixels',
    },
    minHeight: {
      control: {type: 'range', min: 100, max: 600, step: 10},
      description: 'Minimum height in pixels',
    },
    elevation: {
      control: {type: 'inline-radio'},
      options: ['none', 'low', 'med', 'high'],
      description: 'Resting shadow depth',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    width: 300,
  },
  render: args => (
    <Card {...args}>
      <p {...stylex.props(styles.text)}>
        Simple content inside a card. The card provides default padding via the
        --container-padding CSS variable.
      </p>
    </Card>
  ),
};

export const WithSimpleContent: Story = {
  render: () => (
    <Card width={320}>
      <VStack gap={2}>
        <Heading level={3}>Card Title</Heading>
        <p {...stylex.props(styles.text, styles.textSecondary)}>
          This card contains simple content without Layout. The container
          padding is applied automatically.
        </p>
      </VStack>
    </Card>
  ),
};

export const Elevations: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      {(['none', 'low', 'med', 'high'] as const).map(elevation => (
        <VStack key={elevation} gap={2}>
          <p {...stylex.props(styles.heading)}>
            elevation=&quot;{elevation}&quot;
          </p>
          <Card width={220} elevation={elevation}>
            <VStack gap={1}>
              <Heading level={3}>{elevation}</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                Resting at the {elevation} shadow level.
              </p>
            </VStack>
          </Card>
        </VStack>
      ))}
    </div>
  ),
};

export const WithInnerLayout: Story = {
  render: () => (
    <Card width={350}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={3}>Card with Layout</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <p {...stylex.props(styles.text, styles.textSecondary)}>
              When using Layout, the layout uses negative margin to escape the
              container padding, then manages its own padding.
            </p>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="secondary">
                Cancel
              </Button>
              <Button label="Save" variant="primary">
                Save
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Card>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>Small (200px)</h4>
        <Card width={200}>
          <p {...stylex.props(styles.text)}>Small card</p>
        </Card>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>Medium (300px)</h4>
        <Card width={300}>
          <p {...stylex.props(styles.text)}>Medium card</p>
        </Card>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>Large (400px)</h4>
        <Card width={400}>
          <p {...stylex.props(styles.text)}>Large card</p>
        </Card>
      </div>
    </div>
  ),
};

export const FixedHeight: Story = {
  render: () => (
    <Card width={300} height={200}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={3}>Fixed Height Card</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <p {...stylex.props(styles.text, styles.textSecondary)}>
              This card has a fixed height. Content area will scroll if needed.
            </p>
          </LayoutContent>
        }
      />
    </Card>
  ),
};

export const NestedCards: Story = {
  render: () => (
    <Card width={400}>
      <VStack gap={3}>
        <Heading level={3}>Parent Card</Heading>
        <Card width="100%">
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            Nested card resets --container-padding and gets its own padding.
          </p>
        </Card>
        <Card width="100%">
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            Another nested card with independent padding.
          </p>
        </Card>
      </VStack>
    </Card>
  ),
};

export const NestedSections: Story = {
  render: () => (
    <Card width={400}>
      <Section variant="transparent" dividers={['bottom']}>
        <VStack gap={2}>
          <Heading level={3}>First Section</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            This section escapes the card padding on top and sides because it's
            the first child.
          </p>
        </VStack>
      </Section>
      <Section variant="transparent" dividers={['bottom']}>
        <VStack gap={2}>
          <Heading level={3}>Middle Section</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            Middle sections only escape horizontal padding, maintaining visual
            separation from adjacent sections.
          </p>
        </VStack>
      </Section>
      <Section variant="transparent">
        <VStack gap={2}>
          <Heading level={3}>Last Section</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            This section escapes the card padding on bottom and sides because
            it's the last child.
          </p>
        </VStack>
      </Section>
    </Card>
  ),
};

export const SingleSection: Story = {
  render: () => (
    <Card width={350}>
      <Section variant="muted">
        <VStack gap={2}>
          <Heading level={3}>Only Section (Full Bleed All Sides)</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            When a section is both first and last child, it gets full bleed on
            all four sides, completely filling the card.
          </p>
        </VStack>
      </Section>
    </Card>
  ),
};

export const MixedContent: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>Simple Content</h4>
        <Card width={250}>
          <VStack gap={2}>
            <Heading level={3}>Card Title</Heading>
            <p {...stylex.props(styles.text, styles.textSecondary)}>
              Regular content uses the card's container padding.
            </p>
          </VStack>
        </Card>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>With Section</h4>
        <Card width={250}>
          <Section variant="muted">
            <VStack gap={2}>
              <Heading level={3}>Card Title</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                Section content bleeds to the card edges.
              </p>
            </VStack>
          </Section>
        </Card>
      </div>
    </div>
  ),
};

export const FullBleed: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>Default (with padding)</h4>
        <Card width={250}>
          <div style={{backgroundColor: 'rgba(0,100,200,0.2)', padding: 8}}>
            <p {...stylex.props(styles.text)}>Content with card padding</p>
          </div>
        </Card>
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>Full Bleed (no padding)</h4>
        <Card width={250} padding={0}>
          <div style={{backgroundColor: 'rgba(0,100,200,0.2)', padding: 8}}>
            <p {...stylex.props(styles.text)}>Content touches card edges</p>
          </div>
        </Card>
      </div>
    </div>
  ),
};

/**
 * Cards shown on top of different background treatments.
 * Demonstrates the visual contrast between cards on wash (gray)
 * backgrounds vs surface (white) backgrounds.
 */
export const OnBackgrounds: Story = {
  decorators: [Story => <Story />],
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
      <div {...stylex.props(styles.pageWrapper)}>
        <h4 {...stylex.props(styles.heading)}>Cards on wash background</h4>
        <div {...stylex.props(styles.storyWrapper)}>
          <Card width={250}>
            <VStack gap={2}>
              <Heading level={3}>Card on Wash</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                Cards stand out clearly against the wash background, creating a
                layered visual hierarchy.
              </p>
            </VStack>
          </Card>
          <Card width={250}>
            <VStack gap={2}>
              <Heading level={3}>Another Card</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                Multiple cards on wash create a dashboard-like layout.
              </p>
            </VStack>
          </Card>
        </div>
      </div>
      <Section variant="section" width="100%">
        <h4 {...stylex.props(styles.heading)}>Cards on surface section</h4>
        <div {...stylex.props(styles.storyWrapper)}>
          <Card width={250}>
            <VStack gap={2}>
              <Heading level={3}>Card on Surface</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                On a surface background, cards are more subtle since both share
                the same base color.
              </p>
            </VStack>
          </Card>
          <Card width={250}>
            <VStack gap={2}>
              <Heading level={3}>Another Card</Heading>
              <p {...stylex.props(styles.text, styles.textSecondary)}>
                The card border provides separation from the surface.
              </p>
            </VStack>
          </Card>
        </div>
      </Section>
    </div>
  ),
};

/**
 * Callout card: a muted card used as a callout/highlight area.
 * Uses `variant="muted"` directly on Card instead of wrapping content
 * in a wash section — simpler and semantically cleaner.
 */
export const Callout: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <Card width={350} variant="muted">
        <VStack gap={2}>
          <Heading level={3}>💡 Tip</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            Use <code>variant="muted"</code> for callouts, tips, or highlighted
            information. The muted background provides visual contrast without
            needing a nested section.
          </p>
        </VStack>
      </Card>
      <Card width={350} variant="muted">
        <VStack gap={2}>
          <Heading level={3}>⚠️ Warning</Heading>
          <p {...stylex.props(styles.text, styles.textSecondary)}>
            Muted cards work well for alerts and warnings too.
          </p>
        </VStack>
      </Card>
    </div>
  ),
};

/**
 * All background color variants in one view.
 * `muted` uses the wash background for de-emphasised cards;
 * the non-semantic variants use the `--color-<name>-background` token.
 */
export const ColorVariants: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      {(
        [
          'default',
          'muted',
          'blue',
          'cyan',
          'gray',
          'green',
          'orange',
          'pink',
          'purple',
          'red',
          'teal',
          'yellow',
        ] as const
      ).map(variant => (
        <div key={variant}>
          <h4 {...stylex.props(styles.heading)}>{variant}</h4>
          <Card width={160} variant={variant}>
            <p {...stylex.props(styles.text)}>{variant}</p>
          </Card>
        </div>
      ))}
    </div>
  ),
};

/**
 * `brand` is not one of Card's variants. The theme adds it: the module
 * augmentation widens `CardVariantMap` so `variant="brand"` type-checks, and
 * `card['variant:brand']` supplies the paint. Card itself has no style for the
 * value, so it falls through to base styles and the theme rule is what shows —
 * here an accent fill no built-in variant produces.
 *
 * The added variant is background-only, which is the shape the axis carries:
 * Card subtracts a border's width from its padding for `default` alone, so a
 * theme rule that paints a border sits a border-width proud of the cards
 * beside it. That is true of a theme override on a built-in variant today and
 * is not this axis to fix.
 */
declare module '@astryxdesign/core/Card' {
  interface CardVariantMap {
    brand: true;
  }
}

const brandVariantTheme = defineTheme({
  name: 'card-brand-variant-demo',
  components: {
    card: {
      'variant:brand': {
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        // The ring for a variant Card has never seen: the theme picks it,
        // because no token the component could pick is guaranteed to contrast
        // with this fill.
        '--selectable-card-ring-color': 'var(--color-on-accent)',
      },
    },
  },
});

export const ThemeAddedVariant: Story = {
  render: () => (
    <Theme theme={brandVariantTheme} mode="light">
      <div {...stylex.props(styles.storyWrapper)}>
        <div>
          <h4 {...stylex.props(styles.heading)}>brand (added by the theme)</h4>
          <Card width={200} variant="brand">
            <p {...stylex.props(styles.text, styles.textInherit)}>brand</p>
          </Card>
        </div>
        <div>
          <h4 {...stylex.props(styles.heading)}>default (built in)</h4>
          <Card width={200}>
            <p {...stylex.props(styles.text)}>default</p>
          </Card>
        </div>
        <div>
          <h4 {...stylex.props(styles.heading)}>brand, selected</h4>
          <SelectableCard
            label="brand, selected"
            isSelected
            onChange={() => {}}
            variant="brand"
            width={200}>
            <p {...stylex.props(styles.text, styles.textInherit)}>selected</p>
          </SelectableCard>
        </div>
        <div>
          <h4 {...stylex.props(styles.heading)}>brand, unselected</h4>
          <SelectableCard
            label="brand, unselected"
            isSelected={false}
            onChange={() => {}}
            variant="brand"
            width={200}>
            <p {...stylex.props(styles.text, styles.textInherit)}>unselected</p>
          </SelectableCard>
        </div>
      </div>
    </Theme>
  ),
};

/**
 * A card with no children, and one with a minimum height. An empty card holds
 * its padding and radius rather than collapsing, so a placeholder or a loading
 * shell keeps the surrounding layout stable.
 */
export const Empty: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div>
        <h4 {...stylex.props(styles.heading)}>No children</h4>
        <Card width={250} />
      </div>
      <div>
        <h4 {...stylex.props(styles.heading)}>No children, minHeight 120</h4>
        <Card width={250} minHeight={120} />
      </div>
    </div>
  ),
};

/**
 * Long prose and a title long enough to wrap, in a fixed-width card. Text wraps
 * and the card grows to fit. Most languages run longer than English, so this is
 * the state translated copy lands in.
 */
export const LongContent: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <Card width={280}>
        <VStack gap={2}>
          <Heading level={3}>
            A card title long enough to wrap onto several lines
          </Heading>
          <p {...stylex.props(styles.text)}>
            Cards grow to fit their content, so a long description keeps
            wrapping rather than being cut off. Sibling cards in a grid stay
            aligned on their top edge and the tallest one sets the row height.
          </p>
        </VStack>
      </Card>
    </div>
  ),
};

/**
 * A card with no width prop inside a 320px container: the width comes from the
 * parent, so the card reflows to the container instead of forcing horizontal
 * scroll on a narrow screen.
 */
export const NarrowContainer: Story = {
  render: () => (
    <div {...stylex.props(styles.narrowContainer)}>
      <Card>
        <VStack gap={2}>
          <Heading level={3}>Narrow container</Heading>
          <p {...stylex.props(styles.text)}>
            The card fills the container it is given.
          </p>
        </VStack>
      </Card>
    </div>
  ),
};

const payouts = [
  {label: 'Payout', amount: '$1,240.00', id: 'po_1Q8ZK4X7M2N5P3R6T9V1W4YB'},
  {label: 'Refund', amount: '-$86.50', id: 're_3NfK9Lm2Qx7Vb4Tz8Rw1Hy6C'},
  {label: 'Adjustment', amount: '$12.00', id: 'adj_7Hq2Wm9Kx4Lz8Vn3Rb6Tf1PD'},
];

function PayoutCard({
  payout,
  truncateId,
}: {
  payout: (typeof payouts)[number];
  truncateId?: boolean;
}) {
  return (
    <Card>
      <VStack gap={1}>
        <Heading level={3}>{payout.label}</Heading>
        <Text hasTabularNumbers>{payout.amount}</Text>
        <Text type="supporting" maxLines={truncateId ? 1 : undefined}>
          {payout.id}
        </Text>
      </VStack>
    </Card>
  );
}

function RowFrame({
  label,
  width,
  children,
}: {
  label: string;
  width?: 320 | 390;
  children: ReactNode;
}) {
  return (
    <div>
      <p {...stylex.props(styles.heading)}>{label}</p>
      <div
        {...stylex.props(
          styles.frame,
          width === 320 && styles.frame320,
          width === 390 && styles.frame390,
        )}>
        {children}
      </div>
    </div>
  );
}

/**
 * Three cards sharing a row in 320px and 390px frames and at full width.
 * Each card shrinks to its HStack share or Grid track instead of widening
 * the row to fit its longest unbroken value, so the row stays inside the
 * frame. A value that cannot wrap is clipped at the card edge (the raw IDs
 * in the first two frames); the Grid frames truncate it with
 * `maxLines={1}`, the recommended form, which shows the full value in a
 * tooltip.
 */
export const InNarrowRow: Story = {
  render: () => (
    <div {...stylex.props(styles.frames)}>
      <RowFrame
        label="HStack, 390px frame, raw IDs (clipped at the card edge)"
        width={390}>
        <HStack gap={3}>
          {payouts.map(payout => (
            <PayoutCard key={payout.id} payout={payout} />
          ))}
        </HStack>
      </RowFrame>
      <RowFrame label="HStack, 320px frame, raw IDs" width={320}>
        <HStack gap={3}>
          {payouts.map(payout => (
            <PayoutCard key={payout.id} payout={payout} />
          ))}
        </HStack>
      </RowFrame>
      <RowFrame
        label="Grid columns={3}, 390px frame, IDs truncated with maxLines={1}"
        width={390}>
        <Grid columns={3} gap={3}>
          {payouts.map(payout => (
            <PayoutCard key={payout.id} payout={payout} truncateId />
          ))}
        </Grid>
      </RowFrame>
      <RowFrame
        label="Grid columns={3}, 320px frame, IDs truncated"
        width={320}>
        <Grid columns={3} gap={3}>
          {payouts.map(payout => (
            <PayoutCard key={payout.id} payout={payout} truncateId />
          ))}
        </Grid>
      </RowFrame>
      <RowFrame label="Grid columns={3}, full width (unchanged)">
        <Grid columns={3} gap={3}>
          {payouts.map(payout => (
            <PayoutCard key={payout.id} payout={payout} truncateId />
          ))}
        </Grid>
      </RowFrame>
    </div>
  ),
};
