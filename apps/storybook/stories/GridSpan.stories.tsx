// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GridSpan.stories.tsx
 * @input Uses Grid and GridSpan with numeric, full, row, long-content, and aligned-row spans
 * @output Component-owned rendered evidence for GridSpan
 * @position Storybook evidence; lets GridSpan-scoped accessibility, RTL, and screenshot audits resolve a story
 */

import type {Meta, StoryObj} from '@storybook/react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  matrix: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
    boxSizing: 'border-box',
    inlineSize: '100%',
    maxInlineSize: 720,
    minInlineSize: 0,
  },
  item: {
    boxSizing: 'border-box',
    padding: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
  },
  // A dashed outline keeps each span's extent visible in every theme and
  // mode, including where the muted fill matches the page surface.
  spanned: {
    boxSizing: 'border-box',
    padding: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
    outline: `1px dashed ${colorVars['--color-border-emphasized']}`,
    outlineOffset: -1,
  },
  tall: {
    minBlockSize: 96,
  },
  narrowHost: {
    maxInlineSize: 240,
    minInlineSize: 0,
  },
});

function Item({
  children,
  isTall,
  auditItem,
}: {
  children: ReactNode;
  isTall?: boolean;
  auditItem?: string;
}) {
  return (
    <div
      data-audit-item={auditItem}
      {...stylex.props(styles.item, isTall && styles.tall)}>
      {children}
    </div>
  );
}

function Spanned({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.spanned)}>{children}</div>;
}

const meta: Meta<typeof GridSpan> = {
  title: 'Core/GridSpan',
  component: GridSpan,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An optional wrapper that makes one Grid item span several columns or rows. `columns="full"` covers every explicit column.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof GridSpan>;

/** Bounded browser fixture for the GridSpan layout contract. */
export const SpanMatrix: Story = {
  render: () => (
    <div {...stylex.props(styles.matrix)}>
      <Grid data-audit-grid="numeric" columns={3} gap={2}>
        <GridSpan data-audit-case="numeric" columns={2}>
          <Spanned>Spans 2 columns</Spanned>
        </GridSpan>
        <Item>One</Item>
      </Grid>

      <Grid data-audit-grid="full" columns={3} gap={2}>
        <GridSpan data-audit-case="full" columns="full">
          <Spanned>Spans every explicit column</Spanned>
        </GridSpan>
        <Item>One</Item>
        <Item>Two</Item>
        <Item>Three</Item>
      </Grid>

      <Grid data-audit-grid="rows" columns={3} gap={2} rowHeight={48}>
        <GridSpan data-audit-case="rows" rows={2}>
          <Spanned>Spans 2 rows</Spanned>
        </GridSpan>
        <Item>One</Item>
        <Item>Two</Item>
        <Item>Three</Item>
        <Item>Four</Item>
      </Grid>

      <div data-audit-host="long-content" {...stylex.props(styles.narrowHost)}>
        <Grid data-audit-grid="long-content" columns={2} gap={2}>
          <GridSpan data-audit-case="long-content" columns="full">
            <Spanned>
              <Text data-audit-text="long-content" type="body" maxLines={1}>
                A long single-line label that is much wider than its 240px grid
                and truncates inside the span
              </Text>
            </Spanned>
          </GridSpan>
        </Grid>
      </div>

      <Grid data-audit-grid="aligned" columns={3} gap={2} align="center">
        <Item isTall>Tall item</Item>
        <Item auditItem="aligned-plain">Short plain item</Item>
        <GridSpan data-audit-case="aligned">
          <Spanned>Short spanned item</Spanned>
        </GridSpan>
      </Grid>
    </div>
  ),
};
