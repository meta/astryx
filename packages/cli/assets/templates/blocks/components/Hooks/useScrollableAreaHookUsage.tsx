// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useScrollableArea} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';

const TOP_SHADOW = `inset 0 12px 8px -8px ${colorVars['--color-shadow']}`;
const BOTTOM_SHADOW = `inset 0 -12px 8px -8px ${colorVars['--color-shadow']}`;

const styles = stylex.create({
  viewport: {
    height: 160,
  },
  shadowTop: {
    boxShadow: TOP_SHADOW,
  },
  shadowBottom: {
    boxShadow: BOTTOM_SHADOW,
  },
  shadowBoth: {
    boxShadow: `${TOP_SHADOW}, ${BOTTOM_SHADOW}`,
  },
});

const ACTIVITY = [
  'Maya created the Checkout project',
  'Sam invited Lee',
  'Build 318 passed',
  'Lee opened "Card total rounds down"',
  'Maya deployed 1.4.2 to staging',
  'Build 319 failed',
  'Sam fixed the rounding test',
  'Build 320 passed',
  'Maya deployed 1.4.3 to production',
  'Lee closed "Card total rounds down"',
];

export default function UseScrollableAreaHookUsage() {
  const [count, setCount] = useState(3);
  const {getViewportProps, getContentProps, state} = useScrollableArea({
    axis: 'block',
    keyboardAccess: {owner: 'viewport', label: 'Activity log'},
    overscroll: 'contain',
  });
  const {isScrollable, atStart, atEnd} = state.block;
  const hiddenAbove = isScrollable && !atStart;
  const hiddenBelow = isScrollable && !atEnd;

  return (
    <Card width={320} padding={4}>
      <VStack gap={3}>
        <HStack justify="between" vAlign="center">
          <Heading level={4}>Activity log</Heading>
          <Button
            label="Add entry"
            variant="secondary"
            isDisabled={count === ACTIVITY.length}
            onClick={() => setCount(count + 1)}
          />
        </HStack>
        <div
          {...getViewportProps(
            stylex.props(
              styles.viewport,
              hiddenAbove && hiddenBelow
                ? styles.shadowBoth
                : hiddenAbove
                  ? styles.shadowTop
                  : hiddenBelow && styles.shadowBottom,
            ),
          )}>
          <VStack {...getContentProps()} gap={2}>
            {ACTIVITY.slice(0, count).map(entry => (
              <Text key={entry} type="body">
                {entry}
              </Text>
            ))}
          </VStack>
        </div>
      </VStack>
    </Card>
  );
}
