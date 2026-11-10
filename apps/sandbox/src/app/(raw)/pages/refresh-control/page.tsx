// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Nothing
 * @output A bare page with a RefreshControl list in a fixed-height card,
 *   above rows that make the document scroll. A pull past the trigger
 *   refreshes for 1.5 s: the list settles below the spinner, then returns to
 *   the top.
 * @position A raw page, with no sandbox chrome, for checking a pull to refresh
 *   on a phone, with motion and under Reduce Motion. The page scrolls with
 *   the document.
 */

import {useCallback, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {REFRESH_REVEAL_VAR, useRefreshControl} from '@astryxdesign/lab';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';

const REFRESH_MS = 1500;

const LIST_ROWS = Array.from(
  {length: 30},
  (_, index) => `Message ${index + 1}`,
);
const PAGE_ROWS = Array.from({length: 30}, (_, index) => `Row ${index + 1}`);

const styles = stylex.create({
  scroller: {height: '100%', overflowY: 'auto'},
  content: {position: 'relative'},
  // The indicator's band sits above the content, inside a box that clips it.
  band: {
    position: 'absolute',
    insetInline: 0,
    bottom: '100%',
    height: '100lvh',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  indicator: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealed: (opacity: string) => ({opacity}),
});

export default function RefreshControlPage() {
  const [count, setCount] = useState(0);
  const onRefresh = useCallback(async () => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, REFRESH_MS);
    });
    setCount(value => value + 1);
  }, []);
  const control = useRefreshControl({onRefresh, announce: 'Refreshing'});
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Refresh control</Heading>
        <Text color="secondary">
          With the messages at the top, pull them down past the spinner and let
          go. They wait below the spinner while the refresh runs, then go back
          to the top.
        </Text>
      </VStack>
      <Text>{`Refreshed ${count} times`}</Text>
      <Card height="60dvh" padding={0}>
        <div
          {...stylex.props(styles.scroller)}
          role="region"
          aria-label="Messages"
          tabIndex={0}>
          <div
            ref={control.contentRef}
            {...stylex.props(styles.content)}
            aria-busy={control.isRefreshing || undefined}>
            <List hasDividers>
              {LIST_ROWS.map(row => (
                <ListItem key={row} label={row} />
              ))}
            </List>
            <div {...stylex.props(styles.band)}>
              <div
                ref={control.indicatorRef}
                aria-hidden
                {...stylex.props(styles.indicator)}>
                <span
                  {...stylex.props(
                    styles.revealed(`var(${REFRESH_REVEAL_VAR}, 0)`),
                  )}>
                  <Spinner size="lg" shade="subtle" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <VStack gap={2}>
        {PAGE_ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}
