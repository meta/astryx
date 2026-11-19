// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import {
  colorVars,
  spacingVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  container: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  item: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-body'],
    borderRadius: radiusVars['--radius-element'],
    textAlign: 'center',
  },
  featuredItem: {
    padding: spacingVars['--spacing-6'],
    backgroundColor: colorVars['--color-accent-muted'],
    borderRadius: radiusVars['--radius-element'],
    textAlign: 'center',
    height: '100%',
    boxSizing: 'border-box',
  },
  cardImage: {
    height: 120,
    backgroundColor: colorVars['--color-background-body'],
    borderRadius: radiusVars['--radius-element'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  storyWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  sectionLabel: {
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  narrowHost: {
    maxWidth: 500,
    minWidth: 0,
    outline: `1px dashed ${colorVars['--color-border-emphasized']}`,
  },
  auditHost: {
    boxSizing: 'border-box',
    inlineSize: '100%',
    maxInlineSize: 720,
    minInlineSize: 0,
  },
});

const meta: Meta<typeof Grid> = {
  title: 'Core/Grid',
  component: Grid,
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'object',
      description:
        'Column configuration: number for fixed columns, or {minWidth, max?, repeat?} for responsive',
    },
    gap: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Spacing between all grid items',
    },
    rowGap: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Spacing between rows (overrides gap)',
    },
    columnGap: {
      control: 'select',
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Spacing between columns (overrides gap)',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end', 'stretch'],
      description: 'Vertical alignment of grid items',
    },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'stretch'],
      description: 'Horizontal alignment of grid items',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Grid>;

const GridItem = ({children}: {children: React.ReactNode}) => (
  <div {...stylex.props(styles.item)}>
    <Text type="body">{children}</Text>
  </div>
);

const FeaturedItem = ({children}: {children: React.ReactNode}) => (
  <div {...stylex.props(styles.featuredItem)}>
    <Text type="body">{children}</Text>
  </div>
);

export const Default: Story = {
  args: {
    columns: 3,
    gap: 4,
  },
  render: args => (
    <div {...stylex.props(styles.container)}>
      <Grid {...args}>
        <GridItem>Item 1</GridItem>
        <GridItem>Item 2</GridItem>
        <GridItem>Item 3</GridItem>
        <GridItem>Item 4</GridItem>
        <GridItem>Item 5</GridItem>
        <GridItem>Item 6</GridItem>
      </Grid>
    </div>
  ),
};

export const FixedColumns: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          2 Columns
        </Text>
        <Grid columns={2} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
          <GridItem>Item 3</GridItem>
          <GridItem>Item 4</GridItem>
        </Grid>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          4 Columns
        </Text>
        <Grid columns={4} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
          <GridItem>Item 3</GridItem>
          <GridItem>Item 4</GridItem>
          <GridItem>Item 5</GridItem>
          <GridItem>Item 6</GridItem>
          <GridItem>Item 7</GridItem>
          <GridItem>Item 8</GridItem>
        </Grid>
      </div>
    </div>
  ),
};

/**
 * auto-fit (repeat: 'fit') stretches items to fill when there are fewer
 * items than available columns. Compare with auto-fill (default) which
 * preserves consistent widths.
 */
export const ResponsiveAutoFit: Story = {
  render: () => (
    <VStack gap={6}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          {
            "columns={{minWidth: 200, repeat: 'fit'}} with 2 items — cards stretch to fill"
          }
        </Text>
        <Grid columns={{minWidth: 200, repeat: 'fit'}} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
        </Grid>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          Same auto-fit grid with 6 items; items fill the available tracks
        </Text>
        <Grid columns={{minWidth: 200, repeat: 'fit'}} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
          <GridItem>Item 3</GridItem>
          <GridItem>Item 4</GridItem>
          <GridItem>Item 5</GridItem>
          <GridItem>Item 6</GridItem>
        </Grid>
      </div>
    </VStack>
  ),
};

/** New API: responsive columns with auto-fill (consistent widths) */
export const ResponsiveAutoFill: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Resize the viewport — columns auto-fill, empty tracks preserved (min
        200px per item)
      </Text>
      <Grid columns={{minWidth: 200}} gap={4}>
        <GridItem>Item 1</GridItem>
        <GridItem>Item 2</GridItem>
        <GridItem>Item 3</GridItem>
      </Grid>
    </div>
  ),
};

/** Side-by-side comparison: auto-fill vs auto-fit with few items */
export const FillVsFitComparison: Story = {
  render: () => (
    <VStack gap={6}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          auto-fill (default) — items stay consistent width, empty tracks
          preserved
        </Text>
        <Grid columns={{minWidth: 250}} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
        </Grid>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          auto-fit — items stretch to fill all available space
        </Text>
        <Grid columns={{minWidth: 250, repeat: 'fit'}} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
        </Grid>
      </div>
    </VStack>
  ),
};

export const CappedResponsive: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Responsive with max 3 columns (min 250px per item; column count is
        capped but present columns always fill)
      </Text>
      <Grid columns={{minWidth: 250, max: 3}} gap={4}>
        <GridItem>Item 1</GridItem>
        <GridItem>Item 2</GridItem>
        <GridItem>Item 3</GridItem>
        <GridItem>Item 4</GridItem>
        <GridItem>Item 5</GridItem>
        <GridItem>Item 6</GridItem>
      </Grid>
    </div>
  ),
};

export const CappedCollapsesToFullWidth: Story = {
  name: 'Capped — fills when collapsed (#3391)',
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        columns={'{{minWidth: 360, max: 2}}'} — resize the viewport narrow
        enough that only one column fits. The lone column stretches to full
        width (no dead space on the right); on wider viewports it caps at 2.
      </Text>
      <div style={{maxWidth: 520, resize: 'horizontal', overflow: 'auto'}}>
        <Grid columns={{minWidth: 360, max: 2}} gap={4}>
          <GridItem>Left block</GridItem>
          <GridItem>Right block</GridItem>
        </Grid>
      </div>
    </div>
  ),
};

export const WithGridSpan: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Using GridSpan to span multiple columns/rows
      </Text>
      <Grid columns={4} gap={4}>
        <GridSpan columns={2}>
          <FeaturedItem>Spans 2 columns</FeaturedItem>
        </GridSpan>
        <GridItem>Normal</GridItem>
        <GridItem>Normal</GridItem>
        <GridItem>Normal</GridItem>
        <GridSpan columns={3}>
          <FeaturedItem>Spans 3 columns</FeaturedItem>
        </GridSpan>
        <GridSpan columns="full">
          <FeaturedItem>Full width (spans all columns)</FeaturedItem>
        </GridSpan>
      </Grid>
    </div>
  ),
};

const longTokens: SearchableItem[] = [
  {id: 'short', label: 'Design'},
  {
    id: 'long',
    label:
      'A long token label with spaces that is much wider than the 500px grid cell it sits in, so it has to truncate',
  },
];

const longTokenSource = {
  search: () => longTokens,
  bootstrap: () => longTokens,
};

export const GridSpanWithLongContent: Story = {
  name: 'GridSpan contains a long token (#7438)',
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        The dashed box is 500px wide. The long token truncates inside it.
      </Text>
      <div data-testid="host" {...stylex.props(styles.narrowHost)}>
        <Grid columns={{minWidth: 280, max: 2}} gap={4}>
          <GridSpan columns="full">
            <VStack>
              <Tokenizer
                label="Labels"
                width="100%"
                searchSource={longTokenSource}
                value={longTokens}
                onChange={() => {}}
              />
            </VStack>
          </GridSpan>
        </Grid>
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    const host = canvasElement.querySelector('[data-testid="host"]');
    const span = host?.querySelector('.astryx-grid-span');
    const field = span?.firstElementChild;
    if (!host || !span || !field) {
      throw new Error('Expected the host, its GridSpan and the field stack');
    }
    // The span's single column must not grow past the host to fit a token.
    const hostRight = host.getBoundingClientRect().right;
    await expect(span.getBoundingClientRect().right).toBeLessThanOrEqual(
      hostRight + 0.5,
    );
    await expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
      hostRight + 0.5,
    );
  },
};

export const GridSpanWithRows: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Grid items spanning both columns and rows
      </Text>
      <Grid columns={4} gap={4}>
        <GridSpan columns={2} rows={2}>
          <FeaturedItem>2x2 Featured</FeaturedItem>
        </GridSpan>
        <GridItem>Item 1</GridItem>
        <GridItem>Item 2</GridItem>
        <GridItem>Item 3</GridItem>
        <GridItem>Item 4</GridItem>
        <GridItem>Item 5</GridItem>
        <GridItem>Item 6</GridItem>
      </Grid>
    </div>
  ),
};

export const GalleryExample: Story = {
  render: () => (
    <Section variant="muted">
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Gallery/Card Grid — Responsive with min 280px cards (auto-fill)
      </Text>
      <Grid columns={{minWidth: 280}} gap={5}>
        {Array.from({length: 8}, (_, i) => (
          <Card key={i}>
            <div {...stylex.props(styles.cardImage)} />
            <Text type="label" display="block">
              Card Title {i + 1}
            </Text>
            <Text type="supporting" display="block">
              A brief description of the card content goes here.
            </Text>
          </Card>
        ))}
      </Grid>
    </Section>
  ),
};

export const DifferentGaps: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          Same gap for rows and columns (gap=4)
        </Text>
        <Grid columns={3} gap={4}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
          <GridItem>Item 3</GridItem>
          <GridItem>Item 4</GridItem>
          <GridItem>Item 5</GridItem>
          <GridItem>Item 6</GridItem>
        </Grid>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          Different gaps: rowGap=2, columnGap=6
        </Text>
        <Grid columns={3} rowGap={2} columnGap={6}>
          <GridItem>Item 1</GridItem>
          <GridItem>Item 2</GridItem>
          <GridItem>Item 3</GridItem>
          <GridItem>Item 4</GridItem>
          <GridItem>Item 5</GridItem>
          <GridItem>Item 6</GridItem>
        </Grid>
      </div>
    </div>
  ),
};

export const DashboardLayout: Story = {
  render: () => (
    <Section variant="muted">
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Dashboard-style layout with different sized widgets
      </Text>
      <Grid columns={4} gap={4}>
        <GridSpan columns={2} rows={2}>
          <Card>
            <Text type="label" display="block">
              Main Chart
            </Text>
            <Text type="supporting" display="block">
              Large visualization widget
            </Text>
          </Card>
        </GridSpan>
        <Card>
          <Text type="label" display="block">
            Metric 1
          </Text>
          <Text type="supporting" display="block">
            Quick stat
          </Text>
        </Card>
        <Card>
          <Text type="label" display="block">
            Metric 2
          </Text>
          <Text type="supporting" display="block">
            Quick stat
          </Text>
        </Card>
        <Card>
          <Text type="label" display="block">
            Metric 3
          </Text>
          <Text type="supporting" display="block">
            Quick stat
          </Text>
        </Card>
        <Card>
          <Text type="label" display="block">
            Metric 4
          </Text>
          <Text type="supporting" display="block">
            Quick stat
          </Text>
        </Card>
        <GridSpan columns="full">
          <Card>
            <Text type="label" display="block">
              Full-width Section
            </Text>
            <Text type="supporting" display="block">
              This section spans all explicit columns
            </Text>
          </Card>
        </GridSpan>
      </Grid>
    </Section>
  ),
};

/** Bounded browser fixture for the Grid and GridSpan public layout contract. */
export const AuditMatrix: Story = {
  parameters: {layout: 'padded'},
  render: () => (
    <div
      data-testid="grid-audit-host"
      {...stylex.props(styles.storyWrapper, styles.auditHost)}>
      <Grid data-testid="grid-audit-fixed" columns={3} gap={2}>
        <GridItem>One</GridItem>
        <GridItem>Two</GridItem>
        <GridItem>Three</GridItem>
      </Grid>

      <Grid
        data-testid="grid-audit-responsive"
        columns={{minWidth: 180, max: 3}}
        gap={2}>
        <GridItem>One</GridItem>
        <GridItem>Two</GridItem>
        <GridItem>Three</GridItem>
      </Grid>

      <Grid data-testid="grid-audit-fill" columns={{minWidth: 160}} gap={2}>
        <GridItem>Fill one</GridItem>
        <GridItem>Fill two</GridItem>
      </Grid>

      <Grid
        data-testid="grid-audit-fit"
        columns={{minWidth: 160, repeat: 'fit'}}
        gap={2}>
        <GridItem>Fit one</GridItem>
        <GridItem>Fit two</GridItem>
      </Grid>

      <Grid data-testid="grid-audit-span-grid" columns={3} gap={2}>
        <GridSpan data-testid="grid-audit-span" columns="full">
          <GridItem>All explicit columns</GridItem>
        </GridSpan>
        <GridItem>One</GridItem>
        <GridItem>Two</GridItem>
        <GridItem>Three</GridItem>
      </Grid>
    </div>
  ),
  play: async ({canvasElement}) => {
    const host = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-host"]',
    );
    const fixed = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-fixed"]',
    );
    const responsive = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-responsive"]',
    );
    const fill = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-fill"]',
    );
    const fit = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-fit"]',
    );
    const spanGrid = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-span-grid"]',
    );
    const span = canvasElement.querySelector<HTMLElement>(
      '[data-testid="grid-audit-span"]',
    );
    if (!host || !fixed || !responsive || !fill || !fit || !spanGrid || !span) {
      throw new Error('Expected the complete Grid audit fixture');
    }

    await expect(fixed).toHaveClass('astryx-grid');
    await expect(span).toHaveClass('astryx-grid-span');
    await expect(getComputedStyle(fixed).display).toBe('grid');

    const direction = getComputedStyle(fixed).direction;
    const fixedItems = Array.from(fixed.children) as HTMLElement[];
    const fixedStarts = fixedItems.map(
      item => item.getBoundingClientRect().left,
    );
    if (direction === 'rtl') {
      await expect(fixedStarts[0]).toBeGreaterThan(fixedStarts[1]);
      await expect(fixedStarts[1]).toBeGreaterThan(fixedStarts[2]);
    } else {
      await expect(fixedStarts[0]).toBeLessThan(fixedStarts[1]);
      await expect(fixedStarts[1]).toBeLessThan(fixedStarts[2]);
    }

    const hostRight = host.getBoundingClientRect().right;
    for (const grid of [fixed, responsive, fill, fit, spanGrid]) {
      await expect(grid.getBoundingClientRect().right).toBeLessThanOrEqual(
        hostRight + 0.5,
      );
    }
    await expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);

    const responsiveStyle = getComputedStyle(responsive);
    const responsiveTracks = responsiveStyle.gridTemplateColumns
      .split(' ')
      .filter(Boolean).length;
    const responsiveGap = Number.parseFloat(responsiveStyle.columnGap) || 0;
    const expectedResponsiveTracks = Math.min(
      3,
      Math.max(
        1,
        Math.floor(
          (responsive.clientWidth + responsiveGap) / (180 + responsiveGap),
        ),
      ),
    );
    await expect(responsiveTracks).toBe(expectedResponsiveTracks);
    if (expectedResponsiveTracks === 3) {
      const fillWidth = (
        fill.firstElementChild as HTMLElement
      ).getBoundingClientRect().width;
      const fitWidth = (
        fit.firstElementChild as HTMLElement
      ).getBoundingClientRect().width;
      await expect(fitWidth).toBeGreaterThan(fillWidth);
    }

    const gridRect = spanGrid.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    await expect(Math.abs(spanRect.left - gridRect.left)).toBeLessThanOrEqual(
      0.5,
    );
    await expect(Math.abs(spanRect.right - gridRect.right)).toBeLessThanOrEqual(
      0.5,
    );
  },
};
