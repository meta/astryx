// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HStack.stories.tsx
 * @input Uses HStack with default, aligned, alias, precedence, and wrapping rows
 * @output Component-owned rendered evidence for HStack
 * @position Storybook evidence; lets HStack-scoped accessibility, RTL, and screenshot audits resolve an HStack story
 */

import type {Meta, StoryObj} from '@storybook/react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {HStack} from '@astryxdesign/core/HStack';
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
    gap: spacingVars['--spacing-4'],
    boxSizing: 'border-box',
    paddingBlock: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-4'],
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  // An outline keeps each stack's box visible in every theme and mode.
  box: {
    boxSizing: 'border-box',
    outline: `1px dashed ${colorVars['--color-border-emphasized']}`,
    outlineOffset: -1,
    borderRadius: radiusVars['--radius-element'],
  },
  item: {
    boxSizing: 'border-box',
    inlineSize: 24,
    blockSize: 24,
    flexShrink: 0,
    backgroundColor: colorVars['--color-accent'],
    borderRadius: radiusVars['--radius-inner'],
  },
});

const BOX = {width: 240, height: 64};

function Items({count = 3}: {count?: number}) {
  return (
    <>
      {Array.from({length: count}, (_, index) => (
        <div
          key={index}
          data-audit-item={index}
          {...stylex.props(styles.item)}
        />
      ))}
    </>
  );
}

function Row({label, children}: {label: string; children: ReactNode}) {
  return (
    <div {...stylex.props(styles.row)}>
      <Text type="supporting">{label}</Text>
      {children}
    </div>
  );
}

const meta: Meta<typeof HStack> = {
  title: 'Core/HStack',
  component: HStack,
};

export default meta;
type Story = StoryObj<typeof HStack>;

/**
 * Rows of HStack in fixed boxes: the default flow from the inline start, the
 * main and cross axes set by `hAlign`/`vAlign` and by their `justify`/`align`
 * aliases, an explicit alignment winning over its alias, and wrapping.
 */
export const AlignmentMatrix: Story = {
  render: () => (
    <div {...stylex.props(styles.matrix)}>
      <Row label="Default">
        <HStack data-audit-case="default" gap={2} {...BOX} xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="hAlign end">
        <HStack
          data-audit-case="h-end"
          gap={2}
          hAlign="end"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="justify between">
        <HStack
          data-audit-case="justify-between"
          justify="between"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="hAlign center over justify end">
        <HStack
          data-audit-case="h-wins"
          gap={2}
          hAlign="center"
          justify="end"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="vAlign center">
        <HStack
          data-audit-case="v-center"
          gap={2}
          vAlign="center"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="align end">
        <HStack
          data-audit-case="align-end"
          gap={2}
          align="end"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="vAlign start over align end">
        <HStack
          data-audit-case="v-wins"
          gap={2}
          vAlign="start"
          align="end"
          {...BOX}
          xstyle={styles.box}>
          <Items />
        </HStack>
      </Row>
      <Row label="wrap">
        <HStack
          data-audit-case="wrap"
          gap={2}
          wrap="wrap"
          width={120}
          xstyle={styles.box}>
          <Items count={6} />
        </HStack>
      </Row>
    </div>
  ),
};
