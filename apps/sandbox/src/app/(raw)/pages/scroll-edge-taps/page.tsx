// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=`: done (the default), strip or refresh
 * @output A bare page with one case in a fixed-height card, above rows that
 *   make the document scroll. In done, a NavigationStack's pushed screen has
 *   a "Done" row that pops to the root. In strip, a strip of cards starts at
 *   the pushed screen's edge. In refresh, a RefreshControl list reports the
 *   row a tap ran on and refreshes on a pull at its top.
 * @position A raw page, with no sandbox chrome, for checking taps and pulls
 *   at a scroll edge on a phone. The page scrolls with the document.
 */

import {Suspense, useCallback, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {
  NavigationScreen,
  NavigationStack,
  REFRESH_REVEAL_VAR,
  useNavigationStack,
  useRefreshControl,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';

type EdgeCase = 'done' | 'strip' | 'refresh';

const HINTS: Record<EdgeCase, string> = {
  done: 'Tap "Done", letting the finger drift a little to the right: the screen goes back to Settings.',
  strip:
    'With the strip at its start, drag slowly to the right on it: the strip stays put and the screen follows the finger.',
  refresh:
    'With the rows at the top, tap a row, letting the finger drift a little down: the tap shows above. Pull down slowly to refresh.',
};

const STACK_PATHS: Record<Exclude<EdgeCase, 'refresh'>, string[]> = {
  done: ['General', 'About'],
  strip: ['General'],
};

const SECTIONS: Record<string, string[]> = {
  Settings: ['General', 'Accessibility', 'Display'],
  General: ['About', 'Software Update', 'Storage'],
};

const TILES = [
  'Wi-Fi',
  'Bluetooth',
  'Cellular',
  'Hotspot',
  'Battery',
  'Focus',
  'Screen Time',
  'Sounds',
];

const LIST_ROWS = Array.from({length: 30}, (_, index) => `Item ${index + 1}`);
const PAGE_ROWS = Array.from({length: 30}, (_, index) => `Row ${index + 1}`);

const styles = stylex.create({
  tile: {flexShrink: 0},
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

function parseCase(value: string | null): EdgeCase {
  return value === 'strip' || value === 'refresh' ? value : 'done';
}

function Rows({title}: {title: string}) {
  const nav = useNavigationStack<string>();
  const rows = SECTIONS[title] ?? [];
  return (
    <List>
      {rows.map(row => (
        <ListItem key={row} label={row} onClick={() => nav.push(row)} />
      ))}
      {rows.length === 0 ? (
        <ListItem label="Done" onClick={() => nav.popToRoot()} />
      ) : null}
    </List>
  );
}

function Strip() {
  return (
    <HStack gap={3} padding={4} isScrollable>
      {TILES.map(tile => (
        <Card
          key={tile}
          width={140}
          height={96}
          padding={2}
          xstyle={styles.tile}>
          <Text>{tile}</Text>
        </Card>
      ))}
    </HStack>
  );
}

function StackCase({edgeCase}: {edgeCase: Exclude<EdgeCase, 'refresh'>}) {
  const [path, setPath] = useState<string[]>(STACK_PATHS[edgeCase]);
  return (
    <>
      <Card height="60dvh" padding={0}>
        <NavigationStack
          label="Settings"
          root={
            <NavigationScreen title="Settings">
              <Rows title="Settings" />
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              {edgeCase === 'strip' ? <Strip /> : <Rows title={entry} />}
            </NavigationScreen>
          )}
        />
      </Card>
      <Button label="Reset" onClick={() => setPath(STACK_PATHS[edgeCase])} />
    </>
  );
}

function RefreshCase() {
  const [count, setCount] = useState(0);
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const onRefresh = useCallback(async () => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 1000);
    });
    setCount(value => value + 1);
  }, []);
  const control = useRefreshControl({onRefresh, announce: 'Refreshing'});
  return (
    <>
      <Text>{`${lastTapped ?? 'No row'} tapped · Refreshed ${count} times`}</Text>
      <Card height="60dvh" padding={0}>
        <div
          {...stylex.props(styles.scroller)}
          role="region"
          aria-label="Items"
          tabIndex={0}>
          <div
            ref={control.contentRef}
            {...stylex.props(styles.content)}
            aria-busy={control.isRefreshing || undefined}>
            <List hasDividers>
              {LIST_ROWS.map(row => (
                <ListItem
                  key={row}
                  label={row}
                  onClick={() => setLastTapped(row)}
                />
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
    </>
  );
}

function EdgeCaseView({edgeCase}: {edgeCase: EdgeCase}) {
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Scroll edge taps</Heading>
        <Text color="secondary">{HINTS[edgeCase]}</Text>
        <HStack gap={3}>
          <Link href="?case=done">done</Link>
          <Link href="?case=strip">strip</Link>
          <Link href="?case=refresh">refresh</Link>
        </HStack>
      </VStack>
      {edgeCase === 'refresh' ? (
        <RefreshCase />
      ) : (
        <StackCase edgeCase={edgeCase} />
      )}
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

function EdgeCases() {
  const [searchParams] = useSearchParams();
  const edgeCase = parseCase(searchParams.get('case'));
  return <EdgeCaseView key={edgeCase} edgeCase={edgeCase} />;
}

export default function ScrollEdgeTapsPage() {
  return (
    <Suspense>
      <EdgeCases />
    </Suspense>
  );
}
